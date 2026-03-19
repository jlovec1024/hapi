# 支持项目级别的自定义命令扫描

## Goal

扩展斜杠命令系统，使其能够扫描并加载**项目级别**的自定义命令（`<project>/.claude/commands/`），而不仅仅是全局命令（`~/.claude/commands/`）。

## 问题描述

**当前行为：**
- 系统只扫描全局命令目录：`~/.claude/commands/`（Claude）或 `~/.codex/prompts/`（Codex）
- 项目级别的命令（`<project>/.claude/commands/`）被完全忽略

**期望行为：**
- 同时扫描全局命令和项目级别命令
- 项目命令优先级高于全局命令（如果同名）
- 在 Web UI 的自动完成列表中显示所有可用命令

## 根本原因分析

### 当前实现的问题

**1. CLI 端扫描逻辑（`cli/src/modules/common/slashCommands.ts`）**

```typescript
// 当前实现
function getUserCommandsDir(agent: string): string | null {
    switch (agent) {
        case 'claude': {
            const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
            return join(configDir, 'commands');  // ❌ 只返回全局目录
        }
        // ...
    }
}

export async function listSlashCommands(agent: string): Promise<SlashCommand[]> {
    const builtin = BUILTIN_COMMANDS[agent] ?? [];
    const [user, plugin] = await Promise.all([
        scanUserCommands(agent),  // ❌ 只扫描全局目录
        scanPluginCommands(agent),
    ]);
    return [...builtin, ...user, ...plugin];
}
```

**2. RPC Handler 缺少上下文（`cli/src/modules/common/handlers/slashCommands.ts`）**

```typescript
// 当前实现
rpcHandlerManager.registerHandler<ListSlashCommandsRequest, ListSlashCommandsResponse>(
    'listSlashCommands',
    async (data) => {
        const commands = await listSlashCommands(data.agent);  // ❌ 没有传递 workingDirectory
        return { success: true, commands };
    }
);
```

**3. 关键发现：**
- `registerCommonHandlers(rpcHandlerManager, workingDirectory)` 函数**已经接收** `workingDirectory` 参数
- 但 `registerSlashCommandHandlers(rpcHandlerManager)` **没有接收**这个参数
- 其他 handlers（bash, files, git 等）都正确接收了 `workingDirectory`

## 设计方案

### 方案概述

**核心思路：**
1. 修改 `listSlashCommands` 函数，接受可选的 `projectDir` 参数
2. 如果提供了 `projectDir`，扫描 `<projectDir>/.claude/commands/`
3. 合并全局命令和项目命令，项目命令优先
4. 修改 RPC handler，传递 `workingDirectory`

### 详细设计

#### 1. 修改命令扫描逻辑

**文件：`cli/src/modules/common/slashCommands.ts`**

```typescript
// 新增：获取项目级别命令目录
function getProjectCommandsDir(agent: string, projectDir: string): string | null {
    switch (agent) {
        case 'claude':
            return join(projectDir, '.claude', 'commands');
        case 'codex':
            return join(projectDir, '.codex', 'prompts');
        default:
            return null;
    }
}

// 修改：扫描项目命令
async function scanProjectCommands(agent: string, projectDir: string): Promise<SlashCommand[]> {
    const dir = getProjectCommandsDir(agent, projectDir);
    if (!dir) {
        return [];
    }
    // 使用 'user' source，但可以考虑添加 'project' source 以区分
    return scanCommandsDir(dir, 'user');
}

// 修改：listSlashCommands 接受可选的 projectDir
export async function listSlashCommands(
    agent: string,
    projectDir?: string
): Promise<SlashCommand[]> {
    const builtin = BUILTIN_COMMANDS[agent] ?? [];

    // 并行扫描所有来源
    const [user, plugin, project] = await Promise.all([
        scanUserCommands(agent),
        scanPluginCommands(agent),
        projectDir ? scanProjectCommands(agent, projectDir) : Promise.resolve([])
    ]);

    // 合并策略：builtin → user (global) → plugin → project
    // 项目命令放在最后，这样可以覆盖同名的全局命令
    const allCommands = [...builtin, ...user, ...plugin, ...project];

    // 去重：如果有同名命令，保留最后一个（项目命令优先）
    const commandMap = new Map<string, SlashCommand>();
    for (const cmd of allCommands) {
        commandMap.set(cmd.name, cmd);
    }

    return Array.from(commandMap.values());
}
```

#### 2. 修改 RPC Handler

**文件：`cli/src/modules/common/handlers/slashCommands.ts`**

```typescript
export function registerSlashCommandHandlers(
    rpcHandlerManager: RpcHandlerManager,
    workingDirectory: string  // 新增参数
): void {
    rpcHandlerManager.registerHandler<ListSlashCommandsRequest, ListSlashCommandsResponse>(
        'listSlashCommands',
        async (data) => {
            logger.debug('List slash commands request for agent:', data.agent);
            logger.debug('Working directory:', workingDirectory);

            try {
                // 传递 workingDirectory 作为 projectDir
                const commands = await listSlashCommands(data.agent, workingDirectory);
                return { success: true, commands };
            } catch (error) {
                logger.debug('Failed to list slash commands:', error);
                return rpcError(getErrorMessage(error, 'Failed to list slash commands'));
            }
        }
    );
}
```

