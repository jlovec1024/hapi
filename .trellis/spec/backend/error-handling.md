# 错误处理

> 本项目中错误的处理方式。

---

## 概述

HAPI Hub 遵循务实的错误处理方法：

- **HTTP API**：返回 `{ error: string }` JSON 并使用适当的 HTTP 状态码
- **Socket.IO**：静默忽略无效事件（除非需要，否则不向客户端传播错误）
- **数据库**：使用结果类型（`VersionedUpdateResult`）而不是抛出异常
- **守卫**：返回 `Response | T` 联合类型，使用前先检查
- **输入验证**：使用 Zod schema 的 `.safeParse()`（验证失败时不抛出异常）

**核心原则**：优雅失败。不要因为无效输入而让服务器崩溃。

---

## HTTP API 错误响应

### 标准格式

所有错误响应使用 `{ error: string }` JSON：

```typescript
// 400 - Bad Request（无效输入）
return c.json({ error: 'Invalid body' }, 400)

// 401 - Unauthorized（未授权）
return c.json({ error: 'Unauthorized' }, 401)

// 403 - Forbidden（存在但访问被拒绝）
return c.json({ error: 'Session access denied' }, 403)

// 404 - Not Found（未找到）
return c.json({ error: 'Session not found' }, 404)

// 409 - Conflict（冲突）
return c.json({ error: 'Session is inactive' }, 409)

// 503 - Service Unavailable（依赖未就绪）
return c.json({ error: 'Not connected' }, 503)
```

**状态码指南**：
- `400` - 无效的请求体/参数
- `401` - 未认证
- `403` - 已认证但访问被拒绝（命名空间不匹配等）
- `404` - 资源未找到
- `409` - 冲突（错误状态）
- `413` - 负载过大
- `422` - 验证错误（格式有效但语义无效）
- `503` - 服务依赖不可用（同步引擎、机器未在线）

### 路由处理器中的错误响应

```typescript
app.post('/sessions/:id/resume', async (c) => {
    // 1. 使用守卫检查依赖
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine  // 守卫返回了错误

    // 2. 使用守卫检查资源访问
    const sessionResult = requireSessionFromParam(c, engine)
    if (sessionResult instanceof Response) return sessionResult

    // 3. 执行操作，检查结果
    const result = await engine.resumeSession(sessionResult.sessionId, namespace)
    if (result.type === 'error') {
        const status = result.code === 'no_machine_online' ? 503 : 500
        return c.json({ error: result.message }, status)
    }

    return c.json({ success: true })
})
```

---

## 守卫模式

### 什么是守卫？

守卫是返回 `T | Response` 的函数。如果返回 `Response`，调用者应立即返回它。

```typescript
function requireSyncEngine(
    c: Context,
    getSyncEngine: () => SyncEngine | null
): SyncEngine | Response {
    const engine = getSyncEngine()
    if (!engine) {
        return c.json({ error: 'Not connected' }, 503)
    }
    return engine
}
```

### 使用守卫

```typescript
// 检查守卫返回值
const engine = requireSyncEngine(c, getSyncEngine)
if (engine instanceof Response) return engine

// 现在可以安全使用 engine
const result = await engine.doSomething()
```

**为什么使用守卫？**
- 避免嵌套的 if/else
- 集中错误响应逻辑
- 类型安全（TypeScript 知道检查后的类型）

---

## Socket.IO 错误处理

### 静默忽略无效事件

Socket.IO 事件处理器**不应抛出异常**。使用 Zod `.safeParse()` 并静默忽略无效输入：

```typescript
socket.on('session:create', (data) => {
    // 验证输入
    const parsed = sessionCreateSchema.safeParse(data)
    if (!parsed.success) {
        // 静默忽略 - 来自有问题客户端的无效事件是预期的
        return
    }

    // 处理有效事件
    handleSessionCreate(parsed.data)
})
```

**为什么静默忽略？**
- 客户端可能发送格式错误的数据
- 抛出异常会断开 socket
- 记录每个无效事件会产生噪音

### 何时发送错误给客户端

只在客户端需要知道操作失败时才发送错误：

```typescript
socket.on('session:create', async (data, callback) => {
    const parsed = sessionCreateSchema.safeParse(data)
    if (!parsed.success) {
        callback?.({ error: 'Invalid request' })
        return
    }

    const result = await createSession(parsed.data)
    if (result.type === 'error') {
        callback?.({ error: result.message })
        return
    }

    callback?.({ success: true, sessionId: result.sessionId })
})
```


