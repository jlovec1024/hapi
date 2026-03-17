import { describe, expect, it } from 'vitest'
import { reduceChatBlocks } from '@/chat/reducer'
import type { ChatBlock, NormalizedMessage } from '@/chat/types'

function assertNever(x: never): never {
    throw new Error(`Unexpected block kind: ${String(x)}`)
}

function simplifyBlock(block: ChatBlock): unknown {
    if (block.kind === 'user-text') {
        return { kind: block.kind, id: block.id, text: block.text }
    }

    if (block.kind === 'agent-text') {
        return { kind: block.kind, id: block.id, text: block.text }
    }

    if (block.kind === 'agent-event') {
        return { kind: block.kind, id: block.id, event: block.event }
    }

    if (block.kind === 'tool-call') {
        return {
            kind: block.kind,
            id: block.id,
            tool: {
                id: block.tool.id,
                name: block.tool.name,
                state: block.tool.state,
                input: block.tool.input,
                result: block.tool.result,
                followupText: block.tool.followupText
            },
            children: block.children.map(simplifyBlock)
        }
    }

    if (block.kind === 'cli-output') {
        return { kind: block.kind, id: block.id, source: block.source, text: block.text }
    }

    if (block.kind === 'agent-reasoning') {
        return { kind: block.kind, id: block.id, text: block.text }
    }

    return assertNever(block)
}

function fixtureMessages(): NormalizedMessage[] {
    return [
        {
            id: 'm-user',
            localId: null,
            createdAt: 1000,
            isSidechain: false,
            role: 'user',
            content: { type: 'text', text: 'hello world' }
        },
        {
            id: 'm-agent-task',
            localId: null,
            createdAt: 1010,
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
            createdAt: 1011,
            isSidechain: true,
            role: 'agent',
            content: [{ type: 'sidechain', uuid: 'u-sidechain-root', prompt: 'subtask prompt' }]
        },
        {
            id: 'm-sidechain-agent',
            localId: null,
            createdAt: 1012,
            isSidechain: true,
            role: 'agent',
            content: [{ type: 'text', text: 'sidechain assistant text', uuid: 'u-sidechain-child', parentUUID: 'u-sidechain-root' }]
        },
        {
            id: 'm-agent-task-result',
            localId: null,
            createdAt: 1013,
            isSidechain: false,
            role: 'agent',
            content: [{ type: 'tool-result', tool_use_id: 'tool-task-1', content: { ok: true }, is_error: false, uuid: 'u-task-result', parentUUID: 'u-task-call' }]
        },
        {
            id: 'm-summary',
            localId: null,
            createdAt: 1020,
            isSidechain: false,
            role: 'agent',
            content: [{ type: 'summary', summary: 'summary as event' }]
        },
        {
            id: 'm-turn',
            localId: null,
            createdAt: 1030,
            isSidechain: false,
            role: 'event',
            content: { type: 'turn-duration', durationMs: 321 }
        },
        {
            id: 'm-limit',
            localId: null,
            createdAt: 1040,
            isSidechain: false,
            role: 'agent',
            content: [{ type: 'text', text: 'Claude AI usage limit reached|1700000000000', uuid: 'u-limit', parentUUID: null }]
        }
    ]
}

describe('chat block equivalence baseline', () => {
    it('keeps key reducer semantics stable', () => {
        const { blocks } = reduceChatBlocks(fixtureMessages(), null)
        const current = blocks.map(simplifyBlock)

        expect(current).toEqual([
            { kind: 'user-text', id: 'm-user', text: 'hello world' },
            {
                kind: 'tool-call',
                id: 'tool-task-1',
                tool: {
                    id: 'tool-task-1',
                    name: 'Task',
                    state: 'completed',
                    input: { prompt: 'subtask prompt' },
                    result: { ok: true },
                    followupText: undefined
                },
                children: [
                    { kind: 'user-text', id: 'm-sidechain-root:0', text: 'subtask prompt' },
                    { kind: 'agent-text', id: 'm-sidechain-agent:0', text: 'sidechain assistant text' }
                ]
            },
            { kind: 'agent-event', id: 'm-summary:0', event: { type: 'message', message: 'summary as event' } },
            { kind: 'agent-event', id: 'm-turn', event: { type: 'turn-duration', durationMs: 321 } },
            { kind: 'agent-event', id: 'm-limit', event: { type: 'limit-reached', endsAt: 1700000000000 } }
        ])
    })

    it('merges skill launch instructions into the tool card instead of emitting a text block', () => {
        const messages: NormalizedMessage[] = [
            {
                id: 'm-skill-call',
                localId: null,
                createdAt: 2000,
                isSidechain: false,
                role: 'agent',
                content: [
                    {
                        type: 'tool-call',
                        id: 'tool-skill-1',
                        name: 'Skill',
                        input: { skill: 'trellis:before-backend-dev' },
                        description: null,
                        uuid: 'u-skill-call',
                        parentUUID: null
                    }
                ]
            },
            {
                id: 'm-skill-result',
                localId: null,
                createdAt: 2001,
                isSidechain: false,
                role: 'agent',
                content: [
                    {
                        type: 'tool-result',
                        tool_use_id: 'tool-skill-1',
                        content: 'Launching skill: trellis:before-backend-dev',
                        is_error: false,
                        uuid: 'u-skill-result',
                        parentUUID: 'u-skill-call'
                    },
                    {
                        type: 'text',
                        text: 'Read the backend development guidelines before starting your development task.\n\n1. Read the index.',
                        uuid: 'u-skill-text',
                        parentUUID: 'u-skill-result'
                    }
                ]
            }
        ]

        const { blocks } = reduceChatBlocks(messages, null)
        expect(blocks).toHaveLength(1)
        expect(blocks[0]?.kind).toBe('tool-call')

        if (blocks[0]?.kind !== 'tool-call') {
            throw new Error('Expected tool-call block')
        }

        expect(blocks[0].tool.result).toBe('Launching skill: trellis:before-backend-dev')
        expect(blocks[0].tool.followupText).toBe(
            'Read the backend development guidelines before starting your development task.\n\n1. Read the index.'
        )
    })
})
