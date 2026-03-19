import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const configurationModulePath = new URL('./configuration.ts', import.meta.url).pathname

function createTempHome(): string {
  const home = join(tmpdir(), `zs-config-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(home, { recursive: true })
  return home
}

async function readRunnerLogDestination(tempHome: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<string> {
  process.env.ZS_HOME = tempHome
  if (extraEnv.ZS_RUNNER_LOG_DESTINATION === undefined) {
    delete process.env.ZS_RUNNER_LOG_DESTINATION
  } else {
    process.env.ZS_RUNNER_LOG_DESTINATION = extraEnv.ZS_RUNNER_LOG_DESTINATION
  }

  const { configuration } = await import(`${configurationModulePath}?t=${Date.now()}-${Math.random()}`)
  return configuration.runnerLogDestination
}

async function expectRunnerLogDestination(tempHome: string, expected: string, extraEnv: NodeJS.ProcessEnv = {}) {
  await expect(readRunnerLogDestination(tempHome, extraEnv)).resolves.toBe(expected)
}

async function withRunnerConfigEnv(tempHome: string, run: () => Promise<void>, extraEnv: NodeJS.ProcessEnv = {}) {
  const previousZsHome = process.env.ZS_HOME
  const previousRunnerLogDestination = process.env.ZS_RUNNER_LOG_DESTINATION

  process.env.ZS_HOME = tempHome
  if (extraEnv.ZS_RUNNER_LOG_DESTINATION === undefined) {
    delete process.env.ZS_RUNNER_LOG_DESTINATION
  } else {
    process.env.ZS_RUNNER_LOG_DESTINATION = extraEnv.ZS_RUNNER_LOG_DESTINATION
  }

  try {
    await run()
  } finally {
    if (previousZsHome === undefined) {
      delete process.env.ZS_HOME
    } else {
      process.env.ZS_HOME = previousZsHome
    }

    if (previousRunnerLogDestination === undefined) {
      delete process.env.ZS_RUNNER_LOG_DESTINATION
    } else {
      process.env.ZS_RUNNER_LOG_DESTINATION = previousRunnerLogDestination
    }
  }
}

describe('runner logging configuration', () => {
  let tempHome: string
  const originalZsHome = process.env.ZS_HOME
  const originalRunnerLogDestination = process.env.ZS_RUNNER_LOG_DESTINATION

  beforeEach(() => {
    tempHome = createTempHome()
    delete process.env.ZS_RUNNER_LOG_DESTINATION
  })

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true })
    if (originalZsHome === undefined) {
      delete process.env.ZS_HOME
    } else {
      process.env.ZS_HOME = originalZsHome
    }
    if (originalRunnerLogDestination === undefined) {
      delete process.env.ZS_RUNNER_LOG_DESTINATION
    } else {
      process.env.ZS_RUNNER_LOG_DESTINATION = originalRunnerLogDestination
    }
  })

  it('reads runnerLogDestination from settings.json', async () => {
    writeFileSync(join(tempHome, 'settings.json'), JSON.stringify({ runnerLogDestination: 'stdio' }, null, 2))
    await expectRunnerLogDestination(tempHome, 'stdio')
  })

  it('prefers ZS_RUNNER_LOG_DESTINATION env var over settings.json', async () => {
    writeFileSync(join(tempHome, 'settings.json'), JSON.stringify({ runnerLogDestination: 'file' }, null, 2))
    await expectRunnerLogDestination(tempHome, 'stdio', { ZS_RUNNER_LOG_DESTINATION: 'stdio' })
  })

  it('falls back to settings/default when env var is invalid', async () => {
    writeFileSync(join(tempHome, 'settings.json'), JSON.stringify({ runnerLogDestination: 'file' }, null, 2))
    await expectRunnerLogDestination(tempHome, 'file', { ZS_RUNNER_LOG_DESTINATION: 'invalid-value' })
  })

  it('defaults to file when neither env nor settings specify it', async () => {
    await expectRunnerLogDestination(tempHome, 'file')
  })
})
