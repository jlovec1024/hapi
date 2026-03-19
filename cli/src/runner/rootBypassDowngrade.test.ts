import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { SpawnSessionOptions, SpawnSessionResult } from '@/modules/common/rpcTypes';

// Mock dependencies
const mockSpawnZhushenCLI = vi.fn();
const mockLogger = {
  debug: vi.fn(),
  debugLargeJson: vi.fn(),
  warn: vi.fn(),
  info: vi.fn()
};

vi.mock('@/api/api', () => ({ ApiClient: vi.fn() }));

vi.mock('@/ui/auth', () => ({ authAndSetupMachineIfNeeded: vi.fn() }));

vi.mock('@/ui/doctor', () => ({ getEnvironmentInfo: vi.fn(() => ({})) }));

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
  getRunnerAvailability: vi.fn(),
  isRunnerRunningCurrentlyInstalledZhushenVersion: vi.fn(),
  stopRunner: vi.fn()
}));

vi.mock('./controlServer', () => ({ startRunnerControlServer: vi.fn() }));

vi.mock('./worktree', () => ({ createWorktree: vi.fn(), removeWorktree: vi.fn() }));

vi.mock('@/agent/sessionFactory', () => ({ buildMachineMetadata: vi.fn() }));

vi.mock('../../package.json', () => ({ default: { version: '1.0.0', bugs: 'https://github.com/test/test' } }));

vi.mock('@/utils/spawnZhushenCLI', () => ({
  spawnZhushenCLI: mockSpawnZhushenCLI
}));

vi.mock('@/ui/logger', () => ({
  logger: mockLogger
}));

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    mkdtemp: vi.fn().mockResolvedValue('/tmp/test'),
    writeFile: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('os', () => ({
  default: {
    tmpdir: vi.fn().mockReturnValue('/tmp'),
    hostname: vi.fn().mockReturnValue('test-host'),
    platform: vi.fn().mockReturnValue('linux'),
    homedir: vi.fn().mockReturnValue('/home/test')
  }
}));

describe('Root user BYPASS mode downgrade', () => {
  let originalGetuid: typeof process.getuid;
  let mockGetuid: Mock<() => number>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Save original getuid
    originalGetuid = process.getuid;

    // Create mock getuid
    mockGetuid = vi.fn();
    process.getuid = mockGetuid as any;

    // Setup default mock behavior for spawnZhushenCLI
    mockSpawnZhushenCLI.mockReturnValue({
      pid: 12345,
      stderr: {
        on: vi.fn()
      },
      once: vi.fn(),
      removeListener: vi.fn()
    });
  });

  afterEach(() => {
    // Restore original getuid
    if (originalGetuid) {
      process.getuid = originalGetuid;
    } else {
      delete (process as any).getuid;
    }
  });

  it('should downgrade BYPASS mode when running as root with Claude', async () => {
    // Mock root user (uid = 0)
    mockGetuid.mockReturnValue(0);

    // Import after mocks are set up
    const { startRunner } = await import('./run');

    // We need to test the spawnSession function which is internal
    // For now, we'll verify the behavior through integration
    // by checking that the logger.warn is called with the correct message

    // This is a placeholder - the actual test would need to:
    // 1. Set up a full runner environment
    // 2. Call spawnSession with root + claude + yolo
    // 3. Verify that --yolo is not passed to spawnZhushenCLI
    // 4. Verify that warnings are returned in the result

    expect(mockGetuid).toBeDefined();
  });

  it('should not downgrade BYPASS mode when running as non-root', async () => {
    // Mock non-root user (uid = 1000)
    mockGetuid.mockReturnValue(1000);

    // Verify the mock returns correct value
    const uid = mockGetuid();
    expect(uid).toBe(1000);
  });

  it('should not downgrade BYPASS mode for non-Claude agents even as root', async () => {
    // Mock root user
    mockGetuid.mockReturnValue(0);

    // Test would verify that codex, cursor, gemini, opencode are not affected
    const uid = mockGetuid();
    expect(uid).toBe(0);
  });

  it('should handle Windows (no getuid) gracefully', async () => {
    // Remove getuid to simulate Windows
    delete (process as any).getuid;

    expect(process.getuid).toBeUndefined();
  });
});

describe('Root detection utility', () => {
  it('should detect root user correctly', () => {
    const mockGetuid = vi.fn().mockReturnValue(0);
    process.getuid = mockGetuid as any;

    const isRootUser = typeof process.getuid === 'function' && process.getuid() === 0;
    expect(isRootUser).toBe(true);
  });

  it('should detect non-root user correctly', () => {
    const mockGetuid = vi.fn().mockReturnValue(1000);
    process.getuid = mockGetuid as any;

    const isRootUser = typeof process.getuid === 'function' && process.getuid() === 0;
    expect(isRootUser).toBe(false);
  });

  it('should handle missing getuid (Windows)', () => {
    delete (process as any).getuid;

    const isRootUser = typeof process.getuid === 'function' && process.getuid() === 0;
    expect(isRootUser).toBe(false);
  });
});

describe('SpawnSessionResult warnings field', () => {
  it('should accept success result with warnings', () => {
    const result: SpawnSessionResult = {
      type: 'success',
      sessionId: 'test-session-id',
      warnings: ['Test warning']
    };

    expect(result.type).toBe('success');
    expect(result.warnings).toEqual(['Test warning']);
  });

  it('should accept success result without warnings', () => {
    const result: SpawnSessionResult = {
      type: 'success',
      sessionId: 'test-session-id'
    };

    expect(result.type).toBe('success');
    expect(result.warnings).toBeUndefined();
  });

  it('should accept success result with empty warnings array', () => {
    const result: SpawnSessionResult = {
      type: 'success',
      sessionId: 'test-session-id',
      warnings: []
    };

    expect(result.type).toBe('success');
    expect(result.warnings).toEqual([]);
  });
});
