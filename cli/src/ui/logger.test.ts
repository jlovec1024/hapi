import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync, utimesSync } from 'fs'
import { readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const loggerModulePath = new URL('./logger.ts', import.meta.url).pathname
const aliasConfigurationPath = '@/configuration'
const aliasPersistencePath = '@/persistence'

type LoggerProbeResult = {
  writeRunnerLogsToStdio: boolean
  logPath?: string
  runnerLogs: Array<{ file: string; path: string; modified: string }>
  latestRunnerLog: { file: string; path: string; modified: string } | null
}

type MockConfiguration = {
  isRunnerProcess: boolean
  runnerLogDestination: 'file' | 'stdio'
  logsDir: string
  runnerStateFile: string
}

function createTempHome(): string {
  const home = join(tmpdir(), `zs-logger-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(home, { recursive: true })
  return home
}

function serializeLogInfo(log: { file: string; path: string; modified: Date }) {
  return {
    file: log.file,
    path: log.path,
    modified: log.modified.toISOString(),
  }
}

async function loadLoggerModule(configuration: MockConfiguration) {
  const token = `${Date.now()}-${Math.random()}`

  mock.module(aliasConfigurationPath, () => ({
    configuration,
  }))

  mock.module(aliasPersistencePath, () => ({
    readRunnerState: async () => {
      try {
        const content = await readFile(configuration.runnerStateFile, 'utf8')
        return JSON.parse(content)
      } catch {
        return null
      }
    },
  }))

  return await import(`${loggerModulePath}?t=${token}`)
}

async function runLoggerProbe(tempHome: string, runnerLogDestination: 'file' | 'stdio' = 'file'): Promise<LoggerProbeResult> {
  const logsDir = join(tempHome, 'logs')
  const runnerStateFile = join(tempHome, 'runner.state.json')
  const configuration: MockConfiguration = {
    isRunnerProcess: true,
    runnerLogDestination,
    logsDir,
    runnerStateFile,
  }

  try {
    const { logger, listRunnerLogFiles, getLatestRunnerLog } = await loadLoggerModule(configuration)
    logger.debug('[RUNNER RUN] probe')
    const runnerLogs = await listRunnerLogFiles()
    const latestRunnerLog = await getLatestRunnerLog()

    return {
      writeRunnerLogsToStdio: logger.isWritingRunnerLogsToStdio(),
      logPath: logger.getLogPath(),
      runnerLogs: runnerLogs.map(serializeLogInfo),
      latestRunnerLog: latestRunnerLog ? serializeLogInfo(latestRunnerLog) : null,
    }
  } finally {
    mock.restore()
  }
}

describe('runner logger destination', () => {
  let tempHome: string

  beforeEach(() => {
    tempHome = createTempHome()
  })

  afterEach(() => {
    mock.restore()
    rmSync(tempHome, { recursive: true, force: true })
  })

  it('defaults to file logging for runner processes', async () => {
    const result = await runLoggerProbe(tempHome)

    expect(result.writeRunnerLogsToStdio).toBe(false)
    expect(result.logPath).toBeDefined()
    expect(result.logPath?.endsWith('-runner.log')).toBe(true)
    expect(result.logPath?.startsWith(join(tempHome, 'logs'))).toBe(true)
  })

  it('reads stdio logging from env override', async () => {
    const result = await runLoggerProbe(tempHome, 'stdio')

    expect(result.writeRunnerLogsToStdio).toBe(true)
    expect(result.logPath).toBeUndefined()
  })

  it('reads file logging from settings when env is absent', async () => {
    const result = await runLoggerProbe(tempHome, 'file')

    expect(result.writeRunnerLogsToStdio).toBe(false)
    expect(result.logPath).toBeDefined()
  })

  it('prefers env override over settings file', async () => {
    const result = await runLoggerProbe(tempHome, 'stdio')

    expect(result.writeRunnerLogsToStdio).toBe(true)
    expect(result.logPath).toBeUndefined()
  })

  it('ignores invalid env values and falls back to settings/default', async () => {
    const result = await runLoggerProbe(tempHome, 'file')

    expect(result.writeRunnerLogsToStdio).toBe(false)
    expect(result.logPath).toBeDefined()
  })

  it('prefers persisted runnerLogPath over newer files in directory listing', async () => {
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

    const result = await runLoggerProbe(tempHome)

    expect(result.runnerLogs[0]?.path).toBe(olderLogPath)
    expect(result.latestRunnerLog?.path).toBe(olderLogPath)
  })

  it('deduplicates persisted runnerLogPath already present in logs directory', async () => {
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

    const result = await runLoggerProbe(tempHome)

    expect(result.runnerLogs.filter(log => log.path === logPath)).toHaveLength(1)
    expect(result.latestRunnerLog?.path).toBe(logPath)
  })

  it('returns empty results when logs directory is missing', async () => {
    const result = await runLoggerProbe(tempHome, 'stdio')

    expect(result.runnerLogs).toEqual([])
    expect(result.latestRunnerLog).toBeNull()
  })
})
