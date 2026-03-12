import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { getStoredLocale, getTranslation } from '@/lib/use-translation'

type TerminalConnectionState =
    | { status: 'idle' }
    | { status: 'connecting' }
    | { status: 'connected' }
    | { status: 'reconnecting'; reason: string }
    | { status: 'error'; error: string }

type UseTerminalSocketOptions = {
    baseUrl: string
    token: string
    sessionId: string
    terminalId: string
    onTerminalNotFound?: () => void
}

type TerminalReadyPayload = {
    terminalId: string
}

type TerminalOutputPayload = {
    terminalId: string
    data: string
}

type TerminalExitPayload = {
    terminalId: string
    code: number | null
    signal: string | null
}

type TerminalErrorPayload = {
    terminalId: string
    message: string
}

export function useTerminalSocket(options: UseTerminalSocketOptions): {
    state: TerminalConnectionState
    connect: (cols: number, rows: number) => void
    write: (data: string) => void
    resize: (cols: number, rows: number) => void
    close: (terminalId?: string) => void
    disconnect: () => void
    onOutput: (handler: (data: string) => void) => void
    onExit: (handler: (code: number | null, signal: string | null) => void) => void
} {
    const [state, setState] = useState<TerminalConnectionState>({ status: 'idle' })
    const socketRef = useRef<Socket | null>(null)
    const outputHandlerRef = useRef<(data: string) => void>(() => {})
    const exitHandlerRef = useRef<(code: number | null, signal: string | null) => void>(() => {})
    const sessionIdRef = useRef(options.sessionId)
    const terminalIdRef = useRef(options.terminalId)
    const tokenRef = useRef(options.token)
    const baseUrlRef = useRef(options.baseUrl)
    const terminalNotFoundHandlerRef = useRef<(() => void) | null>(options.onTerminalNotFound ?? null)
    const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
    const translateRef = useRef<(key: string, params?: Record<string, string | number>) => string>(() => '')

    useEffect(() => {
        translateRef.current = (key: string, params?: Record<string, string | number>) => {
            return getTranslation(getStoredLocale(), key, params)
        }
    }, [])

    useEffect(() => {
        sessionIdRef.current = options.sessionId
        terminalIdRef.current = options.terminalId
        baseUrlRef.current = options.baseUrl
        terminalNotFoundHandlerRef.current = options.onTerminalNotFound ?? null
    }, [options.sessionId, options.terminalId, options.baseUrl, options.onTerminalNotFound])

    useEffect(() => {
        tokenRef.current = options.token
        const socket = socketRef.current
        if (!socket) {
            return
        }
        if (!options.token) {
            console.error('[Terminal] stage=auth.update outcome=error', {
                cause: 'missing_token',
                sessionId: sessionIdRef.current,
                terminalId: terminalIdRef.current
            })
            if (socket.connected) {
                socket.disconnect()
            }
            return
        }
        socket.auth = { token: options.token }
        if (socket.connected) {
            socket.disconnect()
            socket.connect()
        }
    }, [options.token])

    const logTerminalEvent = useCallback((
        level: 'log' | 'error',
        stage: string,
        outcome: 'start' | 'success' | 'error' | 'duplicate' | 'retry',
        details: Record<string, unknown>
    ) => {
        if (level === 'error') {
            const message = `[Terminal] stage=${stage} outcome=${outcome}`
            console.error(message, details)
        }
    }, [])

    const t = useCallback((key: string, params?: Record<string, string | number>) => {
        return translateRef.current(key, params)
    }, [])

    const isCurrentTerminal = useCallback((terminalId: string) => terminalId === terminalIdRef.current, [])

    const emitCreate = useCallback((socket: Socket, size: { cols: number; rows: number }) => {
        logTerminalEvent('log', 'terminal.create.emit', 'start', {
            sessionId: sessionIdRef.current,
            terminalId: terminalIdRef.current,
            cols: size.cols,
            rows: size.rows
        })
        socket.emit('terminal:create', {
            sessionId: sessionIdRef.current,
            terminalId: terminalIdRef.current,
            cols: size.cols,
            rows: size.rows
        })
    }, [logTerminalEvent])

    const setErrorState = useCallback((message: string, cause?: string) => {
        if (cause) {
            logTerminalEvent('error', 'terminal.state', 'error', {
                sessionId: sessionIdRef.current,
                terminalId: terminalIdRef.current,
                cause,
                message
            })
        }
        setState({ status: 'error', error: message })
    }, [logTerminalEvent])

    const connect = useCallback((cols: number, rows: number) => {
        lastSizeRef.current = { cols, rows }
        const token = tokenRef.current
        const sessionId = sessionIdRef.current
        const terminalId = terminalIdRef.current

        logTerminalEvent('log', 'terminal.connect', 'start', {
            sessionId,
            terminalId,
            cols,
            rows,
            hasExistingSocket: socketRef.current !== null
        })

        if (!token || !sessionId || !terminalId) {
            setErrorState(t('terminal.error.missingCredentials'), 'missing_terminal_credentials')
            return
        }

        if (socketRef.current) {
            const socket = socketRef.current
            socket.auth = { token }
            if (socket.connected) {
                logTerminalEvent('log', 'terminal.connect', 'duplicate', {
                    sessionId,
                    terminalId,
                    cause: 'socket_already_connected'
                })
                emitCreate(socket, { cols, rows })
            } else {
                logTerminalEvent('log', 'terminal.socket.connect', 'retry', {
                    sessionId,
                    terminalId,
                    cause: 'reuse_existing_socket'
                })
                socket.connect()
            }
            setState({ status: 'connecting' })
            return
        }

        const socket = io(`${baseUrlRef.current}/terminal`, {
            auth: { token },
            path: '/socket.io/',
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            transports: ['polling', 'websocket'],
            autoConnect: false
        })

        socketRef.current = socket
        setState({ status: 'connecting' })

        socket.on('connect', () => {
            const size = lastSizeRef.current ?? { cols, rows }
            logTerminalEvent('log', 'terminal.socket.connect', 'success', {
                sessionId: sessionIdRef.current,
                terminalId: terminalIdRef.current,
                socketId: socket.id ?? null,
                cols: size.cols,
                rows: size.rows
            })
            setState({ status: 'connecting' })
            emitCreate(socket, size)
        })

        socket.on('terminal:ready', (payload: TerminalReadyPayload) => {
            if (!isCurrentTerminal(payload.terminalId)) {
                return
            }
            logTerminalEvent('log', 'terminal.ready', 'success', {
                sessionId: sessionIdRef.current,
                terminalId: payload.terminalId
            })
            setState({ status: 'connected' })
        })

        socket.on('terminal:output', (payload: TerminalOutputPayload) => {
            if (!isCurrentTerminal(payload.terminalId)) {
                return
            }
            outputHandlerRef.current(payload.data)
        })

        socket.on('terminal:exit', (payload: TerminalExitPayload) => {
            if (!isCurrentTerminal(payload.terminalId)) {
                return
            }
            logTerminalEvent('error', 'terminal.exit', 'error', {
                sessionId: sessionIdRef.current,
                terminalId: payload.terminalId,
                code: payload.code,
                signal: payload.signal,
                cause: 'terminal_process_exit'
            })
            exitHandlerRef.current(payload.code, payload.signal)
            setErrorState(t('terminal.error.exited'), 'terminal_exited')
        })

        socket.on('terminal:error', (payload: TerminalErrorPayload) => {
            if (!isCurrentTerminal(payload.terminalId)) {
                return
            }
            logTerminalEvent('error', 'terminal.error', 'error', {
                sessionId: sessionIdRef.current,
                terminalId: payload.terminalId,
                message: payload.message,
                cause: 'terminal_runtime_error'
            })
            if (payload.message === 'Terminal not found.') {
                setState({ status: 'reconnecting', reason: payload.message })
                terminalNotFoundHandlerRef.current?.()
                return
            }
            setErrorState(payload.message)
        })

        socket.on('connect_error', (error) => {
            const message = error instanceof Error ? error.message : t('terminal.error.connection')
            logTerminalEvent('error', 'terminal.socket.connect', 'error', {
                sessionId: sessionIdRef.current,
                terminalId: terminalIdRef.current,
                cause: 'connect_error',
                message
            })
            setErrorState(message)
        })

        socket.on('disconnect', (reason) => {
            if (reason === 'io client disconnect') {
                logTerminalEvent('log', 'terminal.socket.disconnect', 'success', {
                    sessionId: sessionIdRef.current,
                    terminalId: terminalIdRef.current,
                    reason
                })
                setState({ status: 'idle' })
                return
            }
            logTerminalEvent('error', 'terminal.socket.disconnect', 'error', {
                sessionId: sessionIdRef.current,
                terminalId: terminalIdRef.current,
                reason,
                cause: 'unexpected_disconnect'
            })
            setErrorState(t('terminal.error.disconnected', { reason }))
        })

        socket.connect()
    }, [emitCreate, setErrorState, isCurrentTerminal, logTerminalEvent, t])

    const write = useCallback((data: string) => {
        const socket = socketRef.current
        if (!socket || !socket.connected) {
            logTerminalEvent('error', 'terminal.write', 'error', {
                sessionId: sessionIdRef.current,
                terminalId: terminalIdRef.current,
                cause: 'socket_not_connected'
            })
            return
        }
        socket.emit('terminal:write', { terminalId: terminalIdRef.current, data })
    }, [logTerminalEvent])

    const resize = useCallback((cols: number, rows: number) => {
        lastSizeRef.current = { cols, rows }
        const socket = socketRef.current
        if (!socket || !socket.connected) {
            logTerminalEvent('error', 'terminal.resize', 'error', {
                sessionId: sessionIdRef.current,
                terminalId: terminalIdRef.current,
                cols,
                rows,
                cause: 'socket_not_connected'
            })
            return
        }
        socket.emit('terminal:resize', { terminalId: terminalIdRef.current, cols, rows })
    }, [logTerminalEvent])

    const close = useCallback((terminalId = terminalIdRef.current) => {
        const socket = socketRef.current
        if (!socket || !socket.connected) {
            return
        }
        logTerminalEvent('log', 'terminal.close.request', 'success', {
            sessionId: sessionIdRef.current,
            terminalId
        })
        socket.emit('terminal:close', { terminalId })
    }, [logTerminalEvent])

    const disconnect = useCallback(() => {
        const socket = socketRef.current
        if (!socket) {
            return
        }
        logTerminalEvent('log', 'terminal.disconnect', 'success', {
            sessionId: sessionIdRef.current,
            terminalId: terminalIdRef.current
        })
        socket.removeAllListeners()
        socket.disconnect()
        socketRef.current = null
        setState({ status: 'idle' })
    }, [logTerminalEvent])

    const onOutput = useCallback((handler: (data: string) => void) => {
        outputHandlerRef.current = handler
    }, [])

    const onExit = useCallback((handler: (code: number | null, signal: string | null) => void) => {
        exitHandlerRef.current = handler
    }, [])

    return {
        state,
        connect,
        write,
        resize,
        close,
        disconnect,
        onOutput,
        onExit
    }
}
