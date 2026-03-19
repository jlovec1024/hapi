# 状态管理

> 本项目中状态的管理方式。

---

## 概述

Zhushen Web 采用**混合式状态管理方案**：

1. **本地组件状态**（`useState`、`useReducer`）用于仅影响 UI 的状态
2. **TanStack Query** 用于服务端状态（API 数据、缓存、同步）
3. **模块级 store** 用于不适合 React Query 的跨组件状态
4. **URL 状态**（TanStack Router）用于导航与可分享状态
5. **Context** 用于依赖注入（API client、session context）

**不使用全局状态库**（Redux、Zustand 等）——状态尽量保持在靠近使用处。

---

## 状态分类

### 1. 本地组件状态

对于只影响单个组件的状态，使用 `useState` 或 `useReducer`：

```typescript
// 仅 UI 使用的状态
const [isOpen, setIsOpen] = useState(false)
const [copied, setCopied] = useState(false)
const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
```

**适用场景**：
- UI 开关（modal、dropdown、展开/收起）
- 表单输入值（提交前）
- 临时 UI 状态（loading spinner、动画）

### 2. 服务端状态（TanStack Query）

所有服务端数据都使用 TanStack Query：

```typescript
// 读取查询
const { sessions, isLoading, error, refetch } = useSessions(api)

// 写入 mutation
const { sendMessage, isSending } = useSendMessage(api, sessionId)
```

**适用场景**：
- 任何来自 API endpoint 的数据
- 需要缓存的数据
- 需要后台重新获取的数据
- 乐观更新

**配置**（`lib/query-client.ts`）：
```typescript
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5_000,           // 缓存 5 秒
            refetchOnWindowFocus: false, // Tab 聚焦时不自动重新获取
            retry: 1,                    // 查询失败后重试一次
        },
        mutations: {
            retry: 0,                    // mutation 不自动重试
        },
    },
})
```

### 3. 模块级 Store

对于不适合 React Query 的跨组件状态，使用带订阅模式的模块级 store：

```typescript
// lib/message-window-store.ts
const states = new Map<string, MessageWindowState>()
const listeners = new Map<string, Set<() => void>>()

export function getMessageWindowState(sessionId: string): MessageWindowState {
    return states.get(sessionId) ?? createInitialState(sessionId)
}

export function subscribeToMessageWindow(sessionId: string, listener: () => void): () => void {
    const sessionListeners = listeners.get(sessionId) ?? new Set()
    sessionListeners.add(listener)
    listeners.set(sessionId, sessionListeners)
    return () => sessionListeners.delete(listener)
}

export function updateMessageStatus(sessionId: string, localId: string, status: MessageStatus): void {
    const state = getMessageWindowState(sessionId)
    // ... 更新状态
    notifyListeners(sessionId)
}
```

**适用场景**：
- 实时消息窗口（乐观更新、待发送消息）
- 需要在组件卸载后继续保留的状态
- 多个无直接关系组件共享的状态
- 对性能敏感的状态（避免 React 级联重渲染）

**模式**：暴露 getters、setters 与订阅函数。组件在 `useEffect` 中订阅。

### 4. URL 状态（TanStack Router）

可分享 / 可收藏的状态使用 URL 参数表示：

```typescript
// 路由定义
export const Route = createFileRoute('/sessions/$sessionId')({
    component: SessionPage,
})

// 组件中读取
const { sessionId } = Route.useParams()
```

**适用场景**：
- 当前页面/视图（session ID、settings tab）
- 筛选条件与搜索参数
- 任何应该能通过 URL 分享的状态

### 5. Context（依赖注入）

Context 用于向组件树下传递依赖，而不是承载频繁变化的状态：

```typescript
// components/AssistantChat/context.tsx
export type ZhushenChatContextValue = {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    disabled: boolean
    onRefresh: () => void
}

export function ZhushenChatProvider(props: { value: ZhushenChatContextValue; children: ReactNode }) {
    return <ZhushenChatContext.Provider value={props.value}>{props.children}</ZhushenChatContext.Provider>
}
```

**适用场景**：
- 向深层组件传递 API client
- 功能级配置（session context、theme）
- 需要在深层组件中可访问的 callbacks

**不要用于**：
- 高频变化的状态（会导致整棵子树重渲染）
- 本可以放在本地状态或 React Query 中的状态

