import { describe, expect, it, mock, afterEach } from 'bun:test'
import { registerTerminalHandlers } from './terminal'
import { registerTerminalHandlers as registerCliTerminalHandlers } from './cli/terminalHandlers'
import { TerminalRegistry } from '../terminalRegistry'
import type { SocketServer, SocketWithData } from '../socketTypes'
import type { StoredSession } from '../../store'

const originalConsoleError = console.error

afterEach(() => {
    console.error = originalConsoleError
    mock.restore()
})

type EmittedEvent = {
    event: string
    data: unknown
}

class FakeSocket {
    readonly id: string
    readonly data: Record<string, unknown> = {}
    readonly emitted: EmittedEvent[] = []
    private readonly handlers = new Map<string, (...args: unknown[]) => void>()

    constructor(id: string) {
        this.id = id
    }

    on(event: string, handler: (...args: unknown[]) => void): this {
        this.handlers.set(event, handler)
        return this
    }

    emit(event: string, data: unknown): boolean {
        this.emitted.push({ event, data })
        return true
    }

    trigger(event: string, data?: unknown): void {
        const handler = this.handlers.get(event)
        if (!handler) {
            return
        }
        if (typeof data === 'undefined') {
            handler()
            return
        }
        handler(data)
    }
}

class FakeNamespace {
    readonly sockets = new Map<string, FakeSocket>()
    readonly adapter = { rooms: new Map<string, Set<string>>() }
}

class FakeServer {
    private readonly namespaces = new Map<string, FakeNamespace>()

    of(name: string): FakeNamespace {
        const existing = this.namespaces.get(name)
        if (existing) {
            return existing
        }
        const namespace = new FakeNamespace()
        this.namespaces.set(name, namespace)
        return namespace
    }
}

type Harness = {
    io: FakeServer
    terminalSocket: FakeSocket
    cliNamespace: FakeNamespace
    terminalRegistry: TerminalRegistry
}

function createHarness(options?: {
    sessionActive?: boolean
    maxTerminalsPerSocket?: number
    maxTerminalsPerSession?: number
}): Harness {
    const io = new FakeServer()
    const terminalSocket = new FakeSocket('terminal-socket')
    terminalSocket.data.namespace = 'default'
    const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })
    const cliNamespace = io.of('/cli')

    registerTerminalHandlers(terminalSocket as unknown as SocketWithData, {
        io: io as unknown as SocketServer,
        getSession: () => ({ active: options?.sessionActive ?? true, namespace: 'default' }),
        terminalRegistry,
        maxTerminalsPerSocket: options?.maxTerminalsPerSocket ?? 4,
        maxTerminalsPerSession: options?.maxTerminalsPerSession ?? 4
    })

    return { io, terminalSocket, cliNamespace, terminalRegistry }
}

function connectCliSocket(cliNamespace: FakeNamespace, cliSocket: FakeSocket, sessionId: string): void {
    cliSocket.data.namespace = 'default'
    cliNamespace.sockets.set(cliSocket.id, cliSocket)
    const roomId = `session:${sessionId}`
    const room = cliNamespace.adapter.rooms.get(roomId) ?? new Set<string>()
    room.add(cliSocket.id)
    cliNamespace.adapter.rooms.set(roomId, room)
}

function lastEmit(socket: FakeSocket, event: string): EmittedEvent | undefined {
    return [...socket.emitted].reverse().find((entry) => entry.event === event)
}

