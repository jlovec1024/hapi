import { logger } from '@/ui/logger'
import type {
    TerminalErrorPayload,
    TerminalExitPayload,
    TerminalOutputPayload,
    TerminalReadyPayload
} from '@zs/protocol'
import type { TerminalSession } from './types'
import path from 'path'

// Static import for bun-pty (required for bun build --compile to work)
// Dynamic import() does not work in compiled executables
import * as BunPty from 'bun-pty'

type TerminalLogDetails = {
    stage: string
    outcome: 'start' | 'success' | 'error' | 'duplicate' | 'retry'
    terminalId: string
    cause?: string
    [key: string]: unknown
}

type TerminalRuntime = TerminalSession & {
    pty: BunPty.IPty
    dataDisposable: BunPty.IDisposable
    exitDisposable: BunPty.IDisposable
    idleTimer: ReturnType<typeof setTimeout> | null
}

type TerminalManagerOptions = {
    sessionId: string
    getSessionPath: () => string | null
    onReady: (payload: TerminalReadyPayload) => void
    onOutput: (payload: TerminalOutputPayload) => void
    onExit: (payload: TerminalExitPayload) => void
    onError: (payload: TerminalErrorPayload) => void
    idleTimeoutMs?: number
    maxTerminals?: number
}

type BunPtySpawn = (
    file: string,
    args: string[],
    options: {
        name: string
        cols?: number
        rows?: number
        cwd?: string
        env?: Record<string, string>
    }
) => BunPty.IPty

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60_000
const DEFAULT_MAX_TERMINALS = 4
const SENSITIVE_ENV_KEYS = new Set([
    'CLI_API_TOKEN',
    'ZS_API_URL',
    'ZS_HTTP_MCP_URL',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY'
])

const bunPtySpawn: BunPtySpawn | null = BunPty.spawn ?? null

function resolveEnvNumber(name: string, fallback: number): number {
    const raw = process.env[name]
    if (!raw) {
        return fallback
    }
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function resolveShell(): string {
    if (process.env.SHELL) {
        return process.env.SHELL
    }

    if (process.platform === 'win32') {
        return process.env.COMSPEC || 'cmd.exe'
    }

    if (process.platform === 'darwin') {
        return '/bin/zsh'
    }

    return '/bin/bash'
}

function getTerminalSupportIssue(): string | null {
    return null
}

function buildFilteredEnv(): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
        if (!value) continue
        if (SENSITIVE_ENV_KEYS.has(key)) continue
        env[key] = value
    }
    return env
}

function extractErrorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) {
        return undefined
    }
    if (!('code' in error)) {
        return undefined
    }
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : undefined
}

export class TerminalManager {
    private readonly sessionId: string
    private readonly getSessionPath: () => string | null
    private readonly onReady: (payload: TerminalReadyPayload) => void
    private readonly onOutput: (payload: TerminalOutputPayload) => void
    private readonly onExit: (payload: TerminalExitPayload) => void
    private readonly onError: (payload: TerminalErrorPayload) => void
    private readonly idleTimeoutMs: number
    private readonly maxTerminals: number
    private readonly terminals: Map<string, TerminalRuntime> = new Map()
    private readonly filteredEnv: Record<string, string>

