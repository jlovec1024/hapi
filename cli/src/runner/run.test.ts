import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetRunnerAvailability = vi.fn();
const mockIsRunnerRunningCurrentlyInstalledZhushenVersion = vi.fn();
const mockStopRunner = vi.fn();
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

vi.mock('@/api/api', () => ({ ApiClient: vi.fn() }));
vi.mock('@/ui/logger', () => ({
  logger: {
    debug: vi.fn(),
    debugLargeJson: vi.fn()
  }
}));
vi.mock('@/ui/auth', () => ({ authAndSetupMachineIfNeeded: vi.fn() }));
vi.mock('@/ui/doctor', () => ({ getEnvironmentInfo: vi.fn(() => ({})) }));
vi.mock('@/utils/spawnZhushenCLI', () => ({ spawnZhushenCLI: vi.fn() }));
vi.mock('@/persistence', () => ({
  writeRunnerState: vi.fn(),
  readRunnerState: vi.fn(),
  acquireRunnerLock: vi.fn(),
  releaseRunnerLock: vi.fn()
}));
vi.mock('@/utils/process', () => ({
  isProcessAlive: vi.fn(),
  isWindows: vi.fn(() => false),
  killProcess: vi.fn(),
  killProcessByChildProcess: vi.fn()
}));
vi.mock('@/utils/time', () => ({ withRetry: vi.fn() }));
vi.mock('@/utils/errorUtils', () => ({ isRetryableConnectionError: vi.fn(() => false) }));
vi.mock('./controlClient', () => ({
  cleanupRunnerState: vi.fn(),
  getInstalledCliMtimeMs: vi.fn(),
  getRunnerAvailability: mockGetRunnerAvailability,
  isRunnerRunningCurrentlyInstalledZhushenVersion: mockIsRunnerRunningCurrentlyInstalledZhushenVersion,
  stopRunner: mockStopRunner
}));
vi.mock('./controlServer', () => ({ startRunnerControlServer: vi.fn() }));
vi.mock('./worktree', () => ({ createWorktree: vi.fn(), removeWorktree: vi.fn() }));
vi.mock('@/agent/sessionFactory', () => ({ buildMachineMetadata: vi.fn() }));
vi.mock('../../package.json', () => ({ default: { version: '1.0.0' } }));

describe('startRunner degraded handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockClear();
  });

  it('does not stop the existing runner when availability is degraded', async () => {
    mockGetRunnerAvailability.mockResolvedValue({
      status: 'degraded',
      state: {
        pid: 123,
        httpPort: 1,
        startedWithCliVersion: '1.0.0'
      }
    });
    mockIsRunnerRunningCurrentlyInstalledZhushenVersion.mockResolvedValue(false);

    const exitSignal = new Error('EXIT:0');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
      throw new Error(`EXIT:${code ?? 0}`);
    }) as never);

    try {
      const { startRunner } = await import('./run');
      await expect(startRunner()).rejects.toThrow('EXIT:0');
      expect(mockStopRunner).not.toHaveBeenCalled();
      expect(mockIsRunnerRunningCurrentlyInstalledZhushenVersion).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });
});

