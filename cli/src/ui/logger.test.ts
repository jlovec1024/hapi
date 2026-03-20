import { execFileSync } from 'child_process'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const cliDir = dirname(fileURLToPath(new URL('../../package.json', import.meta.url)))
const bunBinary = process.env.BUN_BINARY ?? '/usr/local/bin/bun'

type LoggerProbeResult = {
  writeRunnerLogsToStdio: boolean
  logPath?: string
  runnerLogs: Array<{ file: string; path: string; modified: string }>
  latestRunnerLog: { file: string; path: string; modified: string } | null
}

function createTempHome(): string {
  const home = join(tmpdir(), `zs-logger-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(home, { recursive: true })
  return home
}

function runLoggerProbe(tempHome: string, extraEnv: NodeJS.ProcessEnv = {}): LoggerProbeResult {
  const output = execFileSync(bunBinary, ['--eval', `
    process.argv = ['bun', 'src/index.ts', 'runner', 'start-sync']
    import('./src/ui/logger.ts').then(async ({ logger, listRunnerLogFiles, getLatestRunnerLog }) => {
      logger.debug('[RUNNER RUN] probe')
      const runnerLogs = await listRunnerLogFiles()
      const latestRunnerLog = await getLatestRunnerLog()
      console.log(JSON.stringify({
        writeRunnerLogsToStdio: logger.isWritingRunnerLogsToStdio(),
        logPath: logger.getLogPath(),
        runnerLogs: runnerLogs.map(log => ({
          file: log.file,
          path: log.path,
          modified: log.modified.toISOString(),
        })),
        latestRunnerLog: latestRunnerLog ? {
          file: latestRunnerLog.file,
          path: latestRunnerLog.path,
          modified: latestRunnerLog.modified.toISOString(),
        } : null,
      }))
    })
  `], {
    cwd: cliDir,
    env: {
      ...process.env,
      ...extraEnv,
      ZS_HOME: tempHome,
      ZS_RUNNER_LOG_DESTINATION: extraEnv.ZS_RUNNER_LOG_DESTINATION,
    },
    encoding: 'utf8'
  }).trim()

  const lines = output.split('\n')
  const jsonLine = lines.at(-1)
  if (!jsonLine) {
    throw new Error('Logger probe produced no JSON output')
  }

  return JSON.parse(jsonLine) as LoggerProbeResult
}

describe('runner logger destination', () => {
  let tempHome: string

  beforeEach(() => {
    tempHome = createTempHome()
  })

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true })
  })

  it('defaults to file logging for runner processes', () => {
    const result = runLoggerProbe(tempHome)

    expect(result.writeRunnerLogsToStdio).toBe(false)
    expect(result.logPath).toBeDefined()
    expect(result.logPath?.endsWith('-runner.log')).toBe(true)
    expect(result.logPath?.startsWith(join(tempHome, 'logs'))).toBe(true)
  })

  it('reads stdio logging from env override', () => {
    const result = runLoggerProbe(tempHome, { ZS_RUNNER_LOG_DESTINATION: 'stdio' })

    expect(result.writeRunnerLogsToStdio).toBe(true)
    expect(result.logPath).toBeUndefined()
  })

  it('reads file logging from settings when env is absent', () => {
    writeFileSync(join(tempHome, 'settings.json'), JSON.stringify({ runnerLogDestination: 'file' }, null, 2))

    const result = runLoggerProbe(tempHome)

    expect(result.writeRunnerLogsToStdio).toBe(false)
    expect(result.logPath).toBeDefined()
  })

  it('prefers env override over settings file', () => {
    writeFileSync(join(tempHome, 'settings.json'), JSON.stringify({ runnerLogDestination: 'file' }, null, 2))

    const result = runLoggerProbe(tempHome, { ZS_RUNNER_LOG_DESTINATION: 'stdio' })

    expect(result.writeRunnerLogsToStdio).toBe(true)
    expect(result.logPath).toBeUndefined()
  })

  it('ignores invalid env values and falls back to settings/default', () => {
    writeFileSync(join(tempHome, 'settings.json'), JSON.stringify({ runnerLogDestination: 'file' }, null, 2))

    const result = runLoggerProbe(tempHome, { ZS_RUNNER_LOG_DESTINATION: 'invalid-value' })

    expect(result.writeRunnerLogsToStdio).toBe(false)
    expect(result.logPath).toBeDefined()
  })

  it('prefers persisted runnerLogPath over newer files in directory listing', () => {
    const logsDir = join(tempHome, 'logs')
    mkdirSync(logsDir, { recursive: true })

    const olderLogPath = join(logsDir, '2026-03-19-00-00-00-pid-1-runner.log')
    const newerLogPath = join(logsDir, '2026-03-19-00-00-01-pid-2-runner.log')
    writeFileSync(olderLogPath, 'older')
    writeFileSync(newerLogPath, 'newer')

    const olderDate = new Date('2026-03-19T00:00:00.000Z')
    const newerDate = new Date('2026-03-19T00:00:01.000Z')
    utimesSync(olderLogPath, olderDate, olderDate)
    utimesSync(newerLogPath, newerDate, newerDate)

    writeFileSync(join(tempHome, 'runner.state.json'), JSON.stringify({
      pid: 1,
      httpPort: 3000,
      startTime: 'now',
      startedWithCliVersion: 'test',
      runnerLogPath: olderLogPath,
    }, null, 2))

    const result = runLoggerProbe(tempHome)

    expect(result.runnerLogs[0]?.path).toBe(olderLogPath)
    expect(result.latestRunnerLog?.path).toBe(olderLogPath)
  })

  it('deduplicates persisted runnerLogPath already present in logs directory', () => {
    const logsDir = join(tempHome, 'logs')
    mkdirSync(logsDir, { recursive: true })

    const logPath = join(logsDir, '2026-03-19-00-00-00-pid-1-runner.log')
    writeFileSync(logPath, 'log')
    writeFileSync(join(tempHome, 'runner.state.json'), JSON.stringify({
      pid: 1,
      httpPort: 3000,
      startTime: 'now',
      startedWithCliVersion: 'test',
      runnerLogPath: logPath,
    }, null, 2))

    const result = runLoggerProbe(tempHome)

    expect(result.runnerLogs.filter(log => log.path === logPath)).toHaveLength(1)
    expect(result.latestRunnerLog?.path).toBe(logPath)
  })

  it('returns empty results when logs directory is missing', () => {
    const result = runLoggerProbe(tempHome, { ZS_RUNNER_LOG_DESTINATION: 'stdio' })

    expect(result.runnerLogs).toEqual([])
    expect(result.latestRunnerLog).toBeNull()
  })
})
