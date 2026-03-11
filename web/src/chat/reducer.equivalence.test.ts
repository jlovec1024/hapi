import { describe, expect, it } from 'vitest'
import { reduceChatBlocks } from '@/chat/reducer'
import type { ChatBlock, NormalizedMessage } from '@/chat/types'

function simplifyBlock(block: ChatBlock): unknown {
    if (block.kind === 'user-text') {
        return {
            kind: block.kind,
            id: block.id,
            text: block.text
        }
    }

    if (block.kind === 'agent-text') {
        return {
            kind: block.kind,
            id: block.id,
            text: block.text
        }
    }

    if (block.kind === 'agent-reasoning') {
        return {
            kind: block.kind,
            id: block.id,
            text: block.text
        }
    }

    if (block.kind === 'cli-output') {
        return {
            kind: block.kind,
            id: block.id,
            source: block.source,
            text: block.text
        }
    }

    if (block.kind === 'agent-event') {
        return {
            kind: block.kind,
            id: block.id,
            event: block.event
        }
    }

    return {
        kind: block.kind,
        id: block.id,
        tool: {
            id: block.tool.id,
            name: block.tool.name,
            state: block.tool.state,
            input: block.tool.input,
            result: block.tool.result
        },
        children: block.children.map(simplifyBlock)
    }
}

function simplifyBlocks(blocks: ChatBlock[]): unknown[] {
    return blocks.map(simplifyBlock)
}

function fixtureMessages(): NormalizedMessage[] {
    return [
        {
            id: 'm-user-plain',
            localId: null,
            createdAt: 1000,
            isSidechain: false,
            role: 'user',
            content: { type: 'text', text: 'hello world' }
        },
        {
            id: 'm-user-cli',
            localId: null,
            createdAt: 1010,
            isSidechain: false,
            role: 'user',
            meta: { sentFrom: 'cli' },
            content: {
                type: 'text',
                text: '<command-name>ls</command-name>\n<command-message>running</command-message>'
            }
        },
        {
            id: 'm-agent-cli',
            localId: null,
            createdAt: 1020,
            isSidechain: false,
            role: 'agent',
            meta: { sentFrom: 'cli' },
            content: [
                {
                    type: 'text',
                    text: '<local-command-stdout>file-a\\nfile-b</local-command-stdout>',
                    uuid: 'u-agent-cli',
                    parentUUID: null
                }
            ]
        },
        {
            id: 'm-agent-text',
            localId: null,
            createdAt: 1030,
            isSidechain: false,
            role: 'agent',
            content: [
                {
                    type: 'text',
                    text: 'assistant reply',
                    uuid: 'u-agent-text',
                    parentUUID: null
                }
            ]
        },
        {
            id: 'm-agent-reasoning',
            localId: null,
            createdAt: 1040,
            isSidechain: false,
            role: 'agent',
            content: [
                {
                    type: 'reasoning',
                    text: 'thinking...',
                    uuid: 'u-agent-reasoning',
                    parentUUID: null
                }
            ]
        },
        {
            id: 'm-agent-task',
            localId: null,
            createdAt: 1050,
            isSidechain: false,
            role: 'agent',
            content: [
                {
                    type: 'tool-call',
                    id: 'tool-task-1',
                    name: 'Task',
                    input: { prompt: 'subtask prompt' },
                    description: 'run subtask',
                    uuid: 'u-task-call',
                    parentUUID: null
                }
            ]
        },
        {
            id: 'm-sidechain-root',
            localId: null,
            createdAt: 1055,
            isSidechain: true,
            role: 'agent',
            content: [
                {
                    type: 'sidechain',
                    uuid: 'u-sidechain-root',
                    prompt: 'subtask prompt'
                }
            ]
        },
        {
            id: 'm-sidechain-agent',
            localId: null,
            createdAt: 1056,
            isSidechain: true,
            role: 'agent',
            content: [
                {
                    type: 'text',
                    text: 'sidechain assistant text',
                    uuid: 'u-sidechain-child',
                    parentUUID: 'u-sidechain-root'
                }
            ]
        },
        {
            id: 'm-agent-task-result',
            localId: null,
            createdAt: 1060,
            isSidechain: false,
            role: 'agent',
            content: [
                {
                    type: 'tool-result',
                    tool_use_id: 'tool-task-1',
                    content: { ok: true },
                    is_error: false,
                    uuid: 'u-task-result',
                    parentUUID: 'u-task-call'
                }
            ]
        },
        {
            id: 'm-agent-summary',
            localId: null,
            createdAt: 1070,
            isSidechain: false,
            role: 'agent',
            content: [
                {
                    type: 'summary',
                    summary: 'summary as event'
                }
            ]
        },
        {
            id: 'm-event',
            localId: null,
            createdAt: 1080,
            isSidechain: false,
            role: 'event',
            content: {
                type: 'turn-duration',
                durationMs: 321
            }
        },
        {
            id: 'm-limit-event',
            localId: null,
            createdAt: 1090,
            isSidechain: false,
            role: 'agent',
            content: [
                {
                    type: 'text',
                    text: 'Claude AI usage limit reached|1700000000000',
                    uuid: 'u-limit',
                    parentUUID: null
                }
            ]
        }
    ]
}

describe('chat block equivalence baseline', () => {
    it('keeps ChatBlock semantic/order stable on fixture sample', () => {
        const { blocks } = reduceChatBlocks(fixtureMessages(), null)
        const current = simplifyBlocks(blocks)

        const baseline = [
            { kind: 'user-text', id: 'm-user-plain', text: 'hello world' },
            {
                kind: 'cli-output',
                id: 'm-user-cli',
                source: 'user',
                text: '<command-name>ls</command-name>\n<command-message>running</command-message>'
            },
            {
                kind: 'cli-output',
                id: 'm-agent-cli:0',
                source: 'assistant',
                text: '<local-command-stdout>file-a\\nfile-b</local-command-stdout>'
            },
            { kind: 'agent-text', id: 'm-agent-text:0', text: 'assistant reply' },
            { kind: 'agent-reasoning', id: 'm-agent-reasoning:0', text: 'thinking...' },
            {
                kind: 'tool-call',
                id: 'tool-task-1',
                tool: {
                    id: 'tool-task-1',
                    name: 'Task',
                    state: 'completed',
                    input: { prompt: 'subtask prompt' },
                    result: { ok: true }
                },
                children: [
                    { kind: 'user-text', id: 'm-sidechain-root:0', text: 'subtask prompt' },
                    { kind: 'agent-text', id: 'm-sidechain-agent:0', text: 'sidechain assistant text' }
                ]
            },
            {
                kind: 'agent-event',
                id: 'm-agent-summary:0',
                event: { type: 'message', message: 'summary as event' }
            },
            {
                kind: 'agent-event',
                id: 'm-event',
                event: { type: 'turn-duration', durationMs: 321 }
            },
            {
                kind: 'agent-event',
                id: 'm-limit-event',
                event: { type: 'limit-reached', endsAt: 1700000000000 }
            }
        ]

        expect(current).toEqual(baseline)
    })
})
