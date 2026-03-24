import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useEffect, useId, useState } from 'react'
import { defaultSchema } from 'hast-util-sanitize'
import type { Schema } from 'hast-util-sanitize'
import {
    MarkdownTextPrimitive,
    unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
    useIsMarkdownCodeBlock,
    type CodeHeaderProps,
    type MarkdownTextPrimitiveProps,
} from '@assistant-ui/react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import mermaid from 'mermaid'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import { SyntaxHighlighter } from '@/components/assistant-ui/shiki-highlighter'
import { useCopyToClipboard } from '@/shared/hooks/useCopyToClipboard'
import { CopyIcon, CheckIcon } from '@/components/icons'
import 'katex/dist/katex.min.css'

const HTML_ALLOWED_TAG_NAMES = [
    'abbr',
    'b',
    'blockquote',
    'br',
    'code',
    'dd',
    'del',
    'details',
    'div',
    'dl',
    'dt',
    'em',
    'figcaption',
    'figure',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'input',
    'kbd',
    'li',
    'mark',
    'ol',
    'p',
    'picture',
    'pre',
    'section',
    'small',
    'span',
    'strong',
    'sub',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
] as const

const rehypeSanitizeSchema: Schema = {
    ...defaultSchema,
    tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), ...HTML_ALLOWED_TAG_NAMES])),
    attributes: {
        ...defaultSchema.attributes,
        a: [
            ...((defaultSchema.attributes?.a as string[] | undefined) ?? []),
            'href',
            'target',
            'rel',
            'title',
        ],
        code: [...((defaultSchema.attributes?.code as string[] | undefined) ?? []), ['className', /^language-./]],
        div: [...((defaultSchema.attributes?.div as string[] | undefined) ?? []), 'className'],
        img: [
            ...((defaultSchema.attributes?.img as string[] | undefined) ?? []),
            'src',
            'alt',
            'title',
            'width',
            'height',
            'loading',
        ],
        input: [
            ...((defaultSchema.attributes?.input as string[] | undefined) ?? []),
            'type',
            'checked',
            'disabled',
        ],
        span: [...((defaultSchema.attributes?.span as string[] | undefined) ?? []), 'className'],
        '*': [...((defaultSchema.attributes?.['*'] as string[] | undefined) ?? []), 'className'],
    },
    clobberPrefix: 'aui-md-',
}

export const MARKDOWN_REMARK_PLUGINS: NonNullable<MarkdownTextPrimitiveProps['remarkPlugins']> = [remarkGfm, remarkMath]

export const MARKDOWN_REHYPE_PLUGINS: NonNullable<MarkdownTextPrimitiveProps['rehypePlugins']> = [
    rehypeRaw,
    [rehypeSanitize, rehypeSanitizeSchema],
    rehypeKatex,
]

