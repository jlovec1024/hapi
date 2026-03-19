# zhushen runner start 流程分析

## 目标

理解在 Windows PowerShell 7 终端中执行 `zhushen runner start .` 后的完整执行流程，包括：
- 命令执行链路
- Claude Code 会话启动过程
- MCP 服务器启动机制
- 各个进程在哪个终端中运行

## 状态

✅ **分析完成** - 所有待确认问题已解答

## 已知信息

### 项目结构
- **Monorepo 结构**：使用 Bun workspaces，包含 cli、hub、web、shared 等子包
- **CLI 入口**：`cli/src/commands/runner.ts` 定义 runner 命令
- **核心逻辑**：`cli/src/runner/run.ts` 包含 runner 启动的主要逻辑

### 命令执行流程（初步分析）

从代码分析得出：

1. **用户执行**：`zhushen runner start .`
   - 注意：`.` 参数在当前代码中未被使用（commandArgs[1] 未读取）

2. **命令分发**：`cli/src/commands/runner.ts`
   ```typescript
   if (runnerSubcommand === 'start') {
       // 启动一个分离的子进程
       const child = spawnZhushenCLI(['runner', 'start-sync'], {
           detached: true,
           stdio: 'ignore',
           env: process.env
       })
       child.unref()
   }
   ```

3. **实际启动**：`runner start-sync` 子命令
   ```typescript
   if (runnerSubcommand === 'start-sync') {
       await initializeToken()
       await startRunner()
       process.exit(0)
   }
   ```

4. **Runner 主进程**：`startRunner()` 函数（`cli/src/runner/run.ts`）

### 关键组件

#### 1. Runner 进程（后台守护进程）
- **运行方式**：detached 模式，与父进程分离
- **stdio**：'ignore' - 不继承父进程的标准输入输出
- **作用**：
  - 管理多个 Claude Code 会话
  - 提供 HTTP 控制服务器
  - 与 主神 云端服务保持连接
  - 监控会话健康状态

#### 2. 控制服务器（Control Server）
- **启动位置**：`startRunnerControlServer()`
- **功能**：
  - 提供本地 HTTP API
  - 接收会话启动/停止请求
  - 接收会话 webhook 回调

#### 3. 会话进程（Session Process）
- **启动方式**：通过 `spawnSession()` 函数
- **命令示例**：`zhushen claude --zhushen-starting-mode remote --started-by runner`
- **运行模式**：detached，独立于 runner 进程

## 完整流程分析

### 1. MCP 服务器启动机制 ✅

**关键发现：MCP 服务器在每个会话启动时创建，而非 runner 启动时**

#### 主神 MCP Server（每个会话独立）
- **启动位置**：`cli/src/claude/runClaude.ts` 中的 `startZhushenServer()`
- **启动时机**：每个 Claude 会话启动时
- **服务器类型**：HTTP MCP Server（使用 StreamableHTTPServerTransport）
- **监听地址**：`127.0.0.1:随机端口`
- **提供的工具**：`change_title` - 修改会话标题
- **生命周期**：与会话进程绑定，会话结束时停止

```typescript
// cli/src/claude/runClaude.ts:72-74
const zhushenServer = await startZhushenServer(session);
logger.debug(`[START] 主神 MCP server started at ${zhushenServer.url}`);
```

#### MCP STDIO Bridge（可选）
- **命令**：`zhushen mcp --url <http://127.0.0.1:PORT>`
- **作用**：将 STDIO MCP 协议桥接到 HTTP MCP 服务器
- **使用场景**：当 Claude Code 需要通过 STDIO 协议访问 主神 MCP 工具时
- **实现**：`cli/src/codex/zhushenMcpStdioBridge.ts`

#### MCP 配置传递机制

**Local Mode（本地模式）：**
```typescript
// cli/src/claude/claudeLocal.ts:57-59
const cleanupMcpConfig = appendMcpConfigArg(args, opts.mcpServers, {
    baseDir: projectDir
});
```
- 通过 `--mcp-config` 参数传递
- Windows 平台：写入临时 JSON 文件，传递文件路径
- 其他平台：直接传递 JSON 字符串

