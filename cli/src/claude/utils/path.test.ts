import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';

const harness = vi.hoisted(() => ({
    homeDir: '/tmp/zs-path-test-home'
}));

vi.mock('node:os', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:os')>();
    return {
        ...actual,
        homedir: vi.fn(() => harness.homeDir)
    };
});

const { getProjectPath } = await import('./path');

describe('getProjectPath', () => {
    it('should replace slashes with hyphens in the project path', () => {
        const workingDir = '/Users/steve/projects/my-app';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join(harness.homeDir, '.claude', 'projects', '-Users-steve-projects-my-app'));
    });

    it('should replace dots with hyphens in the project path', () => {
        const workingDir = '/Users/steve/projects/app.test.js';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join(harness.homeDir, '.claude', 'projects', '-Users-steve-projects-app-test-js'));
    });

    it('should handle paths with both slashes and dots', () => {
        const workingDir = '/var/www/my.site.com/public';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join(harness.homeDir, '.claude', 'projects', '-var-www-my-site-com-public'));
    });

    it('should replace underscores with hyphens in the project path', () => {
        const workingDir = '/data/github/hapi__worktrees/ime';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join(harness.homeDir, '.claude', 'projects', '-data-github-hapi--worktrees-ime'));
    });

    it('should handle relative paths by resolving them first', () => {
        const workingDir = './my-project';
        const result = getProjectPath(workingDir);
        expect(result).toContain(join(harness.homeDir, '.claude', 'projects'));
        expect(result).toContain('my-project');
    });

    it('should handle empty directory path', () => {
        const workingDir = '';
        const result = getProjectPath(workingDir);
        expect(result).toContain(join(harness.homeDir, '.claude', 'projects'));
    });

    it('should always use the standard Claude home directory', () => {
        const workingDir = '/Users/steve/projects/my-app';
        const result = getProjectPath(workingDir);
        expect(result).toBe(join(harness.homeDir, '.claude', 'projects', '-Users-steve-projects-my-app'));
    });
});
