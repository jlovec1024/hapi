import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const mockReadRunnerState = mock()
const mockClearRunnerState = mock()
const mockClearRunnerLock = mock()
const mockIsProcessAlive = mock()
const originalFetch = globalThis.fetch
const originalAbortSignalTimeout = AbortSignal.timeout
const mockAbortSignalTimeout = mock(() => new AbortController().signal)

mock.module('@/api/types', () => ({}))

mock.module('@/ui/logger', () => ({
  logger: {
    debug: mock(),
    debugLargeJson: mock()
  }
}))

mock.module('@/persistence', () => ({
  readRunnerState: mockReadRunnerState,
  clearRunnerState: mockClearRunnerState,
  clearRunnerLock: mockClearRunnerLock,
  writeRunnerState: mock(),
  acquireRunnerLock: mock(),
  releaseRunnerLock: mock(),
  readSettings: mock(async () => ({}))
}))

mock.module('@/utils/process', () => ({
  isProcessAlive: mockIsProcessAlive,
  killProcess: mock(),
  isWindows: mock(() => false),
  killProcessByChildProcess: mock()
}))

mock.module('@/projectPath', () => ({
  isBunCompiled: mock(() => false),
  projectPath: mock(() => '/project'),
  runtimePath: mock(() => '/runtime')
}))

mock.module('../../package.json', () => ({
  default: {
    version: '1.0.0'
  }
}))

describe('isRunnerRunningCurrentlyInstalledZhushenVersion degraded handling', () => {
  beforeEach(() => {
    mockReadRunnerState.mockReset()
    mockClearRunnerState.mockReset()
    mockClearRunnerLock.mockReset()
    mockIsProcessAlive.mockReset()
    mockAbortSignalTimeout.mockReset()

    mockReadRunnerState.mockResolvedValue({
      pid: 123,
      httpPort: 4312,
      startedWithCliVersion: '1.0.0',
      startedWithCliMtimeMs: 111
    })
    mockIsProcessAlive.mockReturnValue(true)
    mockAbortSignalTimeout.mockReturnValue(new AbortController().signal)
    AbortSignal.timeout = mockAbortSignalTimeout
    globalThis.fetch = mock().mockRejectedValue(new Error('connect ECONNREFUSED')) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    AbortSignal.timeout = originalAbortSignalTimeout
  })

  it('returns false for degraded runner state so callers do not treat control-plane loss as reusable health', async () => {
    const module = await import('./controlClient')

    await expect(module.isRunnerRunningCurrentlyInstalledZhushenVersion()).resolves.toBe(false)
  })

  it('returns false for missing runner state', async () => {
    const module = await import('./controlClient')
    mockReadRunnerState.mockResolvedValue(null)

    await expect(module.isRunnerRunningCurrentlyInstalledZhushenVersion()).resolves.toBe(false)
  })
})
