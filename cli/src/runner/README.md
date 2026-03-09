# zs CLI Runner：控制流与生命周期

Runner 是一个常驻后台进程，用于管理 HAPI 会话、支持移动端远程控制，并在 CLI 版本变化时处理自动更新。

## 1. Runner 生命周期

### 启动 Runner

命令：`zs runner start`

控制流程：
1. `src/index.ts` 接收 `runner start` 命令。
2. 通过 `spawnHappyCLI(['runner', 'start-sync'], { detached: true })` 拉起 detached 进程。
3. 新进程调用 `src/runner/run.ts` 中的 `startRunner()`。
4. `startRunner()` 执行启动流程：
   - 初始化 shutdown promise 及处理器（SIGINT、SIGTERM、uncaughtException、unhandledRejection）。
   - 版本检查：`isRunnerRunningCurrentlyInstalledHappyVersion()` 比较 CLI 二进制 mtime。
   - 若版本不一致：先调用 `stopRunner()` 终止旧 runner。
   - 若相同版本已在运行：输出 “Runner already running” 并退出。
   - 获取锁：`acquireRunnerLock()` 创建独占 lock 文件，防止多个 runner 并发。
   - 直连初始化：`authAndSetupMachineIfNeeded()` 确保 `CLI_API_TOKEN` 与 `machineId` 已准备。
   - 状态持久化：写入 runner.state.json（PID、版本、HTTP 端口、mtime）。
   - HTTP 服务：在随机端口启动 Fastify，用于本地 CLI 控制（list、stop、spawn）。
   - WebSocket：通过 `ApiMachineClient` 与后端保持长连接。
   - RPC 注册：暴露 `spawn-happy-session`、`stop-session`、`stop-runner` 处理器。
   - 心跳循环：每 60 秒（或 `ZS_RUNNER_HEARTBEAT_INTERVAL`）检查版本更新、清理死会话、校验 PID 归属。
5. 等待 shutdown promise 被 resolve，触发来源包括：
   - 收到 OS 信号（SIGINT/SIGTERM）- source: `os-signal`
   - 调用 HTTP `/stop` 端点 - source: `zs-cli`
   - 调用 RPC `stop-runner` - source: `zs-app`
   - 发生未捕获异常 - source: `exception`
6. 关闭时 `cleanupAndShutdown()` 执行：
   - 清除心跳 interval
   - 向后端更新 runner 为 `shutting-down`（带 shutdown source）
   - 断开 WebSocket
   - 停止 HTTP 服务
   - 删除 runner.state.json
   - 释放 lock 文件
   - 退出进程

### 版本检测与自动更新

Runner 会检测 CLI 二进制变化（例如执行 `npm upgrade @jlovec/zhushen` 后）：
1. 启动时记录 `startedWithCliMtimeMs`（CLI 二进制文件修改时间）。
2. 心跳中通过 `getInstalledCliMtimeMs()` 对比当前 mtime 与记录值。
3. 若 mtime 变化：
   - 清除心跳 interval
   - 通过 `spawnHappyCLI(['runner', 'start'])` 拉起新 runner
   - 等待 10 秒，由新 runner 杀掉旧进程
4. 新 runner 启动后发现旧 runner mtime 不一致。
5. 新 runner 调用 `stopRunner()`，先尝试 HTTP `/stop`，失败则回退 SIGKILL。
6. 新 runner 接管运行。

### 心跳系统

每 60 秒执行一次（可由 `ZS_RUNNER_HEARTBEAT_INTERVAL` 配置）：
1. **Guard**：若上一轮心跳仍在运行则跳过（防并发心跳）。
2. **Session Pruning**：对每个跟踪 PID 调用 `isProcessAlive(pid)`，移除已死亡会话。
3. **Version Check**：比较 CLI 二进制 mtime，变化则触发自重启。
4. **PID Ownership**：验证当前 runner 仍拥有 state 文件，若被接管则自终止。
5. **State Update**：写入 runner.state.json 的 `lastHeartbeat` 时间戳。

### 停止 Runner

命令：`zs runner stop`

控制流程：
1. `controlClient.ts` 中的 `stopRunner()` 读取 runner.state.json。
2. 先尝试通过 HTTP POST `/stop` 优雅关闭。
3. Runner 收到请求后以 `zs-cli` 作为 source 触发 shutdown。
4. `cleanupAndShutdown()` 执行：
   - 更新后端状态为 `shutting-down`
   - 关闭 WebSocket
   - 停止 HTTP 服务
   - 删除 runner.state.json
   - 释放 lock 文件
5. 若 HTTP 方式失败，回退到 `killProcess(pid, true)`（Windows 使用 `taskkill /T /F`）。

## 2. 多 Agent 支持

Runner 支持拉起不同 AI Agent 的会话：

