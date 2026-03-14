# 前端错误处理规范

> 记录前端错误处理的最佳实践和常见陷阱

---

## 核心原则

### 1. 错误分类

所有错误必须明确分类为以下两种类型之一：

- **永久性错误 (Permanent Error)**: 需要用户干预才能解决的错误
  - 认证失败 (401)
  - 权限不足 (403)
  - 资源不存在 (404)
  - CORS 配置错误
  - 无效的配置参数

- **临时性错误 (Transient Error)**: 可能通过重试解决的错误
  - 网络超时
  - 服务器暂时不可用 (503)
  - 连接中断

### 2. 重连策略

**禁止模式** ❌：
```typescript
// 错误：对所有错误都无限重连
socket.on('connect_error', (error) => {
    console.error('Connection error:', error)
    // Socket.IO 会自动重连，没有区分错误类型
})
```

**正确模式** ✅：
```typescript
socket.on('connect_error', (error) => {
    // 根据错误类型决定是否重连
    if (isPermanentError(error)) {
        socket.disconnect()
        showUserError('无法连接：请检查访问地址或权限配置')
    } else {
        // 允许自动重连，但有次数限制
        if (retryCount > MAX_RETRIES) {
            socket.disconnect()
            showUserError('连接失败：请检查网络连接')
        }
    }
})

function isPermanentError(error: Error): boolean {
    const message = error.message.toLowerCase()
    return (
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('cors') ||
        message.includes('origin not allowed')
    )
}
```

### 3. 用户通知

**禁止模式** ❌：
```typescript
// 错误：只在控制台输出，用户看不到
console.error('Connection failed:', error)
```

**正确模式** ✅：
```typescript
// 在 UI 上显示明确的错误信息
setState({
    status: 'error',
    error: translateError(error)
})

function translateError(error: Error): string {
    if (error.message.includes('cors')) {
        return '跨域配置错误：请使用正确的访问地址'
    }
    if (error.message.includes('unauthorized')) {
        return '认证失败：请重新登录'
    }
    return '连接失败：请检查网络连接'
}
```

---

## Socket.IO 错误处理

### 常见问题：CORS 错误导致无限重连

**问题描述**：
使用非 `ZS_PUBLIC_URL` 的地址访问时，Socket.IO 连接会因 CORS 验证失败返回 403，但前端将其视为临时故障进行无限重连。

**错误日志特征**：
```
POST http://192.168.2.230:13006/socket.io/?EIO=4&transport=polling 403 (Forbidden)
[Terminal] stage=terminal.socket.connect outcome=error {cause: 'connect_error', message: 'xhr post error'}
```

**根本原因**：
1. 后端 CORS 验证失败时抛出异常，返回 403
2. 前端没有区分永久性错误和临时性错误
3. Socket.IO 默认会无限重连

**解决方案**：
```typescript
// 在 useTerminalSocket.ts 中
socket.on('connect_error', (error) => {
    logTerminalEvent('log', 'terminal.socket.connect', 'error', {
        sessionId: sessionIdRef.current,
        terminalId: terminalIdRef.current,
        cause: 'connect_error',
        message: error.message
    })

    // 检查是否为 CORS 或权限错误
    const isPermanent =
        error.message.includes('xhr post error') || // CORS 403
        error.message.includes('forbidden') ||
        error.message.includes('unauthorized')

    if (isPermanent) {
        // 停止重连
        socket.disconnect()
        setState({
            status: 'error',
            error: translateRef.current('terminal.error.cors_or_auth')
        })
        return
    }

    // 临时错误：允许重连但有限制
    setState({
        status: 'reconnecting',
        reason: error.message
    })
})
```

---

## HTTP 请求错误处理

### 状态码分类

**永久性错误**：
- 400 Bad Request - 请求参数错误
- 401 Unauthorized - 未认证
- 403 Forbidden - 无权限
- 404 Not Found - 资源不存在
- 422 Unprocessable Entity - 验证失败

**临时性错误**：
- 408 Request Timeout - 请求超时
- 429 Too Many Requests - 限流
- 500 Internal Server Error - 服务器错误
- 502 Bad Gateway - 网关错误
- 503 Service Unavailable - 服务不可用
- 504 Gateway Timeout - 网关超时

### 重试策略

```typescript
async function fetchWithRetry<T>(
    url: string,
    options: RequestInit,
    maxRetries = 3
): Promise<T> {
    let lastError: Error | null = null

    for (let i = 0; i <= maxRetries; i++) {
        try {
            const response = await fetch(url, options)

            // 永久性错误：不重试
            if (response.status >= 400 && response.status < 500) {
                throw new PermanentError(
                    `Request failed: ${response.status}`,
                    response.status
                )
            }

            // 临时性错误：重试
            if (response.status >= 500) {
                if (i < maxRetries) {
                    await sleep(Math.pow(2, i) * 1000) // 指数退避
                    continue
                }
                throw new TransientError(
                    `Server error: ${response.status}`,
                    response.status
                )
            }

            return await response.json()
        } catch (error) {
            lastError = error as Error

            // 网络错误：重试
            if (i < maxRetries && isNetworkError(error)) {
                await sleep(Math.pow(2, i) * 1000)
                continue
            }

            throw error
        }
    }

    throw lastError
}
```

---

## 错误边界 (Error Boundary)

### React 错误边界

```typescript
class ErrorBoundary extends React.Component<Props, State> {
    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // 记录错误
        logError(error, errorInfo)

        // 显示友好的错误页面
        this.setState({ hasError: true, error })
    }

    render() {
        if (this.state.hasError) {
            return <ErrorFallback error={this.state.error} />
        }
        return this.props.children
    }
}
```

---

## 常见错误

### ❌ 错误 1：忽略错误类型，盲目重试

```typescript
// 错误示例
async function loadData() {
    try {
        return await api.getData()
    } catch (error) {
        // 不管什么错误都重试
        return await loadData()
    }
}
```

**问题**：如果是 404 或 403，重试永远不会成功，造成无限循环。

### ❌ 错误 2：只在控制台输出错误

```typescript
// 错误示例
socket.on('error', (error) => {
    console.error('Socket error:', error)
    // 用户看不到任何提示
})
```

**问题**：用户不知道发生了什么，无法采取行动。

### ❌ 错误 3：错误信息不明确

```typescript
// 错误示例
setState({ error: 'Something went wrong' })
```

**问题**：用户不知道如何解决问题。

---

## 检查清单

在实现错误处理时，确保：

- [ ] 区分了永久性错误和临时性错误
- [ ] 永久性错误不会触发重试
- [ ] 临时性错误有重试次数限制
- [ ] 所有错误都有用户可见的提示
- [ ] 错误信息清晰且可操作
- [ ] 记录了足够的错误日志用于调试
- [ ] 考虑了网络断开的场景
- [ ] 考虑了 CORS 配置错误的场景

---

**最后更新**: 2026-03-14
**相关问题**: Socket.IO 跨域访问无限重连 Bug
