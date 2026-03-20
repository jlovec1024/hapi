import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { SpawnOptions } from 'child_process'

const spawnMock = mock((..._args: any[]) => ({ pid: 12345 } as any))

mock.module('child_process', () => ({
  spawn: spawnMock
}))

mock.module('@/projectPath', () => ({
  projectPath: mock(() => '/mock/project'),
  isBunCompiled: mock(() => false)
}))

mock.module('@/ui/logger', () => ({
  logger: {
    debug: mock()
  }
}))

mock.module('node:fs', () => ({
  existsSync: mock((path: string) => path === '/mock/project/src/index.ts')
}))

mock.module('cross-spawn', () => ({
  default: {
    sync: mock(() => ({ status: 0 }))
  }
}))

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
const originalVersionsDescriptor = Object.getOwnPropertyDescriptor(process, 'versions')

function setPlatform(value: string) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true
  })
}

function setVersions(value: Record<string, string | undefined>) {
  Object.defineProperty(process, 'versions', {
    value,
    configurable: true
  })
}

function getSpawnCommandArgsOrThrow(): { command: string; args: string[]; options: SpawnOptions } {
  expect(spawnMock).toHaveBeenCalledTimes(1)
  const firstCall = spawnMock.mock.calls[0] as unknown[] | undefined
  const command = firstCall?.[0] as string | undefined
  const args = firstCall?.[1] as string[] | undefined
  const options = firstCall?.[2] as SpawnOptions | undefined
  if (!command || !args || !options) {
    throw new Error('Expected spawn(command, args, options) to be passed')
  }
  return { command, args, options }
}

describe('spawnZhushenCLI windowsHide behavior', () => {
  beforeAll(() => {
    if (!originalPlatformDescriptor?.configurable) {
      throw new Error('process.platform is not configurable in this runtime')
    }
    if (!originalVersionsDescriptor?.configurable) {
      throw new Error('process.versions is not configurable in this runtime')
    }
  })

  beforeEach(() => {
    spawnMock.mockClear()
    setVersions({ ...process.versions, bun: '1.3.5' })
  })

  afterAll(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor)
    }
    if (originalVersionsDescriptor) {
      Object.defineProperty(process, 'versions', originalVersionsDescriptor)
    }
  })

  it('sets windowsHide=true when platform is win32 and detached=true', async () => {
    setPlatform('win32')
    const { spawnZhushenCLI } = await import('./spawnZhushenCLI')

    spawnZhushenCLI(['runner', 'start-sync'], {
      detached: true,
      stdio: 'ignore'
    })

    const { options } = getSpawnCommandArgsOrThrow()
    expect(options.detached).toBe(true)
    expect(options.windowsHide).toBe(true)
  })

  it('does not set windowsHide when platform is win32 but detached is false', async () => {
    setPlatform('win32')
    const { spawnZhushenCLI } = await import('./spawnZhushenCLI')

    spawnZhushenCLI(['runner', 'start-sync'], {
      detached: false,
      stdio: 'ignore'
    })

    const { options } = getSpawnCommandArgsOrThrow()
    expect(options.detached).toBe(false)
    expect('windowsHide' in options).toBe(false)
  })

  it('does not set windowsHide on non-win32 even when detached=true', async () => {
    setPlatform('linux')
    const { spawnZhushenCLI } = await import('./spawnZhushenCLI')

    spawnZhushenCLI(['runner', 'start-sync'], {
      detached: true,
      stdio: 'ignore'
    })

    const { options } = getSpawnCommandArgsOrThrow()
    expect(options.detached).toBe(true)
    expect('windowsHide' in options).toBe(false)
  })
})

describe('spawnZhushenCLI cwd propagation for bun runtime', () => {
  beforeAll(() => {
    if (!originalVersionsDescriptor?.configurable) {
      throw new Error('process.versions is not configurable in this runtime')
    }
  })

  beforeEach(() => {
    spawnMock.mockClear()
  })

  afterAll(() => {
    if (originalVersionsDescriptor) {
      Object.defineProperty(process, 'versions', originalVersionsDescriptor)
    }
  })

  it('keeps bun execution rooted at the project while forwarding requested cwd via env', async () => {
    setVersions({ ...process.versions, bun: '1.3.5' })
    const { spawnZhushenCLI } = await import('./spawnZhushenCLI')

    spawnZhushenCLI(['runner', 'start-sync'], {
      cwd: '/tmp/session-dir',
      stdio: 'ignore'
    })

    const { args, options } = getSpawnCommandArgsOrThrow()
    expect(args.includes('--cwd')).toBe(false)
    expect(options.cwd).toBeDefined()
    expect(options.cwd).not.toBe('/tmp/session-dir')
    expect(options.env?.ZS_CLI_WORKING_DIRECTORY).toBe('/tmp/session-dir')
  })
})
