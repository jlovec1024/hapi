const terminalSessions = new Map<string, TerminalSessionState>()
const MAX_BUFFER_LENGTH = 200_000

export type TerminalSessionState = {
    terminalId: string
    outputBuffer: string
    hasEverConnected: boolean
}

function createTerminalId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createInitialState(): TerminalSessionState {
    return {
        terminalId: createTerminalId(),
        outputBuffer: '',
        hasEverConnected: false
    }
}

export function getTerminalSessionState(sessionId: string): TerminalSessionState {
    const existing = terminalSessions.get(sessionId)
    if (existing) {
        return existing
    }
    const created = createInitialState()
    terminalSessions.set(sessionId, created)
    return created
}

export function resetTerminalSessionState(sessionId: string): TerminalSessionState {
    const next = createInitialState()
    terminalSessions.set(sessionId, next)
    return next
}

export function clearTerminalSessionBuffer(sessionId: string): TerminalSessionState {
    const next = { ...getTerminalSessionState(sessionId), outputBuffer: '' }
    terminalSessions.set(sessionId, next)
    return next
}

export function appendTerminalSessionOutput(sessionId: string, chunk: string): TerminalSessionState {
    const current = getTerminalSessionState(sessionId)
    const nextBuffer = `${current.outputBuffer}${chunk}`
    const outputBuffer = nextBuffer.length > MAX_BUFFER_LENGTH
        ? nextBuffer.slice(nextBuffer.length - MAX_BUFFER_LENGTH)
        : nextBuffer
    const next = { ...current, outputBuffer }
    terminalSessions.set(sessionId, next)
    return next
}

export function markTerminalSessionConnected(sessionId: string): TerminalSessionState {
    const next = { ...getTerminalSessionState(sessionId), hasEverConnected: true }
    terminalSessions.set(sessionId, next)
    return next
}
