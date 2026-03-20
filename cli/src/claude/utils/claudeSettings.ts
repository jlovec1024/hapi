/**
 * Utilities for reading Claude's settings.json configuration
 * 
 * Handles reading Claude's settings.json file to respect user preferences
 * like includeCoAuthoredBy setting for commit message generation.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '@/ui/logger';

function resolveHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME ?? homedir();
}

export interface ClaudeSettings {
  includeCoAuthoredBy?: boolean;
  [key: string]: unknown;
}

export function getClaudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveHomeDir(env), '.claude');
}

/**
 * Get the path to Claude's settings.json file
 */
export function getClaudeSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(getClaudeConfigDir(env), 'settings.json');
}

export function getClaudeLegacyConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveHomeDir(env), '.claude.json');
}

/**
 * Read Claude's settings.json file from the default location
 *
 * @returns Claude settings object or null if file doesn't exist or can't be read
 */
export function readClaudeSettings(env: NodeJS.ProcessEnv = process.env): ClaudeSettings | null {
  try {
    const settingsPath = getClaudeSettingsPath(env);

    if (!existsSync(settingsPath)) {
      logger.debug(`[ClaudeSettings] No Claude settings file found at ${settingsPath}`);
      return null;
    }

    const settingsContent = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent) as ClaudeSettings;

    logger.debug(`[ClaudeSettings] Successfully read Claude settings from ${settingsPath}`);
    logger.debug(`[ClaudeSettings] includeCoAuthoredBy: ${settings.includeCoAuthoredBy}`);

    return settings;
  } catch (error) {
    logger.debug(`[ClaudeSettings] Error reading Claude settings: ${error}`);
    return null;
  }
}

/**
 * Check if Co-Authored-By lines should be included in commit messages
 * based on Claude's settings
 *
 * @returns true if Co-Authored-By should be included, false otherwise
 */
export function shouldIncludeCoAuthoredBy(): boolean {
  const settings = readClaudeSettings();

  // If no settings file or includeCoAuthoredBy is not explicitly set,
  // default to true to maintain backward compatibility
  if (!settings || settings.includeCoAuthoredBy === undefined) {
    return true;
  }

  return settings.includeCoAuthoredBy;
}