#### 3. 修改 Handler 注册

**文件：`cli/src/modules/common/registerCommonHandlers.ts`**

```typescript
export function registerCommonHandlers(rpcHandlerManager: RpcHandlerManager, workingDirectory: string): void {
    registerBashHandlers(rpcHandlerManager, workingDirectory);
    registerFileHandlers(rpcHandlerManager, workingDirectory);
    registerDirectoryHandlers(rpcHandlerManager, workingDirectory);
    registerRipgrepHandlers(rpcHandlerManager, workingDirectory);
    registerDifftasticHandlers(rpcHandlerManager, workingDirectory);
    registerSlashCommandHandlers(rpcHandlerManager, workingDirectory);  // 传递 workingDirectory
    registerSkillsHandlers(rpcHandlerManager);
    registerGitHandlers(rpcHandlerManager, workingDirectory);
    registerUploadHandlers(rpcHandlerManager);
}
```

### 命令优先级策略

**方案 A：项目命令覆盖全局命令（推荐）**

```
合并顺序：builtin → global user → plugin → project
去重策略：后者覆盖前者（Map.set）
```

**优点：**
- 项目可以自定义同名命令，覆盖全局行为
- 符合"就近原则"（项目配置优先于全局配置）

**缺点：**
- 可能导致混淆（用户不知道命令被覆盖了）

**方案 B：保留所有命令，添加前缀区分**

```
项目命令：/my-command
全局命令：/my-command (global)
```

**优点：**
- 所有命令都可见
- 用户可以明确选择

**缺点：**
- UI 更复杂
- 需要修改命令名称显示逻辑

**方案 C：添加新的 source 类型**

```typescript
source: 'builtin' | 'user' | 'plugin' | 'project'
```

**优点：**
- 可以在 UI 中显示命令来源
- 保留所有命令，由用户选择

**缺点：**
- 需要修改类型定义（可能影响其他代码）

### 推荐方案

**浮浮酱推荐：方案 A + 方案 C 的组合**

1. **添加 `'project'` source 类型**（区分项目命令）
2. **项目命令覆盖全局命令**（如果同名）
3. **在 Web UI 中显示来源标识**（可选，未来优化）

```typescript
// 修改类型定义
export interface SlashCommand {
    name: string;
    description?: string;
    source: 'builtin' | 'user' | 'plugin' | 'project';  // 新增 'project'
    content?: string;
    pluginName?: string;
}

// 扫描项目命令时使用 'project' source
async function scanProjectCommands(agent: string, projectDir: string): Promise<SlashCommand[]> {
    const dir = getProjectCommandsDir(agent, projectDir);
    if (!dir) {
        return [];
    }
    return scanCommandsDir(dir, 'project');  // 使用 'project' 而非 'user'
}
```

## 影响范围分析

### 需要修改的文件

| 文件 | 修改内容 | 风险 |
|------|---------|------|
| `cli/src/modules/common/slashCommands.ts` | 添加 `getProjectCommandsDir`、`scanProjectCommands`，修改 `listSlashCommands` 签名 | 低 |
| `cli/src/modules/common/handlers/slashCommands.ts` | 修改 `registerSlashCommandHandlers` 签名，传递 `workingDirectory` | 低 |
| `cli/src/modules/common/registerCommonHandlers.ts` | 传递 `workingDirectory` 给 `registerSlashCommandHandlers` | 极低 |
| `web/src/types/api.ts` | 修改 `SlashCommand` 类型，添加 `'project'` source | 低 |

### 不需要修改的部分

- ✅ Hub API 路由（`hub/src/web/routes/sessions.ts`）- 无需修改
- ✅ RPC Gateway（`hub/src/sync/rpcGateway.ts`）- 无需修改
- ✅ Web Hook（`web/src/hooks/queries/useSlashCommands.ts`）- 无需修改（自动支持新 source）
- ✅ Web UI 组件 - 无需修改（自动显示新命令）

### 向后兼容性

**✅ 完全向后兼容**

- `listSlashCommands(agent)` 仍然有效（`projectDir` 是可选参数）
- 如果不传 `projectDir`，行为与当前完全一致
- 新增的 `'project'` source 不会破坏现有逻辑

## 测试计划

### 单元测试

1. **测试全局命令扫描**（现有行为）
   - 不传 `projectDir`，应该只返回全局命令

2. **测试项目命令扫描**
   - 传递 `projectDir`，应该返回全局 + 项目命令

3. **测试命令覆盖**
   - 项目命令与全局命令同名，应该保留项目命令

4. **测试不存在的项目目录**
   - `<projectDir>/.claude/commands/` 不存在，不应该报错

### 集成测试

1. **创建测试项目**
   ```bash
   mkdir -p /tmp/test-project/.claude/commands
   echo "---\ndescription: Project command\n---\nTest" > /tmp/test-project/.claude/commands/test.md
   ```

