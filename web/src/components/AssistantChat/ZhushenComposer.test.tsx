import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ZhushenComposer } from './ZhushenComposer'

const mockComposerSend = vi.fn()
const mockComposerSetText = vi.fn()
const mockThreadCancelRun = vi.fn()

let mockSuggestions: Array<{ key: string; text: string; label: string }> = []
let mockSelectedIndex = -1

vi.mock('@assistant-ui/react', async () => {
    const ReactModule = await import('react')

    const Root = ({ children, onSubmit, className }: { children: React.ReactNode; onSubmit?: (e?: React.FormEvent<HTMLFormElement>) => void; className?: string }) => (
        <form className={className} onSubmit={(e) => onSubmit?.(e)}>
            {children}
        </form>
    )

    const Input = ReactModule.forwardRef<HTMLTextAreaElement, {
        onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
        onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
        onSelect?: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void
        onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
        submitOnEnter?: boolean
        disabled?: boolean
        placeholder?: string
        className?: string
    }>((props, ref) => {
        const {
            onKeyDown,
            onChange,
            onSelect,
            onPaste,
            submitOnEnter,
            disabled,
            placeholder,
            className
        } = props

        return (
            <textarea
                ref={ref}
                data-testid="composer-input"
                disabled={disabled}
                placeholder={placeholder}
                className={className}
                onChange={onChange}
                onSelect={onSelect}
                onPaste={onPaste}
                onKeyDown={(e) => {
                    onKeyDown?.(e)
                    if (submitOnEnter && e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) {
                        mockComposerSend()
                    }
                }}
            />
        )
    })

    const Attachments = () => null

    return {
        ComposerPrimitive: { Root, Input, Attachments },
        useAssistantApi: () => ({
            composer: () => ({
                send: mockComposerSend,
                setText: mockComposerSetText,
                addAttachment: vi.fn()
            }),
            thread: () => ({
                cancelRun: mockThreadCancelRun
            })
        }),
        useAssistantState: (selector: (s: { composer: { text: string; attachments: unknown[] }; thread: { isRunning: boolean; isDisabled: boolean } }) => unknown) => selector({
            composer: { text: 'hello', attachments: [] },
            thread: { isRunning: false, isDisabled: false }
        })
    }
})

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTouch: false,
        haptic: {
            impact: vi.fn(),
            notification: vi.fn()
        }
    })
}))

vi.mock('@/hooks/usePWAInstall', () => ({
    usePWAInstall: () => ({ isStandalone: false, isIOS: false })
}))

vi.mock('@/hooks/useActiveWord', () => ({
    useActiveWord: () => '/he'
}))

vi.mock('@/hooks/useActiveSuggestions', () => ({
    useActiveSuggestions: () => [
        mockSuggestions,
        mockSelectedIndex,
        vi.fn(),
        vi.fn(),
        vi.fn()
    ]
}))

vi.mock('@/utils/applySuggestion', () => ({
    applySuggestion: () => ({
        text: '/help ',
        cursorPosition: 6
    })
}))

vi.mock('@/lib/recent-skills', () => ({
    markSkillUsed: vi.fn()
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('@/components/ChatInput/FloatingOverlay', () => ({
    FloatingOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ChatInput/Autocomplete', () => ({
    Autocomplete: () => <div data-testid="autocomplete" />
}))

vi.mock('@/components/AssistantChat/StatusBar', () => ({
    StatusBar: () => null
}))

vi.mock('@/components/AssistantChat/ComposerButtons', () => ({
    ComposerButtons: ({ onSend }: { onSend: () => void }) => (
        <button type="button" onClick={onSend}>send</button>
    )
}))

vi.mock('@/components/AssistantChat/AttachmentItem', () => ({
    AttachmentItem: () => null
}))


afterEach(() => {
    cleanup()
})

describe('ZhushenComposer keyboard behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSuggestions = []
        mockSelectedIndex = -1
    })

    it('sends on Enter when no suggestions are open', () => {
        render(<ZhushenComposer />)
        const input = screen.getByTestId('composer-input')

        fireEvent.keyDown(input, { key: 'Enter' })

        expect(mockComposerSend).toHaveBeenCalledTimes(1)
    })

    it('does not send on Shift+Enter (newline behavior)', () => {
        render(<ZhushenComposer />)
        const input = screen.getByTestId('composer-input')

        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

        expect(mockComposerSend).not.toHaveBeenCalled()
    })

    it('uses Enter to pick suggestion first instead of sending', () => {
        mockSuggestions = [{ key: '1', text: '/help', label: 'help' }]
        mockSelectedIndex = 0

        render(<ZhushenComposer />)
        const input = screen.getByTestId('composer-input')

        fireEvent.keyDown(input, { key: 'Enter' })

        expect(mockComposerSend).not.toHaveBeenCalled()
        expect(mockComposerSetText).toHaveBeenCalledWith('/help ')
    })

    it('restores draft when switching back to previous session', () => {
        const { rerender } = render(<ZhushenComposer sessionId="session-a" />)
        const input = screen.getByTestId('composer-input')

        fireEvent.change(input, { target: { value: '123', selectionStart: 3, selectionEnd: 3 } })

        rerender(<ZhushenComposer sessionId="session-b" />)
        rerender(<ZhushenComposer sessionId="session-a" />)

        expect(mockComposerSetText).toHaveBeenCalledWith('123')
    })
})
