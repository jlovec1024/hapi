import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.vitest.ts'],
        alias: {
            'bun-pty': resolve('./src/__mocks__/bun-pty.ts'),
        }
    },
    resolve: {
        alias: {
            '@': resolve('./src'),
        },
    },
})
