# 跨平台思维指南

> **目的**: 在编写涉及系统调用、路径、命令的代码时，避免平台特定假设导致的 Bug

---

## 为什么需要跨平台思维？

**真实案例**: Windows 上 Terminal 无法启动

```typescript
// ❌ 隐式假设所有平台都有 /bin/bash
function resolveShell(): string {
    if (process.env.SHELL) {
        return process.env.SHELL
    }
    if (process.platform === 'darwin') {
        return '/bin/zsh'
    }
    return '/bin/bash'  // Windows 上不存在！
}
```

**后果**:
- Windows 用户完全无法使用 Terminal 功能
- 错误日志不足，难以排查
- 需要紧急修复和回归测试

**教训**: 30 分钟的跨平台思考 > 30 小时的紧急修复

---

## 核心原则

### 1. 永远不要假设平台

```typescript
// ❌ 错误：假设是 Unix-like 系统
const home = process.env.HOME

// ✅ 正确：使用跨平台 API
const home = os.homedir()
```

### 2. 使用平台检测

```typescript
// ✅ 明确的平台检测
if (process.platform === 'win32') {
    // Windows 特定逻辑
} else if (process.platform === 'darwin') {
    // macOS 特定逻辑
} else {
    // Linux/Unix 特定逻辑
}
```

### 3. 优先使用跨平台 API

| 需求 | ❌ 平台特定 | ✅ 跨平台 API |
|------|------------|--------------|
| Home 目录 | `process.env.HOME` | `os.homedir()` |
| 临时目录 | `/tmp` | `os.tmpdir()` |
| 路径拼接 | `dir + '/' + file` | `path.join(dir, file)` |
| 路径分隔符 | `/` 或 `\` | `path.sep` |
| 行结束符 | `\n` | `os.EOL` |

---

## 常见跨平台陷阱

### 陷阱 1: Shell 路径假设

**问题**: 假设所有平台都有 `/bin/bash`

```typescript
// ❌ 错误
const shell = '/bin/bash'

// ✅ 正确
function resolveShell(): string {
    if (process.env.SHELL) {
        return process.env.SHELL
    }

    if (process.platform === 'win32') {
        // Windows: 使用 COMSPEC 或默认 cmd.exe
        return process.env.COMSPEC || 'cmd.exe'
    }

    if (process.platform === 'darwin') {
        return '/bin/zsh'
    }

    return '/bin/bash'
}
```

### 陷阱 2: 环境变量假设

**问题**: 假设某些环境变量存在

```typescript
// ❌ 错误：Windows 上没有 USER
const username = process.env.USER

// ✅ 正确：跨平台获取用户名
const username = process.env.USER || process.env.USERNAME || os.userInfo().username
```

**常见环境变量差异**:

| 用途 | Unix/Linux/macOS | Windows |
|------|------------------|---------|
| 用户名 | `USER` | `USERNAME` |
| Home 目录 | `HOME` | `USERPROFILE` |
| Shell | `SHELL` | `COMSPEC` |
| 路径分隔符 | `:` | `;` |

### 陷阱 3: 命令行工具假设

**问题**: 使用平台特定的命令行工具

```typescript
// ❌ 错误：pgrep 在 Windows 上不存在
spawn('pgrep', ['-P', pid.toString()])

// ✅ 正确：平台检测
if (process.platform === 'win32') {
    // Windows: 使用 tasklist 或 wmic
    spawn('tasklist', ['/FI', `PID eq ${pid}`])
} else {
    // Unix-like: 使用 pgrep
    spawn('pgrep', ['-P', pid.toString()])
}
```

**平台特定命令对照表**:

| 功能 | Unix/Linux/macOS | Windows |
|------|------------------|---------|
| 列出进程 | `ps` | `tasklist` |
| 杀死进程 | `kill` | `taskkill` |
| 查找进程 | `pgrep` | `tasklist /FI` |
| 查找文件 | `find` | `dir /s` |

### 陷阱 4: 路径分隔符假设

**问题**: 硬编码路径分隔符

```typescript
// ❌ 错误：Windows 使用反斜杠
const fullPath = dir + '/' + file

// ✅ 正确：使用 path.join
const fullPath = path.join(dir, file)
```

### 陷阱 5: 文件权限假设

**问题**: 假设所有平台都支持 Unix 权限

```typescript
// ❌ 错误：Windows 不支持 chmod
fs.chmodSync(file, 0o755)

// ✅ 正确：平台检测
if (process.platform !== 'win32') {
    fs.chmodSync(file, 0o755)
}
```

---

### 陷阱 6: 环境变量语义写反

**问题**: 运行时环境变量名称正确，但值被对调，导致配置工具把 token 当成 URL、把 URL 当成 token。

```bash
# ❌ 错误：API Key / URL 值写反
ZCF_API_KEY="https://axonhub.example.com"
ZCF_API_URL="ah-xxxxxxxx"