function CodeHeader(props: CodeHeaderProps) {
    const { copied, copy } = useCopyToClipboard()
    const { t } = useTranslation()
    const language = props.language && props.language !== 'unknown' ? props.language : ''

    return (
        <div className="aui-md-codeheader flex items-center justify-between rounded-t-md bg-[var(--app-code-bg)] px-2 py-1">
            <div className="min-w-0 flex-1 pr-2 text-xs font-mono text-[var(--app-hint)]">
                {language}
            </div>
            <button
                type="button"
                onClick={() => copy(props.code)}
                className="shrink-0 rounded p-1 text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]"
                title={t('code.copy')}
                aria-label={t('code.copy')}
            >
                {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
            </button>
        </div>
    )
}

function Pre(props: ComponentPropsWithoutRef<'pre'>) {
    const { className, ...rest } = props

    return (
        <div className="aui-md-pre-wrapper min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden">
            <pre
                {...rest}
                className={cn(
                    'aui-md-pre m-0 w-max min-w-full rounded-b-md rounded-t-none bg-[var(--app-code-bg)] p-2 text-sm',
                    className
                )}
            />
        </div>
    )
}

function Code(props: ComponentPropsWithoutRef<'code'>) {
    const isCodeBlock = useIsMarkdownCodeBlock()

    if (isCodeBlock) {
        return <code {...props} className={cn('aui-md-codeblockcode font-mono', props.className)} />
    }

    return (
        <code
            {...props}
            className={cn(
                'aui-md-code break-words rounded bg-[var(--app-inline-code-bg)] px-[0.3em] py-[0.1em] font-mono text-[0.9em]',
                props.className
            )}
        />
    )
}

function A(props: ComponentPropsWithoutRef<'a'>) {
    const rel = props.target === '_blank' ? (props.rel ?? 'noreferrer') : props.rel

    return <a {...props} rel={rel} className={cn('aui-md-a text-[var(--app-link)] underline', props.className)} />
}

function Paragraph(props: ComponentPropsWithoutRef<'p'>) {
    return <p {...props} className={cn('aui-md-p leading-relaxed', props.className)} />
}

function Blockquote(props: ComponentPropsWithoutRef<'blockquote'>) {
    return (
        <blockquote
            {...props}
            className={cn(
                'aui-md-blockquote border-l-4 border-[var(--app-hint)] pl-3 opacity-85',
                props.className
            )}
        />
    )
}

function UnorderedList(props: ComponentPropsWithoutRef<'ul'>) {
    return <ul {...props} className={cn('aui-md-ul list-disc pl-6', props.className)} />
}

function OrderedList(props: ComponentPropsWithoutRef<'ol'>) {
    return <ol {...props} className={cn('aui-md-ol list-decimal pl-6', props.className)} />
}

function ListItem(props: ComponentPropsWithoutRef<'li'>) {
    return <li {...props} className={cn('aui-md-li', props.className)} />
}

function Hr(props: ComponentPropsWithoutRef<'hr'>) {
    return <hr {...props} className={cn('aui-md-hr border-[var(--app-divider)]', props.className)} />
}

function Table(props: ComponentPropsWithoutRef<'table'>) {
    const { className, ...rest } = props

    return (
        <div className="aui-md-table-wrapper max-w-full overflow-x-auto">
            <table {...rest} className={cn('aui-md-table w-full border-collapse', className)} />
        </div>
    )
}

function Thead(props: ComponentPropsWithoutRef<'thead'>) {
    return <thead {...props} className={cn('aui-md-thead', props.className)} />
}

function Tbody(props: ComponentPropsWithoutRef<'tbody'>) {
    return <tbody {...props} className={cn('aui-md-tbody', props.className)} />
}

function Tr(props: ComponentPropsWithoutRef<'tr'>) {
    return <tr {...props} className={cn('aui-md-tr', props.className)} />
}

function Th(props: ComponentPropsWithoutRef<'th'>) {
    return (
        <th
            {...props}
            className={cn(
                'aui-md-th border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-1 text-left font-semibold',
                props.className
            )}
        />
    )
}

function Td(props: ComponentPropsWithoutRef<'td'>) {
    return <td {...props} className={cn('aui-md-td border border-[var(--app-border)] px-2 py-1', props.className)} />
}

function H1(props: ComponentPropsWithoutRef<'h1'>) {
    return <h1 {...props} className={cn('aui-md-h1 mt-3 text-base font-semibold', props.className)} />
}

function H2(props: ComponentPropsWithoutRef<'h2'>) {
    return <h2 {...props} className={cn('aui-md-h2 mt-3 text-base font-semibold', props.className)} />
}

function H3(props: ComponentPropsWithoutRef<'h3'>) {
    return <h3 {...props} className={cn('aui-md-h3 mt-2 text-base font-semibold', props.className)} />
}

function H4(props: ComponentPropsWithoutRef<'h4'>) {
    return <h4 {...props} className={cn('aui-md-h4 mt-2 text-base font-semibold', props.className)} />
}

function H5(props: ComponentPropsWithoutRef<'h5'>) {
    return <h5 {...props} className={cn('aui-md-h5 mt-2 text-base font-semibold', props.className)} />
}

function H6(props: ComponentPropsWithoutRef<'h6'>) {
    return <h6 {...props} className={cn('aui-md-h6 mt-2 text-base font-semibold', props.className)} />
}

function Strong(props: ComponentPropsWithoutRef<'strong'>) {
    return <strong {...props} className={cn('aui-md-strong font-semibold', props.className)} />
}

function Em(props: ComponentPropsWithoutRef<'em'>) {
    return <em {...props} className={cn('aui-md-em italic', props.className)} />
}

function Image(props: ComponentPropsWithoutRef<'img'>) {
    return <img {...props} className={cn('aui-md-img max-w-full rounded', props.className)} />
}

function Details(props: ComponentPropsWithoutRef<'details'>) {
    return (
        <details
            {...props}
            className={cn(
                'aui-md-details rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] px-3 py-2',
                props.className
            )}
        />
    )
}

function Summary(props: ComponentPropsWithoutRef<'summary'>) {
    return (
        <summary
            {...props}
            className={cn('aui-md-summary cursor-pointer font-medium text-[var(--app-fg)]', props.className)}
        />
    )
}

function Figure(props: ComponentPropsWithoutRef<'figure'>) {
    return <figure {...props} className={cn('aui-md-figure my-3', props.className)} />
}

function Figcaption(props: ComponentPropsWithoutRef<'figcaption'>) {
    return (
        <figcaption
            {...props}
            className={cn('aui-md-figcaption mt-2 text-sm text-[var(--app-hint)]', props.className)}
        />
    )
}

function Keyboard(props: ComponentPropsWithoutRef<'kbd'>) {
    return (
        <kbd
            {...props}
            className={cn(
                'aui-md-kbd rounded border border-[var(--app-border)] bg-[var(--app-secondary-bg)] px-1.5 py-0.5 font-mono text-[0.85em]',
                props.className
            )}
        />
    )
}

function Mark(props: ComponentPropsWithoutRef<'mark'>) {
    return (
        <mark
            {...props}
            className={cn('aui-md-mark rounded bg-[var(--app-subtle-bg)] px-1 text-[var(--app-fg)]', props.className)}
        />
    )
}

type MermaidDiagramProps = {
    code: string
}

function MermaidDiagram({ code }: MermaidDiagramProps) {
    const { t } = useTranslation()
    const diagramId = useId()
    const [svg, setSvg] = useState<string | null>(null)
    const [hasError, setHasError] = useState(false)

    useEffect(() => {
        let cancelled = false

        async function renderDiagram() {
            try {
                mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: 'strict',
                    theme: 'default',
                })

                const { svg: renderedSvg } = await mermaid.render(`mermaid-${diagramId}`, code)
                if (cancelled) return
                setSvg(renderedSvg)
                setHasError(false)
            } catch {
                if (cancelled) return
                setSvg(null)
                setHasError(true)
            }
        }

        void renderDiagram()

        return () => {
            cancelled = true
        }
    }, [code, diagramId])

    if (hasError) {
        return (
            <div className="aui-md-mermaid-fallback rounded-md border border-[var(--app-border)] bg-[var(--app-code-bg)] p-3">
                <p className="mb-2 text-sm text-[var(--app-hint)]">{t('markdown.mermaidFallback')}</p>
                <pre className="m-0 overflow-x-auto text-sm">
                    <code>{code}</code>
                </pre>
            </div>
        )
    }

    if (!svg) {
        return (
            <div
                className="aui-md-mermaid-loading rounded-md border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3 text-sm text-[var(--app-hint)]"
                role="status"
                aria-label={t('misc.loading')}
            >
                {t('misc.loading')}
            </div>
        )
    }

    return (
        <div className="aui-md-mermaid-wrapper overflow-x-auto rounded-md border border-[var(--app-border)] bg-white p-3 dark:bg-[var(--app-code-bg)]">
            <div
                className="aui-md-mermaid [&_svg]:h-auto [&_svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
            />
        </div>
    )
}

