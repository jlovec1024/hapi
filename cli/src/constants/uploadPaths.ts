import { join } from 'path'
import { tmpdir } from 'os'

export const ZS_BLOBS_DIR_NAME = 'zs-blobs'

export function getZsBlobsDir(): string {
    return join(tmpdir(), ZS_BLOBS_DIR_NAME)
}
