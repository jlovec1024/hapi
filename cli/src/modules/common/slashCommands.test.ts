import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

type SlashCommandsModule = typeof import('./slashCommands')

async function importFreshSlashCommandsModule(): Promise<SlashCommandsModule> {
    return import(`./slashCommands?test=${Date.now()}-${Math.random()}`)
}

const originalHome = process.env.HOME

let listSlashCommands: SlashCommandsModule['listSlashCommands']

describe('listSlashCommands', () => {
    let sandboxDir: string
    let homeClaudeDir: string
    let projectDir: string

    beforeEach(async () => {
        sandboxDir = await mkdtemp(join(tmpdir(), 'zs-slash-commands-'))
        process.env.HOME = join(sandboxDir, 'home')
        delete process.env.CLAUDE_CONFIG_DIR


        ;({ listSlashCommands } = await importFreshSlashCommandsModule())

        homeClaudeDir = join(process.env.HOME, '.claude')
        projectDir = join(sandboxDir, 'project')

        await mkdir(join(homeClaudeDir, 'commands'), { recursive: true })
        await mkdir(join(projectDir, '.claude', 'commands'), { recursive: true })
    })

    afterEach(async () => {
        delete process.env.CLAUDE_CONFIG_DIR
        if (originalHome === undefined) {
            delete process.env.HOME
        } else {
            process.env.HOME = originalHome
        }
        await rm(sandboxDir, { recursive: true, force: true })
    })

    it('keeps backward-compatible behavior when projectDir is not provided', async () => {
        await mkdir(homeClaudeDir, { recursive: true })
        await writeFile(
            join(homeClaudeDir, 'commands', 'global-only.md'),
            ['---', 'description: Global only', '---', '', 'Global command body'].join('\n')
        )

        ;({ listSlashCommands } = await importFreshSlashCommandsModule())
        const commands = await listSlashCommands('claude')
        const command = commands.find(cmd => cmd.name === 'global-only')

        expect(command).toBeDefined()
        expect(command?.source).toBe('user')
        expect(command?.description).toBe('Global only')
    })

    it('loads project-level commands when projectDir is provided', async () => {
        await writeFile(
            join(projectDir, '.claude', 'commands', 'project-only.md'),
            ['---', 'description: Project only', '---', '', 'Project command body'].join('\n')
        )

        const commands = await listSlashCommands('claude', projectDir)
        const command = commands.find(cmd => cmd.name === 'project-only')

        expect(command).toBeDefined()
        expect(command?.source).toBe('project')
        expect(command?.description).toBe('Project only')
    })

    it('prefers project command when project and global have same name', async () => {
        await writeFile(
            join(homeClaudeDir, 'commands', 'shared.md'),
            ['---', 'description: Global shared', '---', '', 'Global body'].join('\n')
        )
        await writeFile(
            join(projectDir, '.claude', 'commands', 'shared.md'),
            ['---', 'description: Project shared', '---', '', 'Project body'].join('\n')
        )

        const commands = await listSlashCommands('claude', projectDir)
        const sharedCommands = commands.filter(cmd => cmd.name === 'shared')

        expect(sharedCommands).toHaveLength(1)
        expect(sharedCommands[0]?.source).toBe('project')
        expect(sharedCommands[0]?.description).toBe('Project shared')
        expect(sharedCommands[0]?.content).toBe('Project body')
    })

    it('loads nested project commands using colon-separated names', async () => {
        await mkdir(join(projectDir, '.claude', 'commands', 'trellis'), { recursive: true })
        await writeFile(
            join(projectDir, '.claude', 'commands', 'trellis', 'start.md'),
            ['---', 'description: Trellis start', '---', '', 'Start flow'].join('\n')
        )

        const commands = await listSlashCommands('claude', projectDir)
        const command = commands.find(cmd => cmd.name === 'trellis:start')

        expect(command).toBeDefined()
        expect(command?.source).toBe('project')
        expect(command?.description).toBe('Trellis start')
    })

    it('returns empty project commands when project directory does not exist', async () => {
        const nonExistentProjectDir = join(sandboxDir, 'not-exists')

        await expect(listSlashCommands('claude', nonExistentProjectDir)).resolves.toBeDefined()
    })
})
