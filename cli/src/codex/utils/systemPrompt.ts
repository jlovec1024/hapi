/**
 * Codex-specific system prompt for local mode.
 *
 * This prompt instructs Codex to call the zs__change_title function
 * to set appropriate chat session titles.
 */

import { trimIdent } from '@/utils/trimIdent';

/**
 * Title instruction for Codex to call the zs MCP tool.
 * Note: Codex exposes MCP tools under the `functions.` namespace,
 * so the tool is called as `functions.zs__change_title`.
 */
export const TITLE_INSTRUCTION = trimIdent(`
    ALWAYS when you start a new chat, call the title tool to set a concise task title.
    Prefer calling functions.zs__change_title.
    If that exact tool name is unavailable, call an equivalent alias such as zs__change_title, mcp__zs__change_title, or zs_change_title.
    If the task focus changes significantly later, call the title tool again with a better title.
`);

/**
 * The system prompt to inject via developer_instructions in local mode.
 */
export const codexSystemPrompt = TITLE_INSTRUCTION;
