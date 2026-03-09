import chalk from 'chalk'
import type { CommandDefinition } from './types'

export const notifyCommand: CommandDefinition = {
    name: 'notify',
    requiresRuntimeAssets: true,
    run: async () => {
        console.error(chalk.red('The `zs notify` command is not available in direct-connect mode.'))
        console.error(chalk.gray('Use push notifications from zhushen-hub instead.'))
        process.exit(1)
    }
}
