import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockInitializeToken = vi.fn()
const mockMaybeAutoStartServer = vi.fn()
const mockAuthAndSetupMachineIfNeeded = vi.fn()
const mockIsRunnerRunningCurrentlyInstalledHappyVersion = vi.fn()
const mockSpawnHappyCLI = vi.fn()
const mockRunClaude = vi.fn()
const mockCheckClaudeAuthConfig = vi.fn()
const mockFormatClaudeAuthConfigError = vi.fn(() => 'missing auth details')

vi.mock('@/configuration', () => ({
    configuration: {
        apiUrl: 'http://example.test'
    }
}))

vi.mock('@/runner/controlClient', () => ({
    isRunnerRunningCurrentlyInstalledHappyVersion: mockIsRunnerRunningCurrentlyInstalledHappyVersion
}))

vi.mock('@/ui/auth', () => ({
    authAndSetupMachineIfNeeded: mockAuthAndSetupMachineIfNeeded
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn()
    }
}))

vi.mock('@/ui/tokenInit', () => ({
    initializeToken: mockInitializeToken
}))

vi.mock('@/utils/spawnHappyCLI', () => ({
    spawnHappyCLI: mockSpawnHappyCLI
}))

vi.mock('@/utils/autoStartServer', () => ({
    maybeAutoStartServer: mockMaybeAutoStartServer
}))

vi.mock('@/utils/bunRuntime', () => ({
    withBunRuntimeEnv: vi.fn(() => process.env)
}))

vi.mock('@/utils/errorUtils', () => ({
    extractErrorInfo: vi.fn(() => ({
        message: 'boom',
        messageLower: 'boom'
    }))
}))

vi.mock('@/claude/utils/authConfig', () => ({
    checkClaudeAuthConfig: mockCheckClaudeAuthConfig,
    formatClaudeAuthConfigError: mockFormatClaudeAuthConfigError
}))

describe('claudeCommand runner availability gating', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockInitializeToken.mockResolvedValue(undefined)
        mockMaybeAutoStartServer.mockResolvedValue(undefined)
        mockAuthAndSetupMachineIfNeeded.mockResolvedValue(undefined)
        mockIsRunnerRunningCurrentlyInstalledHappyVersion.mockResolvedValue(true)
        mockRunClaude.mockResolvedValue(undefined)
        mockCheckClaudeAuthConfig.mockReturnValue({
            ok: true,
            source: { type: 'env', envKey: 'CLAUDE_CODE_OAUTH_TOKEN' },
            checkedPaths: []
        })
        mockSpawnHappyCLI.mockReturnValue({
            unref: vi.fn()
        })
    })

    it('starts runner when reusable-health check is false so degraded control plane is not treated as ready', async () => {
        mockIsRunnerRunningCurrentlyInstalledHappyVersion.mockResolvedValue(false)
        const { claudeCommand } = await import('./claude')

        await claudeCommand.run({ commandArgs: [] } as never)

        expect(mockSpawnHappyCLI).toHaveBeenCalledWith(['runner', 'start-sync'], {
            detached: true,
            stdio: 'ignore',
            env: process.env
        })
        expect(mockRunClaude).toHaveBeenCalledTimes(1)
    })

    it('skips runner start when reusable-health check is true', async () => {
        const { claudeCommand } = await import('./claude')

        await claudeCommand.run({ commandArgs: [] } as never)

        expect(mockSpawnHappyCLI).not.toHaveBeenCalled()
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

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
            throw new Error(`EXIT:${code ?? 0}`)
        }) as never)
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

        try {
            const { claudeCommand } = await import('./claude')
            await expect(claudeCommand.run({ commandArgs: [] } as never)).rejects.toThrow('EXIT:1')
            expect(mockInitializeToken).not.toHaveBeenCalled()
            expect(mockSpawnHappyCLI).not.toHaveBeenCalled()
            expect(mockRunClaude).not.toHaveBeenCalled()
        } finally {
            exitSpy.mockRestore()
            errorSpy.mockRestore()
        }
    })
})

vi.mock('@/claude/runClaude', () => ({
    runClaude: mockRunClaude
}))
