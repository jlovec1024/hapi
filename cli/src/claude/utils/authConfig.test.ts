import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/ui/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

type AuthConfigModule = typeof import('./authConfig');

const testHomeDir = '/tmp/zs-auth-config-test-home';
const originalHome = process.env.HOME;

let checkClaudeAuthConfig: AuthConfigModule['checkClaudeAuthConfig'];
let formatClaudeAuthConfigError: AuthConfigModule['formatClaudeAuthConfigError'];

describe('checkClaudeAuthConfig', () => {
  let testClaudeDir: string;
  let legacyConfigBackupPath: string | null = null;
  let legacyConfigPath: string;

  beforeEach(async () => {
    process.env.HOME = testHomeDir;
    delete process.env.CLAUDE_CONFIG_DIR;
    vi.resetModules();

    ({ checkClaudeAuthConfig, formatClaudeAuthConfigError } = await import('./authConfig'));

    testClaudeDir = join(testHomeDir, '.claude');
    legacyConfigPath = join(testHomeDir, '.claude.json');

    mkdirSync(testClaudeDir, { recursive: true });
    rmSync(join(testClaudeDir, 'settings.json'), { force: true });

    if (existsSync(legacyConfigPath)) {
      legacyConfigBackupPath = `${legacyConfigPath}.bak-${Date.now()}`;
      writeFileSync(legacyConfigBackupPath, readFileSync(legacyConfigPath, 'utf-8'));
      rmSync(legacyConfigPath, { force: true });
    } else {
      legacyConfigBackupPath = null;
    }

    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CONFIG_DIR;

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (existsSync(testClaudeDir)) {
      rmSync(testClaudeDir, { recursive: true, force: true });
    }

    rmSync(legacyConfigPath, { force: true });
    if (legacyConfigBackupPath && existsSync(legacyConfigBackupPath)) {
      writeFileSync(legacyConfigPath, readFileSync(legacyConfigBackupPath, 'utf-8'));
      rmSync(legacyConfigBackupPath, { force: true });
    }
  });

  it('returns env source when CLAUDE_CODE_OAUTH_TOKEN exists', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'token-123';

    const result = checkClaudeAuthConfig();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toEqual({ type: 'env', envKey: 'CLAUDE_CODE_OAUTH_TOKEN' });
    }
  });

  it('returns settings source when settings.json contains auth-like fields', () => {
    const settingsPath = join(testClaudeDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ oauthToken: 'abc' }));

    const result = checkClaudeAuthConfig();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source.type).toBe('settings');
      expect(result.source.path).toBe(settingsPath);
    }
  });

  it('returns legacy config source when ~/.claude.json contains auth-like fields', () => {
    writeFileSync(legacyConfigPath, JSON.stringify({ apiKey: 'legacy-key' }));

    const result = checkClaudeAuthConfig();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source.type).toBe('legacy-config');
      expect(result.source.path).toBe(legacyConfigPath);
    }
  });

  it('returns structured failure when no auth config is available', () => {
    const result = checkClaudeAuthConfig();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CLAUDE_AUTH_CONFIG_MISSING');
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(formatClaudeAuthConfigError(result)).toContain('已检查:');
    }
  });
});