# ✅ 正确：名称和值语义一致
ZCF_API_KEY="ah-xxxxxxxx"
ZCF_API_URL="https://axonhub.example.com"
```

**症状**:
- 配置阶段报 `Invalid base URL format`
- 日志里 URL 显示成 token，Key 显示成域名
- 后续流程继续执行，但实际配置已经脏掉

**预防**:
- 对成对出现的环境变量（如 `*_KEY` / `*_URL`）做语义校验，而不只检查“是否非空”
- 在入口脚本中打印脱敏后的配置摘要，便于肉眼识别写反
- 对明显写反的输入做告警，必要时自动纠正或直接失败

### 陷阱 7: Git 仓库信任状态假设

**问题**: 在 Docker runner / worktree 场景中，代码默认假设 Git 已经信任当前仓库目录，但容器内路径、挂载目录或动态创建的 worktree 路径往往并不在 Git 的 `safe.directory` 白名单里。

```bash
# ❌ 错误：直接进入 worktree 流程，假设 git 一定可用
git worktree add /workspace/.claude/worktrees/task-123

# ✅ 正确：启动阶段先验证仓库信任状态，缺失时显式配置
if ! git config --global --get-all safe.directory | grep -Fx "$REPO_DIR" >/dev/null; then
  git config --global --add safe.directory "$REPO_DIR"
fi
```

**症状**:
- runner docker 中无法开启 worktree 模式
- Git 报 `detected dubious ownership in repository`
- 主流程看起来像“worktree 功能异常”，但真正失败点是基础 Git 配置缺失

**根因**:
- 把“仓库路径存在”误当成“Git 已认可该路径可操作”
- 容器镜像、宿主挂载、worktree 子目录会改变 Git 看到的所有者/路径语义
- 初始化逻辑只准备了目录和命令，却没有准备 Git trust prerequisite

**预防**:
- 在 runner / docker / worktree 初始化入口增加 `git rev-parse` + `safe.directory` 预检
- 将仓库信任配置视为环境契约的一部分，而不是依赖人工补救
- 错误日志同时输出 `repo path`、`git status/command`、`dubious ownership` 关键词，避免误判成 worktree API 故障
- 对动态 worktree 根目录和主仓库目录分别校验，不要只校验其中一个

---

## 跨平台检查清单

### 编码时自我检查

当你写下以下代码时，**立即触发跨平台检查**：

```typescript
// 🚨 危险信号
process.env.SHELL
process.env.HOME
process.env.USER
'/bin/bash'
'/usr/bin/'
'/tmp/'
'~/'
spawn('ps', ...)
spawn('kill', ...)
spawn('pgrep', ...)
fs.chmod(...)
hardcoded '/' in paths
```

### 代码审查清单

在 PR 审查时检查：

- [ ] 是否使用了硬编码的 Unix 路径？
- [ ] 是否假设某个环境变量存在？
- [ ] 是否调用了平台特定的命令行工具？
- [ ] 是否使用了 `path.join()` 而不是字符串拼接？
- [ ] 是否使用了 `os.homedir()` 而不是 `process.env.HOME`？
- [ ] 是否在 Windows 上测试过？
- [ ] Docker / worktree 场景下是否验证过 Git `safe.directory` 信任状态？

---

## 最佳实践

### 1. 创建跨平台工具函数

```typescript
// utils/platform.ts
export const Platform = {
    getShell(): string {
        if (process.env.SHELL) {
            return process.env.SHELL
        }
        if (process.platform === 'win32') {
            return process.env.COMSPEC || 'cmd.exe'
        }
        if (process.platform === 'darwin') {
            return '/bin/zsh'
        }
        return '/bin/bash'
    },

    getUsername(): string {
        return process.env.USER || process.env.USERNAME || os.userInfo().username
    },

    isWindows(): boolean {
        return process.platform === 'win32'
    }
}
```

### 2. 增强错误日志

```typescript
// ❌ 错误：日志不足
catch (error) {
    logger.debug('Failed to spawn', { error })
}

