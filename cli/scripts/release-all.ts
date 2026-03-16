#!/usr/bin/env bun
/**
 * Unified release script that handles the complete release flow:
 * 1. Bump version
 * 2. Build binaries (with embedded web assets)
 * 3. Publish platform packages first (so lockfile can resolve them)
 * 4. Publish main package
 * 5. bun install (to get complete lockfile with published packages)
 * 6. Git commit + tag + push
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const scriptDir = import.meta.dir;
const projectRoot = join(scriptDir, '..');
const repoRoot = join(projectRoot, '..');

// 解析参数
const args = process.argv.slice(2);
const version = args.find(arg => !arg.startsWith('--'));
const dryRun = args.includes('--dry-run');
const publishNpm = args.includes('--publish-npm');  // 只发布 npm，跳过 git 操作
const skipBuild = args.includes('--skip-build');    // 跳过构建（二进制已存在）

if (!version) {
    console.error('Usage: bun run scripts/release-all.ts <version> [options]');
    console.error('Options:');
    console.error('  --dry-run      Preview the release process');
    console.error('  --publish-npm  Only publish to npm, skip git operations');
    console.error('  --skip-build   Skip building binaries (use existing)');
    console.error('Example: bun run scripts/release-all.ts 0.2.0');
    process.exit(1);
}

function run(cmd: string, cwd = projectRoot): void {
    console.log(`\n$ ${cmd}`);
    if (!dryRun) {
        execSync(cmd, { cwd, stdio: 'inherit' });
    }
}

async function runWithTimeoutRetry(cmd: string, cwd = projectRoot): Promise<void> {
    const timeoutCmd = `timeout 60s ${cmd}`;
    while (true) {
        console.log(`\n$ ${timeoutCmd}`);
        if (dryRun) {
            return;
        }
        try {
            execSync(timeoutCmd, { cwd, stdio: 'inherit' });
            return;
        } catch {
            console.warn(`⚠️ ${cmd} failed or timed out. Retrying in 60s...`);
            await new Promise(resolve => setTimeout(resolve, 60_000));
        }
    }
}

async function main(): Promise<void> {
    const flags = [dryRun && 'dry-run', publishNpm && 'publish-npm', skipBuild && 'skip-build'].filter(Boolean);
    console.log(`\n🚀 Starting release v${version}${flags.length ? ` (${flags.join(', ')})` : ''}\n`);

    // Pre-checks
    console.log('🔍 Pre-checks...');
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf-8', cwd: repoRoot }).trim();
    const isGithubTagRelease = process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF_TYPE === 'tag';

    if (!isGithubTagRelease && currentBranch !== 'main') {
        console.error(`❌ Release must be run from main branch (current: ${currentBranch})`);
        process.exit(1);
    }

    if (isGithubTagRelease) {
        console.log(`   ✓ Running in GitHub tag release context: ${process.env.GITHUB_REF_NAME ?? 'unknown tag'}`);
    } else {
        console.log('   ✓ On main branch');
    }

    // Pre-check: Ensure npm is logged in (skip in CI trusted publishing or dry-run mode)
    if (!dryRun && !isGithubTagRelease) {
        try {
            const npmUser = execSync('npm whoami', { encoding: 'utf-8' }).trim();
            console.log(`   ✓ Logged in to npm as: ${npmUser}`);
        } catch {
            console.error('❌ Not logged in to npm. Run `npm login` first.');
            process.exit(1);
        }
    } else if (dryRun) {
        console.log('   ✓ Skipping npm login check (dry-run)');
    } else {
        console.log('   ✓ Skipping npm login check (GitHub tag trusted publishing)');
    }

    // Step 1: Update package.json version
    console.log('📦 Step 1: Updating package.json version...');
    const pkgPath = join(projectRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const oldVersion = pkg.version;
    pkg.version = version;
    if (!dryRun) {
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    }
    console.log(`   ${oldVersion} → ${version}`);

    // Step 2: Build all platform binaries (with embedded web assets)
    if (!skipBuild) {
        console.log('\n🔨 Step 2: Building all platform binaries with web assets...');
        run('bun run build:single-exe:all', repoRoot);
    } else {
        console.log('\n🔨 Step 2: Skipping build (--skip-build)');
    }

    // Step 3: Prepare and publish platform packages
    console.log('\n📤 Step 3: Publishing platform packages...');
    run('bun run prepare-npm-packages');
    const platforms = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64'];
    for (const platform of platforms) {
        const npmDir = join(projectRoot, 'npm', platform);
        run(`npm publish --access public${dryRun ? ' --dry-run' : ''}`, npmDir);
    }

    // Step 4: Publish main package
    console.log('\n📤 Step 4: Publishing main package...');
    const mainNpmDir = join(projectRoot, 'npm', 'main');
    run(`npm publish --access public${dryRun ? ' --dry-run' : ''}`, mainNpmDir);

    // --publish-npm 模式到此结束
    if (publishNpm) {
        console.log(`\n✅ Published v${version} to npm!`);
        return;
    }

    // Step 5: bun install to get complete lockfile
    console.log('\n📥 Step 5: Updating lockfile...');
    console.log('⏳ Waiting for npm registry to sync (60s)...');
    await new Promise(resolve => setTimeout(resolve, 60_000));  // 等待 60 秒

    // 重试机制：验证 lockfile 完整性
    let retries = 0;
    const maxRetries = 5;
    while (retries < maxRetries) {
        await runWithTimeoutRetry('bun install', repoRoot);

        // 验证 lockfile 完整性
        const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const lockfile = readFileSync(join(repoRoot, 'bun.lock'), 'utf-8');
        const optionalDeps = pkgJson.optionalDependencies || {};
        const missing: string[] = [];

        for (const [name, ver] of Object.entries(optionalDeps)) {
            const expectedPattern = `"${name}@${ver}"`;
            if (!lockfile.includes(expectedPattern)) {
                missing.push(`${name}@${ver}`);
            }
        }

        if (missing.length === 0) {
            console.log('✅ Lockfile 完整性验证通过');
            break;
        }

        retries++;
        if (retries < maxRetries) {
            console.warn(`⚠️ Lockfile 缺少包定义: ${missing.join(', ')}`);
            console.warn(`⏳ 等待 npm registry 同步... (${retries}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 60_000));
        } else {
            console.error('❌ Lockfile 验证失败，缺少以下包定义：');
            missing.forEach(pkg => console.error(`  - ${pkg}`));
            console.error('\n可能原因：npm registry 同步延迟过长');
            console.error('建议：稍后手动运行 bun install 并提交 lockfile');
            process.exit(1);
        }
    }
    // Step 6: Git commit + tag + push
    console.log('\n📝 Step 6: Creating git commit and tag...');
    run(`git add .`, repoRoot);
    run(`git commit -m "Release version ${version}"`, repoRoot);
    run(`git tag v${version}`, repoRoot);
    run(`git push && git push --tags`, repoRoot);

    console.log(`\n✅ Release v${version} completed!`);
}

main().catch(err => {
    console.error('Release failed:', err);
    process.exit(1);
});
