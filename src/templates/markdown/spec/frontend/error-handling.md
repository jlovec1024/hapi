# Frontend Error Handling Guidelines

> Best practices for error handling in frontend development

---

## Core Principles

### 1. Error Classification

All errors must be explicitly classified as one of two types:

- **Permanent Error**: Requires user intervention to resolve
  - Authentication failure (401)
  - Permission denied (403)
  - Resource not found (404)
  - CORS configuration error
  - Invalid configuration parameters

- **Transient Error**: May be resolved through retry
  - Network timeout
  - Server temporarily unavailable (503)
  - Connection interrupted

### 2. Reconnection Strategy

**Forbidden Pattern** ❌:
```typescript
// Wrong: Infinite reconnection for all errors
socket.on('connect_error', (error) => {
    console.error('Connection error:', error)
    // Socket.IO will auto-reconnect without distinguishing error types
})
```

**Correct Pattern** ✅:
```typescript
socket.on('connect_error', (error) => {
    // Decide whether to reconnect based on error type
    if (isPermanentError(error)) {
        socket.disconnect()
        showUserError('Cannot connect: Please check access URL or permission configuration')
    } else {
        // Allow auto-reconnect, but with retry limit
        if (retryCount > MAX_RETRIES) {
            socket.disconnect()
            showUserError('Connection failed: Please check network connection')
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

### 3. User Notification

**Forbidden Pattern** ❌:
```typescript
// Wrong: Only console output, user cannot see
console.error('Connection failed:', error)
```

**Correct Pattern** ✅:
```typescript
// Display clear error message in UI
setState({
    status: 'error',
    error: translateError(error)
})

function translateError(error: Error): string {
    if (error.message.includes('cors')) {
        return 'CORS configuration error: Please use correct access URL'
    }
    if (error.message.includes('unauthorized')) {
        return 'Authentication failed: Please login again'
    }
    return 'Connection failed: Please check network connection'
}
```

---

## Socket.IO Error Handling

### Common Issue: CORS Error Causing Infinite Reconnection

**Problem Description**:
When accessing with non-`ZS_PUBLIC_URL` address, Socket.IO connection fails due to CORS validation returning 403, but frontend treats it as transient failure and infinitely reconnects.

**Error Log Characteristics**:
```
POST http://192.168.2.230:13006/socket.io/?EIO=4&transport=polling 403 (Forbidden)
[Terminal] stage=terminal.socket.connect outcome=error {cause: 'connect_error', message: 'xhr post error'}
```

**Root Cause**:
1. Backend CORS validation failure throws exception, returns 403
2. Frontend doesn't distinguish permanent vs transient errors
3. Socket.IO defaults to infinite reconnection

**Solution**:
```typescript
// In useTerminalSocket.ts
socket.on('connect_error', (error) => {
    logTerminalEvent('log', 'terminal.socket.connect', 'error', {
        sessionId: sessionIdRef.current,
        terminalId: terminalIdRef.current,
        cause: 'connect_error',
        message: error.message
    })

    // Check if CORS or permission error
    const isPermanent =
        error.message.includes('xhr post error') || // CORS 403
        error.message.includes('forbidden') ||
        error.message.includes('unauthorized')

    if (isPermanent) {
        // Stop reconnection
        socket.disconnect()
        setState({
            status: 'error',
            error: translateRef.current('terminal.error.cors_or_auth')
        })
        return
    }

    // Transient error: Allow reconnection but with limit
    setState({
        status: 'reconnecting',
        reason: error.message
    })
})
```

---

## HTTP Request Error Handling

### Status Code Classification

**Permanent Errors**:
- 400 Bad Request - Invalid request parameters
- 401 Unauthorized - Not authenticated
- 403 Forbidden - No permission
- 404 Not Found - Resource doesn't exist
- 422 Unprocessable Entity - Validation failed

**Transient Errors**:
- 408 Request Timeout - Request timeout
- 429 Too Many Requests - Rate limited
- 500 Internal Server Error - Server error
- 502 Bad Gateway - Gateway error
- 503 Service Unavailable - Service unavailable
- 504 Gateway Timeout - Gateway timeout

### Retry Strategy

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

            // Permanent error: Don't retry
            if (response.status >= 400 && response.status < 500) {
                throw new PermanentError(
                    `Request failed: ${response.status}`,
                    response.status
                )
            }

            // Transient error: Retry
            if (response.status >= 500) {
                if (i < maxRetries) {
                    await sleep(Math.pow(2, i) * 1000) // Exponential backoff
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

            // Network error: Retry
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

## Error Boundary

### React Error Boundary

```typescript
class ErrorBoundary extends React.Component<Props, State> {
    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error
        logError(error, errorInfo)

        // Display friendly error page
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

## Common Mistakes

### ❌ Mistake 1: Ignoring error types, blindly retrying

```typescript
// Wrong example
async function loadData() {
    try {
        return await api.getData()
    } catch (error) {
        // Retry regardless of error type
        return await loadData()
    }
}
```

**Problem**: If it's 404 or 403, retry will never succeed, causing infinite loop.

### ❌ Mistake 2: Only console output errors

```typescript
// Wrong example
socket.on('error', (error) => {
    console.error('Socket error:', error)
    // User cannot see any notification
})
```

**Problem**: User doesn't know what happened, cannot take action.

### ❌ Mistake 3: Unclear error messages

```typescript
// Wrong example
setState({ error: 'Something went wrong' })
```

**Problem**: User doesn't know how to resolve the issue.

---

## Checklist

When implementing error handling, ensure:

- [ ] Distinguished permanent vs transient errors
- [ ] Permanent errors don't trigger retry
- [ ] Transient errors have retry count limit
- [ ] All errors have user-visible notifications
- [ ] Error messages are clear and actionable
- [ ] Logged sufficient error information for debugging
- [ ] Considered network disconnection scenario
- [ ] Considered CORS configuration error scenario

---

**Last Updated**: 2026-03-14
**Related Issue**: Socket.IO cross-origin access infinite reconnection bug