---

## 何时使用全局状态

**默认优先本地状态。** 只有在以下情况下才提升为全局：

1. **多个无直接关系的组件**需要共享同一份状态
2. **状态必须持久化**，即使组件卸载也不能丢失
3. **性能敏感**（避免 prop drilling 导致重复渲染）
4. **实时更新**，且不适合 React Query 的数据模型

**示例**：消息窗口状态之所以做成全局，是因为：
- 多个组件都需要它（thread、composer、status bar）
- 滚动或切换导致组件卸载时也必须保留
- 乐观更新需要立刻反馈到 UI
- 实时消息通过 WebSocket 到达

---

## 服务端状态最佳实践

### Query Keys

统一收敛在 `lib/query-keys.ts`：

```typescript
export const queryKeys = {
    sessions: ['sessions'] as const,
    session: (id: string) => ['session', id] as const,
    messages: (sessionId: string) => ['messages', sessionId] as const,
    machines: ['machines'] as const,
}
```

### 乐观更新

对于需要即时反馈的 mutation：

```typescript
const mutation = useMutation({
    mutationFn: async (input) => {
        await api.sendMessage(input.sessionId, input.text, input.localId)
    },
    onMutate: async (input) => {
        // 立即把消息加到 UI 中
        appendOptimisticMessage(input.sessionId, {
            id: input.localId,
            content: { role: 'user', content: { type: 'text', text: input.text } },
            status: 'sending',
        })
    },
    onSuccess: (_, input) => {
        // 更新状态为 'sent'
        updateMessageStatus(input.sessionId, input.localId, 'sent')
    },
    onError: (_, input) => {
        // 更新状态为 'failed'
        updateMessageStatus(input.sessionId, input.localId, 'failed')
    },
})
```

### 缓存失效

mutation 成功后要使相关查询失效：

```typescript
const mutation = useMutation({
    mutationFn: async (sessionId) => {
        await api.deleteSession(sessionId)
    },
    onSuccess: () => {
        // 重新获取 sessions 列表
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
    },
})
```

---

## 派生状态

### 在 render 中直接计算

对于简单派生状态，直接在 render 中计算：

```typescript
function SessionList({ sessions }: { sessions: Session[] }) {
    const activeSessions = sessions.filter(s => s.active)
    const inactiveSessions = sessions.filter(s => !s.active)
    // ...
}
```

### 仅在昂贵计算时使用 useMemo

只有在计算成本较高时才使用 `useMemo`：

```typescript
const sortedSessions = useMemo(() => {
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
}, [sessions])
```

**不要**把 `useMemo` 用在便宜计算上——它本身也有开销。

---

## 常见错误

- ❌ 对频繁变化的状态使用 Context（导致重渲染）
- ❌ 过早提升状态（在真的需要共享之前应保持本地）
- ❌ 不用 TanStack Query 管理服务端数据（重复造缓存/重新获取轮子）
- ❌ 存储派生状态而不是直接计算
- ❌ 对便宜计算使用 `useMemo`（过早优化）
- ❌ mutation 后没有失效相关 queries
- ❌ 忘记清理模块级 store 的订阅
- ❌ 把纯 UI 状态塞进 URL（只有可分享状态才适合放那里）
- ❌ 在本地状态足够时仍使用全局状态
- ❌ 对可选 query 数据不提供默认值（`?? []`）
- ❌ 将 composer 草稿文本视为全局/thread 状态，而产品预期其实是**按 session 作用域持久化草稿**

---

## Session 级草稿契约（聊天输入框）

当聊天输入内容需要在 session 切换后仍然保留时，应遵循以下契约：

### 必需行为

- 草稿文本按 `session.id`（或等价的稳定 session 标识）进行作用域隔离。
- 从 session A 切走再回到 session A 时，应恢复它之前的草稿。
- 切到 session B 时，不得显示 session A 的草稿。
- 发送成功时，只清空当前活跃 session 的草稿。
- 未发送草稿在应用内部的 route/session tab 切换时不得丢失。

### 实现模式

- 维护一个以 session 为 key 的 draft store（`Map<sessionId, draft>` / 模块级 store / 持久化层）。
- 在活跃 session 变化时：
  - 通过 `draftStore.get(session.id) ?? ''` 将草稿注入到输入框
  - 每次变更或 debounce 后，都将编辑结果持久化到对应的 session key
