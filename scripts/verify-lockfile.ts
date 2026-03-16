#!/usr/bin/env bun
/**
 * 验证 lockfile 中所有 optionalDependencies 都有对应的包定义
 * 用于检测 npm registry 延迟导致的 lockfile 不完整问题
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const scriptDir = import.meta.dir;
const repoRoot = join(scriptDir, '..');
const cliPackageJsonPath = join(repoRoot, 'cli', 'package.json');
const lockfilePath = join(repoRoot, 'bun.lock');

try {
  const packageJson = JSON.parse(readFileSync(cliPackageJsonPath, 'utf-8'));
  const lockfile = readFileSync(lockfilePath, 'utf-8');

  const optionalDeps = packageJson.optionalDependencies || {};
  const missing: string[] = [];

  for (const [name, version] of Object.entries(optionalDeps)) {
    const expectedPattern = `"${name}@${version}"`;
    if (!lockfile.includes(expectedPattern)) {
      missing.push(`${name}@${version}`);
    }
  }

  if (missing.length > 0) {
    console.error('❌ Lockfile 缺少以下包定义：');
    missing.forEach(pkg => console.error(`  - ${pkg}`));
    console.error('\n修复方法：');
    console.error('  1. 等待 npm registry 同步（如果刚发布）');
    console.error('  2. 运行: bun install');
    console.error('  3. 提交: git add bun.lock');
    process.exit(1);
  }

  console.log('✅ Lockfile 完整性验证通过');
  console.log(`   检查了 ${Object.keys(optionalDeps).length} 个 optionalDependencies`);
} catch (error) {
  console.error('❌ 验证失败:', error);
  process.exit(1);
}
