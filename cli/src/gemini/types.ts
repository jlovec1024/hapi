import type { GeminiPermissionMode } from '@zs/protocol/types';

export type PermissionMode = GeminiPermissionMode;

export interface GeminiMode {
    permissionMode: PermissionMode;
    model?: string;
}
