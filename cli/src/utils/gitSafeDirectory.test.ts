import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecFile = vi.fn()
const mockLstat = vi.fn()
const mockReadFile = vi.fn()
const mockRealpath = vi.fn()
const mockLogger = {
    debug: vi.fn(),
    warn: vi.fn()
}

vi.mock('node:child_process', () => ({
    execFile: mockExecFile
}))

vi.mock('node:fs/promises', () => ({
    lstat: mockLstat,
    readFile: mockReadFile,
    realpath: mockRealpath
}))

vi.mock('@/ui/logger', () => ({
    logger: mockLogger
}))

describe('gitSafeDirectory', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockRealpath.mockImplementation(async (path: string) => path)
    })

    it('skips non-git directories', async () => {
        mockLstat.mockRejectedValue(new Error('missing'))

        const { ensureGitSafeDirectoryForSession } = await import('./gitSafeDirectory')

        await expect(ensureGitSafeDirectoryForSession('/tmp/plain-dir')).resolves.toBeUndefined()
        expect(mockExecFile).not.toHaveBeenCalled()
    })

    it('adds the main repo root when started from a worktree', async () => {
        mockLstat.mockImplementation(async (path: string) => {
            if (path === '/repo/worktrees/feature/.git') {
                return {
                    isDirectory: () => false,
                    isFile: () => true
                }
            }
            throw new Error(`unexpected lstat: ${path}`)
        })
        mockReadFile.mockResolvedValue('gitdir: /repo/.git/worktrees/feature\n')
        mockExecFile
            .mockImplementationOnce((_cmd: string, _args: string[], callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void) => {
                callback(Object.assign(new Error('missing'), { code: 1, stdout: '', stderr: '' }))
            })
            .mockImplementationOnce((_cmd: string, _args: string[], callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void) => {
                callback(null, { stdout: '', stderr: '' })
            })

        const { ensureGitSafeDirectoryForSession } = await import('./gitSafeDirectory')

        await expect(ensureGitSafeDirectoryForSession('/repo/worktrees/feature')).resolves.toBeUndefined()
        expect(mockExecFile).toHaveBeenNthCalledWith(
            1,
            'git',
            ['config', '--global', '--get-all', 'safe.directory'],
            expect.any(Function)
        )
        expect(mockExecFile).toHaveBeenNthCalledWith(
            2,
            'git',
            ['config', '--global', '--add', 'safe.directory', '/repo'],
            expect.any(Function)
        )
        expect(mockLogger.warn).toHaveBeenCalledWith('[SESSION] Added Git safe.directory for repo root: /repo')
    })

    it('does not add config when the repo root is already trusted', async () => {
        mockLstat.mockImplementation(async (path: string) => {
            if (path === '/repo/.git') {
                return {
                    isDirectory: () => true,
                    isFile: () => false
                }
            }
            throw new Error(`unexpected lstat: ${path}`)
        })
        mockExecFile.mockImplementationOnce((_cmd: string, _args: string[], callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void) => {
            callback(null, { stdout: '/repo\n', stderr: '' })
        })

        const { ensureGitSafeDirectoryForSession } = await import('./gitSafeDirectory')

        await expect(ensureGitSafeDirectoryForSession('/repo')).resolves.toBeUndefined()
        expect(mockExecFile).toHaveBeenCalledTimes(1)
        expect(mockLogger.warn).not.toHaveBeenCalled()
    })

    it('surfaces a clear error when repairing safe.directory fails', async () => {
        mockLstat.mockImplementation(async (path: string) => {
            if (path === '/repo/.git') {
                return {
                    isDirectory: () => true,
                    isFile: () => false
                }
            }
            throw new Error(`unexpected lstat: ${path}`)
        })
        mockExecFile
            .mockImplementationOnce((_cmd: string, _args: string[], callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void) => {
                callback(Object.assign(new Error('missing'), { code: 1, stdout: '', stderr: '' }))
            })
            .mockImplementationOnce((_cmd: string, _args: string[], callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void) => {
                callback(Object.assign(new Error('repair failed'), {
                    stderr: 'fatal: detected dubious ownership in repository at \'/repo\'',
                    stdout: ''
                }))
            })

        const { ensureGitSafeDirectoryForSession } = await import('./gitSafeDirectory')

        await expect(ensureGitSafeDirectoryForSession('/repo')).rejects.toThrow(
            "Git trust preflight failed for repo root '/repo'. The CLI could not add Git safe.directory automatically. Git reported dubious ownership. fatal: detected dubious ownership in repository at '/repo'"
        )
    })
})
