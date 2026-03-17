import { execFile } from 'node:child_process'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { logger } from '@/ui/logger'

const execFileAsync = promisify(execFile)
const DUBIOUS_OWNERSHIP_HINT = 'detected dubious ownership'

async function pathExists(path: string): Promise<boolean> {
    try {
        await lstat(path)
        return true
    } catch {
        return false
    }
}

async function normalizePath(path: string): Promise<string> {
    try {
        return await realpath(path)
    } catch {
        return resolve(path)
    }
}

function getParentDirectory(path: string): string | null {
    const parent = dirname(path)
    return parent === path ? null : parent
}

function parseGitDirPointer(contents: string): string | null {
    const match = contents.match(/^gitdir:\s*(.+)\s*$/m)
    if (!match) {
        return null
    }
    return match[1].trim()
}

function deriveMainRepoRootFromGitDir(gitDir: string): string | null {
    const worktreesDir = dirname(gitDir)
    if (worktreesDir === gitDir) {
        return null
    }

    const normalizedWorktreesDir = worktreesDir.replace(/\\/g, '/')
    if (!normalizedWorktreesDir.endsWith('/.git/worktrees')) {
        return null
    }

    const commonGitDir = dirname(worktreesDir)
    const repoRoot = dirname(commonGitDir)
    return repoRoot === commonGitDir ? null : repoRoot
}

export async function resolveGitRepoRootForSession(workingDirectory: string): Promise<string | null> {
    let currentDirectory = await normalizePath(workingDirectory)

    while (true) {
        const gitEntryPath = join(currentDirectory, '.git')
        if (await pathExists(gitEntryPath)) {
            const stat = await lstat(gitEntryPath)
            if (stat.isDirectory()) {
                return currentDirectory
            }

            if (stat.isFile()) {
                const rawGitPointer = await readFile(gitEntryPath, 'utf8')
                const parsedGitDir = parseGitDirPointer(rawGitPointer)
                if (!parsedGitDir) {
                    return currentDirectory
                }

                const gitDir = await normalizePath(
                    isAbsolute(parsedGitDir) ? parsedGitDir : resolve(currentDirectory, parsedGitDir)
                )
                const worktreeRepoRoot = deriveMainRepoRootFromGitDir(gitDir)
                return worktreeRepoRoot ? await normalizePath(worktreeRepoRoot) : currentDirectory
            }
        }

        const parentDirectory = getParentDirectory(currentDirectory)
        if (!parentDirectory) {
            return null
        }
        currentDirectory = parentDirectory
    }
}

type GitCommandResult = {
    stdout: string
    stderr: string
}

async function runGit(args: string[]): Promise<GitCommandResult> {
    const result = await execFileAsync('git', args)
    return {
        stdout: result.stdout ? result.stdout.toString() : '',
        stderr: result.stderr ? result.stderr.toString() : ''
    }
}

async function listSafeDirectories(): Promise<string[]> {
    try {
        const result = await runGit(['config', '--global', '--get-all', 'safe.directory'])
        return result.stdout
            .split(/\r?\n/)
            .map((entry) => entry.trim())
            .filter(Boolean)
    } catch (error) {
        const execError = error as NodeJS.ErrnoException & {
            stdout?: string
            stderr?: string
            code?: string | number
        }
        const exitCode = execError.code
        if (String(exitCode) === '1') {
            return []
        }
        const stderr = execError.stderr ? execError.stderr.toString().trim() : ''
        const stdout = execError.stdout ? execError.stdout.toString().trim() : ''
        throw new Error(stderr || stdout || execError.message || 'Failed to read Git safe.directory config.')
    }
}

async function isDirectoryTrusted(repoRoot: string, safeDirectories: string[]): Promise<boolean> {
    if (safeDirectories.includes('*')) {
        return true
    }

    const normalizedRepoRoot = await normalizePath(repoRoot)
    for (const entry of safeDirectories) {
        if (!entry) {
            continue
        }

        if (!isAbsolute(entry)) {
            if (entry === normalizedRepoRoot) {
                return true
            }
            continue
        }

        const normalizedEntry = await normalizePath(entry)
        if (normalizedEntry === normalizedRepoRoot) {
            return true
        }
    }

    return false
}

async function addSafeDirectory(repoRoot: string): Promise<void> {
    try {
        await runGit(['config', '--global', '--add', 'safe.directory', repoRoot])
    } catch (error) {
        const execError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
        const stderr = execError.stderr ? execError.stderr.toString().trim() : ''
        const stdout = execError.stdout ? execError.stdout.toString().trim() : ''
        throw new Error(stderr || stdout || execError.message || 'Failed to add Git safe.directory.')
    }
}

export async function ensureGitSafeDirectoryForSession(workingDirectory: string): Promise<void> {
    const repoRoot = await resolveGitRepoRootForSession(workingDirectory)
    if (!repoRoot) {
        logger.debug(`[SESSION] Git safe.directory preflight skipped (not a Git repository): ${workingDirectory}`)
        return
    }

    const safeDirectories = await listSafeDirectories()
    if (await isDirectoryTrusted(repoRoot, safeDirectories)) {
        logger.debug(`[SESSION] Git safe.directory preflight passed for repo root: ${repoRoot}`)
        return
    }

    try {
        await addSafeDirectory(repoRoot)
        logger.warn(`[SESSION] Added Git safe.directory for repo root: ${repoRoot}`)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const suspiciousOwnershipHint = message.toLowerCase().includes(DUBIOUS_OWNERSHIP_HINT)
            ? ' Git reported dubious ownership.'
            : ''
        throw new Error(
            `Git trust preflight failed for repo root '${repoRoot}'. The CLI could not add Git safe.directory automatically.${suspiciousOwnershipHint} ${message}`.trim()
        )
    }
}
