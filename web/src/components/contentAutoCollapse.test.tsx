import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ToolCallBlock } from '@/chat/types'
import { CodeBlock } from '@/components/CodeBlock'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { getToolResultViewComponent } from '@/components/ToolCard/views/_results'
import { I18nProvider } from '@/lib/i18n-context'
import zhCN from '@/lib/locales/zh-CN'

vi.mock('@/components/MarkdownRenderer', () => ({
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>
}))

const REMOVED_COLLAPSE_LABELS = ['收起长消息', '展开长消息（已隐藏部分）']

beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
            matches: false,
            media: '',
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn()
        }))
    })
})

beforeEach(() => {
    localStorage.setItem('zs-lang', 'zh-CN')
})

afterEach(() => {
    cleanup()
})

function renderWithI18n(ui: React.ReactElement) {
    return render(
        <I18nProvider>
            {ui}
        </I18nProvider>
    )
}

function makeToolBlock(overrides: Partial<ToolCallBlock['tool']> = {}): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: 'tool-skill-1',
        localId: null,
        createdAt: 0,
        tool: {
            id: 'tool-skill-1',
            name: 'Skill',
            state: 'completed',
            input: { skill: 'trellis:before-backend-dev' },
            createdAt: 0,
            startedAt: 0,
            completedAt: 0,
            description: null,
            result: 'Launching skill: trellis:before-backend-dev',
            followupText: undefined,
            ...overrides
        },
        children: []
    }
}

function expectCollapseButtonsRemoved() {
    for (const label of REMOVED_COLLAPSE_LABELS) {
        expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
}

describe('Long content display', () => {
    it('shows long code blocks without collapse controls', () => {
        const longCode = 'a'.repeat(1200)

        renderWithI18n(<CodeBlock code={longCode} language="text" />)

        expect(screen.getByText(longCode)).toBeInTheDocument()
        expectCollapseButtonsRemoved()
    })

    it('shows long cli output without collapse controls', async () => {
        const longStdout = 'a'.repeat(1100)
        const text = `<command-name>echo hi</command-name>\n<local-command-stdout>${longStdout}</local-command-stdout>`

        renderWithI18n(<CliOutputBlock text={text} />)

        fireEvent.click(screen.getByRole('button', { name: 'echo hi' }))

        expect(await screen.findByText(longStdout, { exact: false })).toBeInTheDocument()
        expectCollapseButtonsRemoved()
    })

    it('shows long skill followup text without collapse controls', () => {
        const ResultView = getToolResultViewComponent('Skill')
        const longFollowup = '请先阅读规范。\n\n' + 'a'.repeat(1050)

        renderWithI18n(
            <ResultView
                block={makeToolBlock({ followupText: longFollowup })}
                metadata={null}
            />
        )

        expect(screen.getByText(zhCN['tool.skillInstructions'])).toBeInTheDocument()
        expect(screen.getByText(/请先阅读规范。/)).toBeInTheDocument()
        expectCollapseButtonsRemoved()
    })
})