| Agent | 命令 | Token 环境 |
|-------|------|------------|
| `claude`（默认） | `zs claude` | `CLAUDE_CODE_OAUTH_TOKEN` |
| `codex` | `zs codex` | `CODEX_HOME`（包含 `auth.json` 的临时目录） |
| `gemini` | `zs gemini` | - |
| `opencode` | `zs opencode` | OpenCode 配置（不注入 token） |

### Token 认证

在带 token 拉起会话时：
- **Claude**：设置环境变量 `CLAUDE_CODE_OAUTH_TOKEN`。
- **Codex**：在 `os.tmpdir()/zs-codex-*` 创建临时目录，将 token 写入 `auth.json`，并设置 `CODEX_HOME`。
- **OpenCode**：不注入 token，依赖 OpenCode 自身配置。

## 3. 会话管理

### Runner 拉起的会话（Remote）

由移动端通过后端 RPC 发起：
1. 后端通过 WebSocket 将 RPC `spawn-happy-session` 转发给 runner。
2. `ApiMachineClient` 调用 `spawnSession()` handler。
3. `spawnSession()`：
   - 校验 / 创建目录（含审批流程）
   - 配置 Agent 对应的 token 环境
   - 以 `--zs-starting-mode remote --started-by runner` 启动 detached zs 进程
   - 加入 `pidToTrackedSession` map
   - 设置 15 秒 session webhook 等待器
4. 新 zs 进程：
   - 在后端创建 session 并获得 `happySessionId`
   - 调用 `notifyRunnerSessionStarted()`，向 runner 的 `/session-started` 发 POST
5. Runner 更新跟踪信息并写入 `happySessionId`，resolve 等待器。
6. RPC 返回 session 信息给移动端。

### 终端直接拉起的会话

用户直接运行 `zs`：
1. CLI 按配置自动启动 runner。
2. zs 进程调用 `notifyRunnerSessionStarted()`。
3. Runner 接收 webhook，创建 `TrackedSession`，`startedBy: 'zs directly - likely by user from terminal'`。
4. 会话纳入健康监控。

### 目录创建审批

拉起会话时的目录处理：
1. 用 `fs.access()` 检查目录是否存在。
2. 若不存在且 `approvedNewDirectoryCreation = false`：返回 `requestToApproveDirectoryCreation`（HTTP 409）。
3. 若不存在且已批准：使用 `fs.mkdir({ recursive: true })` 创建目录。
4. 目录创建错误处理：
   - `EACCES`：权限不足
   - `ENOTDIR`：路径上已有同名文件
   - `ENOSPC`：磁盘空间不足
   - `EROFS`：只读文件系统

### 会话终止

通过 RPC `stop-session` 或 HTTP `/stop-session`：
1. `stopSession()` 通过 `happySessionId` 或 `PID-{pid}` 格式查找会话。
2. 通过 `killProcessByChildProcess()` 或 `killProcess()` 发起终止（Windows 使用 `taskkill /T`）。
3. `on('exit')` 处理器将会话从跟踪 map 中移除。

## 4. HTTP 控制服务（Fastify）

本地 HTTP 服务基于 Fastify，使用 `fastify-type-provider-zod` 实现类型安全请求 / 响应校验。

**Host：**127.0.0.1（仅本机）
**Port：**动态分配（系统决定）

### 端点

#### POST `/session-started`
Session webhook：会话创建后主动上报。

**Request：**
```json
{ "sessionId": "string", "metadata": { ... } }
```
**Response (200)：**
```json
{ "status": "ok" }
```

#### POST `/list`
返回全部被跟踪会话。

**Response (200)：**
```json
{
  "children": [
    { "startedBy": "runner", "happySessionId": "uuid", "pid": 12345 }
  ]
}
```

#### POST `/stop-session`
终止指定会话。

**Request：**
```json
{ "sessionId": "string" }
```
**Response (200)：**
```json
{ "success": true }
```

#### POST `/spawn-session`
创建新会话。

**Request：**
```json
{ "directory": "/path/to/dir", "sessionId": "optional-uuid" }
```
**Response (200) - Success：**
```json
{
  "success": true,
  "sessionId": "uuid",
  "approvedNewDirectoryCreation": true
}
```
**Response (409) - Requires Approval：**
```json
{
  "success": false,
  "requiresUserApproval": true,
  "actionRequired": "CREATE_DIRECTORY",
  "directory": "/path/to/dir"
}
```
**Response (500) - Error：**
```json
{ "success": false, "error": "Error message" }
```

#### POST `/stop`
优雅关闭 runner。

**Response (200)：**
```json
{ "status": "stopping" }
```

## 5. 状态持久化

### runner.state.json
```json
{
  "pid": 12345,
  "httpPort": 50097,
  "startTime": "8/24/2025, 6:46:22 PM",
  "startedWithCliVersion": "0.9.0-6",
  "startedWithCliMtimeMs": 1724531182000,
  "lastHeartbeat": "8/24/2025, 6:47:22 PM",
  "runnerLogPath": "/path/to/runner.log"
}
```

