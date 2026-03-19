/**
 * Cross-platform Zhushen CLI spawning utility
 *
 * ## Background
 *
 * Zhushen CLI runs in two modes:
 * 1. **Compiled binary**: A single executable built with `bun build --compile`
 * 2. **Development mode**: Running TypeScript directly via `bun`
 *
 * ## Execution Modes
 *
 * **Compiled Binary (Production):**
 * - The executable is self-contained and runs directly
 * - `process.execPath` points to the compiled binary itself
 * - No additional entrypoint needed - just pass args to `process.execPath`
 *
 * **Development Mode:**
 * - Running via `bun src/index.ts`
 * - Spawn child processes using the same runtime with `src/index.ts` entrypoint
 *
 * ## Cross-Platform Support
 *
 * This utility handles spawning Zhushen CLI subprocesses (for runner processes)
 * in a cross-platform way, detecting the current runtime mode and using
 * the appropriate command and arguments.
 */

import { spawn, SpawnOptions, type ChildProcess } from 'child_process';
import { join } from 'node:path';
import { isBunCompiled, projectPath } from '@/projectPath';
import { logger } from '@/ui/logger';
import { existsSync } from 'node:fs';
import spawnCross from 'cross-spawn';

const SESSION_CWD_ENV_KEY = 'ZS_CLI_WORKING_DIRECTORY';

/**
 * Resolve the TypeScript entrypoint for development mode.
 */
function resolveEntrypoint(projectRoot: string): string {
  const srcEntrypoint = join(projectRoot, 'src', 'index.ts');
  if (existsSync(srcEntrypoint)) {
    return srcEntrypoint;
  }

  const bunMain = globalThis.Bun?.main;
  if (bunMain && existsSync(bunMain)) {
    return bunMain;
  }

  throw new Error('No CLI entrypoint found (expected src/index.ts)');
}

function resolveBunExecutable(): string {
  if (typeof (process.versions as Record<string, string | undefined>).bun === 'string') {
    return process.execPath;
  }

  const bunFromEnv = process.env.BUN_BIN;
  if (bunFromEnv && existsSync(bunFromEnv)) {
    return bunFromEnv;
  }

  const bunFromPath = spawnCross.sync('bun', ['--version'], { stdio: 'ignore' });
  if (!bunFromPath.error && bunFromPath.status === 0) {
    return 'bun';
  }

  throw new Error('Bun runtime is required to spawn the TypeScript CLI entrypoint');
}

export interface ZhushenCliCommand {
  command: string;
  args: string[];
}

export function getZhushenCliCommand(args: string[]): ZhushenCliCommand {
  // Compiled binary mode: just use the executable directly
  if (isBunCompiled()) {
    return {
      command: process.execPath,
      args
    };
  }

  // Development mode: spawn with TypeScript entrypoint via Bun.
  const projectRoot = projectPath();
  const entrypoint = resolveEntrypoint(projectRoot);
  const bunExecutable = resolveBunExecutable();

  return {
    command: bunExecutable,
    args: [entrypoint, ...args]
  };
}

export function getSpawnedCliWorkingDirectory(): string {
  return process.env[SESSION_CWD_ENV_KEY] || process.cwd();
}

export function spawnZhushenCLI(args: string[], options: SpawnOptions = {}): ChildProcess {
  const requestedCwd = typeof options.cwd === 'string' ? options.cwd : undefined;
  const projectRoot = projectPath();
  const executionCwd = isBunCompiled() ? requestedCwd ?? process.cwd() : projectRoot;

  // Note: We're executing the current runtime with the calculated entrypoint path below,
  // bypassing the 'zs' wrapper that would normally be found in the shell's PATH.
  // However, we log it as 'zs' here because other engineers are typically looking
  // for when "zs" was started and don't care about the underlying node process
  // details and flags we use to achieve the same result.
  const fullCommand = `zs ${args.join(' ')}`;
  logger.debug(`[SPAWN ZS CLI] Spawning: ${fullCommand} in ${requestedCwd ?? process.cwd()}`);

  const { command: spawnCommand, args: spawnArgs } = getZhushenCliCommand(args);

  // On Windows, detached processes allocate a new console window by default.
  // windowsHide: true suppresses this to prevent cmd windows from accumulating.
  const finalOptions: SpawnOptions = {
    ...options,
    cwd: executionCwd,
    env: {
      ...process.env,
      ...options.env,
      ...(requestedCwd ? { [SESSION_CWD_ENV_KEY]: requestedCwd } : {})
    }
  };
  if (process.platform === 'win32' && options.detached) {
    finalOptions.windowsHide = true;
  }
  return spawn(spawnCommand, spawnArgs, finalOptions);
}

