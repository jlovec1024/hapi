import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function loadEnvFile(filePath: string) {
    if (!existsSync(filePath)) {
        return
    }

    const contents = readFileSync(filePath, 'utf8')

    for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) {
            continue
        }

        const equalsIndex = line.indexOf('=')
        if (equalsIndex === -1) {
            continue
        }

        const key = line.slice(0, equalsIndex).trim()
        if (!key) {
            continue
        }

        if (key in process.env && process.env[key] !== undefined) {
            continue
        }

        let value = line.slice(equalsIndex + 1).trim()
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1)
        }

        process.env[key] = value
    }
}

function ensureIsolatedZhushenHome() {
    if (process.env.ZS_HOME) {
        return
    }

    process.env.ZS_HOME = join(
        tmpdir(),
        `zs-integration-test-${process.pid}-${process.cwd().replace(/[\\/]/g, '_')}`
    )
}

loadEnvFile(join(process.cwd(), '.env.integration-test'))
ensureIsolatedZhushenHome()
