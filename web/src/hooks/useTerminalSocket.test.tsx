import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTerminalSocket } from './useTerminalSocket'

type SocketHandler = (...args: any[]) => void

type MockSocket = {
    auth: Record<string, unknown>
    connected: boolean
    id?: string
    on: ReturnType<typeof vi.fn>
    emit: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    removeAllListeners: ReturnType<typeof vi.fn>
    trigger: (event: string, ...args: any[]) => void
}

const ioMock = vi.fn()

vi.mock('socket.io-client', () => ({
    io: (...args: unknown[]) => ioMock(...args)
}))

vi.mock('@/lib/use-translation', () => ({
    getStoredLocale: () => 'en',
    getTranslation: (_locale: string, key: string) => key
}))

function createMockSocket(): MockSocket {
    const handlers = new Map<string, SocketHandler[]>()

    const socket: MockSocket = {
        auth: {},
        connected: false,
        id: 'socket-1',
        on: vi.fn((event: string, handler: SocketHandler) => {
            const existing = handlers.get(event) ?? []
            existing.push(handler)
            handlers.set(event, existing)
            return socket
        }),
        emit: vi.fn(),
        connect: vi.fn(() => {
            socket.connected = true
        }),
        disconnect: vi.fn(() => {
            socket.connected = false
        }),
        removeAllListeners: vi.fn(() => {
            handlers.clear()
        }),
        trigger: (event: string, ...args: any[]) => {
            for (const handler of handlers.get(event) ?? []) {
                handler(...args)
            }
        }
    }

    return socket
}

describe('useTerminalSocket', () => {
    let socket: MockSocket

    beforeEach(() => {
        socket = createMockSocket()
        ioMock.mockReturnValue(socket)
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('disconnect clears current socket so later connect creates a fresh socket', () => {
        const { result } = renderHook(() => useTerminalSocket({
            baseUrl: 'http://localhost:3000',
            token: 'test-token',
            sessionId: 'session-1',
            terminalId: 'terminal-1'
        }))

        act(() => {
            result.current.connect(90, 20)
        })

        expect(ioMock).toHaveBeenCalledTimes(1)
        expect(socket.connect).toHaveBeenCalledTimes(1)

        act(() => {
            socket.trigger('connect')
        })

        expect(socket.emit).toHaveBeenCalledWith('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 90,
            rows: 20
        })

        act(() => {
            result.current.disconnect()
        })

        expect(socket.removeAllListeners).toHaveBeenCalledTimes(1)
        expect(socket.disconnect).toHaveBeenCalledTimes(1)

        const nextSocket = createMockSocket()
        ioMock.mockReturnValueOnce(nextSocket)

        act(() => {
            result.current.connect(100, 30)
        })

        expect(ioMock).toHaveBeenCalledTimes(2)
        expect(nextSocket.connect).toHaveBeenCalledTimes(1)
    })

    it('reuses the existing socket before disconnect is called', () => {
        const { result } = renderHook(() => useTerminalSocket({
            baseUrl: 'http://localhost:3000',
            token: 'test-token',
            sessionId: 'session-1',
            terminalId: 'terminal-1'
        }))

        act(() => {
            result.current.connect(90, 20)
        })

        act(() => {
            socket.trigger('connect')
        })

        socket.emit.mockClear()
        socket.connect.mockClear()

        act(() => {
            result.current.connect(120, 40)
        })

        expect(ioMock).toHaveBeenCalledTimes(1)
        expect(socket.connect).not.toHaveBeenCalled()
        expect(socket.emit).toHaveBeenCalledWith('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 120,
            rows: 40
        })
    })
})
