import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionChat } from './SessionChat'

vi.mock('@/components/TeamPanel', () => ({
    TeamPanel: () => null,
}))

vi.mock('@/components/AssistantChat/ZhushenComposer', () => ({
    ZhushenComposer: () => <div data-testid="zhushen-composer" />,
}))

vi.mock('@/components/AssistantChat/ZhushenThread', () => ({
    ZhushenThread: () => <div data-testid="zhushen-thread" />,
}))

vi.mock('@/lib/assistant-runtime', () => ({
    useZhushenRuntime: () => ({}),
}))

vi.mock('@/lib/attachmentAdapter', () => ({
    createAttachmentAdapter: () => null,
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            notification: vi.fn(),
        }
    })
}))

vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        abortSession: vi.fn(),
        switchSession: vi.fn(),
        setPermissionMode: vi.fn(),
        setModelMode: vi.fn(),
    })
}))

vi.mock('@/chat/normalize', () => ({
    normalizeDecryptedMessage: vi.fn(() => null),
}))

vi.mock('@/chat/reducer', () => ({
    reduceChatBlocks: () => ({ blocks: [], latestUsage: null }),
}))

vi.mock('@/chat/reconcile', () => ({
    reconcileChatBlocks: () => ({ blocks: [], byId: new Map() }),
}))

vi.mock('@assistant-ui/react', async () => {
    const ReactModule = await import('react')
    return {
        AssistantRuntimeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
    }
})

const baseProps = {
    api: {} as never,
    messages: [],
    messagesWarning: null,
    hasMoreMessages: false,
    isLoadingMessages: false,
    isLoadingMoreMessages: false,
    isSending: false,
    pendingCount: 0,
    messagesVersion: 0,
    onRefresh: vi.fn(),
    onLoadMore: vi.fn(async () => ({})),
    onSend: vi.fn(),
    onFlushPending: vi.fn(),
    onAtBottomChange: vi.fn(),
}

function buildSession(active: boolean) {
    return {
        id: active ? 'active-session' : 'inactive-session',
        active,
        metadata: { path: '/tmp/project', flavor: 'claude' },
        agentState: {},
        permissionMode: 'ask',
        modelMode: 'default',
        thinking: false,
        teamState: null,
    } as never
}

describe('SessionChat', () => {
    it('shows inactive hint only for inactive sessions', () => {
        const { rerender } = render(
            <SessionChat
                {...baseProps}
                session={buildSession(false)}
            />
        )

        expect(screen.getByText('Session is inactive. Sending will resume it automatically.')).toBeInTheDocument()
        expect(screen.getByTestId('zhushen-thread')).toBeInTheDocument()
        expect(screen.getByTestId('zhushen-composer')).toBeInTheDocument()

        rerender(
            <SessionChat
                {...baseProps}
                session={buildSession(true)}
            />
        )

        expect(screen.queryByText('Session is inactive. Sending will resume it automatically.')).toBeNull()
    })
})