### Lock 文件
- 使用 O_EXCL 原子获取。
- 文件内记录 PID 便于排查。
- 用于防止多个 runner 同时运行。
- 优雅关闭时清理。

## 6. WebSocket 通信

`ApiMachineClient` 负责双向通信：

**Runner -> Server：**
- `machine-alive`：20 秒心跳
- `machine-update-metadata`：静态机器信息变化
- `machine-update-state`：runner 状态变化

**Server -> Runner：**
- `rpc-request`，方法包括：
  - `spawn-happy-session`：拉起新会话
  - `stop-session`：按 ID 停止会话
  - `stop-runner`：请求关闭 runner

全部数据为 TLS 上的明文 JSON；认证方式是 `CLI_API_TOKEN`（非端到端加密）。

## 7. 进程发现与清理

### Doctor 命令

`zs doctor` 使用 `ps aux | grep` 查找 Zhushen 相关进程：
- 生产模式：匹配 `zs` 二进制、`happy-coder`
- 开发模式：匹配 `src/index.ts`（通过 `bun` 运行）
- 依据命令参数分类：runner、runner-spawned、user-session、doctor

### 清理失控进程

`zs doctor clean`：
1. `findRunawayHappyProcesses()` 过滤疑似孤儿进程。
2. `killRunawayHappyProcesses()`：
   - 先发 SIGTERM
   - 等待 1 秒
   - 若仍存活再发 SIGKILL

## 8. 集成测试

### 测试环境
- 需要 `.env.integration-test`
- 使用本地 zhushen-hub（`http://localhost:3006`）
- 使用独立 `~/.zhushen-dev-test` 目录

### 关键测试场景
- 会话列表、拉起、停止
- 外部会话 webhook 跟踪
- SIGTERM / SIGKILL 优雅关闭
- 防止多 runner 并发
- 版本不匹配检测
- 目录创建审批流程
- 并发会话压力测试

---

# 机器同步架构：拆分 Metadata 与 Runner State

> 直连说明：这里的 “hub” 指 `zhushen-hub`，payload 为明文 JSON（无 base64/加密），
> 认证使用 `CLI_API_TOKEN`（REST `Authorization: Bearer ...` + Socket.IO `handshake.auth.token`）。

## 数据结构（类似 Session 的 metadata + agentState）

```typescript
// 静态机器信息（很少变化）
interface MachineMetadata {
  host: string;              // hostname
  platform: string;          // darwin, linux, win32
  happyCliVersion: string;
  homeDir: string;
  happyHomeDir: string;
  happyLibDir: string;       // runtime path
}

// 动态 runner 状态（频繁更新）
interface RunnerState {
  status: 'running' | 'shutting-down' | 'offline';
  pid?: number;
  httpPort?: number;
  startedAt?: number;
  shutdownRequestedAt?: number;
  shutdownSource?: 'zs-app' | 'zs-cli' | 'os-signal' | 'exception';
}
```

## 1. CLI 启动阶段

检查 settings 中是否存在 machine ID：
- 若不存在：仅在本地创建 ID（供 session 关联）
- 不会在 hub 创建 machine（这是 runner 的职责）
- CLI 不负责 machine 细节；相关 API 与 schema 都在 runner 子模块

## 2. Runner 启动：初始注册

### REST 请求：`POST /cli/machines`
```json
{
  "id": "machine-uuid-123",
  "metadata": {
    "host": "MacBook-Pro.local",
    "platform": "darwin",
    "happyCliVersion": "1.0.0",
    "homeDir": "/Users/john",
    "happyHomeDir": "/Users/john/.zhushen",
    "happyLibDir": "/usr/local/lib/node_modules/@jlovec/zhushen"
  },
  "runnerState": {
    "status": "running",
    "pid": 12345,
    "httpPort": 8080,
    "startedAt": 1703001234567
  }
}
```

### 服务器响应：
```json
{
  "machine": {
    "id": "machine-uuid-123",
    "metadata": { "host": "...", "platform": "...", "happyCliVersion": "..." },
    "metadataVersion": 1,
    "runnerState": { "status": "running", "pid": 12345 },
    "runnerStateVersion": 1,
    "active": true,
    "activeAt": 1703001234567,
    "createdAt": 1703001234567,
    "updatedAt": 1703001234567
  }
}
```

## 3. WebSocket 连接与实时更新

### 连接握手：
```javascript
io(`${botUrl}/cli`, {
  auth: {
    token: "CLI_API_TOKEN",
    clientType: "machine-scoped",
    machineId: "machine-uuid-123"
  },
  path: "/socket.io/",
  transports: ["websocket"]
})
```

