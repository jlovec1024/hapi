import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CodeBlock } from '@/components/CodeBlock'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { LongContentCollapse } from '@/components/LongContentCollapse'
import { I18nProvider } from '@/lib/i18n-context'
import { LONG_CONTENT_COLLAPSE_THRESHOLD } from '@/lib/contentLimits'
import zhCN from '@/lib/locales/zh-CN'

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

function renderWithI18n(ui: React.ReactElement) {
    return render(
        <I18nProvider>
            {ui}
        </I18nProvider>
    )
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
})