2. **启动会话**
   ```bash
   cd /tmp/test-project
   zhushen claude
   ```

3. **验证命令列表**
   - 在 Web UI 中输入 `/`
   - 应该看到 `/test` 命令
   - 命令描述应该是 "Project command"

### 手动测试

1. **测试项目命令覆盖全局命令**
   - 在 `~/.claude/commands/` 创建 `foo.md`
   - 在项目 `.claude/commands/` 创建同名 `foo.md`（不同描述）
   - 验证自动完成显示项目版本

2. **测试多项目隔离**
   - 在项目 A 创建命令 `cmd-a`
   - 在项目 B 创建命令 `cmd-b`
   - 验证项目 A 只看到 `cmd-a`，项目 B 只看到 `cmd-b`

## Requirements

1. **扫描项目命令**
   - 扫描 `<projectDir>/.claude/commands/` 目录
   - 支持与全局命令相同的 Markdown + frontmatter 格式

2. **命令合并**
   - 合并全局命令和项目命令
   - 项目命令覆盖同名全局命令

3. **类型安全**
   - 添加 `'project'` 作为新的 `source` 类型
   - 保持向后兼容

4. **错误处理**
   - 项目目录不存在时不报错
   - 命令文件读取失败时跳过该文件

## Acceptance Criteria

- [ ] 在项目 `.claude/commands/` 中创建的命令能在自动完成中显示
- [ ] 项目命令与全局命令同名时，项目命令优先
- [ ] 不传 `projectDir` 时，行为与当前一致（向后兼容）
- [ ] 项目目录不存在时不报错
- [ ] 命令的 `source` 字段正确标识为 `'project'`
- [ ] 所有现有测试通过
- [ ] Lint 和 typecheck 通过

## Definition of Done

- [ ] 代码实现完成
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 手动测试验证
- [ ] Lint 和 typecheck 通过
- [ ] 不破坏现有功能
- [ ] 向后兼容性验证

## Out of Scope

以下功能**不在本次实现范围内**：

- ❌ UI 中显示命令来源标识（builtin/user/plugin/project）
- ❌ 命令参数补全
- ❌ 命令分类/嵌套
- ❌ 实时文件监听（添加新命令后自动刷新）
- ❌ 命令别名
- ❌ 修复 CLI 和 Web 的内置命令不一致问题

## Technical Notes

### 关键约束

- 命令格式：Markdown with YAML frontmatter
- 通信协议：RPC over WebSocket/HTTP
- 向后兼容：`projectDir` 必须是可选参数

### 实现细节

**命令扫描顺序：**
```
1. 内置命令 (builtin)
2. 全局用户命令 (~/.claude/commands/)
3. 插件命令 (~/.claude/plugins/)
4. 项目命令 (<projectDir>/.claude/commands/)
```

**去重策略：**
```typescript
const commandMap = new Map<string, SlashCommand>();
for (const cmd of allCommands) {
    commandMap.set(cmd.name, cmd);  // 后者覆盖前者
}
```

**错误处理：**
```typescript
// scanCommandsDir 已经处理了目录不存在的情况
try {
    const entries = await readdir(dir, { withFileTypes: true });
    // ...
} catch {
    return [];  // 目录不存在或不可访问，返回空数组
}
```

### 相关文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `cli/src/modules/common/slashCommands.ts` | 修改 | 添加项目命令扫描逻辑 |
| `cli/src/modules/common/handlers/slashCommands.ts` | 修改 | 传递 workingDirectory |
| `cli/src/modules/common/registerCommonHandlers.ts` | 修改 | 传递 workingDirectory 参数 |
| `web/src/types/api.ts` | 修改 | 添加 'project' source 类型 |

### 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|-------|------|---------|
| 破坏现有功能 | 低 | 高 | 保持向后兼容，充分测试 |
| 性能问题（扫描多个目录） | 低 | 低 | 并行扫描（Promise.all） |
| 类型定义不兼容 | 低 | 中 | 使用联合类型，保持兼容 |

## 待确认问题

### Q1: 命令优先级策略

主人希望使用哪种策略？

1. **方案 A：项目命令覆盖全局命令**（推荐）
   - 同名时只保留项目命令
   - 符合"就近原则"

2. **方案 B：保留所有命令，添加前缀**
   - 项目命令：`/my-command`
   - 全局命令：`/my-command (global)`

3. **方案 C：保留所有命令，不去重**
   - 自动完成列表中显示两个同名命令
   - 通过 source 标识区分

### Q2: 是否添加 'project' source 类型？

1. **添加新类型**（推荐）
   - 修改 `source: 'builtin' | 'user' | 'plugin' | 'project'`
   - 可以在 UI 中区分命令来源

2. **复用 'user' 类型**
   - 不修改类型定义
   - 项目命令和全局命令都是 `'user'`

---

**浮浮酱的推荐：**
- Q1 选择**方案 A**（项目命令覆盖全局命令）
- Q2 选择**添加 'project' 类型**

这样既简单又灵活，未来可以在 UI 中显示命令来源喵～ (๑•̀ㅂ•́)✧
