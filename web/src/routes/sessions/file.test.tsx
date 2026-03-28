import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nContext } from '@/lib/i18n-context'
import { en } from '@/lib/locales'
import FilePage from './file'

type QueryState = {
    isLoading?: boolean
    data?: unknown
}

const useQueryMock = vi.fn()
let mockSearch: { path?: string; staged?: boolean } = {}
let mockDiffState: QueryState = {}
let mockFileState: QueryState = {}

vi.mock('@tanstack/react-query', () => ({
    useQuery: (options: { queryKey?: unknown[] }) => {
        useQueryMock(options)
        const key = Array.isArray(options?.queryKey) ? options.queryKey[0] : undefined
        const base = { isLoading: false, data: undefined }
        if (key === 'git-file-diff') {
            return { ...base, ...mockDiffState }
        }
        if (key === 'session-file') {
            return { ...base, ...mockFileState }
        }
        return base
    },
}))

vi.mock('@tanstack/react-router', () => ({
    useParams: () => ({ sessionId: 'session-1' }),
    useSearch: () => mockSearch,
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: null,
    }),
}))

vi.mock('@/hooks/useAppGoBack', () => ({
    useAppGoBack: () => vi.fn(),
}))

vi.mock('@/hooks/useCopyToClipboard', () => ({
    useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }),
}))

vi.mock('@/shared/lib/shiki', () => ({
    langAlias: {},
    useShikiHighlighter: (content: string) => content,
}))

function setQueryStates(diffState: QueryState, fileState: QueryState) {
    mockDiffState = diffState
    mockFileState = fileState
}

function renderWithI18n() {
    const translations = en as Record<string, string>
    const t = (key: string, vars?: Record<string, string | number>) => {
        let value = translations[key] ?? key
        if (vars) {
            for (const [varKey, varValue] of Object.entries(vars)) {
                value = value.replace(`{${varKey}}`, String(varValue))
            }
        }
        return value
    }

    return render(
        <I18nContext.Provider value={{ t, locale: 'en', setLocale: vi.fn() }}>
            <FilePage />
        </I18nContext.Provider>
    )
}

describe('FilePage image preview behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSearch = {}
        mockDiffState = {}
        mockFileState = {}
    })

    it('renders image preview in File view for image files', async () => {
        mockSearch = { path: 'photo.png' }
        setQueryStates(
            { data: { success: true, stdout: '' } },
            { data: { success: true, content: 'aGVsbG8=' } }
        )

        renderWithI18n()

        await waitFor(() => {
            expect(screen.getByRole('img', { name: 'Preview of photo.png' })).toBeInTheDocument()
        })
    })

    it('keeps binary fallback for non-image binary files', async () => {
        mockSearch = { path: 'archive.bin' }
        setQueryStates(
            { data: { success: true, stdout: '' } },
            { data: { success: true, content: 'AGFiYw==' } }
        )

        renderWithI18n()

        await waitFor(() => {
            expect(screen.getByText('This looks like a binary file. It cannot be displayed.')).toBeInTheDocument()
        })
    })

    it('keeps existing text rendering for non-image text files', async () => {
        mockSearch = { path: 'notes.txt' }
        setQueryStates(
            { data: { success: true, stdout: '' } },
            { data: { success: true, content: 'aGVsbG8gdGV4dA==' } }
        )

        renderWithI18n()

        await waitFor(() => {
            expect(screen.getByText('hello text')).toBeInTheDocument()
        })
    })

    it('shows fallback message when image preview fails to load', async () => {
        mockSearch = { path: 'broken.png' }
        setQueryStates(
            { data: { success: true, stdout: '' } },
            { data: { success: true, content: 'aW52YWxpZA==' } }
        )

        renderWithI18n()

        const image = await screen.findByRole('img', { name: 'Preview of broken.png' })
        fireEvent.error(image)

        await waitFor(() => {
            expect(screen.getByText('Failed to load image preview.')).toBeInTheDocument()
        })
    })
})