### 心跳（每 20 秒）：
```json
// Client -> Server
socket.emit('machine-alive', {
  "machineId": "machine-uuid-123",
  "time": 1703001234567
})
```

## 4. Runner State 更新（通过 WebSocket）

### 当 runner 状态变化时：
```json
// Client -> Server
socket.emit('machine-update-state', {
  "machineId": "machine-uuid-123",
  "runnerState": {
    "status": "shutting-down",
    "pid": 12345,
    "httpPort": 8080,
    "startedAt": 1703001234567,
    "shutdownRequestedAt": 1703001244567,
    "shutdownSource": "zs-app"
  },
  "expectedVersion": 1
}, callback)

// Server -> Client (callback)
// Success:
{
  "result": "success",
  "version": 2,
  "runnerState": { "status": "shutting-down" }
}

// Version mismatch:
{
  "result": "version-mismatch",
  "version": 3,
  "runnerState": { "status": "running" }
}
```

### 机器 metadata 更新（低频）：
```json
// Client -> Server
socket.emit('machine-update-metadata', {
  "machineId": "machine-uuid-123",
  "metadata": {
    "host": "MacBook-Pro.local",
    "platform": "darwin",
    "happyCliVersion": "1.0.1",
    "homeDir": "/Users/john",
    "happyHomeDir": "/Users/john/.zhushen"
  },
  "expectedVersion": 1
}, callback)
```

## 5. Web App RPC 调用（经 zhushen-hub）

Web App 调用 `zhushen-hub` 的 REST 端点（例如 `POST /api/machines/:id/spawn`）。
`zhushen-hub` 再通过 `/cli` namespace 的 Socket.IO `rpc-request` 转发给 runner。

machine-scoped RPC 方法名使用 `${machineId}:` 前缀，例如：
- `${machineId}:spawn-happy-session`

## 6. 服务端向客户端广播

### 当 runner state 变化时：
```json
// Server -> Mobile/Web clients
socket.emit('update', {
  "id": "update-id-xyz",
  "seq": 456,
  "body": {
    "t": "update-machine",
    "machineId": "machine-uuid-123",
    "runnerState": {
      "value": { "status": "shutting-down" },
      "version": 2
    }
  },
  "createdAt": 1703001244567
})
```

### 当 metadata 变化时：
```json
socket.emit('update', {
  "id": "update-id-abc",
  "seq": 457,
  "body": {
    "t": "update-machine",
    "machineId": "machine-uuid-123",
    "metadata": {
      "value": { "host": "MacBook-Pro.local" },
      "version": 2
    }
  },
  "createdAt": 1703001244567
})
```

## 7. 获取机器状态（REST）

### 请求：`GET /cli/machines/machine-uuid-123`
```http
Authorization: Bearer <CLI_API_TOKEN>
```

### 响应：
```json
{
  "machine": {
    "id": "machine-uuid-123",
    "metadata": { "host": "...", "platform": "...", "happyCliVersion": "..." },
    "metadataVersion": 2,
    "runnerState": { "status": "running", "pid": 12345 },
    "runnerStateVersion": 3,
    "active": true,
    "activeAt": 1703001244567,
    "createdAt": 1703001234567,
    "updatedAt": 1703001244567
  }
}
```

## 关键设计决策

1. **关注点分离**：
   - `metadata`：静态机器信息（host、platform、version）
   - `runnerState`：动态运行态（status、pid、port）

2. **独立版本控制**：
   - `metadataVersion`：用于 metadata 更新
   - `runnerStateVersion`：用于 runnerState 更新
   - 支持并发更新且减少冲突

3. **安全策略**：不做端到端加密（仅 TLS）；CLI 认证为共享密钥 `CLI_API_TOKEN`。

4. **更新事件模型**：服务端广播复用 session 同类模式：
   - `t: 'update-machine'`，可带 metadata 和/或 runnerState
   - 客户端仅接收变化字段

5. **RPC 规范**：machine-scoped RPC 方法名使用 machineId 前缀（与 session 一致）。

---

# Improvements

- runner.state.json 在 runner 退出或停止时会被硬删除。建议保留文件，并新增 `state` 与 `stateReason` 字段，说明当前状态与原因。
- 若找不到该文件：可视为 runner 从未启动，或被用户 / doctor 清理。
- 若文件存在但损坏：可考虑升级到最新版结构；若可写，也可直接删除。

- runner 的 post helpers 未返回类型化结果。
- `runnerPost` 目前返回“runner 响应或 `{ error: ... }`”二选一，不够一致。建议统一 envelope 类型。

- runner 退出 / 重启后会丢失对子进程的跟踪。建议将子进程（至少 PID）写入同一 state 文件，便于 doctor 与 cleanup。

- runner 控制服务当前绑定 `127.0.0.1` 随机端口；若未来对外暴露，必须要求显式认证 token/header。
