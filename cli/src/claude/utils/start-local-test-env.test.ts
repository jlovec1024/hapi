import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type StartLocalTestEnvModule = typeof import('./startLocalTestEnv');

const testHomeDir = '/tmp/zs-start-local-test-env-test-home';
const originalHome = process.env.HOME;

let resolveStartupConfig: StartLocalTestEnvModule['resolveStartupConfig'];
let readClaudeSettingsEnv: StartLocalTestEnvModule['readClaudeSettingsEnv'];
let buildDockerComposeArgs: StartLocalTestEnvModule['buildDockerComposeArgs'];

describe('startLocalTestEnv', () => {
    let settingsPath: string;
    let claudeDir: string;

    beforeEach(async () => {
        process.env.HOME = testHomeDir;
        claudeDir = join(testHomeDir, '.claude');
        settingsPath = join(claudeDir, 'settings.json');
        rmSync(testHomeDir, { recursive: true, force: true });
        mkdirSync(claudeDir, { recursive: true });

        ({ resolveStartupConfig, readClaudeSettingsEnv, buildDockerComposeArgs } = await import('./startLocalTestEnv'));
    });

    afterEach(() => {
        if (originalHome === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = originalHome;
        }

        rmSync(testHomeDir, { recursive: true, force: true });
    });

    it('prefers process env over Claude settings values', () => {
        writeFileSync(settingsPath, JSON.stringify({
            env: {
                ANTHROPIC_API_KEY: 'settings-key',
                ANTHROPIC_BASE_URL: 'https://settings.example'
            }
        }));

        const result = resolveStartupConfig({
            ...process.env,
            ANTHROPIC_API_KEY: 'env-key',
            ANTHROPIC_BASE_URL: 'https://env.example'
        }, settingsPath);

        expect(result).toEqual({
            anthropicApiKey: 'env-key',
            anthropicBaseUrl: 'https://env.example'
        });
    });

    it('falls back to Claude settings env when process env is missing', () => {
        writeFileSync(settingsPath, JSON.stringify({
            env: {
                ANTHROPIC_API_KEY: 'settings-key',
                ANTHROPIC_BASE_URL: 'https://settings.example'
            }
        }));

        const result = resolveStartupConfig({}, settingsPath);

        expect(result).toEqual({
            anthropicApiKey: 'settings-key',
            anthropicBaseUrl: 'https://settings.example'
        });
    });

    it('throws a clear aggregated error when required values are missing from both sources', () => {
        expect(() => resolveStartupConfig({}, settingsPath)).toThrow(
            `缺少 Claude 启动配置: ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL。请先设置环境变量，或在 ${settingsPath} 的 .env 中提供对应字段。`
        );
    });

    it('throws a clear error when ANTHROPIC_BASE_URL is missing from both sources', () => {
        writeFileSync(settingsPath, JSON.stringify({
            env: {
                ANTHROPIC_API_KEY: 'settings-key'
            }
        }));

        expect(() => resolveStartupConfig({}, settingsPath)).toThrow(
            `缺少 Claude 启动配置: ANTHROPIC_BASE_URL。请先设置环境变量，或在 ${settingsPath} 的 .env 中提供对应字段。`
        );
    });

    it('returns empty settings env when settings file does not exist', () => {
        expect(readClaudeSettingsEnv(settingsPath)).toEqual({});
    });

    it('throws when Claude settings file contains invalid JSON', () => {
        writeFileSync(settingsPath, '{invalid-json');

        expect(() => readClaudeSettingsEnv(settingsPath)).toThrow(`无法读取 Claude settings.json: ${settingsPath}`);
    });

    it('builds docker compose args with fixed project name and compose file', () => {
        const composeFilePath = '/tmp/project/docker-compose.yml';

        expect(buildDockerComposeArgs(composeFilePath)).toEqual([
            'compose',
            '--project-name',
            'zhushen',
            '-f',
            composeFilePath,
            'up',
            '-d',
            '--build'
        ]);
    });
});