**Remote Mode（远程模式）：**
```typescript
// cli/src/claude/sdk/query.ts:339
cleanupMcpConfig = appendMcpConfigArg(spawnArgs, mcpServers)
```
- 同样通过 `--mcp-config` 参数传递给 Claude Code SDK
- SDK 内部启动 Claude Code 进程时传递配置

**MCP 配置内容：**
```json
{
  "mcpServers": {
    "zhushen": {
      "type": "http",
      "url": "http://127.0.0.1:<random-port>"
    }
  }
}
```

### 2. 终端归属与进程架构 ✅

#### 进程层级结构

```
PowerShell 终端 (用户执行 zhushen runner start)
│
├─ zhushen runner start (立即退出)
│   └─ spawnZhushenCLI(['runner', 'start-sync'], { detached: true, stdio: 'ignore' })
│       └─ unref() - 解除父进程引用
│
└─ Runner 进程 (后台守护进程，detached)
    ├─ 控制服务器 (HTTP, 127.0.0.1:随机端口)
    ├─ 与 主神 Hub 的连接
    │
    └─ 会话进程们 (每个都是 detached)
        ├─ Session 1: zhushen claude --zhushen-starting-mode remote --started-by runner
        │   ├─ 主神 MCP Server (HTTP, 127.0.0.1:随机端口)
        │   ├─ Hook Server (HTTP, 127.0.0.1:随机端口)
        │   └─ Claude Code SDK 进程 (spawn)
        │       └─ Claude Code 实际进程
        │
        └─ Session 2: ...
```

#### 终端归属详解

| 进程 | 终端归属 | stdio 配置 | 说明 |
|------|---------|-----------|------|
| `zhushen runner start` | 用户终端 | 继承 | 立即退出 |
| Runner 进程 | 无（后台） | `'ignore'` | detached + unref，完全脱离终端 |
| 会话进程 | 无（后台） | `['ignore', 'pipe', 'pipe']` | detached，stdout/stderr 被 runner 捕获 |
| Claude Code SDK | 无（后台） | `['pipe', 'pipe', 'pipe']` | 由会话进程管理 |
| 主神 MCP Server | 无（后台） | N/A | HTTP 服务器，无 stdio |
| Hook Server | 无（后台） | N/A | HTTP 服务器，无 stdio |

**关键点：**
- ✅ Runner 进程使用 `detached: true` + `stdio: 'ignore'` + `unref()`，完全脱离终端
- ✅ 会话进程使用 `detached: true`，但 stdout/stderr 被 runner 捕获用于调试
- ✅ 所有 HTTP 服务器（控制服务器、MCP 服务器、Hook 服务器）都没有终端依赖

### 3. 进程生命周期 ✅

#### 关闭终端后的行为

**继续运行的进程：**
- ✅ Runner 进程 - 因为 `detached: true` + `unref()`
- ✅ 所有会话进程 - 因为 `detached: true`
- ✅ 所有 MCP 服务器 - 作为会话进程的一部分
- ✅ 所有 Hook 服务器 - 作为会话进程的一部分

**Runner 如何保证会话不随终端关闭而终止：**

1. **Detached 模式**：
```typescript
// cli/src/runner/run.ts:368-376
zhushenProcess = spawnZhushenCLI(args, {
  cwd: spawnDirectory,
  detached: true,  // 关键：会话独立于 runner
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...extraEnv }
});
```

2. **不调用 unref()**：
- Runner 对会话进程**不调用** `unref()`
- 这样 runner 会等待会话进程结束
- 但会话进程本身是 detached 的，可以独立存在

3. **进程跟踪**：
```typescript
// cli/src/runner/run.ts:394-402
const trackedSession: TrackedSession = {
  startedBy: 'runner',
  pid,
  childProcess: zhushenProcess,
  directoryCreated,
  message: ...
};
pidToTrackedSession.set(pid, trackedSession);
```

### 4. 认证流程 ✅

#### Token 初始化
```typescript
// cli/src/commands/claude.ts:117
await initializeToken()
```