describe('terminal socket handlers', () => {
    it('rejects terminal creation when session is inactive', () => {
        console.error = mock(() => undefined) as typeof console.error
        const { terminalSocket, terminalRegistry } = createHarness({ sessionActive: false })

        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 80,
            rows: 24
        })

        const errorEvent = lastEmit(terminalSocket, 'terminal:error')
        expect(errorEvent).toBeDefined()
        expect(errorEvent?.data).toEqual({
            terminalId: 'terminal-1',
            message: 'Session is inactive or unavailable.'
        })
        expect(terminalRegistry.get('terminal-1')).toBeNull()
    })

    it('opens a terminal and forwards write/resize/close to the CLI socket', () => {
        const { terminalSocket, cliNamespace, terminalRegistry } = createHarness()
        const cliSocket = new FakeSocket('cli-socket-1')
        connectCliSocket(cliNamespace, cliSocket, 'session-1')

        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 120,
            rows: 40
        })

        const openEvent = lastEmit(cliSocket, 'terminal:open')
        expect(openEvent?.data).toEqual({
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 120,
            rows: 40
        })
        expect(terminalRegistry.get('terminal-1')).not.toBeNull()

        terminalSocket.trigger('terminal:write', {
            terminalId: 'terminal-1',
            data: 'ls\n'
        })
        const writeEvent = lastEmit(cliSocket, 'terminal:write')
        expect(writeEvent?.data).toEqual({
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            data: 'ls\n'
        })

        terminalSocket.trigger('terminal:resize', {
            terminalId: 'terminal-1',
            cols: 100,
            rows: 30
        })
        const resizeEvent = lastEmit(cliSocket, 'terminal:resize')
        expect(resizeEvent?.data).toEqual({
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 100,
            rows: 30
        })

        terminalSocket.trigger('terminal:close', {
            terminalId: 'terminal-1'
        })
        const closeEvent = lastEmit(cliSocket, 'terminal:close')
        expect(closeEvent?.data).toEqual({
            sessionId: 'session-1',
            terminalId: 'terminal-1'
        })
        expect(terminalRegistry.get('terminal-1')).toBeNull()
    })

    it('detaches terminal on socket disconnect and allows later reattach', () => {
        const { io, terminalSocket, cliNamespace, terminalRegistry } = createHarness()
        const cliSocket = new FakeSocket('cli-socket-1')
        connectCliSocket(cliNamespace, cliSocket, 'session-1')

        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 90,
            rows: 24
        })

        terminalSocket.trigger('disconnect')

        expect(lastEmit(cliSocket, 'terminal:close')).toBeUndefined()
        expect(terminalRegistry.get('terminal-1')?.socketId).toBeNull()

        const secondTerminalSocket = new FakeSocket('terminal-socket-2')
        secondTerminalSocket.data.namespace = 'default'
        registerTerminalHandlers(secondTerminalSocket as unknown as SocketWithData, {
            io: io as unknown as SocketServer,
            getSession: () => ({ active: true, namespace: 'default' }),
            terminalRegistry,
            maxTerminalsPerSocket: 4,
            maxTerminalsPerSession: 4
        })

        secondTerminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 100,
            rows: 30
        })

        const readyEvent = lastEmit(secondTerminalSocket, 'terminal:ready')
        expect(readyEvent?.data).toEqual({ terminalId: 'terminal-1' })
        expect(lastEmit(cliSocket, 'terminal:open')?.data).toEqual({
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 90,
            rows: 24
        })
        expect(terminalRegistry.get('terminal-1')?.socketId).toBe('terminal-socket-2')
    })

    it('reuses terminal id for same socket/session without emitting duplicate-id error', () => {
        const { terminalSocket, cliNamespace, terminalRegistry } = createHarness()
        const cliSocket = new FakeSocket('cli-socket-1')
        connectCliSocket(cliNamespace, cliSocket, 'session-1')

        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 80,
            rows: 24
        })

        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 100,
            rows: 30
        })

        const openEvents = cliSocket.emitted.filter((entry) => entry.event === 'terminal:open')
        expect(openEvents.length).toBe(1)
        expect(openEvents[0]?.data).toEqual({
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 80,
            rows: 24
        })

        const duplicateIdError = terminalSocket.emitted.find(
            (entry) =>
                entry.event === 'terminal:error'
                && (entry.data as { message?: string })?.message === 'Terminal ID is already in use.'
        )
        expect(duplicateIdError).toBeUndefined()
        expect(terminalRegistry.get('terminal-1')).not.toBeNull()
    })

    it('reattaches existing terminal id even when previous cli socket is gone', () => {
        const { terminalSocket, cliNamespace, terminalRegistry } = createHarness()
        const firstCliSocket = new FakeSocket('cli-socket-1')
        connectCliSocket(cliNamespace, firstCliSocket, 'session-1')

        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 80,
            rows: 24
        })

        cliNamespace.sockets.delete(firstCliSocket.id)

        const secondCliSocket = new FakeSocket('cli-socket-2')
        connectCliSocket(cliNamespace, secondCliSocket, 'session-1')

        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 90,
            rows: 28
        })

        const reopenedEvent = lastEmit(secondCliSocket, 'terminal:open')
        expect(reopenedEvent).toBeUndefined()

        const duplicateIdError = terminalSocket.emitted.find(
            (entry) =>
                entry.event === 'terminal:error'
                && (entry.data as { message?: string })?.message === 'Terminal ID is already in use.'
        )
        expect(duplicateIdError).toBeUndefined()
        expect(terminalRegistry.get('terminal-1')?.cliSocketId).toBe('cli-socket-1')
    })

    it('removes stale detached terminal when cli reports terminal not found', () => {
        const { io, terminalSocket, cliNamespace, terminalRegistry } = createHarness()
        const cliSocket = new FakeSocket('cli-socket-1')
        connectCliSocket(cliNamespace, cliSocket, 'session-1')

        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 90,
            rows: 24
        })

        terminalSocket.trigger('disconnect')
        expect(terminalRegistry.get('terminal-1')?.socketId).toBeNull()

        const cliHandlerSocket = new FakeSocket('cli-socket-1')
        cliHandlerSocket.data.namespace = 'default'
        const terminalNamespace = io.of('/terminal')
        const detachedTerminalSocket = new FakeSocket('terminal-socket-2')
        terminalNamespace.sockets.set(detachedTerminalSocket.id, detachedTerminalSocket)
        terminalRegistry.rebindSocket('terminal-1', detachedTerminalSocket.id)

        registerCliTerminalHandlers(cliHandlerSocket as never, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: {} as StoredSession }),
            emitAccessError: () => {}
        })

        cliHandlerSocket.trigger('terminal:error', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            message: 'Terminal not found.'
        })

        expect(terminalRegistry.get('terminal-1')).toBeNull()
        expect(lastEmit(detachedTerminalSocket, 'terminal:error')?.data).toEqual({
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            message: 'Terminal not found.'
        })
    })

    it('enforces per-socket terminal limits', () => {
        console.error = mock(() => undefined) as typeof console.error
        const { terminalSocket, cliNamespace } = createHarness({ maxTerminalsPerSocket: 1 })
        const cliSocket = new FakeSocket('cli-socket-1')
        connectCliSocket(cliNamespace, cliSocket, 'session-1')

        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 80,
            rows: 24
        })

        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-2',
            cols: 80,
            rows: 24
        })

        expect(lastEmit(terminalSocket, 'terminal:error')?.data).toEqual({
            terminalId: 'terminal-2',
            message: 'Too many terminals open (max 1).'
        })
    })
})

