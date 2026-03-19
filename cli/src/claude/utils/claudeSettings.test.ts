/**
 * Tests for Claude settings reading functionality
 *
 * Tests reading Claude's settings.json file and respecting the includeCoAuthoredBy setting
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const testHomeDir = '/tmp/zs-claude-settings-test-home';
const originalHome = process.env.HOME;

mock.module('@/ui/logger', () => ({
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}));

type ClaudeSettingsModule = typeof import('./claudeSettings');

async function importFreshClaudeSettingsModule(): Promise<ClaudeSettingsModule> {
  return import(`./claudeSettings?test=${Date.now()}-${Math.random()}`);
}

let readClaudeSettings: ClaudeSettingsModule['readClaudeSettings'];
let shouldIncludeCoAuthoredBy: ClaudeSettingsModule['shouldIncludeCoAuthoredBy'];

describe('Claude Settings', () => {
  let testClaudeDir: string;

  beforeEach(async () => {
    process.env.HOME = testHomeDir;
    delete process.env.CLAUDE_CONFIG_DIR;

    ({ readClaudeSettings, shouldIncludeCoAuthoredBy } = await importFreshClaudeSettingsModule());

    testClaudeDir = join(testHomeDir, '.claude');
    mkdirSync(testClaudeDir, { recursive: true });
    rmSync(join(testClaudeDir, 'settings.json'), { force: true });
  });

  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (existsSync(testClaudeDir)) {
      rmSync(testClaudeDir, { recursive: true, force: true });
    }
  });

  describe('readClaudeSettings', () => {
    it('returns null when settings file does not exist', () => {
      const settings = readClaudeSettings();
      expect(settings).toBe(null);
    });

    it('reads settings when file exists', () => {
      const settingsPath = join(testClaudeDir, 'settings.json');
      const testSettings = { includeCoAuthoredBy: false, otherSetting: 'value' };
      writeFileSync(settingsPath, JSON.stringify(testSettings));

      const settings = readClaudeSettings();
      expect(settings).toEqual(testSettings);
    });

    it('returns null when settings file is invalid JSON', () => {
      const settingsPath = join(testClaudeDir, 'settings.json');
      writeFileSync(settingsPath, 'invalid json');

      const settings = readClaudeSettings();
      expect(settings).toBe(null);
    });
  });

  describe('shouldIncludeCoAuthoredBy', () => {
    it('returns true when no settings file exists (default behavior)', () => {
      const result = shouldIncludeCoAuthoredBy();
      expect(result).toBe(true);
    });

    it('returns true when includeCoAuthoredBy is not set (default behavior)', () => {
      const settingsPath = join(testClaudeDir, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({ otherSetting: 'value' }));

      const result = shouldIncludeCoAuthoredBy();
      expect(result).toBe(true);
    });

    it('returns false when includeCoAuthoredBy is explicitly set to false', () => {
      const settingsPath = join(testClaudeDir, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({ includeCoAuthoredBy: false }));

      const result = shouldIncludeCoAuthoredBy();
      expect(result).toBe(false);
    });

    it('returns true when includeCoAuthoredBy is explicitly set to true', () => {
      const settingsPath = join(testClaudeDir, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({ includeCoAuthoredBy: true }));

      const result = shouldIncludeCoAuthoredBy();
      expect(result).toBe(true);
    });
  });
});
