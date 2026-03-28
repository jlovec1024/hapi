// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { useVisibilityReporter } from './useVisibilityReporter'

function createApiError(status: number, body: unknown): ApiError {
    return new ApiError(
        `HTTP ${status} Error`,
        status,
        typeof (body as { error?: unknown })?.error === 'string' ? (body as { error: string }).error : undefined,
        JSON.stringify(body),
        body as {
            error?: unknown
            reason?: unknown
            trackedNamespace?: unknown
        }
    )
}

describe('useVisibilityReporter', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const originalVisibilityState = document.visibilityState

    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        })
    })

    afterEach(() => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: originalVisibilityState,
        })
        consoleErrorSpy.mockClear()
    })

    it('stops retrying stale subscriptions after subscription_not_found', async () => {
        const setVisibility = vi
            .fn<() => Promise<void>>()
            .mockRejectedValueOnce(createApiError(404, {
                error: 'Subscription not found',
                reason: 'subscription_not_found',
                trackedNamespace: null,
            }))
            .mockResolvedValueOnce(undefined)

        const api = { setVisibility } as never
        const { rerender } = renderHook(
            ({ subscriptionId }) => useVisibilityReporter({
                api,
                subscriptionId,
                enabled: true,
            }),
            {
                initialProps: { subscriptionId: 'sub-1' },
            }
        )

        await vi.runAllTimersAsync()
        expect(setVisibility).toHaveBeenCalledTimes(1)
        expect(setVisibility).toHaveBeenLastCalledWith({
            subscriptionId: 'sub-1',
            visibility: 'visible',
        })

        rerender({ subscriptionId: 'sub-2' })

        await vi.runAllTimersAsync()
        expect(setVisibility).toHaveBeenCalledTimes(2)
        expect(setVisibility).toHaveBeenLastCalledWith({
            subscriptionId: 'sub-2',
            visibility: 'visible',
        })
    })

    it('stops retrying stale subscriptions after namespace_mismatch', async () => {
        const setVisibility = vi
            .fn<() => Promise<void>>()
            .mockRejectedValueOnce(createApiError(404, {
                error: 'Subscription not found',
                reason: 'namespace_mismatch',
                trackedNamespace: 'beta',
            }))
            .mockResolvedValueOnce(undefined)

        const api = { setVisibility } as never
        const { rerender } = renderHook(
            ({ subscriptionId }) => useVisibilityReporter({
                api,
                subscriptionId,
                enabled: true,
            }),
            {
                initialProps: { subscriptionId: 'sub-1' },
            }
        )

        await vi.runAllTimersAsync()
        expect(setVisibility).toHaveBeenCalledTimes(1)

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000)
        })
        expect(setVisibility).toHaveBeenCalledTimes(1)

        rerender({ subscriptionId: 'sub-2' })

        await vi.runAllTimersAsync()
        expect(setVisibility).toHaveBeenCalledTimes(2)
        expect(setVisibility).toHaveBeenLastCalledWith({
            subscriptionId: 'sub-2',
            visibility: 'visible',
        })
    })

    it('keeps retrying current subscription for non-classified errors', async () => {
        const setVisibility = vi
            .fn<() => Promise<void>>()
            .mockRejectedValueOnce(new Error('network error'))
            .mockResolvedValueOnce(undefined)

        const api = { setVisibility } as never
        renderHook(() => useVisibilityReporter({
            api,
            subscriptionId: 'sub-1',
            enabled: true,
        }))

        expect(setVisibility).toHaveBeenCalledTimes(1)

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000)
        })

        expect(setVisibility).toHaveBeenCalledTimes(2)
        expect(setVisibility).toHaveBeenNthCalledWith(2, {
            subscriptionId: 'sub-1',
            visibility: 'visible',
        })
    })

    it('registers and cleans up visibilitychange listener', () => {
        const setVisibility = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const api = { setVisibility } as never

        const { unmount } = renderHook(() => useVisibilityReporter({
            api,
            subscriptionId: 'sub-1',
            enabled: true,
        }))

        expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

        unmount()

        expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    })
})

