import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

const mockGetRunnerAvailability = mock()
const mockIsRunnerRunningCurrentlyInstalledZhushenVersion = mock()
const mockStopRunner = mock()
const mockWriteRunnerState = mock()
const mockReadRunnerState = mock()
const mockAcquireRunnerLock = mock()
const mockReleaseRunnerLock = mock(async () => undefined)
const mockClearRunnerState = mock(async () => undefined)
const mockClearRunnerLock = mock(async () => undefined)

mock.module('@/api/api', () => ({ ApiClient: mock() }))
mock.module('@/ui/logger', () => ({
  logger: {
    debug: mock(),
    debugLargeJson: mock()
  }
}))
mock.module('@/ui/auth', () => ({ authAndSetupMachineIfNeeded: mock() }))
mock.module('@/ui/doctor', () => ({ getEnvironmentInfo: mock(() => ({})) }))
mock.module('@/utils/spawnZhushenCLI', () => ({ spawnZhushenCLI: mock() }))
mock.module('@/persistence', () => ({
  writeRunnerState: mockWriteRunnerState,
  readRunnerState: mockReadRunnerState,
  acquireRunnerLock: mockAcquireRunnerLock,
  releaseRunnerLock: mockReleaseRunnerLock,
  clearRunnerState: mockClearRunnerState,
  clearRunnerLock: mockClearRunnerLock
}))
mock.module('@/utils/process', () => ({
  isProcessAlive: mock(),
  isWindows: mock(() => false),
  killProcess: mock(),
  killProcessByChildProcess: mock()
}))
mock.module('@/utils/time', () => ({
  delay: mock(),
  exponentialBackoffDelay: mock(() => 0),
  createBackoff: mock(() => mock(async <T>(callback: () => Promise<T>) => await callback())),
  backoff: mock(async <T>(callback: () => Promise<T>) => await callback()),
  withRetry: mock(async <T>(fn: () => Promise<T>) => await fn())
}))
mock.module('@/utils/errorUtils', () => ({ isRetryableConnectionError: mock(() => false) }))
mock.module('./controlClient', () => ({
  cleanupRunnerState: mock(),
  getInstalledCliMtimeMs: mock(),
  getRunnerAvailability: mockGetRunnerAvailability,
  isRunnerRunningCurrentlyInstalledZhushenVersion: mockIsRunnerRunningCurrentlyInstalledZhushenVersion,
  stopRunner: mockStopRunner
}))
mock.module('./controlServer', () => ({ startRunnerControlServer: mock() }))
mock.module('./worktree', () => ({ createWorktree: mock(), removeWorktree: mock() }))
mock.module('@/agent/sessionFactory', () => ({ buildMachineMetadata: mock() }))
mock.module('@/claude/utils/authConfig', () => ({
  checkClaudeAuthConfig: mock(() => ({ ok: true, source: { type: 'env', envKey: 'CLAUDE_CODE_OAUTH_TOKEN' }, checkedPaths: [] })),
  formatClaudeAuthConfigError: mock(() => 'missing auth details')
}))
mock.module('../../package.json', () => ({ default: { version: '1.0.0' } }))

describe('startRunner degraded handling', () => {
  beforeEach(() => {
    mock.restore()
    mockGetRunnerAvailability.mockReset()
    mockIsRunnerRunningCurrentlyInstalledZhushenVersion.mockReset()
    mockStopRunner.mockReset()
    mockWriteRunnerState.mockReset()
    mockReadRunnerState.mockReset()
    mockAcquireRunnerLock.mockReset()
    mockReleaseRunnerLock.mockReset()
    mockClearRunnerState.mockReset()
    mockClearRunnerLock.mockReset()
  })

  afterEach(() => {
    mock.restore()
  })

  it('does not stop the existing runner when availability is degraded', async () => {
    mockGetRunnerAvailability.mockResolvedValue({
      status: 'degraded',
      state: {
        pid: 123,
        httpPort: 1,
        startedWithCliVersion: '1.0.0'
      }
    })
    mockIsRunnerRunningCurrentlyInstalledZhushenVersion.mockResolvedValue(false)

    const exitSpy = spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
      throw new Error(`EXIT:${code ?? 0}`)
    }) as never)

    try {
      const { startRunner } = await import('./run')
      await expect(startRunner()).rejects.toThrow('EXIT:0')
      expect(mockStopRunner).not.toHaveBeenCalled()
      expect(mockIsRunnerRunningCurrentlyInstalledZhushenVersion).not.toHaveBeenCalled()
    } finally {
      exitSpy.mockRestore()
    }
  })
})
