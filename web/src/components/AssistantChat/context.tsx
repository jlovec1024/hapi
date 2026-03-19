import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'
import type { ApiClient } from '@/api/client'
import type { SessionMetadataSummary } from '@/types/api'

export type ZhushenChatContextValue = {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    disabled: boolean
    onRefresh: () => void
    onRetryMessage?: (localId: string) => void
}

const ZhushenChatContext = createContext<ZhushenChatContextValue | null>(null)

export function ZhushenChatProvider(props: { value: ZhushenChatContextValue; children: ReactNode }) {
    return (
        <ZhushenChatContext.Provider value={props.value}>
            {props.children}
        </ZhushenChatContext.Provider>
    )
}

export function useZhushenChatContext(): ZhushenChatContextValue {
    const ctx = useContext(ZhushenChatContext)
    if (!ctx) {
        throw new Error('ZhushenChatContext is missing')
    }
    return ctx
}
