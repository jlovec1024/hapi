import { existsSync, readFileSync } from 'node:fs';
import { logger } from '@/ui/logger';
import { getClaudeLegacyConfigPath, getClaudeSettingsPath } from './claudeSettings';

const OFFICIAL_CLAUDE_ENV_KEYS = [
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_API_KEY'
] as const;

export type ClaudeAuthConfigSourceType = 'env' | 'settings' | 'legacy-config';

export interface ClaudeAuthConfigSource {
  type: ClaudeAuthConfigSourceType;
  path?: string;
  envKey?: string;
  details?: string[];
}

export interface ClaudeAuthConfigCheckSuccess {
  ok: true;
  source: ClaudeAuthConfigSource;
  checkedPaths: string[];
}

export interface ClaudeAuthConfigCheckFailure {
  ok: false;
  code: 'CLAUDE_AUTH_CONFIG_MISSING';
  message: string;
  hint: string;
  checkedPaths: string[];
  suggestions: string[];
}

export type ClaudeAuthConfigCheckResult =
  | ClaudeAuthConfigCheckSuccess
  | ClaudeAuthConfigCheckFailure;

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readJsonFile(filePath: string): unknown | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as unknown;
  } catch (error) {
    logger.debug(`[ClaudeAuthConfig] Failed to read JSON from ${filePath}: ${error}`);
    return null;
  }
}

function objectHasAuthLikeValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;

  for (const [key, entry] of Object.entries(record)) {
    if (hasNonEmptyString(entry) && /(token|api[_-]?key|oauth)/i.test(key)) {
      return true;
    }

    if (entry && typeof entry === 'object' && objectHasAuthLikeValue(entry)) {
      return true;
    }
  }

  return false;
}

function detectEnvSource(env: NodeJS.ProcessEnv): ClaudeAuthConfigSource | null {
  for (const key of OFFICIAL_CLAUDE_ENV_KEYS) {
    if (hasNonEmptyString(env[key])) {
      return {
        type: 'env',
        envKey: key
      };
    }
  }

  return null;
}

function detectSettingsSource(settingsPath: string): ClaudeAuthConfigSource | null {
  const parsed = readJsonFile(settingsPath);
  if (!parsed || !objectHasAuthLikeValue(parsed)) {
    return null;
  }

  return {
    type: 'settings',
    path: settingsPath
  };
}

function detectLegacyConfigSource(legacyPath: string): ClaudeAuthConfigSource | null {
  const parsed = readJsonFile(legacyPath);
  if (!parsed || !objectHasAuthLikeValue(parsed)) {
    return null;
  }

  return {
    type: 'legacy-config',
    path: legacyPath
  };
}

export function checkClaudeAuthConfig(env: NodeJS.ProcessEnv = process.env): ClaudeAuthConfigCheckResult {
  const settingsPath = getClaudeSettingsPath(env);
  const legacyConfigPath = getClaudeLegacyConfigPath();
  const checkedPaths = [settingsPath, legacyConfigPath];

  const envSource = detectEnvSource(env);
  if (envSource) {
    return {
      ok: true,
      source: envSource,
      checkedPaths
    };
  }

  const settingsSource = detectSettingsSource(settingsPath);
  if (settingsSource) {
    return {
      ok: true,
      source: settingsSource,
      checkedPaths
    };
  }

  const legacySource = detectLegacyConfigSource(legacyConfigPath);
  if (legacySource) {
    return {
      ok: true,
      source: legacySource,
      checkedPaths
    };
  }

  return {
    ok: false,
    code: 'CLAUDE_AUTH_CONFIG_MISSING',
    message: '未检测到可用的 Claude 认证配置，已阻止启动 Claude 会话。',
    hint: '请先配置 Claude token，再重新启动会话。',
    checkedPaths,
    suggestions: [
      `设置运行环境变量之一：${OFFICIAL_CLAUDE_ENV_KEYS.join(' / ')}`,
      `或在 ${settingsPath} 中写入可用的 Claude 认证配置`,
      `或确认 ${legacyConfigPath} 已存在且包含可用 token`
    ]
  };
}

export function formatClaudeAuthConfigError(result: ClaudeAuthConfigCheckFailure): string {
  const lines = [
    result.message,
    result.hint,
    ...result.suggestions.map((suggestion) => `- ${suggestion}`),
    `已检查: ${result.checkedPaths.join(', ')}`
  ];

  return lines.join('\n');
}
