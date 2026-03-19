import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()
const mockGetOrCreateMachine = vi.fn()
const mockGetOrCreateSession = vi.fn()
const mockSessionSyncClient = vi.fn()
const mockNotifyRunnerSessionStarted = vi.fn()
const mockReadSettings = vi.fn()
const mockEnsureGitSafeDirectoryForSession = vi.fn()

vi.mock('@/api/api', () => ({
    ApiClient: {
        create: mockCreate
    }
}))

vi.mock('@/runner/controlClient', () => ({
    notifyRunnerSessionStarted: mockNotifyRunnerSessionStarted
}))

vi.mock('@/persistence', () => ({
    readSettings: mockReadSettings
}))

vi.mock('@/configuration', () => ({
    configuration: {
        zhushenHomeDir: '/zhushen-home'
    }
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn()
    }
}))

vi.mock('@/projectPath', () => ({
    runtimePath: vi.fn(() => '/runtime')
}))

vi.mock('@/utils/worktreeEnv', () => ({
    readWorktreeEnv: vi.fn(() => null)
}))

vi.mock('@/utils/gitSafeDirectory', () => ({
    ensureGitSafeDirectoryForSession: mockEnsureGitSafeDirectoryForSession
}))

vi.mock('node:os', () => ({
    default: {
        hostname: vi.fn(() => 'test-host'),
        platform: vi.fn(() => 'linux'),
        homedir: vi.fn(() => '/home/test')
    }
}))

vi.mock('../../package.json', () => ({
    default: {
        version: '1.0.0',
        bugs: 'https://example.invalid/bugs'
    }
}))

describe('bootstrapSession', () => {
    beforeEach(() => {
        vi.clearAllMocks()

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