---

## Scenario: Terminal Socket Lifecycle Contract (detach / reattach / expire)

### 1. Scope / Trigger

- 触发条件：修改 terminal socket 生命周期，包括 Web 断开、重新进入 terminal 页、Hub idle timeout 清理、CLI 终端复用。
- 为什么需要 code-spec 深度：
  - 这是 Web socket / Hub registry / CLI terminal process 之间的跨层契约。
  - 如果 disconnect、reattach、expire 行为未显式定义，就会导致重复 `terminal:open`、终端重置或“not found”闪断。

### 2. Signatures

- Hub terminal registry：

```typescript
register(terminalId: string, sessionId: string, socketId: string | null, cliSocketId: string): TerminalRegistryEntry | null
rebindSocket(terminalId: string, socketId: string | null): TerminalRegistryEntry | null
detachSocket(socketId: string): TerminalRegistryEntry[]
removeByCliSocket(socketId: string): TerminalRegistryEntry[]
```

- Web -> Hub terminal events：

```typescript
socket.emit('terminal:create', {
    sessionId: string,
    terminalId: string,
    cols: number,
    rows: number,
})

socket.emit('terminal:write', {
    terminalId: string,
    data: string,
})

socket.emit('terminal:resize', {
    terminalId: string,
    cols: number,
    rows: number,
})
```

- Hub -> Web terminal events：

```typescript
socket.emit('terminal:ready', { terminalId: string })
socket.emit('terminal:error', { terminalId: string, message: string })
socket.emit('terminal:exit', { terminalId: string, code: number | null, signal: string | null })
```

- Hub -> CLI terminal events：

```typescript
cliSocket.emit('terminal:open', {
    sessionId: string,
    terminalId: string,
    cols: number,
    rows: number,
})

cliSocket.emit('terminal:close', {
    sessionId: string,
    terminalId: string,
})
```

### 3. Contracts

- disconnect 契约：
  - Web terminal socket 断开时，Hub 必须调用 `terminalRegistry.detachSocket(socket.id)`。
  - detach 的语义是把 entry 的 `socketId` 设为 `null`，保留 `terminalId/sessionId/cliSocketId`，等待后续 reattach。
  - detach 不是删除；只有 idle timeout、显式 close、CLI socket 消失时才真正 remove。

- reattach 契约：
  - 当 `terminal:create` 带着已存在的 `terminalId` 再次到达，且 `sessionId` 相同，同时 registry 中该 entry 的 `socketId === null` 或等于当前 socket 时，Hub 必须 reattach。
  - reattach 成功后，Hub 只向 Web 发 `terminal:ready`，不得再次向 CLI 发 `terminal:open`。

- conflict 契约：
  - 如果已存在的 `terminalId` 属于其他 session，必须返回 `terminal:error`，message 为 `Terminal ID is already in use by another session.`。
  - 如果 `terminalId` 属于同 session，但仍被其他活跃 socket 绑定，必须返回 `terminal:error`，message 为 `Terminal ID is already in use by another socket.`。

- expire 契约：
  - entry 到达 idle timeout 后，Hub 应回调 `onIdle`，然后 remove 对应 terminal。
  - 前端随后若再用旧 `terminalId` 重连，应收到 `Terminal not found.` 并走新建终端流程。

### 4. Validation & Error Matrix

- `terminal:create` payload schema 校验失败 -> 静默忽略，不抛异常。
- session 不存在 / inactive / namespace 不匹配 -> `terminal:error('Session is inactive or unavailable.')`。
- 没有可用 CLI socket -> `terminal:error('CLI is not connected for this session.')`。
- 同 `terminalId` + 同 session + `socketId === null` -> reattach，发送 `terminal:ready`，不发送 `terminal:open`。
- 同 `terminalId` + 同 session + `socketId === current socket.id` -> 允许幂等重入，发送 `terminal:ready`。
- 同 `terminalId` + 不同 session -> `terminal:error('Terminal ID is already in use by another session.')`。
- 同 `terminalId` + 同 session + 其他活跃 socket -> `terminal:error('Terminal ID is already in use by another socket.')`。
- CLI socket 失效 -> remove entry；如需要告知 Web，则发送 `terminal:error('CLI disconnected.')`。

### 5. Good / Base / Bad Cases

- Good：
  - Web 页离开导致 socket 断开，Hub 仅 detach；用户在 idle timeout 前返回时，Hub reattach 并回 `terminal:ready`，CLI 不收到第二次 `terminal:open`。
