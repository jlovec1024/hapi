import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { Reasoning, ReasoningGroup } from '@/components/assistant-ui/reasoning'
import { ZhushenToolMessage } from './ToolMessage'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { getZhushenChatMetadata, getMessageTextContent } from '@/lib/assistant-runtime'

const TOOL_COMPONENTS = {
    Fallback: ZhushenToolMessage
} as const

const MESSAGE_PART_COMPONENTS = {
    Text: MarkdownText,
    Reasoning: Reasoning,
    ReasoningGroup: ReasoningGroup,
    tools: TOOL_COMPONENTS
} as const

export function ZhushenAssistantMessage() {
    const isCliOutput = useAssistantState(({ message }) => getZhushenChatMetadata(message)?.kind === 'cli-output')
    const cliText = useAssistantState(({ message }) => {
        if (getZhushenChatMetadata(message)?.kind !== 'cli-output') return ''
        return getMessageTextContent(message)
    })
    const toolOnly = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return false
        const parts = message.content
        return parts.length > 0 && parts.every((part) => part.type === 'tool-call')
    })
    const rootClass = toolOnly
        ? 'py-1 min-w-0 max-w-full overflow-x-hidden'
        : 'px-1 min-w-0 max-w-full overflow-x-hidden'

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root className="px-1 min-w-0 max-w-full overflow-x-hidden">
                <CliOutputBlock text={cliText} />
            </MessagePrimitive.Root>
        )
    }

    return (
        <MessagePrimitive.Root className={rootClass}>
            <MessagePrimitive.Content components={MESSAGE_PART_COMPONENTS} />
        </MessagePrimitive.Root>
    )
}