describe('CLI terminal handlers', () => {
    it('forwards ready/output/exit events to registered browser terminal socket', () => {
        const io = new FakeServer()
        const terminalSocket = new FakeSocket('browser-terminal')
        terminalSocket.data.namespace = 'default'
        const terminalNamespace = io.of('/terminal')
        terminalNamespace.sockets.set(terminalSocket.id, terminalSocket)

        const cliSocket = new FakeSocket('cli-terminal')
        cliSocket.data.namespace = 'default'
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })
        terminalRegistry.register('terminal-1', 'session-1', terminalSocket.id, cliSocket.id)

        registerCliTerminalHandlers(cliSocket as unknown as SocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: { id: 'session-1', namespace: 'default', active: true } as StoredSession }),
            emitAccessError: () => {}
        })

        cliSocket.trigger('terminal:ready', { sessionId: 'session-1', terminalId: 'terminal-1' })
        cliSocket.trigger('terminal:output', { sessionId: 'session-1', terminalId: 'terminal-1', data: 'hello' })
        cliSocket.trigger('terminal:exit', { sessionId: 'session-1', terminalId: 'terminal-1', code: 0, signal: null })

        const stored = terminalRegistry.get('terminal-1')
        expect(stored).toBeNull()

        expect(terminalSocket.emitted).toEqual([
            { event: 'terminal:ready', data: { sessionId: 'session-1', terminalId: 'terminal-1' } },
            { event: 'terminal:output', data: { sessionId: 'session-1', terminalId: 'terminal-1', data: 'hello' } },
            { event: 'terminal:exit', data: { sessionId: 'session-1', terminalId: 'terminal-1', code: 0, signal: null } }
        ])
    })

    it('removes stale terminal when cli reports terminal not found', () => {
        const io = new FakeServer()
        const terminalSocket = new FakeSocket('browser-terminal')
        terminalSocket.data.namespace = 'default'
        const terminalNamespace = io.of('/terminal')
        terminalNamespace.sockets.set(terminalSocket.id, terminalSocket)

        const cliSocket = new FakeSocket('cli-terminal')
        cliSocket.data.namespace = 'default'
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })
        terminalRegistry.register('terminal-1', 'session-1', terminalSocket.id, cliSocket.id)
        terminalRegistry.register('terminal-2', 'session-2', terminalSocket.id, cliSocket.id)

        registerCliTerminalHandlers(cliSocket as unknown as SocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: (sessionId) => ({ ok: true, value: { id: sessionId, namespace: 'default', active: true } as StoredSession }),
            emitAccessError: () => {}
        })

        cliSocket.trigger('terminal:error', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            message: 'Terminal not found.'
        })

        expect(terminalRegistry.get('terminal-1')).toBeNull()
        expect(terminalRegistry.get('terminal-2')).not.toBeNull()
        expect(terminalSocket.emitted).toEqual([
            {
                event: 'terminal:error',
                data: {
                    sessionId: 'session-1',
                    terminalId: 'terminal-1',
                    message: 'Terminal not found.'
                }
            }
        ])
    })
})