- 对多 session UX，绝不能依赖一个未分作用域的 `composer.text` 值。

### 最低测试用例

- `A -> 输入 "123" -> 切换 B -> 切回 A` => 输入框内容应为 `123`。
- `A 有 "foo"，B 有 "bar"` => 切换 session 时应显示各自独立草稿。
- `A 发送消息` => A 的草稿被清空；B 的草稿保持不变。
- route remount / re-entry 后，仍能从 session 级 store 中恢复草稿。

---

## Terminal Session Resume Contract

### 1. 范围 / 触发条件

- 触发条件：终端页在同一浏览器标签页内离开后再进入，要求在 Hub idle timeout 之前恢复原终端会话。
- 为什么需要 code-spec 深度：
  - 这是跨层状态流：Web session store -> terminal socket hook -> Hub terminal registry -> CLI terminal process。
  - 如果 session identity、terminal identity 或 disconnect 语义不清晰，就会出现“重进页面后终端被重置”的回归。

### 2. 签名

- 前端 session 级 store：

```typescript
export type TerminalSessionState = {
    terminalId: string
    outputBuffer: string
    hasEverConnected: boolean
}

export function getTerminalSessionState(sessionId: string): TerminalSessionState
export function resetTerminalSessionState(sessionId: string): TerminalSessionState
export function clearTerminalSessionBuffer(sessionId: string): TerminalSessionState
export function appendTerminalSessionOutput(sessionId: string, chunk: string): TerminalSessionState
export function markTerminalSessionConnected(sessionId: string): TerminalSessionState
```

- 终端 socket hook：

```typescript
useTerminalSocket(options: {
    baseUrl: string
    token: string
    sessionId: string
    terminalId: string
    onTerminalNotFound?: () => void
}): {
    state:
        | { status: 'idle' }
        | { status: 'connecting' }
        | { status: 'connected' }
        | { status: 'reconnecting'; reason: string }
        | { status: 'error'; error: string }
    connect: (cols: number, rows: number) => void
    write: (data: string) => void
    resize: (cols: number, rows: number) => void
    disconnect: () => void
    onOutput: (handler: (data: string) => void) => void
    onExit: (handler: (code: number | null, signal: string | null) => void) => void
}
```

### 3. 契约

- session 级身份契约：
  - `terminalId` 必须按 `sessionId` 作用域缓存。
  - 同一标签页内从 terminal route 离开再回来时，只要 Hub 端 terminal 尚未超时，必须继续使用原 `terminalId`。
  - 切换到其他 session 时，不得复用前一个 session 的 `terminalId` 或输出缓冲。

- 输出缓冲契约：
  - `outputBuffer` 属于 session 级 store，而不是组件局部 state。
  - 组件重新挂载后，必须先 replay 已缓存 `outputBuffer`，再接收新的 socket output。
  - **replay 只能用于“恢复 / 初次挂载到既有 session buffer”场景，不得由每次 `outputBuffer` 变更驱动。**
  - **流式 socket output 必须以增量 append 方式直接写入终端实例，同时把 chunk 追加到 session store；不得在每个 chunk 到来时执行 `terminal.reset()` + 全量 buffer replay。**
  - **任何 replay gating（例如 `replayedBufferRef`）只能在 `terminalId` 切换、session 切换或显式 reset 后清空；不得在普通输出 chunk 到达时重置。**
  - buffer 需要有最大长度限制，避免无界增长。

- 过期恢复契约：
  - 当 hook 收到 `terminal:error` 且消息为 `Terminal not found.` 时，必须进入 `reconnecting` 状态。
  - `onTerminalNotFound` 必须执行：重置当前 session 对应的 terminal store、清空终端 UI、断开旧 socket、生成新 terminalId 并重新连接。
  - 新终端创建成功后，应显示 toast，说明旧终端已过期并已自动创建新终端。

- 文本契约：
  - 所有用户可见终端状态文本必须来自 i18n key，而不是 hook/页面内硬编码字符串。

### 4. 校验与错误矩阵

