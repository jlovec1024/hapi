/**
 * Global configuration for Zhushen CLI
 *
 * Centralizes all configuration including environment variables and paths
 * Environment files should be loaded using Node's --env-file flag
 */

import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import packageJson from '../package.json'
import { getCliArgs } from '@/utils/cliArgs'
import { readFileSync } from 'node:fs'
import type { RunnerLogDestination } from '@/persistence'

function isRunnerLogDestination(value: string | undefined): value is RunnerLogDestination {
    return value === 'file' || value === 'stdio'
}

function readRunnerLogDestinationFromSettings(settingsFile: string): RunnerLogDestination | undefined {
    if (!existsSync(settingsFile)) {
        return undefined
    }

    try {
        const content = readFileSync(settingsFile, 'utf8')
        const parsed = JSON.parse(content) as { runnerLogDestination?: unknown }
        return typeof parsed.runnerLogDestination === 'string' && isRunnerLogDestination(parsed.runnerLogDestination)
            ? parsed.runnerLogDestination
            : undefined
    } catch {
        return undefined
    }
}

class Configuration {
    private _apiUrl: string
    private _cliApiToken: string
    public readonly isRunnerProcess: boolean
    public readonly runnerLogDestination: RunnerLogDestination

    // Directories and paths (from persistence)
    public readonly zhushenHomeDir: string
    public readonly logsDir: string
    public readonly settingsFile: string
    public readonly privateKeyFile: string
    public readonly runnerStateFile: string
    public readonly runnerLockFile: string
    public readonly currentCliVersion: string

    public readonly isExperimentalEnabled: boolean

    constructor() {
        // Server configuration
        this._apiUrl = process.env.ZS_API_URL || 'http://localhost:3006'
        this._cliApiToken = process.env.CLI_API_TOKEN || ''

        // Check if we're running as runner based on process args
        const args = getCliArgs()
        this.isRunnerProcess = args.length >= 2 && args[0] === 'runner' && (args[1] === 'start-sync')

        // Directory configuration - Priority: ZS_HOME env > default home dir
        if (process.env.ZS_HOME) {
            // Expand ~ to home directory if present
            const expandedPath = process.env.ZS_HOME.replace(/^~/, homedir())
            this.zhushenHomeDir = expandedPath
        } else {
            this.zhushenHomeDir = join(homedir(), '.zhushen')
        }

        this.logsDir = join(this.zhushenHomeDir, 'logs')
        this.settingsFile = join(this.zhushenHomeDir, 'settings.json')
        this.privateKeyFile = join(this.zhushenHomeDir, 'access.key')
        this.runnerStateFile = join(this.zhushenHomeDir, 'runner.state.json')
        this.runnerLockFile = join(this.zhushenHomeDir, 'runner.state.json.lock')

        const envRunnerLogDestination = process.env.ZS_RUNNER_LOG_DESTINATION?.toLowerCase()
        const settingsRunnerLogDestination = readRunnerLogDestinationFromSettings(this.settingsFile)
        this.runnerLogDestination = isRunnerLogDestination(envRunnerLogDestination)
            ? envRunnerLogDestination
            : settingsRunnerLogDestination ?? 'file'

        this.isExperimentalEnabled = ['true', '1', 'yes'].includes(process.env.ZS_EXPERIMENTAL?.toLowerCase() || '')

        this.currentCliVersion = packageJson.version

        if (!existsSync(this.zhushenHomeDir)) {
            mkdirSync(this.zhushenHomeDir, { recursive: true })
        }
        // Ensure directories exist
        if (!existsSync(this.logsDir)) {
            mkdirSync(this.logsDir, { recursive: true })
        }
    }

    get apiUrl(): string {
        return this._apiUrl
    }

    _setApiUrl(url: string): void {
        this._apiUrl = url
    }

    get cliApiToken(): string {
        return this._cliApiToken
    }

    _setCliApiToken(token: string): void {
        this._cliApiToken = token
    }
}

export const configuration: Configuration = new Configuration()
