import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';

type PathModule = typeof import('./path');

const testHomeDir = '/tmp/zs-path-test-home';
const originalHome = process.env.HOME;

let getProjectPath: PathModule['getProjectPath'];

describe('getProjectPath', () => {
    beforeEach(async () => {
        process.env.HOME = testHomeDir;
        delete process.env.CLAUDE_CONFIG_DIR;
        vi.resetModules();

        ({ getProjectPath } = await import('./path'));
    });

    afterEach(() => {
        delete process.env.CLAUDE_CONFIG_DIR;
        if (originalHome === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = originalHome;
        }
    });

    it('should replace slashes with hyphens in the project path', () => {
        const workingDir = '/Users/steve/projects/my-app';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join(testHomeDir, '.claude', 'projects', '-Users-steve-projects-my-app'));
    });

    it('should replace dots with hyphens in the project path', () => {
        const workingDir = '/Users/steve/projects/app.test.js';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join(testHomeDir, '.claude', 'projects', '-Users-steve-projects-app-test-js'));
    });

    it('should handle paths with both slashes and dots', () => {
        const workingDir = '/var/www/my.site.com/public';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join(testHomeDir, '.claude', 'projects', '-var-www-my-site-com-public'));
    });

    it('should replace underscores with hyphens in the project path', () => {
        const workingDir = '/data/github/zhushen__worktrees/ime';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join(testHomeDir, '.claude', 'projects', '-data-github-zhushen--worktrees-ime'));
    });

    it('should handle relative paths by resolving them first', () => {
        const workingDir = './my-project';
        const result = getProjectPath(workingDir);
        expect(result).toContain(join(testHomeDir, '.claude', 'projects'));
        expect(result).toContain('my-project');
    });

    it('should handle empty directory path', () => {
        const workingDir = '';
        const result = getProjectPath(workingDir);
        expect(result).toContain(join(testHomeDir, '.claude', 'projects'));
    });

    it('should always use the standard Claude home directory', () => {
        const workingDir = '/Users/steve/projects/my-app';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join(testHomeDir, '.claude', 'projects', '-Users-steve-projects-my-app'));
    });
});
