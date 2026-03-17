import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ToolCallBlock } from '@/chat/types'
import { CodeBlock } from '@/components/CodeBlock'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { getToolResultViewComponent } from '@/components/ToolCard/views/_results'
import { LongContentCollapse } from '@/components/LongContentCollapse'
import { I18nProvider } from '@/lib/i18n-context'
import { LONG_CONTENT_COLLAPSE_THRESHOLD } from '@/lib/contentLimits'
import zhCN from '@/lib/locales/zh-CN'

vi.mock('@/components/MarkdownRenderer', () => ({
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>
}))

const COLLAPSE_LABEL = zhCN['content.collapse.close']
const EXPAND_LABEL = zhCN['content.collapse.openWithHidden']

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

describe('Long content auto collapse', () => {
    it('does not collapse at threshold boundary', () => {
        const boundaryText = 'a'.repeat(LONG_CONTENT_COLLAPSE_THRESHOLD)

        renderWithI18n(
            <LongContentCollapse text={boundaryText}>
                <div>boundary-content</div>
            </LongContentCollapse>
        )

        expect(screen.queryByRole('button', { name: EXPAND_LABEL })).not.toBeInTheDocument()
        expect(screen.getByText('boundary-content')).toBeInTheDocument()
    })

    it('auto-collapses code block when content exceeds threshold', () => {
        const longCode = 'a'.repeat(LONG_CONTENT_COLLAPSE_THRESHOLD + 1)

        renderWithI18n(<CodeBlock code={longCode} language="text" />)

        const toggleButton = screen.getByRole('button', { name: EXPAND_LABEL })
        expect(toggleButton).toHaveAttribute('aria-expanded', 'false')

        fireEvent.click(toggleButton)

        expect(screen.getByRole('button', { name: COLLAPSE_LABEL })).toHaveAttribute('aria-expanded', 'true')
    })

    it('auto-collapses cli output when content exceeds threshold', async () => {
        const longStdout = 'a'.repeat(LONG_CONTENT_COLLAPSE_THRESHOLD + 100)
        const text = `<command-name>echo hi</command-name>\n<local-command-stdout>${longStdout}</local-command-stdout>`

        renderWithI18n(<CliOutputBlock text={text} />)

        fireEvent.click(screen.getByRole('button', { name: 'echo hi' }))

        const expandButton = await screen.findByRole('button', { name: EXPAND_LABEL })
        expect(expandButton).toHaveAttribute('aria-expanded', 'false')

        fireEvent.click(expandButton)

        expect(screen.getByRole('button', { name: COLLAPSE_LABEL })).toHaveAttribute('aria-expanded', 'true')
    })

    it('auto-collapses skill followup text inside tool result views', () => {
        const ResultView = getToolResultViewComponent('Skill')
        const longFollowup = '请先阅读规范。\n\n' + 'a'.repeat(LONG_CONTENT_COLLAPSE_THRESHOLD + 50)

        const { container } = renderWithI18n(
            <ResultView
                block={makeToolBlock({ followupText: longFollowup })}
                metadata={null}
            />
        )

        expect(screen.getByText(zhCN['tool.skillInstructions'])).toBeInTheDocument()
        const toggleButton = within(container).getByRole('button', { name: EXPAND_LABEL })
        expect(toggleButton).toHaveAttribute('aria-expanded', 'false')

        fireEvent.click(toggleButton)

        expect(within(container).getByRole('button', { name: COLLAPSE_LABEL })).toHaveAttribute('aria-expanded', 'true')
    })
})