function renderMarkdownClassName(...parts: Array<string | undefined>) {
    return cn('aui-md min-w-0 max-w-full break-words text-base', ...parts)
}

export const defaultComponents = memoizeMarkdownComponents({
    SyntaxHighlighter,
    CodeHeader,
    pre: Pre,
    code: Code,
    h1: H1,
    h2: H2,
    h3: H3,
    h4: H4,
    h5: H5,
    h6: H6,
    a: A,
    p: Paragraph,
    strong: Strong,
    em: Em,
    blockquote: Blockquote,
    ul: UnorderedList,
    ol: OrderedList,
    li: ListItem,
    hr: Hr,
    table: Table,
    thead: Thead,
    tbody: Tbody,
    tr: Tr,
    th: Th,
    td: Td,
    img: Image,
    details: Details,
    summary: Summary,
    figure: Figure,
    figcaption: Figcaption,
    kbd: Keyboard,
    mark: Mark,
} as const)

export const markdownComponentsByLanguage: NonNullable<MarkdownTextPrimitiveProps['componentsByLanguage']> = {
    mermaid: {
        SyntaxHighlighter: ({ code }) => <MermaidDiagram code={code} />,
    },
}

export function mergeMarkdownComponents(
    components?: MarkdownTextPrimitiveProps['components']
): MarkdownTextPrimitiveProps['components'] {
    return components ? { ...defaultComponents, ...components } : defaultComponents
}

export function getMarkdownPrimitiveProps(
    overrides?: Pick<MarkdownTextPrimitiveProps, 'components' | 'className'>
): MarkdownTextPrimitiveProps {
    return {
        remarkPlugins: MARKDOWN_REMARK_PLUGINS,
        rehypePlugins: MARKDOWN_REHYPE_PLUGINS,
        components: mergeMarkdownComponents(overrides?.components),
        componentsByLanguage: markdownComponentsByLanguage,
        className: renderMarkdownClassName(overrides?.className),
    }
}

export function MarkdownText() {
    const markdownProps = getMarkdownPrimitiveProps()

    return <MarkdownTextPrimitive {...markdownProps} smooth={false} />
}