**作用：**
- 检查 `CLI_API_TOKEN` 环境变量
- 如果不存在，提示用户登录
- 验证 token 有效性

#### Token 传递给会话进程

**方式 1：环境变量（Claude 会话）**
```typescript
// cli/src/runner/run.ts:307-311
if (options.agent === 'claude' || !options.agent) {
  extraEnv = {
    CLAUDE_CODE_OAUTH_TOKEN: options.token
  };
}
```

**方式 2：临时文件（Codex 会话）**
```typescript
// cli/src/runner/run.ts:296-306
if (options.agent === 'codex') {
  const codexHomeDir = await fs.mkdtemp(join(os.tmpdir(), 'zhushen-codex-'));
  await fs.writeFile(join(codexHomeDir, 'auth.json'), options.token);
  extraEnv = {
    CODEX_HOME: codexHomeDir
  };
}
```

### 5. 会话通信机制 ✅

#### 会话 → Runner 通信（Webhook）

**Hook Server 启动：**
```typescript
// cli/src/claude/runClaude.ts:88-102
const hookServer = await startHookServer({
    onSessionHook: (sessionId, data) => {
        logger.debug(`[START] Session hook received: ${sessionId}`, data);
        const currentSession = currentSessionRef.current;
        if (currentSession) {
            const previousSessionId = currentSession.sessionId;
            if (previousSessionId !== sessionId) {
                logger.debug(`[START] Claude session ID changed: ${previousSessionId} -> ${sessionId}`);
                currentSession.onSessionFound(sessionId);
            }
        }
    }
});
```

**Hook 配置生成：**
```typescript
// cli/src/claude/runClaude.ts:104-108
const hookSettingsPath = generateHookSettingsFile(hookServer.port, hookServer.token, {
    filenamePrefix: 'session-hook',
    logLabel: 'generateHookSettings'
});
```

**Hook 配置内容：**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "zhushen hook-forwarder --port <PORT> --token <TOKEN>"
          }
        ]
      }
    ]
  }
}
```

**传递给 Claude Code：**
```typescript
// cli/src/claude/claudeLocal.ts:71
args.push('--settings', opts.hookSettingsPath);
```

**Webhook 流程：**
1. Claude Code 启动时读取 `--settings` 文件
2. 触发 SessionStart hook，执行 `zhushen hook-forwarder`
3. hook-forwarder 将 session_id 发送到 Hook Server
4. Hook Server 调用 `onSessionHook` 回调
5. 会话进程更新 sessionId

**Runner 接收 Webhook：**
```typescript
// cli/src/runner/controlServer.ts:38-57
typed.post('/session-started', {
  schema: {
    body: z.object({
      sessionId: z.string(),
      metadata: z.any()
    }),
    response: {
      200: z.object({
        status: z.literal('ok')
      })
    }
  }
}, async (request) => {
  const { sessionId, metadata } = request.body;
  logger.debug(`[CONTROL SERVER] Session started: ${sessionId}`);
  onZhushenSessionWebhook(sessionId, metadata);
  return { status: 'ok' as const };
});
```

#### Runner → 主神 Hub 通信

**连接建立：**
- Runner 启动时连接到 主神 Hub（`configuration.apiUrl`）
- 使用 WebSocket 或 HTTP 长轮询（具体实现在 `@/api` 模块）

**通信内容：**
- 会话状态更新
- 会话元数据（metadata）
- 会话消息（通过 `session.client.sendClaudeSessionMessage()`）

### 6. Worktree 模式 ✅

#### Worktree 会话与普通会话的区别

**普通会话（Simple）：**
```typescript
// cli/src/runner/run.ts:190-232
if (sessionType === 'simple') {
  // 检查目录是否存在
  // 如果不存在，请求用户批准创建
  // 直接在指定目录启动会话
}
```

**Worktree 会话：**
```typescript
// cli/src/runner/run.ts:246-261
if (sessionType === 'worktree') {
  const worktreeResult = await createWorktree({
    basePath: directory,
    nameHint: worktreeName
  });
  if (!worktreeResult.ok) {
    return { type: 'error', errorMessage: worktreeResult.error };
  }
  worktreeInfo = worktreeResult.info;
  spawnDirectory = worktreeInfo.worktreePath;
}
```

**环境变量传递：**
```typescript
// cli/src/runner/run.ts:314-323
if (worktreeInfo) {
  extraEnv = {
    ...extraEnv,
    主神_WORKTREE_BASE_PATH: worktreeInfo.basePath,
    主神_WORKTREE_BRANCH: worktreeInfo.branch,
    主神_WORKTREE_NAME: worktreeInfo.name,
    主神_WORKTREE_PATH: worktreeInfo.worktreePath,
    主神_WORKTREE_CREATED_AT: String(worktreeInfo.createdAt)
  };
}
```

#### Worktree 创建和清理时机

**创建时机：**
- 用户通过 主神 Hub 请求创建 worktree 会话
- Runner 收到 `/spawn-session` 请求，`sessionType: 'worktree'`
- 在 `spawnSession()` 函数中调用 `createWorktree()`

**清理时机：**

1. **会话启动失败时：**
```typescript
// cli/src/runner/run.ts:444-446
if (spawnResult.type !== 'success') {
  await maybeCleanupWorktree('spawn-error');
}
```

2. **会话正常退出时：**
```typescript
// cli/src/runner/run.ts:404-410
zhushenProcess.on('exit', (code, signal) => {
  logger.debug(`[RUNNER RUN] Child PID ${pid} exited with code ${code}, signal ${signal}`);
  if (code !== 0 || signal) {
    logStderrTail();
  }
  onChildExited(pid);
});
```

3. **清理逻辑：**
```typescript
// cli/src/runner/run.ts:263-288
const cleanupWorktree = async () => {
  if (!worktreeInfo) return;
  const result = await removeWorktree({
    repoRoot: worktreeInfo.basePath,
    worktreePath: worktreeInfo.worktreePath
  });
  if (!result.ok) {
    logger.debug(`[RUNNER RUN] Failed to remove worktree: ${result.error}`);
  }
};