- Base：
  - 新 terminalId 首次创建时，Hub register 成功，并向 CLI 发送一次 `terminal:open`。
- Bad：
  - Web 只是短暂离开页面，Hub 却立即 remove entry；用户返回时只能收到 `Terminal not found.`，终端被无谓重置。

### 6. Tests Required

- Unit（registry）：
  - 断言 `detachSocket(socketId)` 不会删除 entry，只会把 `socketId` 置空。
  - 断言 idle timeout 到达后 entry 被 remove。
- Handler tests：
  - 断言同 socket / 同 session / 同 terminalId 幂等创建时，不会发送 duplicate-id error。
  - 断言 stale socket detach 后，同 terminalId 重入只返回 `terminal:ready`，且 CLI 不再收到 `terminal:open`。
  - 断言 session conflict / socket conflict 时返回正确错误 message。
- Integration：
  - 断言 Web reconnect before timeout 能恢复同一 terminalId。
  - 断言 Web reconnect after timeout 会收到 not found 并由前端新建 terminal。

### 7. Wrong vs Correct

#### Wrong

```typescript
socket.on('disconnect', () => {
    terminalRegistry.removeBySocket(socket.id)
})
```

#### Correct

```typescript
socket.on('disconnect', () => {
    terminalRegistry.detachSocket(socket.id)
})

if (existing && existing.sessionId === sessionId && existing.socketId === null) {
    terminalRegistry.rebindSocket(terminalId, socket.id)
    socket.emit('terminal:ready', { terminalId })
    return
}
```

### 使用结果类型

数据库操作返回结果类型而不是抛出异常：

```typescript
export type VersionedUpdateResult =
    | { type: 'success' }
    | { type: 'not_found' }
    | { type: 'version_mismatch', expected: number, actual: number }

export function updateSession(
    db: Database,
    id: string,
    version: number,
    updates: Partial<Session>
): VersionedUpdateResult {
    const current = getSessionById(db, id)
    if (!current) return { type: 'not_found' }
    if (current.version !== version) {
        return { type: 'version_mismatch', expected: version, actual: current.version }
    }

    // 执行更新
    db.prepare('UPDATE sessions SET ... WHERE id = ?').run(id)
    return { type: 'success' }
}
```

### 处理数据库结果

```typescript
const result = updateSession(db, id, version, updates)

if (result.type === 'not_found') {
    return c.json({ error: 'Session not found' }, 404)
}

if (result.type === 'version_mismatch') {
    return c.json({ error: 'Version mismatch' }, 409)
}

// result.type === 'success'
return c.json({ success: true })
```

---

## 输入验证

### 使用 Zod `.safeParse()`

**永远不要**使用 `.parse()`（会抛出异常）。始终使用 `.safeParse()`：

```typescript
// ❌ 错误 - 会抛出异常
const data = requestSchema.parse(body)

// ✅ 正确 - 返回结果
const parsed = requestSchema.safeParse(body)
if (!parsed.success) {
    return c.json({ error: 'Invalid body' }, 400)
}

// 使用 parsed.data
```

### 处理 JSON 解析错误

`c.req.json()` 可能抛出异常。使用 `.catch()` 处理：

```typescript
const body = await c.req.json().catch(() => null)
if (!body) {
    return c.json({ error: 'Invalid JSON' }, 400)
}

const parsed = requestSchema.safeParse(body)
if (!parsed.success) {
    return c.json({ error: 'Invalid body' }, 400)
}
```

---

## 后台服务错误处理

### 不要让后台任务崩溃服务器

后台服务应捕获并记录错误，但继续运行：

```typescript
async function backgroundTask() {
    while (true) {
        try {
            await doSomething()
        } catch (error) {
            console.error('[Background] Task failed:', error)
            // 继续运行 - 不要重新抛出
        }

        await sleep(1000)
    }
}
```

### 通知分发错误处理

通知失败不应阻止其他通知：

```typescript
async function dispatchNotification(event: NotificationEvent) {
    const clients = getClientsForEvent(event)

    for (const client of clients) {
        try {
            await client.send(event)
        } catch (error) {
            console.error('[Notification] Failed to send to client:', client.id, error)
            // 继续处理其他客户端
        }
    }
}
```

---

## 判别联合类型

### 用于多种失败模式的操作

当操作有多种失败模式时，使用判别联合：