- `sessionId` 改变 -> 必须先重置页面级连接状态并切换到目标 session 的 `TerminalSessionState`。
- 同一 session 重进页面且 registry 中 terminal 仍存在 -> 必须复用旧 `terminalId` 并恢复 buffer。
- 同一 session 重进页面但 terminal 已在 Hub 端超时删除 -> 必须 reset store、生成新 `terminalId`、重新建立连接。
- hook 收到普通 `terminal:error`（非 `Terminal not found.`）-> 显示 error 状态，但不得悄悄重建 terminal。
- `token/sessionId/terminalId` 任一缺失 -> hook 进入 error 状态并显示本地化错误文案。
- terminal process exit -> 页面显示退出状态；只有显式重连/reset 后才创建新 terminal。
- **流式 output chunk 到达 -> 只能 append 新 chunk；不得触发 replay effect 的依赖变化从而清空终端并重放全缓冲。**

### 5. Good / Base / Bad Cases

- Good：
  - 用户进入 terminal 页，离开后 10 秒内返回；页面复用原 `terminalId`，已输出内容被回放，CLI 不会收到第二次 `terminal:open`。
  - terminal 已恢复后继续收到 `first chunk`、`second chunk`；终端只追加两段新输出，不发生 reset。
- Base：
  - 用户第一次进入 terminal 页；创建新 terminal，后续输出持续追加到 session store。
- Bad：
  - 用户只是切到其他页面再回来，就生成新的 `terminalId`，原输出丢失，CLI 又创建了一个新终端实例。
  - 每个 output chunk 都触发依赖于 `outputBuffer` 的 replay effect，导致 `terminal.reset()` 后整段历史缓冲被反复重放。

### 6. Tests Required

- Unit（store）：
  - 断言 `getTerminalSessionState(sessionId)` 为每个 session 返回稳定独立状态。
  - 断言 `resetTerminalSessionState(sessionId)` 会更换 `terminalId`，并清空 buffer/连接标记。
  - 断言 `appendTerminalSessionOutput` 会保留末尾 buffer 并应用最大长度限制。
- Hook / route integration：
  - 断言 terminal 页重新挂载后会 replay 之前 session 的 buffer。
  - 断言收到 `Terminal not found.` 后会触发 reset + reconnect。
  - 断言 reset 成功后显示重启 toast。
  - **断言连续 output chunk 到达后，只发生增量 `write(chunk)`，不会再次调用 `terminal.reset()`。**
  - **针对上述流式场景，测试必须等待 React state/effect flush，避免同步断言掩盖 replay 回归。**
- Component：
  - 断言 terminal 页面按钮/状态 banner 文案来自 i18n key。

### 7. Wrong vs Correct

#### Wrong

```typescript
useEffect(() => {
    replayedBufferRef.current = null
    replayStoredBuffer(terminalRef.current, terminalStateSnapshot.outputBuffer)
}, [terminalId, terminalStateSnapshot.outputBuffer, replayStoredBuffer])
```

#### Correct

```typescript
useEffect(() => {
    replayedBufferRef.current = null
    replayStoredBuffer(terminalRef.current, terminalStateSnapshot.outputBuffer)
}, [terminalId, replayStoredBuffer])

useEffect(() => {
    onOutput((data) => {
        const nextState = appendTerminalSessionOutput(sessionId, data)
        setTerminalStateSnapshot(nextState)
        terminalRef.current?.write(data)
    })
}, [onOutput, sessionId])
```


**发送一条消息**：

1. 用户在 composer 中输入（本地状态：`useState`）
2. 用户点击发送 -> 调用 `useSendMessage` mutation
3. mutation 的 `onMutate` 将乐观消息写入模块级 store
4. 模块级 store 通知订阅者 -> UI 立即更新
5. API 调用完成 -> `onSuccess` 更新消息状态
6. 实时 WebSocket 收到确认 -> 再次更新模块级 store

**为什么这样可行**：
- 输入框使用本地状态（无需共享）
- API 调用使用 TanStack Query（缓存、重试、错误处理）
- 消息窗口使用模块级 store（跨组件、实时、乐观更新）
- 没有 prop drilling，也避免了不必要的重渲染

---

## Socket 连接生命周期管理

### 问题背景

WebSocket 连接是有状态的长连接，在 React 组件的生命周期中需要特别注意：

1. **页面切换**：用户从终端页面切换到其他页面再切回来时，组件会重新挂载
2. **浏览器休眠**：浏览器标签页进入后台时，连接可能被挂起
3. **网络波动**：连接断开后需要重连
4. **服务端状态**：服务端可能已经 detach 了连接，但前端不知道

