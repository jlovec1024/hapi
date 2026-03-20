import { afterEach, describe, expect, it, mock } from 'bun:test'

const warnMock = mock()
const debugMock = mock()

mock.module('@/ui/logger', () => ({
  logger: {
    warn: warnMock,
    debug: debugMock,
  }
}))

mock.module('bun-pty', () => ({}))

describe('TerminalManager', () => {
  afterEach(() => {
    warnMock.mockReset()
    debugMock.mockReset()
  })

  it('returns runtime unavailable error when bun-pty is not loaded in test runtime', async () => {
    const onError = mock()
    const onReady = mock()
    const onOutput = mock()
    const onExit = mock()

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

  it('emits terminal not found error when writing to missing terminal', async () => {
    const onError = mock()
    const onReady = mock()
    const onOutput = mock()
    const onExit = mock()

    const { TerminalManager } = await import('./TerminalManager')

    const manager = new TerminalManager({
      sessionId: 'session-1',
      getSessionPath: () => '/tmp/project',
      onReady,
      onOutput,
      onExit,
      onError
    })

    manager.write('missing-terminal', 'echo test')

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith({
      sessionId: 'session-1',
      terminalId: 'missing-terminal',
      message: 'Terminal not found.'
    })
  })
})
