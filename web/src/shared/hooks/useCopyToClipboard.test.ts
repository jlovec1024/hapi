import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCopyToClipboard } from './useCopyToClipboard'

// Mock dependencies
vi.mock('./usePlatform', () => ({
    usePlatform: () => ({
        isTouch: false,
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
            selection: vi.fn(),
        },
    }),
}))

vi.mock('@/shared/lib/clipboard', () => ({
    safeCopyToClipboard: vi.fn(),
}))

describe('useCopyToClipboard', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()  // 启用 fake timers
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()  // 恢复真实定时器
    })

    it('initializes with copied as false', () => {
        const { result } = renderHook(() => useCopyToClipboard())
        expect(result.current.copied).toBe(false)
    })

    it('sets copied to true on successful copy', async () => {
        const { safeCopyToClipboard } = await import('@/shared/lib/clipboard')
        vi.mocked(safeCopyToClipboard).mockResolvedValue()

        const { result } = renderHook(() => useCopyToClipboard())

        let copyResult: boolean | undefined
        await act(async () => {
            copyResult = await result.current.copy('test text')
        })

        expect(copyResult).toBe(true)
        expect(result.current.copied).toBe(true)
        expect(safeCopyToClipboard).toHaveBeenCalledWith('test text')
    })

    it('resets copied to false after delay', async () => {
        const { safeCopyToClipboard } = await import('@/shared/lib/clipboard')
        vi.mocked(safeCopyToClipboard).mockResolvedValue()

        const { result } = renderHook(() => useCopyToClipboard(100))

        await act(async () => {
            await result.current.copy('test')
        })

        expect(result.current.copied).toBe(true)

        // 使用 fake timers 精确控制时间流逝
        act(() => {
            vi.advanceTimersByTime(100)
        })

        expect(result.current.copied).toBe(false)
    })

    it('returns false on copy failure', async () => {
        const { safeCopyToClipboard } = await import('@/shared/lib/clipboard')
        vi.mocked(safeCopyToClipboard).mockRejectedValue(new Error('Copy failed'))

        const { result } = renderHook(() => useCopyToClipboard())

        let copyResult: boolean | undefined
        await act(async () => {
            copyResult = await result.current.copy('test')
        })

        expect(copyResult).toBe(false)
        expect(result.current.copied).toBe(false)
    })

    it('uses custom reset delay', async () => {
        const { safeCopyToClipboard } = await import('@/shared/lib/clipboard')
        vi.mocked(safeCopyToClipboard).mockResolvedValue()

        const { result } = renderHook(() => useCopyToClipboard(50))

        await act(async () => {
            await result.current.copy('test')
        })

        expect(result.current.copied).toBe(true)

        // 使用 fake timers 精确控制时间流逝
        act(() => {
            vi.advanceTimersByTime(50)
        })

        expect(result.current.copied).toBe(false)
    })
})