    constructor(options: TerminalManagerOptions) {
        this.sessionId = options.sessionId
        this.getSessionPath = options.getSessionPath
        this.onReady = options.onReady
        this.onOutput = options.onOutput
        this.onExit = options.onExit
        this.onError = options.onError
        this.idleTimeoutMs = options.idleTimeoutMs ?? resolveEnvNumber('ZS_TERMINAL_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS)
        this.maxTerminals = options.maxTerminals ?? resolveEnvNumber('ZS_TERMINAL_MAX_TERMINALS', DEFAULT_MAX_TERMINALS)
        this.filteredEnv = buildFilteredEnv()
    }

    private logTerminal(details: TerminalLogDetails): void {
        const { stage, outcome, terminalId, ...rest } = details
        logger.debug(`[TERMINAL][session=${this.sessionId}] stage=${stage} outcome=${outcome} terminalId=${terminalId}`, rest)
    }

    create(terminalId: string, cols: number, rows: number): void {
        const existing = this.terminals.get(terminalId)
        if (existing) {
            this.logTerminal({
                stage: 'terminal.create',
                outcome: 'duplicate',
                terminalId,
                cols,
                rows,
                cause: 'terminal_id_reused'
            })
            existing.cols = cols
            existing.rows = rows
            existing.pty.resize(cols, rows)
            this.markActivity(existing)
            this.onReady({ sessionId: this.sessionId, terminalId })
            return
        }

        if (this.terminals.size >= this.maxTerminals) {
            this.logTerminal({
                stage: 'terminal.create',
                outcome: 'error',
                terminalId,
                cause: 'terminal_limit_exceeded',
                maxTerminals: this.maxTerminals,
                openTerminalCount: this.terminals.size
            })
            this.emitError(terminalId, `Too many terminals open (max ${this.maxTerminals}).`)
            return
        }

        const sessionPath = this.getSessionPath() ?? process.cwd()
        const normalizedCwd = path.resolve(sessionPath)
        const shell = resolveShell()
        const terminalSupportIssue = getTerminalSupportIssue()

        this.logTerminal({
            stage: 'terminal.create',
            outcome: 'start',
            terminalId,
            cols,
            rows,
            shell,
            cwd: normalizedCwd,
            platform: process.platform,
            terminalSupportIssue
        })

        if (terminalSupportIssue) {
            logger.warn('[TERMINAL] Terminal unavailable on current platform', {
                shell,
                cwd: normalizedCwd,
                platform: process.platform,
                terminalSupportIssue
            })
            this.emitError(terminalId, terminalSupportIssue)
            return
        }

        if (!bunPtySpawn) {
            this.logTerminal({
                stage: 'terminal.create',
                outcome: 'error',
                terminalId,
                cause: 'bun_pty_unavailable',
                platform: process.platform
            })
            this.emitError(terminalId, 'Terminal is unavailable in this runtime.')
            return
        }

        try {
            const pty = bunPtySpawn(shell, [], {
                name: 'xterm-256color',
                cols,
                rows,
                cwd: normalizedCwd,
                env: this.filteredEnv
            })

            const dataDisposable = pty.onData((data: string) => {
                this.onOutput({
                    sessionId: this.sessionId,
                    terminalId,
                    data
                })
                const active = this.terminals.get(terminalId)
                if (active) {
                    this.markActivity(active)
                }
            })

            const exitDisposable = pty.onExit(({ exitCode, signal }: { exitCode: number; signal?: string | number | null }) => {
                const normalizedSignal = typeof signal === 'string' ? signal : null
                this.logTerminal({
                    stage: 'terminal.process.exit',
                    outcome: 'success',
                    terminalId,
                    cause: 'terminal_process_exit',
                    code: exitCode ?? null,
                    signal: normalizedSignal,
                    rawSignal: signal ?? null
                })
                this.onExit({
                    sessionId: this.sessionId,
                    terminalId,
                    code: exitCode ?? null,
                    signal: normalizedSignal
                })
                this.cleanup(terminalId)
            })

            const runtime: TerminalRuntime = {
                terminalId,
                cols,
                rows,
                pty,
                dataDisposable,
                exitDisposable,
                idleTimer: null
            }

            this.terminals.set(terminalId, runtime)
            this.markActivity(runtime)

            this.logTerminal({
                stage: 'terminal.create',
                outcome: 'success',
                terminalId,
                pid: pty.pid,
                shell,
                cwd: normalizedCwd,
                platform: process.platform
            })

            this.onReady({ sessionId: this.sessionId, terminalId })
        } catch (error: unknown) {
            const errorCode = extractErrorCode(error)
            if (errorCode === 'EPERM' || errorCode === 'EACCES') {
                const suggestion = process.platform === 'win32'
                    ? 'Try running with administrator privileges or check antivirus settings'
                    : 'Check file permissions or try running with sudo'

                logger.warn('[TERMINAL] Terminal creation failed due to permission issue', {
                    platform: process.platform,
                    shell,
                    cwd: normalizedCwd,
                    errorCode,
                    suggestion
                })
                this.emitError(terminalId, `Permission denied: ${suggestion}`)
            } else {
                logger.warn('[TERMINAL] Terminal creation failed', {
                    platform: process.platform,
                    shell,
                    cwd: normalizedCwd,
                    error: error instanceof Error ? error.message : String(error)
                })
                this.emitError(terminalId, 'Failed to create terminal')
            }

            this.logTerminal({
                stage: 'terminal.create',
                outcome: 'error',
                terminalId,
                cause: 'terminal_spawn_failed',
                error: error instanceof Error ? error.message : String(error)
            })
        }
    }

    write(terminalId: string, data: string): void {
        const runtime = this.terminals.get(terminalId)
        if (!runtime) {
            this.logTerminal({
                stage: 'terminal.write',
                outcome: 'error',
                terminalId,
                cause: 'terminal_not_found'
            })
            this.emitError(terminalId, 'Terminal not found.')
            return
        }

        this.logTerminal({
            stage: 'terminal.write',
            outcome: 'success',
            terminalId,
            dataLength: data.length
        })

        runtime.pty.write(data)
        this.markActivity(runtime)
    }

    resize(terminalId: string, cols: number, rows: number): void {
        const runtime = this.terminals.get(terminalId)
        if (!runtime) {
            this.logTerminal({
                stage: 'terminal.resize',
                outcome: 'error',
                terminalId,
                cause: 'terminal_not_found'
            })
            return
        }

        this.logTerminal({
            stage: 'terminal.resize',
            outcome: 'success',
            terminalId,
            cols,
            rows
        })

        runtime.cols = cols
        runtime.rows = rows
        runtime.pty.resize(cols, rows)
        this.markActivity(runtime)
    }

    close(terminalId: string): void {
        const runtime = this.terminals.get(terminalId)
        if (!runtime) {
            this.logTerminal({
                stage: 'terminal.close',
                outcome: 'error',
                terminalId,
                cause: 'terminal_not_found'
            })
            return
        }

        this.logTerminal({
            stage: 'terminal.close',
            outcome: 'success',
            terminalId
        })

        this.cleanup(terminalId)
    }

    closeAll(): void {
        for (const terminalId of this.terminals.keys()) {
            this.close(terminalId)
        }
    }

    private markActivity(runtime: TerminalRuntime): void {
        this.clearIdleTimer(runtime)
        runtime.idleTimer = setTimeout(() => {
            this.logTerminal({
                stage: 'terminal.idle',
                outcome: 'error',
                terminalId: runtime.terminalId,
                cause: 'terminal_idle_timeout',
                idleTimeoutMs: this.idleTimeoutMs
            })
            this.emitError(runtime.terminalId, 'Terminal closed due to inactivity.')
            this.cleanup(runtime.terminalId)
        }, this.idleTimeoutMs)
    }

    private clearIdleTimer(runtime: TerminalRuntime): void {
        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer)
            runtime.idleTimer = null
        }
    }

    private cleanup(terminalId: string): void {
        const runtime = this.terminals.get(terminalId)
        if (!runtime) {
            return
        }

        this.terminals.delete(terminalId)

        this.clearIdleTimer(runtime)

        try {
            runtime.dataDisposable.dispose()
        } catch (error) {
            logger.debug('[TERMINAL] Failed to dispose data listener', { error })
        }

        try {
            runtime.exitDisposable.dispose()
        } catch (error) {
            logger.debug('[TERMINAL] Failed to dispose exit listener', { error })
        }

        try {
            runtime.pty.kill()
        } catch (error) {
            logger.debug('[TERMINAL] Failed to kill PTY process', { error })
        }
    }

    private emitError(terminalId: string, message: string): void {
        this.onError({ sessionId: this.sessionId, terminalId, message })
    }
}