### 核心原则

**Socket 连接必须与组件生命周期严格同步**：

```typescript
// ❌ 错误：把“terminal 可恢复”误解成“旧页面 socket 也要保留”
function TerminalPage() {
    useEffect(() => {
        return () => {
            // 不 disconnect，导致旧 socket 继续占用 terminalId
        }
    }, [])
}

// ✅ 正确：页面离开时断开旧 socket，恢复的是 terminalId 对应的后端终端
function TerminalPage() {
    useEffect(() => {
        return () => {
            disconnectRef.current()
        }
    }, [])
}
```

补充约束：
- **terminalId 可以跨页面复用，但 socket 不可以跨页面生命周期泄漏。**
- 同一组件实例内，`useTerminalSocket` 可以复用当前 `socketRef.current`；一旦页面 unmount，必须 `disconnect()`，让 Hub 执行 detach。
- “返回页面恢复终端” 的含义是：Hub registry 中的 terminal 进程仍存活，新的页面 socket 用同一个 `terminalId` 重新 attach。


### 常见陷阱

#### 1. 把 terminal 恢复误做成 socket 保活

**问题**：Hub 允许 detached terminal 通过同一个 `terminalId` 重新 attach，但前端如果把这个契约误解成“页面离开时不要断开 socket”，就会让旧 socket 在页面销毁后继续占用 terminal。

**症状**：
- `socket_not_connected` 错误
- `Terminal ID is already in use by another socket.` 错误
- 点击“终端” -> 切走页面 -> 再回来时大量报错

**解决方案**：
- 页面 unmount 时始终 `disconnect()`。
- 保留的是 `terminalId` 与输出 buffer，不是旧 socket 实例。
- 新页面重新 mount 后，由新 socket 在 `connect` 成功后再次发送 `terminal:create`，让 Hub 执行 reattach。

#### 2. 组件 Unmount 时未清理

**问题**：组件 unmount 时如果不清理 socket，会导致内存泄漏和事件监听器累积。

**解决方案**：
```typescript
useEffect(() => {
    return () => {
        const socket = socketRef.current
        if (socket) {
            socket.removeAllListeners()
            socket.disconnect()
            socketRef.current = null
        }
    }
}, [])
```

#### 3. 竞态条件：快速切换页面

**问题**：用户快速切换页面时，可能出现：
1. 组件 A mount → 创建 socket
2. 组件 A unmount → 开始断开 socket
3. 组件 A 再次 mount → 创建新 socket
4. 步骤 2 的断开完成 → 影响步骤 3 的 socket

**解决方案**：使用标志位防止竞态
```typescript
const mountedRef = useRef(true)

useEffect(() => {
    mountedRef.current = true
    return () => {
        mountedRef.current = false
    }
}, [])

const connect = useCallback(() => {
    if (!mountedRef.current) {
        return
    }
    // ... 连接逻辑
}, [])
```

### 最佳实践清单

在实现 Socket 相关功能时，必须检查：

- [ ] **组件 unmount 时是否调用 `disconnect()`**
- [ ] **`disconnect()` 是否清理了所有事件监听器**（`removeAllListeners()`）
- [ ] **重连前是否清理了旧连接**
- [ ] **是否处理了服务端 detach 的情况**
- [ ] **是否考虑了页面切换场景**
- [ ] **是否考虑了浏览器休眠场景**
- [ ] **是否有竞态条件保护**
- [ ] **错误日志是否包含足够的上下文**（sessionId、terminalId、socketId、cause）

### 调试技巧

当遇到 Socket 连接问题时：

1. **检查日志中的 cause 字段**：
   - `socket_not_connected`：socket 未连接就尝试操作
   - `socket_already_connected`：重复连接
   - `terminal_runtime_error`：服务端拒绝操作

2. **检查 socket 状态**：
   ```typescript
   console.log('Socket state:', {
       connected: socket.connected,
       disconnected: socket.disconnected,
       id: socket.id
   })
   ```

3. **检查服务端 registry 状态**：
   服务端日志会显示 `detachSocket` 和 `rebindSocket` 操作

4. **使用 React DevTools**：
   检查 `socketRef.current` 是否在预期的时机被清理
