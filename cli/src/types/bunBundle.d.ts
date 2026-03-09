declare module 'bun:bundle' {
    interface Registry {
        features:
            | 'ZS_TARGET_DARWIN_ARM64'
            | 'ZS_TARGET_DARWIN_X64'
            | 'ZS_TARGET_LINUX_ARM64'
            | 'ZS_TARGET_LINUX_X64'
            | 'ZS_TARGET_WIN32_X64';
    }

    export function feature(name: Registry['features']): boolean;
}
