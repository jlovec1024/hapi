/**
 * Unified MCP bridge setup for Codex local and remote modes.
 *
 * This module provides a single source of truth for starting the zs MCP
 * bridge server and generating the MCP server configuration that Codex needs.
 */

import { startZhushenServer } from '@/claude/utils/startZhushenServer';
import { getZhushenCliCommand } from '@/utils/spawnZhushenCLI';
import type { ApiSessionClient } from '@/api/apiSession';

/**
 * MCP server entry configuration.
 */
export interface McpServerEntry {
    command: string;
    args: string[];
}

/**
 * Map of MCP server names to their configurations.
 */
export type McpServersConfig = Record<string, McpServerEntry>;

/**
 * Result of starting the zs MCP bridge.
 */
export interface ZhushenMcpBridge {
    /** The running server instance */
    server: {
        url: string;
        stop: () => void;
    };
    /** MCP server config to pass to Codex (works for both CLI and SDK) */
    mcpServers: McpServersConfig;
}

/**
 * Start the zs MCP bridge server and return the configuration
 * needed to connect Codex to it.
 *
 * This is the single source of truth for MCP bridge setup,
 * used by both local and remote launchers.
 */
export async function buildZhushenMcpBridge(client: ApiSessionClient): Promise<ZhushenMcpBridge> {
    const zhushenServer = await startZhushenServer(client);
    const bridgeCommand = getZhushenCliCommand(['mcp', '--url', zhushenServer.url]);

    return {
        server: {
            url: zhushenServer.url,
            stop: zhushenServer.stop
        },
        mcpServers: {
            zs: {
                command: bridgeCommand.command,
                args: bridgeCommand.args
            }
        }
    };
}
