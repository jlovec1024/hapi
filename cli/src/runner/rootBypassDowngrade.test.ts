import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import type { SpawnSessionResult } from '@/modules/common/rpcTypes'

const mockSpawnZhushenCLI = mock()
const mockStartRunnerControlServer = mock()
const mockLogger = {
  debug: mock(),
  debugLargeJson: mock(),
  warn: mock(),
  info: mock(),
  getLogPath: mock(() => '/tmp/runner.log')
}
const mockAcquireRunnerLock = mock()
const mockReleaseRunnerLock = mock()
const mockAuthAndSetupMachineIfNeeded = mock()
const mockGetRunnerAvailability = mock()
const mockIsRunnerRunningCurrentlyInstalledZhushenVersion = mock()
const mockStopRunner = mock()
const mockReadRunnerState = mock()
const mockWriteRunnerState = mock()
const mockBuildMachineMetadata = mock(() => ({ hostname: 'test-host' }))
const mockAccess = mock()
const mockMkdir = mock()
const mockMkdtemp = mock()
const mockWriteFile = mock()
const mockSetRPCHandlers = mock()
const mockConnect = mock()
const mockUpdateRunnerState = mock(async () => undefined)
const mockDisconnect = mock(async () => undefined)
const mockShutdown = mock(async () => undefined)
const mockMachineSyncClient = mock(() => ({
  setRPCHandlers: mockSetRPCHandlers,
  connect: mockConnect,
  updateRunnerState: mockUpdateRunnerState,
  disconnect: mockDisconnect,
  shutdown: mockShutdown
}))
const mockGetOrCreateMachine = mock(async () => ({ id: 'machine-1' }))
const mockApiClientCreate = mock(async () => ({
  getOrCreateMachine: mockGetOrCreateMachine,
  machineSyncClient: mockMachineSyncClient
}))
const mockCleanupRunnerState = mock(async () => undefined)
const mockGetInstalledCliMtimeMs = mock(() => 111)
const mockCheckClaudeAuthConfig = mock(() => ({ ok: true, checkedPaths: [] }))
const mockFormatClaudeAuthConfigError = mock(() => 'missing auth')
const mockWithRetry = mock(async <T>(fn: () => Promise<T>) => await fn())
const mockIsRetryableConnectionError = mock(() => false)
const mockIsWindows = mock(() => false)
const mockIsProcessAlive = mock(() => false)
const mockKillProcess = mock()
const mockKillProcessByChildProcess = mock()
const mockCreateWorktree = mock()
const mockRemoveWorktree = mock()
const mockGetEnvironmentInfo = mock(() => ({}))
const mockClearRunnerState = mock(async () => undefined)
const mockClearRunnerLock = mock(async () => undefined)
const mockAuthConfig = {
  checkClaudeAuthConfig: mockCheckClaudeAuthConfig,
  formatClaudeAuthConfigError: mockFormatClaudeAuthConfigError
}
let capturedSpawnSession: ((options: Record<string, unknown>) => Promise<SpawnSessionResult>) | null = null
let capturedOnZhushenSessionWebhook: ((sessionId: string, metadata: Record<string, unknown>) => void) | null = null
let runnerStop = mock(async () => undefined)

