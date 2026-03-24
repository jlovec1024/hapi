#!/usr/bin/env bun

import { startLocalTestEnv } from '../cli/src/claude/utils/startLocalTestEnv';

async function main(): Promise<void> {
    await startLocalTestEnv(process.env);
}

if (import.meta.main) {
    main().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
    });
}
