import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

const mockInitializeToken = mock()
const mockMaybeAutoStartServer = mock()
const mockAuthAndSetupMachineIfNeeded = mock()
const mockIsRunnerRunningCurrentlyInstalledZhushenVersion = mock()
const mockSpawnZhushenCLI = mock()
const mockRunClaude = mock()
const mockCheckClaudeAuthConfig = mock()
const mockFormatClaudeAuthConfigError = mock(() => 'missing auth details')

mock.module('chalk', () => ({
    default: {
        bold: Object.assign(mock((value: string) => value), {
            cyan: mock((value: string) => value)
        }),
        gray: mock((value: string) => value),
        red: mock((value: string) => value),
        yellow: mock((value: string) => value)
    }
}))

mock.module('@/configuration', () => ({
    configuration: {
        apiUrl: 'http://example.test'
    }
}))

mock.module('@/runner/controlClient', () => ({
    notifyRunnerSessionStarted: mock(async () => ({ ok: true })),
    listRunnerSessions: mock(async () => []),
    stopRunnerSession: mock(async () => false),
    spawnRunnerSession: mock(async () => ({})),
    stopRunnerHttp: mock(async () => undefined),
    getInstalledCliMtimeMs: mock(() => undefined),
    getRunnerAvailability: mock(async () => ({ status: 'missing', state: null })),
    checkIfRunnerRunningAndCleanupStaleState: mock(async () => false),
    isRunnerRunningCurrentlyInstalledZhushenVersion: mockIsRunnerRunningCurrentlyInstalledZhushenVersion,
    cleanupRunnerState: mock(async () => undefined),
    stopRunner: mock(async () => false)
}))

mock.module('@/ui/auth', () => ({
    authAndSetupMachineIfNeeded: mockAuthAndSetupMachineIfNeeded
}))

mock.module('@/ui/logger', () => ({
    logger: {
        debug: mock(),
        debugLargeJson: mock()
    }
}))

mock.module('@/ui/tokenInit', () => ({
    initializeToken: mockInitializeToken
}))

mock.module('@/utils/spawnZhushenCLI', () => ({
    spawnZhushenCLI: mockSpawnZhushenCLI,
    getZhushenCliCommand: mock(() => ({ command: 'zs', args: [] })),
    getSpawnedCliWorkingDirectory: mock(() => process.cwd())
}))

mock.module('@/utils/autoStartServer', () => ({
    maybeAutoStartServer: mockMaybeAutoStartServer
}))

mock.module('@/utils/bunRuntime', () => ({
    withBunRuntimeEnv: mock(() => process.env)
}))

mock.module('@/utils/errorUtils', () => ({
    apiValidationError: mock((message: string) => new Error(message)),
    extractErrorInfo: mock(() => ({
        message: 'boom',
        messageLower: 'boom'
    })),
    isRetryableConnectionError: mock(() => false)
}))

mock.module('@/claude/utils/authConfig', () => ({
    checkClaudeAuthConfig: mockCheckClaudeAuthConfig,
    formatClaudeAuthConfigError: mockFormatClaudeAuthConfigError
}))

mock.module('@/claude/runClaude', () => ({
    runClaude: mockRunClaude
}))

describe('claudeCommand runner availability gating', () => {
    beforeEach(() => {
        mockInitializeToken.mockReset()
        mockMaybeAutoStartServer.mockReset()
        mockAuthAndSetupMachineIfNeeded.mockReset()
        mockIsRunnerRunningCurrentlyInstalledZhushenVersion.mockReset()
        mockSpawnZhushenCLI.mockReset()
        mockRunClaude.mockReset()
        mockCheckClaudeAuthConfig.mockReset()
        mockFormatClaudeAuthConfigError.mockReset()
        mockFormatClaudeAuthConfigError.mockReturnValue('missing auth details')

        mockInitializeToken.mockResolvedValue(undefined)
        mockMaybeAutoStartServer.mockResolvedValue(undefined)
        mockAuthAndSetupMachineIfNeeded.mockResolvedValue(undefined)
        mockIsRunnerRunningCurrentlyInstalledZhushenVersion.mockResolvedValue(true)
        mockRunClaude.mockResolvedValue(undefined)
        mockCheckClaudeAuthConfig.mockReturnValue({
            ok: true,
            source: { type: 'env', envKey: 'CLAUDE_CODE_OAUTH_TOKEN' },
            checkedPaths: []
        })
        mockSpawnZhushenCLI.mockReturnValue({
            unref: mock()
        })
    })

    it('starts runner when reusable-health check is false so degraded control plane is not treated as ready', async () => {
        mockIsRunnerRunningCurrentlyInstalledZhushenVersion.mockResolvedValue(false)
        const { claudeCommand } = await import('./claude')

        await claudeCommand.run({ commandArgs: [] } as never)

        expect(mockSpawnZhushenCLI).toHaveBeenCalledWith(['runner', 'start-sync'], {
            detached: true,
            stdio: 'ignore',
            env: process.env
        })
        expect(mockRunClaude).toHaveBeenCalledTimes(1)
    })

    it('skips runner start when reusable-health check is true', async () => {
        const { claudeCommand } = await import('./claude')

        await claudeCommand.run({ commandArgs: [] } as never)

        expect(mockSpawnZhushenCLI).not.toHaveBeenCalled()
        expect(mockRunClaude).toHaveBeenCalledTimes(1)
    })

    it('fails before runner startup when Claude auth config is missing', async () => {
        mockCheckClaudeAuthConfig.mockReturnValue({
            ok: false,
            code: 'CLAUDE_AUTH_CONFIG_MISSING',
            message: 'missing',
            hint: 'fix it',
            checkedPaths: ['/data/claude/.claude/settings.json', '/data/claude/.claude.json'],
            suggestions: ['set env']
        })

        const exitSpy = spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
            throw new Error(`EXIT:${code ?? 0}`)
        }) as never)
        const errorSpy = spyOn(console, 'error').mockImplementation(() => undefined)

        try {
            const { claudeCommand } = await import('./claude')
            await expect(claudeCommand.run({ commandArgs: [] } as never)).rejects.toThrow('EXIT:1')
            expect(mockInitializeToken).not.toHaveBeenCalled()
            expect(mockSpawnZhushenCLI).not.toHaveBeenCalled()
            expect(mockRunClaude).not.toHaveBeenCalled()
        } finally {
            exitSpy.mockRestore()
            errorSpy.mockRestore()
        }
    })
})
