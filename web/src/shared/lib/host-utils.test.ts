import { describe, expect, it } from 'vitest'
import { getHostDisplayName, getHostColorKey, getShortMachineId, getHostColorStyle } from './host-utils'

describe('getShortMachineId', () => {
    it('returns first 8 characters of machineId', () => {
        expect(getShortMachineId('abcdef123456')).toBe('abcdef12')
    })

    it('returns null for undefined', () => {
        expect(getShortMachineId(undefined)).toBe(null)
    })

    it('returns null for empty string', () => {
        expect(getShortMachineId('')).toBe(null)
    })

    it('returns null for whitespace-only string', () => {
        expect(getShortMachineId('   ')).toBe(null)
    })
})

describe('getHostDisplayName', () => {
    it('returns full format when all fields present', () => {
        const result = getHostDisplayName({
            host: 'jlovec',
            platform: 'linux',
            machineId: '54080f81abcd'
        })
        expect(result).toBe('jlovec(linux:54080f81)')
    })

    it('returns host(platform) when machineId missing', () => {
        const result = getHostDisplayName({
            host: 'jlovec',
            platform: 'linux'
        })
        expect(result).toBe('jlovec(linux)')
    })

    it('returns host(machineId) when platform missing', () => {
        const result = getHostDisplayName({
            host: 'jlovec',
            machineId: '54080f81abcd'
        })
        expect(result).toBe('jlovec(54080f81)')
    })

    it('returns host only when platform and machineId missing', () => {
        const result = getHostDisplayName({
            host: 'jlovec'
        })
        expect(result).toBe('jlovec')
    })

    it('prefers displayName over host', () => {
        const result = getHostDisplayName({
            displayName: 'My Laptop',
            host: 'jlovec',
            platform: 'darwin',
            machineId: '12345678'
        })
        expect(result).toBe('My Laptop(darwin:12345678)')
    })

    it('falls back to short machineId when no host or displayName', () => {
        const result = getHostDisplayName({
            machineId: 'abcdef123456'
        })
        expect(result).toBe('abcdef12')
    })

    it('falls back to short sessionId when no other fields', () => {
        const result = getHostDisplayName({
            sessionId: 'session-id-12345'
        })
        expect(result).toBe('session-')
    })

    it('returns null when all fields missing', () => {
        const result = getHostDisplayName({})
        expect(result).toBe(null)
    })

    it('trims whitespace from all fields', () => {
        const result = getHostDisplayName({
            host: '  jlovec  ',
            platform: '  linux  ',
            machineId: '  54080f81  '
        })
        expect(result).toBe('jlovec(linux:54080f81)')
    })
})

describe('getHostColorKey', () => {
    it('uses machineId even when host and displayName present', () => {
        const result = getHostColorKey({
            host: 'jlovec',
            displayName: 'My Laptop',
            machineId: '12345678'
        })
        expect(result).toBe('12345678')
    })

    it('uses machineId when only machineId present', () => {
        const result = getHostColorKey({
            machineId: '12345678'
        })
        expect(result).toBe('12345678')
    })

    it('returns fixed identifier when machineId missing', () => {
        const result = getHostColorKey({
            host: 'jlovec',
            displayName: 'My Laptop',
            sessionId: 'session-123'
        })
        expect(result).toBe('__no_machine_id__')
    })

    it('returns fixed identifier when only sessionId present', () => {
        const result = getHostColorKey({
            sessionId: 'session-123'
        })
        expect(result).toBe('__no_machine_id__')
    })

    it('returns fixed identifier when all fields missing', () => {
        const result = getHostColorKey({})
        expect(result).toBe('__no_machine_id__')
    })
})

describe('getHostColorStyle', () => {
    it('returns gray style for fixed identifier', () => {
        const result = getHostColorStyle('__no_machine_id__')
        expect(result).toEqual({
            backgroundColor: 'light-dark(hsl(0 5% 90%), hsl(0 5% 25%))',
            color: 'light-dark(hsl(0 5% 40%), hsl(0 5% 70%))',
            borderColor: 'light-dark(hsl(0 5% 80%), hsl(0 5% 35%))',
        })
    })

    it('returns colored style for machineId', () => {
        const result = getHostColorStyle('12345678')
        // 验证返回的是彩色样式（包含 hsl 且不是灰色）
        expect(result.backgroundColor).toMatch(/hsl\(\d+/)
        expect(result.color).toMatch(/hsl\(\d+/)
        expect(result.borderColor).toMatch(/hsl\(\d+/)
    })

    it('returns consistent color for same machineId', () => {
        const result1 = getHostColorStyle('abcdef12')
        const result2 = getHostColorStyle('abcdef12')
        expect(result1).toEqual(result2)
    })
})
