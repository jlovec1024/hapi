import { mock } from 'bun:test'

mock.module('bun-pty', () => import('./src/__mocks__/bun-pty'))
