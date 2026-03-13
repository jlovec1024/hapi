import { afterEach, describe, expect, it, vi } from 'vitest'

const warnMock = vi.fn()
const debugMock = vi.fn()

vi.mock('@/ui/logger', () => ({
    logger: {
        warn: warnMock,
        debug: debugMock
    }
}))

describe('TerminalManager', () => {
    afterEach(() => {
        warnMock.mockReset()
        debugMock.mockReset()
    })

    it('returns runtime unavailable error when bun-pty is not loaded in test runtime', async () => {
        const onError = vi.fn()
        const onReady = vi.fn()
        const onOutput = vi.fn()
        const onExit = vi.fn()

        const { TerminalManager } = await import('./TerminalManager')

        const manager = new TerminalManager({
            sessionId: 'session-1',
            getSessionPath: () => '/tmp/project',
            onReady,
            onOutput,
            onExit,
            onError
        })

        manager.create('terminal-1', 80, 24)

        expect(onReady).not.toHaveBeenCalled()
        expect(onOutput).not.toHaveBeenCalled()
        expect(onExit).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith({
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            message: 'Terminal is unavailable in this runtime.'
        })
    })
})