```typescript
export type ResumeSessionResult =
    | { type: 'success' }
    | { type: 'error', code: 'not_found', message: string }
    | { type: 'error', code: 'no_machine_online', message: string }
    | { type: 'error', code: 'already_active', message: string }

export async function resumeSession(
    sessionId: string
): Promise<ResumeSessionResult> {
    const session = getSessionById(db, sessionId)
    if (!session) {
        return { type: 'error', code: 'not_found', message: 'Session not found' }
    }

    if (session.status === 'active') {
        return { type: 'error', code: 'already_active', message: 'Session is already active' }
    }

    const machine = findOnlineMachine(session.machineId)
    if (!machine) {
        return { type: 'error', code: 'no_machine_online', message: 'No machine online' }
    }

    // 恢复会话
    return { type: 'success' }
}
```

### 处理判别联合

```typescript
const result = await resumeSession(sessionId)

if (result.type === 'error') {
    const status = result.code === 'no_machine_online' ? 503 :
                   result.code === 'not_found' ? 404 : 409
    return c.json({ error: result.message }, status)
}

return c.json({ success: true })
```

---

## Spawn RPC 结果处理契约

### 问题

当处理来自 spawn RPC 的结果时，必须处理所有可能的响应形状，而不仅仅是预期的成功/错误情况。

### 错误示例 vs 正确示例

**❌ 错误**：只处理预期的 `errorMessage` 字段

```typescript
if (obj.type === 'error' && typeof obj.errorMessage === 'string') {
    return { type: 'error', message: obj.errorMessage }
}
return { type: 'error', message: 'Unexpected spawn result' }
```

**✅ 正确**：处理所有可能的错误形状

```typescript
if (obj.type === 'error' && typeof obj.errorMessage === 'string') {
    return { type: 'error', message: obj.errorMessage }
}
if (typeof obj.error === 'string') {
    return { type: 'error', message: obj.error }
}
if (obj.type === 'requestToApproveDirectoryCreation' && typeof obj.directory === 'string') {
    return { type: 'error', message: `Directory does not exist: ${obj.directory}` }
}
return { type: 'error', message: 'Unexpected spawn result' }
```

**为什么？**
- Spawn 结果可能有多种错误形状
- 不同的 CLI 版本可能返回不同的字段
- 必须优雅地处理所有情况

---

## 记录错误

### 何时记录

**应该记录**：
- 意外错误（异常、数据库错误、网络失败）
- 后台任务失败
- 服务初始化失败
- 配置问题

```typescript
try {
    await doSomething()
} catch (error) {
    console.error('[Component] Failed to do something:', error)
    // 继续或返回错误响应
}
```

**不应记录**：
- 预期的验证失败（用户发送了错误输入）
- 404（资源未找到）
- 认证失败（正常操作中的预期情况）

### 控制台日志

使用适当的日志级别：

```typescript
// 信息 - 正常操作
console.log('[Component] Operation completed')

// 警告 - 非致命问题
console.warn('[Component] Configuration issue detected')

// 错误 - 意外失败
console.error('[Component] Operation failed:', error)
```

---

## 常见错误

- ❌ 使用 Zod `.parse()`（验证失败时抛出异常）- 使用 `.safeParse()`
- ❌ 不检查守卫返回值（`if (engine instanceof Response)`）
- ❌ 在 Socket.IO 事件处理器中抛出错误（会导致 socket 崩溃）
- ❌ 对 404/403 情况返回 500（使用正确的状态码）
- ❌ 不捕获 JSON 解析错误（`c.req.json()` 可能抛出异常 - 使用 `.catch(() => null)`）
- ❌ 在后台服务中吞掉错误而不记录
- ❌ 对有多种失败模式的操作不使用判别联合
- ❌ 向客户端暴露内部错误详情（对 500 使用通用消息）
- ❌ 因后台任务错误而让服务器崩溃
- ❌ 对捕获的错误使用 `any`（使用 `unknown`）

---

## 最佳实践

- ✅ 对所有 HTTP 错误返回 `{ error: string }` JSON
- ✅ 使用适当的 HTTP 状态码
- ✅ 对依赖检查使用守卫模式（`T | Response`）
- ✅ 对所有输入验证使用 Zod `.safeParse()`
- ✅ 对数据库操作使用结果类型
- ✅ 对有多种失败模式的操作使用判别联合
- ✅ 使用 `console.error` 记录意外错误
- ✅ 不要让后台服务崩溃 - 捕获并继续
- ✅ 使用 `.catch(() => null)` 显式处理 JSON 解析错误
- ✅ 对捕获的错误使用 `unknown` 类型，使用前先收窄
