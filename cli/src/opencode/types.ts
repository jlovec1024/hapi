import type { OpencodePermissionMode } from '@zs/protocol/types';

export type PermissionMode = OpencodePermissionMode;

export interface OpencodeMode {
    permissionMode: PermissionMode;
}

export type OpencodeHookEvent = {
    event: string;
    payload: unknown;
    sessionId?: string;
};