async function waitForSpawnReady() {
  for (let index = 0; index < 10 && mockSpawnZhushenCLI.mock.calls.length === 0; index += 1) {
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  expect(mockSpawnZhushenCLI).toHaveBeenCalledTimes(1)
  await Promise.resolve()
}

mock.module('@/api/api', () => ({
  ApiClient: {
    create: mockApiClientCreate
  }
}))
mock.module('@/ui/auth', () => ({ authAndSetupMachineIfNeeded: mockAuthAndSetupMachineIfNeeded }))
mock.module('@/ui/doctor', () => ({ getEnvironmentInfo: mockGetEnvironmentInfo }))
mock.module('@/persistence', () => ({
  writeRunnerState: mockWriteRunnerState,
  readRunnerState: mockReadRunnerState,
  acquireRunnerLock: mockAcquireRunnerLock,
  releaseRunnerLock: mockReleaseRunnerLock,
  clearRunnerState: mockClearRunnerState,
  clearRunnerLock: mockClearRunnerLock
}))
mock.module('@/utils/process', () => ({
  isProcessAlive: mockIsProcessAlive,
  isWindows: mockIsWindows,
  killProcess: mockKillProcess,
  killProcessByChildProcess: mockKillProcessByChildProcess
}))
mock.module('@/utils/time', () => ({
  withRetry: mockWithRetry
}))
mock.module('@/utils/errorUtils', () => ({
  apiValidationError: mock((message: string) => new Error(message)),
  extractErrorInfo: mock(() => ({
    message: 'boom',
    messageLower: 'boom',
    responseErrorText: ''
  })),
  isRetryableConnectionError: mockIsRetryableConnectionError
}))
mock.module('./controlClient', () => ({
  notifyRunnerSessionStarted: mock(async () => ({ ok: true })),
  listRunnerSessions: mock(async () => []),
  stopRunnerSession: mock(async () => false),
  spawnRunnerSession: mock(async () => ({})),
  stopRunnerHttp: mock(async () => undefined),
  cleanupRunnerState: mockCleanupRunnerState,
  getInstalledCliMtimeMs: mockGetInstalledCliMtimeMs,
  getRunnerAvailability: mockGetRunnerAvailability,
  checkIfRunnerRunningAndCleanupStaleState: mock(async () => false),
  isRunnerRunningCurrentlyInstalledZhushenVersion: mockIsRunnerRunningCurrentlyInstalledZhushenVersion,
  stopRunner: mockStopRunner
}))
mock.module('./controlServer', () => ({
  startRunnerControlServer: mockStartRunnerControlServer.mockImplementation(async (handlers: { spawnSession: (options: Record<string, unknown>) => Promise<SpawnSessionResult>; onZhushenSessionWebhook: (sessionId: string, metadata: Record<string, unknown>) => void }) => {
    capturedSpawnSession = handlers.spawnSession
    capturedOnZhushenSessionWebhook = handlers.onZhushenSessionWebhook
    return {
      port: 4312,
      stop: runnerStop
    }
  })
}))
mock.module('./worktree', () => ({ createWorktree: mockCreateWorktree, removeWorktree: mockRemoveWorktree }))
mock.module('@/agent/sessionFactory', () => ({
  bootstrapSession: mock(),
  buildMachineMetadata: mockBuildMachineMetadata,
  buildSessionMetadata: mock()
}))
mock.module('../../package.json', () => ({ default: { version: '1.0.0', bugs: 'https://github.com/test/test' } }))
mock.module('@/utils/spawnZhushenCLI', () => ({
  spawnZhushenCLI: mockSpawnZhushenCLI,
  getZhushenCliCommand: mock(() => ({ command: 'zs', args: [] })),
  getSpawnedCliWorkingDirectory: mock(() => process.cwd())
}))
mock.module('@/ui/logger', () => ({
  logger: mockLogger
}))
mock.module('node:fs/promises', () => ({
  access: mockAccess,
  mkdir: mockMkdir,
  mkdtemp: mockMkdtemp,
  writeFile: mockWriteFile,
  default: {
    access: mockAccess,
    mkdir: mockMkdir,
    mkdtemp: mockMkdtemp,
    writeFile: mockWriteFile
  }
}))
mock.module('os', () => ({
  default: {
    tmpdir: mock(() => '/tmp'),
    hostname: mock(() => 'test-host'),
    platform: mock(() => 'linux'),
    homedir: mock(() => '/home/test')
  }
}))
mock.module('@/claude/utils/authConfig', () => mockAuthConfig)

describe('Root user BYPASS mode downgrade', () => {
  const originalGetuid = process.getuid

  beforeEach(() => {
    capturedSpawnSession = null
    capturedOnZhushenSessionWebhook = null
    runnerStop = mock(async () => undefined)

    mockSpawnZhushenCLI.mockReset()
    mockStartRunnerControlServer.mockReset()
    mockLogger.debug.mockReset()
    mockLogger.debugLargeJson.mockReset()
    mockLogger.warn.mockReset()
    mockLogger.info.mockReset()
    mockLogger.getLogPath.mockReset()
    mockAcquireRunnerLock.mockReset()
    mockReleaseRunnerLock.mockReset()
    mockAuthAndSetupMachineIfNeeded.mockReset()
    mockGetRunnerAvailability.mockReset()
    mockIsRunnerRunningCurrentlyInstalledZhushenVersion.mockReset()
    mockStopRunner.mockReset()
    mockReadRunnerState.mockReset()
    mockWriteRunnerState.mockReset()
    mockBuildMachineMetadata.mockReset()
    mockAccess.mockReset()
    mockMkdir.mockReset()
    mockMkdtemp.mockReset()
    mockWriteFile.mockReset()
    mockSetRPCHandlers.mockReset()
    mockConnect.mockReset()
    mockUpdateRunnerState.mockImplementation(async () => undefined)
    mockDisconnect.mockImplementation(async () => undefined)
    mockShutdown.mockImplementation(async () => undefined)
    mockStartRunnerControlServer.mockImplementation(async (handlers: { spawnSession: (options: Record<string, unknown>) => Promise<SpawnSessionResult>; onZhushenSessionWebhook: (sessionId: string, metadata: Record<string, unknown>) => void }) => {
      capturedSpawnSession = handlers.spawnSession
      capturedOnZhushenSessionWebhook = handlers.onZhushenSessionWebhook
      return {
        port: 4312,
        stop: runnerStop
      }
    })

    process.getuid = mock(() => 1000) as typeof process.getuid

    mockLogger.getLogPath.mockReturnValue('/tmp/runner.log')
    mockGetRunnerAvailability.mockResolvedValue({ status: 'missing', state: null })
    mockIsRunnerRunningCurrentlyInstalledZhushenVersion.mockResolvedValue(false)
    mockAcquireRunnerLock.mockResolvedValue({ close: mock() })
    mockAuthAndSetupMachineIfNeeded.mockResolvedValue({ machineId: 'machine-1' })
    mockBuildMachineMetadata.mockReturnValue({ hostname: 'test-host' })
    mockAccess.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)
    mockMkdtemp.mockResolvedValue('/tmp/test')
    mockWriteFile.mockResolvedValue(undefined)
    mockGetOrCreateMachine.mockResolvedValue({ id: 'machine-1' })
    mockCleanupRunnerState.mockResolvedValue(undefined)
    mockGetInstalledCliMtimeMs.mockReturnValue(111)
    mockCheckClaudeAuthConfig.mockReturnValue({ ok: true, checkedPaths: [] })
    mockFormatClaudeAuthConfigError.mockReturnValue('missing auth')
    mockWithRetry.mockImplementation(async <T>(fn: () => Promise<T>) => await fn())
    mockIsRetryableConnectionError.mockReturnValue(false)
    mockIsWindows.mockReturnValue(false)
    mockIsProcessAlive.mockReturnValue(false)
    mockClearRunnerState.mockResolvedValue(undefined)
    mockClearRunnerLock.mockResolvedValue(undefined)
    mockGetEnvironmentInfo.mockReturnValue({})
    mockMachineSyncClient.mockReturnValue({
      setRPCHandlers: mockSetRPCHandlers,
      connect: mockConnect,
      updateRunnerState: mockUpdateRunnerState,
      disconnect: mockDisconnect,
      shutdown: mockShutdown
    })
    mockApiClientCreate.mockResolvedValue({
      getOrCreateMachine: mockGetOrCreateMachine,
      machineSyncClient: mockMachineSyncClient
    })

    mockSpawnZhushenCLI.mockImplementation(() => {
      const listeners = new Map<string, ((...args: any[]) => void)[]>()
      const on = mock((event: string, handler: (...args: any[]) => void) => {
        const current = listeners.get(event) ?? []
        current.push(handler)
        listeners.set(event, current)
        return child
      })
      const once = mock((event: string, handler: (...args: any[]) => void) => {
        const wrapped = (...args: any[]) => {
          removeListener(event, wrapped)
          handler(...args)
        }
        return on(event, wrapped)
      })
      const removeListener = mock((event: string, handler: (...args: any[]) => void) => {
        listeners.set(event, (listeners.get(event) ?? []).filter(listener => listener !== handler))
        return child
      })
      const emit = (event: string, ...args: any[]) => {
        for (const listener of listeners.get(event) ?? []) {
          listener(...args)
        }
      }
      const child = {
        pid: 12345,
        stderr: {
          on: mock()
        },
        once,
        on,
        removeListener,
        emit,
        unref: mock()
      }
      return child
    })
  })

  afterEach(() => {
    if (originalGetuid) {
      process.getuid = originalGetuid
    } else {
      delete (process as typeof process & { getuid?: typeof process.getuid }).getuid
    }
  })

  it('downgrades BYPASS mode when running as root with Claude', async () => {
    process.getuid = mock(() => 0) as typeof process.getuid

    const exitSpy = spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    try {
      const { startRunner } = await import('./run')
      const runnerPromise = startRunner()
      await new Promise(resolve => setTimeout(resolve, 0))

      const resultPromise = capturedSpawnSession!({
        directory: '/repo',
        machineId: 'machine-1',
        agent: 'claude',
        yolo: true
      })
      await waitForSpawnReady()
      capturedOnZhushenSessionWebhook!('control-server-session', {
        hostPid: 12345,
        startedBy: 'runner'
      })
      const result = await resultPromise

      expect(mockSpawnZhushenCLI).toHaveBeenCalledTimes(1)
      const [args] = mockSpawnZhushenCLI.mock.calls[0] as [string[]]
      expect(args).not.toContain('--yolo')
      expect(result).toEqual({
        type: 'success',
        sessionId: 'control-server-session',
        warnings: ['BYPASS mode is not allowed for root user with Claude Code. Session started in default mode instead.']
      })
      expect(mockLogger.warn).toHaveBeenCalledWith('[RUNNER RUN] Root user detected with BYPASS mode for Claude - downgrading to default mode')

      process.emit('SIGTERM')
      await expect(runnerPromise).resolves.toBeUndefined()
      expect(exitSpy).toHaveBeenCalledWith(0)
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('keeps BYPASS mode for non-root users', async () => {
    process.getuid = mock(() => 1000) as typeof process.getuid

    const exitSpy = spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    try {
      const { startRunner } = await import('./run')
      const runnerPromise = startRunner()
      await new Promise(resolve => setTimeout(resolve, 0))

      const resultPromise = capturedSpawnSession!({
        directory: '/repo',
        machineId: 'machine-1',
        agent: 'claude',
        yolo: true
      })
      await waitForSpawnReady()
      capturedOnZhushenSessionWebhook!('control-server-session', {
        hostPid: 12345,
        startedBy: 'runner'
      })
      const result = await resultPromise

      const [args] = mockSpawnZhushenCLI.mock.calls[0] as [string[]]
      expect(args).toContain('--yolo')
      expect(result).toEqual({
        type: 'success',
        sessionId: 'control-server-session'
      })
      expect(mockLogger.warn).not.toHaveBeenCalled()

      process.emit('SIGTERM')
      await expect(runnerPromise).resolves.toBeUndefined()
      expect(exitSpy).toHaveBeenCalledWith(0)
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('does not downgrade BYPASS mode for non-Claude agents even as root', async () => {
    process.getuid = mock(() => 0) as typeof process.getuid

    const exitSpy = spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    try {
      const { startRunner } = await import('./run')
      const runnerPromise = startRunner()
      await new Promise(resolve => setTimeout(resolve, 0))

      const resultPromise = capturedSpawnSession!({
        directory: '/repo',
        machineId: 'machine-1',
        agent: 'codex',
        yolo: true
      })
      await waitForSpawnReady()
      capturedOnZhushenSessionWebhook!('control-server-session', {
        hostPid: 12345,
        startedBy: 'runner'
      })
      const result = await resultPromise

      const [args] = mockSpawnZhushenCLI.mock.calls[0] as [string[]]
      expect(args).toContain('--yolo')
      expect(result).toEqual({
        type: 'success',
        sessionId: 'control-server-session'
      })
      expect(mockLogger.warn).not.toHaveBeenCalled()

      process.emit('SIGTERM')
      await expect(runnerPromise).resolves.toBeUndefined()
      expect(exitSpy).toHaveBeenCalledWith(0)
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('handles Windows without getuid gracefully', async () => {
    delete (process as typeof process & { getuid?: typeof process.getuid }).getuid

    const exitSpy = spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    try {
      const { startRunner } = await import('./run')
      const runnerPromise = startRunner()
      await new Promise(resolve => setTimeout(resolve, 0))

      const resultPromise = capturedSpawnSession!({
        directory: '/repo',
        machineId: 'machine-1',
        agent: 'claude',
        yolo: true
      })
      await waitForSpawnReady()
      capturedOnZhushenSessionWebhook!('control-server-session', {
        hostPid: 12345,
        startedBy: 'runner'
      })
      const result = await resultPromise

      const [args] = mockSpawnZhushenCLI.mock.calls[0] as [string[]]
      expect(args).toContain('--yolo')
      expect(result).toEqual({
        type: 'success',
        sessionId: 'control-server-session'
      })

      process.emit('SIGTERM')
      await expect(runnerPromise).resolves.toBeUndefined()
      expect(exitSpy).toHaveBeenCalledWith(0)
    } finally {
      exitSpy.mockRestore()
    }
  })
})