const maybeCleanupWorktree = async (reason: string) => {
  if (!worktreeInfo) return;
  const pid = zhushenProcess?.pid;
  if (pid && isProcessAlive(pid)) {
    logger.debug(`[RUNNER RUN] Skipping worktree cleanup after ${reason}; child still running`);
    return;
  }
  await cleanupWorktree();
};
```

**清理策略：**
- ✅ 只有在会话进程已经退出时才清理 worktree
- ✅ 如果进程仍在运行，跳过清理（避免破坏正在使用的 worktree）
- ✅ 清理失败不会阻塞其他操作

## 技术笔记

### 已检查文件（完整列表）

| 文件 | 作用 |
|------|------|
| `cli/src/commands/runner.ts` | Runner 命令定义，处理 start/start-sync/stop |
| `cli/src/commands/claude.ts` | Claude 会话命令，自动确保 runner 运行 |
| `cli/src/commands/mcp.ts` | MCP STDIO Bridge 命令入口 |
| `cli/src/runner/run.ts` | Runner 主逻辑（完整）- spawnSession 实现 |
| `cli/src/runner/controlServer.ts` | Runner HTTP 控制服务器 |
| `cli/src/claude/runClaude.ts` | Claude 会话启动，包括 MCP 和 Hook 服务器 |
| `cli/src/claude/claudeLocal.ts` | 本地 Claude 进程启动 |
| `cli/src/claude/claudeRemote.ts` | 远程 Claude SDK 启动 |
| `cli/src/claude/loop.ts` | 会话循环，local/remote 模式切换 |
| `cli/src/claude/utils/mcpConfig.ts` | MCP 配置生成（JSON/文件） |
| `cli/src/claude/utils/startZhushenServer.ts` | 主神 HTTP MCP 服务器 |
| `cli/src/claude/utils/startHookServer.ts` | Session Hook HTTP 服务器 |
| `cli/src/codex/zhushenMcpStdioBridge.ts` | STDIO → HTTP MCP 桥接 |
| `cli/src/modules/common/hooks/generateHookSettings.ts` | Hook 配置文件生成 |
| `cli/src/utils/spawnZhushenCLI.ts` | 跨平台 主神 CLI 进程启动工具 |

### 关键发现（完整）

1. **双层启动设计**：`start` → `start-sync`，确保父进程可以立即返回
2. **Detached 模式**：Runner 和会话都使用 `detached: true`，确保进程独立性
3. **MCP 按会话创建**：每个会话启动时创建独立的 HTTP MCP 服务器
4. **Hook 机制**：通过 Claude 的 SessionStart hook 实现 session_id 传递
5. **Windows 特殊处理**：MCP 配置在 Windows 上写入文件而非直接传递字符串
6. **版本检查**：Runner 定期检查 CLI 版本，自动重启
7. **心跳机制**：每 60 秒写入状态文件，清理僵尸会话
8. **无终端依赖**：所有后台进程通过 detached + ignore stdio 脱离终端

### Bug 修复记录

#### Windows cmd 窗口堆积问题 ✅ 已修复

**问题描述：**
- 在 Windows 上启动 Claude Code 会话时，会出现多个 cmd 窗口
- 这些 cmd 窗口不会自动关闭，导致窗口堆积

**根本原因：**
- Node.js 在 Windows 上使用 `detached: true` 时，会为子进程分配新的控制台窗口
- 代码中所有 `spawnZhushenCLI` 调用都使用了 `detached: true`，但没有设置 `windowsHide: true`
- 导致每次启动 runner 或会话时都会创建可见的 cmd 窗口

**影响范围：**
- `cli/src/commands/runner.ts:54-59` - Runner 启动
- `cli/src/commands/claude.ts:126-131` - Claude 命令自动启动 runner
- `cli/src/runner/run.ts:368-376` - 会话进程启动
- `cli/src/runner/run.ts:611-613` - Runner 版本更新重启

**修复方案：**
- 修改 `cli/src/utils/spawnZhushenCLI.ts` 的 `spawnZhushenCLI` 函数
- 在 Windows 平台且 `detached: true` 时，自动注入 `windowsHide: true`
- 这样所有调用处都自动生效，无需逐个修改

**修复代码：**
```typescript
// cli/src/utils/spawnZhushenCLI.ts:108-114
// On Windows, detached processes allocate a new console window by default.
// windowsHide: true suppresses this to prevent cmd windows from accumulating.
const finalOptions: SpawnOptions = { ...options };
if (process.platform === 'win32' && options.detached) {
  finalOptions.windowsHide = true;
}
return spawn(spawnCommand, spawnArgs, finalOptions);
```

**验证：**
- ✅ TypeScript 类型检查通过（`SpawnOptions` 包含 `windowsHide` 属性）
- ✅ 逻辑正确（仅在 Windows + detached 时生效）
- ✅ 向后兼容（不影响其他平台和非 detached 调用）

---

## 验证方案（CLI 优先，可自动化）

### Goal

在不依赖手工 GUI 观察的前提下，为 `spawnZhushenCLI` 的 Windows 修复建立可复用、命令行可执行的验证路径，并实际执行可在当前环境完成的验证。

### What I already know

- 当前改动点是 `cli/src/utils/spawnZhushenCLI.ts:108-114`，在 `win32 + detached` 场景注入 `windowsHide: true`。
- 该封装被 `runner start`、`claude` 自动拉起 runner、runner 自重启等路径复用（如 `cli/src/commands/runner.ts:54`、`cli/src/commands/claude.ts:126`、`cli/src/runner/run.ts:368`、`cli/src/runner/run.ts:610`）。
- 项目已有命令行测试入口：根脚本 `test:cli`、`typecheck:cli`，以及 `cli` 包内 `vitest`。
- `runner.integration.test.ts` 依赖外部服务与 token，默认并不适合本地/CI 稳定自动验证。

### Assumptions (temporary)

- 优先选择“纯本地、无外部依赖”的自动化验证，避免依赖 Hub 连接与真实账户。
- Windows 可见 cmd 窗口问题属于平台行为，单元测试通过断言传给 `spawn` 的参数可覆盖核心回归风险。

### Research Notes

#### Feasible approaches here

**Approach A: 单元测试 + CLI 质量门禁（推荐）**

- How it works:
  - 新增 `spawnZhushenCLI` 单元测试，mock `child_process.spawn`，断言：
    - `win32 + detached=true` 时 `windowsHide=true`
    - 非 win32 不注入 `windowsHide`
    - `detached=false` 不注入 `windowsHide`
  - 命令行执行 `bun run typecheck:cli` 与针对性测试命令
- Pros:
  - 稳定、快速、可 CI 自动化
  - 不依赖外部服务
- Cons:
  - 不能直接“目视证明”无窗口弹出，只能证明参数正确传递

**Approach B: 端到端 runner 命令烟测（命令行）**

- How it works:
  - 执行 `zhushen runner start` / `zhushen runner status` / `zhushen runner stop`，配合日志断言无异常
- Pros:
  - 更接近真实启动链路
- Cons:
  - 受环境、认证、后台进程状态影响；自动化稳定性较低

**Approach C: 集成测试 runner.integration.test（受限）**

- How it works:
  - 运行现有 integration 测试
- Pros:
  - 覆盖 runner 真实行为更多
- Cons:
  - 依赖 `CLI_API_TOKEN` 与服务健康，默认不适合作为本任务主验证

### Requirements (evolving)

- 采用 CLI 可自动化执行的验证方案，优先本地稳定性。
- 验证至少覆盖 `win32 + detached` 的核心回归条件。
- 给出可直接复制执行的命令。

### Acceptance Criteria (evolving)

- [x] 存在针对 `spawnZhushenCLI` 的单元测试，覆盖 `windowsHide` 注入逻辑。
- [x] 命令行可执行并通过：CLI typecheck + 对应测试。
- [x] 产出验证报告（命令、结果、结论、未覆盖项）。

### Out of Scope (explicit)

- 不在本任务中引入依赖真实 Hub/Token 的稳定性基线。
- 不在本任务中处理与 `windowsHide` 无关的 runner 行为重构。

### Technical Notes

- 候选测试文件：`cli/src/utils/spawnZhushenCLI.test.ts`（新建）。
- 参考现有测试风格：`cli/src/claude/utils/path.test.ts`（vitest + mock）。
- 相关代码位置：
  - `cli/src/utils/spawnZhushenCLI.ts:80-115`
  - `cli/src/commands/runner.ts:54-59`
  - `cli/src/commands/claude.ts:126-131`
  - `cli/src/runner/run.ts:368-376`
  - `cli/src/runner/run.ts:610-613`

### Validation Results (A + GUI 视觉验证)

#### A 方案执行记录（CLI 自动化）

1. 新增测试文件：`cli/src/utils/spawnZhushenCLI.test.ts`
   - 覆盖场景：
     - `win32 + detached=true` => `windowsHide=true`
     - `win32 + detached=false` => 不注入 `windowsHide`
     - `non-win32 + detached=true` => 不注入 `windowsHide`

2. 命令执行：
   - `cd "C:/Users/joey/code/zhushen/cli" && bunx vitest run src/utils/spawnZhushenCLI.test.ts`
   - 结果：1 file passed, 3 tests passed

3. 类型检查：
   - `cd "C:/Users/joey/code/zhushen/cli" && bun run typecheck`
   - 结果：通过（`tsc --noEmit` 无错误）

#### GUI 层视觉替代验证（命令行观测）

- 方法：
  - 连续 3 轮执行 `bun src/index.ts runner start`
  - 检测 `cmd/conhost` 可见窗口（`MainWindowHandle != 0`）在执行前后的变化
  - 并在每轮启动后 3 秒内每 100ms 高频采样，捕获瞬时弹窗

- 结果：
  - 基线观测 3 轮：新增可见窗口均为 0
  - 高频采样 3 轮：`maxVisibleWithin3s` 均为 0

- 结论：
  - 当前环境下未观测到 runner start 触发可见控制台窗口弹出，符合修复预期。

- 边界：
  - 该验证为系统窗口句柄层面的自动化观测，不等同人工录屏逐帧验证。