// ✅ 正确：包含平台信息
catch (error) {
    logger.error('Failed to spawn shell', {
        shell,
        platform: process.platform,
        cwd: process.cwd(),
        error
    })
}
```

### 3. 使用跨平台库

推荐使用的跨平台库：

- **路径操作**: `path` (Node.js 内置)
- **进程管理**: `cross-spawn` (已在项目中使用)
- **Shell 命令**: `execa` 或 `cross-spawn`
- **文件系统**: `fs-extra`

### 4. 编写跨平台测试

```typescript
describe('resolveShell', () => {
    it('should return cmd.exe on Windows', () => {
        const originalPlatform = process.platform
        Object.defineProperty(process, 'platform', { value: 'win32' })

        expect(resolveShell()).toBe('cmd.exe')

        Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('should return /bin/zsh on macOS', () => {
        // ...
    })
})
```

---

## 快速参考：安全替代方案

| ❌ 不安全 | ✅ 安全 | 说明 |
|----------|--------|------|
| `process.env.HOME` | `os.homedir()` | 跨平台 home 目录 |
| `process.env.USER` | `os.userInfo().username` | 跨平台用户名 |
| `'/tmp'` | `os.tmpdir()` | 跨平台临时目录 |
| `dir + '/' + file` | `path.join(dir, file)` | 跨平台路径拼接 |
| `'\n'` | `os.EOL` | 跨平台行结束符 |
| `'/bin/bash'` | `Platform.getShell()` | 跨平台 shell |
| `spawn('kill', ...)` | `process.kill()` | 跨平台进程管理 |

---

## 真实案例学习

### 案例 1: Terminal Shell 解析失败

**问题**: Windows 上 Terminal 无法启动

**根因**: `resolveShell()` 返回 `/bin/bash`，Windows 上不存在

**修复**:
```typescript
if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe'
}
```

**预防**: 在编写 shell 相关代码时，立即检查跨平台兼容性

### 案例 3: Windows Terminal 能力误判

**问题**: 前端显示 `Failed to spawn terminal using shell: C:\\WINDOWS\\system32\\cmd.exe. Error: terminal option is not supported on this platform`

**根因**: 代码只检查了 shell 路径（`COMSPEC` / `cmd.exe`），但真正依赖的是 `Bun.spawn(..., { terminal })` 的 PTY/terminal 能力。Windows 上即使 shell 路径正确，底层 terminal 选项仍可能不受支持。

**错误修复方式**:
```typescript
// ❌ 只盯着 shell 路径，误以为换成 powershell.exe 就能解决
return process.env.COMSPEC || 'cmd.exe'
```

**正确思路**:
```typescript
// ✅ 先判断当前平台是否具备 terminal capability
const terminalSupportIssue = getTerminalSupportIssue()
if (terminalSupportIssue) {
    emitError(terminalId, terminalSupportIssue)
    return
}
```

**预防**:
- 处理 shell/terminal/进程启动问题时，区分“命令路径正确”与“运行时能力可用”
- 错误日志必须同时带上 `platform`、`shell`、`capability/cause`
- websocket 重连日志要做节流，避免同一错误每秒刷屏掩盖真正根因

### 案例 5: Docker 环境可执行文件路径硬编码

**问题**: Docker 容器启动后 Claude Code 会话失败，报错 `Process exited unexpectedly`

**现象**:
- 日志显示 `[Claude SDK] Using ZS_CLAUDE_PATH: /usr/local/bin/claude`
- spawn 调用失败，但错误信息不明确
- 用户无法判断是配置问题还是安装问题

**根因**:
- `Dockerfile.runner` 中硬编码了 `ENV ZS_CLAUDE_PATH=/usr/local/bin/claude`
- 代码优先读取该环境变量，绕过了 PATH 查找
- 一旦路径失效或镜像变更，直接失败
- 违反"开箱即用"原则，把路径配置暴露给用户

**错误设计**:
```dockerfile
# ❌ 硬编码可执行文件路径
ENV ZS_CLAUDE_PATH=/usr/local/bin/claude
```

```yaml
# ❌ 允许用户覆盖路径配置
environment:
  ZS_CLAUDE_PATH: /usr/local/bin/claude
```

**正确设计**:
```dockerfile
# ✅ 不设置路径环境变量，依赖 PATH
# 确保安装时已正确链接到 PATH
RUN npm install -g @anthropic-ai/claude-code \
    && ln -sf "$(command -v claude)" /usr/local/bin/claude
```

```bash
# ✅ 容器启动时预检
if ! command -v claude >/dev/null 2>&1; then
    echo "[entrypoint] ERROR: claude command not found in PATH" >&2
    echo "[entrypoint] Please ensure Claude Code is installed in the container" >&2
    exit 1
fi
```

**预防原则**:
- **不在仓库内显性定义可执行文件路径**
- **不让用户配置可执行文件路径**（除非高级调试场景）
- **只保证：安装成功 + 在 PATH 可执行**
- **启动时预检 + 清晰错误提示**

**文档更新**:
- 移除 compose 示例中的路径配置说明
- 强调"claude 已预安装，无需配置路径"
- `ZS_CLAUDE_PATH` 标记为"高级用户选项"

---

### 案例 6: Docker runner 中 worktree 因 safe.directory 失败

**问题**: runner docker 中无法开启 worktree 模式，必须先执行 `git config --global --add safe.directory <repo>` 才能继续。

**现象**:
- 进入 worktree 流程后 Git 命令立即失败
- 报错通常包含 `detected dubious ownership in repository`
- 用户感知为“worktree 模式坏了”，但目录与分支逻辑本身可能并无问题

**根因**:
- 容器中的仓库目录通常来自挂载卷或宿主 worktree，Git 会额外校验目录所有权与信任状态
- 系统只做了 worktree 功能层面的准备，却遗漏了 Git 基础环境契约：`safe.directory`
- 把“仓库路径存在”误当成“Git 已认可该路径可操作”

**错误修复方式**:
```bash
# ❌ 出问题后让用户手工补命令，系统自身没有吸收经验
git config --global --add safe.directory "$REPO_DIR"
```

**正确思路**:
```bash
# ✅ 在 runner / worktree 初始化阶段做前置校验
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  repo_dir="$(git rev-parse --show-toplevel)"
  if ! git config --global --get-all safe.directory | grep -Fx "$repo_dir" >/dev/null; then
    git config --global --add safe.directory "$repo_dir"
  fi
fi
```

**预防**:
- 把 `safe.directory` 视为 Docker + Git + worktree 的跨层契约，不要留给用户兜底
- 对主仓库路径与新建 worktree 路径分别做 trust 校验
- 在容器启动或 runner 初始化日志中打印脱敏后的 repo path 与 trust check 结果
- 增加覆盖挂载目录、rootless、不同 uid/gid 组合的集成测试

---

### 案例 7: 多架构 Docker 发布卡在单镜像

**问题**: GitHub Actions 中 `publish (hub, Dockerfile.hub)` 长时间停留在 `Build and push`，而同一工作流里的 runner 镜像已经完成，导致 `zs-hub` 镜像长期未成功发布。

**现象**:
- PR 校验只验证 `linux/amd64`，可以快速通过。
- `compose-smoke` 也只在本机候选镜像上做单架构冒烟。
- 真正发布时才执行 `platforms: linux/amd64,linux/arm64` 的 buildx push。
- `Dockerfile.hub` 比 `Dockerfile.runner` 多一个 `web-build` 阶段，会执行 `bun run build:web` / `vite build`。
- workflow 运行中，runner 发布在约 9 分钟内完成，但 hub 发布 job 在 30+ 分钟后仍停在 `Build and push`。

**根因**: 团队把“单架构本地构建成功”误当成“多架构发布没风险”。实际上 `Dockerfile.hub` 拥有额外的前端构建阶段，且该阶段只在真正的多架构发布路径上被完整放大；一旦某个目标架构（高概率是 `linux/arm64` + QEMU）特别慢或卡住，整个 matrix 项就会看起来像“GHCR 没推上去”。

**错误思路**:
```yaml
# ❌ 只看最终 publish 步骤，缺少按架构可观测性
- uses: docker/build-push-action@v6
  with:
    file: Dockerfile.hub
    platforms: linux/amd64,linux/arm64
    push: true
```

**正确思路**:
```text
# ✅ 把“单架构验证”与“多架构发布”视为不同契约
1. 先确认哪个镜像、哪个架构慢
2. 检查该镜像是否有额外构建阶段（如 vite build）
3. 为多架构阶段增加可观测性，而不是只盯着 registry
```

**预防**:
- 对多架构镜像单独评估最慢路径，不要只复用 `linux/amd64` 校验结论。
- 当某个镜像拥有独有构建阶段时，把它当作独立风险项记录进 spec。
- 为 publish job 增加“按架构拆分 / 进度输出 / 超时阈值”的可观测性，避免长时间 `in_progress` 无法定位。
- 在发布前优先检查 `Dockerfile.*` 差异，而不是看到另一个镜像成功就默认 workflow 没问题。

## 何时使用这个指南

### 触发条件

- [ ] 编写涉及文件系统操作的代码
- [ ] 编写涉及进程管理的代码
- [ ] 编写涉及 shell 命令的代码
- [ ] 编写涉及环境变量的代码
- [ ] 编写涉及路径操作的代码
- [ ] 迁移 shell 脚本到 TypeScript/JavaScript

### 使用流程

1. **编码前**: 浏览本指南的"常见陷阱"部分
2. **编码中**: 遇到危险信号时，查阅"快速参考"
3. **编码后**: 使用"检查清单"自我审查
4. **PR 前**: 确保在 Windows 上测试过（或标注需要测试）

---
