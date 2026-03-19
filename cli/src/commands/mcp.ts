import { runZhushenMcpStdioBridge } from '@/codex/zhushenMcpStdioBridge'
import type { CommandDefinition } from './types'

export const mcpCommand: CommandDefinition = {
    name: 'mcp',
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        await runZhushenMcpStdioBridge(commandArgs)
    }
}
