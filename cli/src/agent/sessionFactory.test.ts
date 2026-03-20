import { beforeEach, describe, expect, it, mock } from 'bun:test'

const mockCreate = mock()
const mockGetOrCreateMachine = mock()
const mockGetOrCreateSession = mock()
const mockSessionSyncClient = mock()
const mockNotifyRunnerSessionStarted = mock()
const mockReadSettings = mock()
const mockEnsureGitSafeDirectoryForSession = mock()

mock.module('@/api/api', () => ({
    ApiClient: {
        create: mockCreate
    }
}))

mock.module('@/runner/controlClient', () => ({
    notifyRunnerSessionStarted: mockNotifyRunnerSessionStarted,
    listRunnerSessions: mock(async () => []),
    stopRunnerSession: mock(async () => false),
    spawnRunnerSession: mock(async () => ({})),
    stopRunnerHttp: mock(async () => undefined),
    getInstalledCliMtimeMs: mock(() => undefined),
    getRunnerAvailability: mock(async () => ({ status: 'missing', state: null })),
    checkIfRunnerRunningAndCleanupStaleState: mock(async () => false),
    isRunnerRunningCurrentlyInstalledZhushenVersion: mock(async () => false),
    cleanupRunnerState: mock(async () => undefined),
    stopRunner: mock(async () => false)
}))

mock.module('@/persistence', () => ({
    readSettings: mockReadSettings
}))

mock.module('@/configuration', () => ({
    configuration: {
        zhushenHomeDir: '/zhushen-home'
    }
}))

mock.module('@/ui/logger', () => ({
    logger: {
        debug: mock()
    }
}))

mock.module('@/projectPath', () => ({
    runtimePath: mock(() => '/runtime')
}))

mock.module('@/utils/worktreeEnv', () => ({
    readWorktreeEnv: mock(() => null)
}))

mock.module('@/utils/gitSafeDirectory', () => ({
    ensureGitSafeDirectoryForSession: mockEnsureGitSafeDirectoryForSession
}))

mock.module('node:os', () => ({
    default: {
        hostname: mock(() => 'test-host'),
        platform: mock(() => 'linux'),
        homedir: mock(() => '/home/test')
    }
}))

mock.module('../../package.json', () => ({
    default: {
        version: '1.0.0',
        bugs: 'https://example.invalid/bugs'
    }
}))

describe('bootstrapSession', () => {
    beforeEach(() => {
        mock.restore()
        mockCreate.mockReset()
        mockGetOrCreateMachine.mockReset()
        mockGetOrCreateSession.mockReset()
        mockSessionSyncClient.mockReset()
        mockNotifyRunnerSessionStarted.mockReset()
        mockReadSettings.mockReset()
        mockEnsureGitSafeDirectoryForSession.mockReset()

        const apiClient = {
            getOrCreateMachine: mockGetOrCreateMachine,
            getOrCreateSession: mockGetOrCreateSession,
            sessionSyncClient: mockSessionSyncClient
        }

        mockCreate.mockResolvedValue(apiClient)
        mockReadSettings.mockResolvedValue({ machineId: 'machine-123' })
        mockEnsureGitSafeDirectoryForSession.mockResolvedValue(undefined)
        mockGetOrCreateMachine.mockResolvedValue({ id: 'machine-123' })
        mockGetOrCreateSession.mockResolvedValue({
            id: 'session-123',
            metadata: null,
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 1
        })
        mockSessionSyncClient.mockReturnValue({ id: 'sync-client' })
        mockNotifyRunnerSessionStarted.mockResolvedValue({ ok: true })
    })

    it('runs git trust preflight before creating the API session', async () => {
        const { bootstrapSession } = await import('./sessionFactory')

        await bootstrapSession({
            flavor: 'claude',
            workingDirectory: '/repo/subdir'
        })

        expect(mockEnsureGitSafeDirectoryForSession).toHaveBeenCalledWith('/repo/subdir')
        expect(mockCreate).toHaveBeenCalledTimes(1)
        expect(mockGetOrCreateSession).toHaveBeenCalledTimes(1)
    })

    it('stops bootstrap when git trust repair fails', async () => {
        mockEnsureGitSafeDirectoryForSession.mockRejectedValue(new Error('Failed to repair Git safe.directory'))

        const { bootstrapSession } = await import('./sessionFactory')

        await expect(
            bootstrapSession({
                flavor: 'claude',
                workingDirectory: '/repo/subdir'
            })
        ).rejects.toThrow('Failed to repair Git safe.directory')

        expect(mockCreate).not.toHaveBeenCalled()
        expect(mockGetOrCreateSession).not.toHaveBeenCalled()
        expect(mockNotifyRunnerSessionStarted).not.toHaveBeenCalled()
    })
})
