import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { shouldAutoCollapseContent } from '@/lib/contentLimits'
import { useTranslation } from '@/lib/use-translation'

const COLLAPSED_PREVIEW_CLASS = 'max-h-56 opacity-100'
const EXPANDED_CONTENT_CLASS = 'max-h-[5000px] opacity-100'

function ChevronIcon(props: { className?: string; open?: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
                'transition-transform duration-200',
                props.open ? 'rotate-90' : '',
                props.className
            )}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

export function LongContentCollapse(props: {
    text: string
    children: ReactNode
    className?: string
    threshold?: number
}) {
    const { t } = useTranslation()
    const shouldCollapse = shouldAutoCollapseContent(props.text, props.threshold)
    const [isOpen, setIsOpen] = useState(false)

    if (!shouldCollapse) {
        return <>{props.children}</>
    }

    return (
        <div className={cn('my-1', props.className)}>
            <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((prev) => !prev)}
                className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--app-hint)] hover:text-[var(--app-fg)] transition-colors cursor-pointer select-none"
            >
                <ChevronIcon open={isOpen} />
                <span>{isOpen ? t('content.collapse.close') : t('content.collapse.openWithHidden')}</span>
            </button>

            <div
                className={cn(
                    'overflow-hidden transition-all duration-200 ease-in-out',
                    isOpen ? EXPANDED_CONTENT_CLASS : COLLAPSED_PREVIEW_CLASS
                )}
            >
                <div className="pt-1">
                    {props.children}
                </div>
            </div>
        </div>
    )
}
