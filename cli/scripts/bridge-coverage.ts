#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const cliRoot = resolve(import.meta.dir, '..');
const sourceDir = join(cliRoot, 'coverage');
const targetDir = join(cliRoot, '..', 'coverage', 'cli');

if (!existsSync(sourceDir)) {
    console.warn('[bridge-coverage] CLI coverage directory not found, skipping bridge.');
    process.exit(0);
}

mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true, force: true });

console.log(`[bridge-coverage] Copied coverage from ${sourceDir} to ${targetDir}`);
