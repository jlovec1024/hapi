/**
 * Zhushen Hub - Main Entry Point
 *
 * Current role:
 * - Legacy host/bootstrap entry for the hub runtime
 * - Wires together config, store, realtime transports, notifications, and web serving
 *
 * NOTE(layering): this file is currently a composition root plus delivery/bootstrap entry.
 * During layering refactors, move business and application logic out of this file instead of adding more here.
 * REMOVE_AFTER:
 * - startup/bootstrap wiring is split into dedicated host/runtime modules
 * - delivery-mode branching no longer lives in this entry file
 * Do not add new domain rules here.
 */

import { createConfiguration, type ConfigSource } from './configuration'
import { Store } from './store'
import { SyncEngine, type SyncEvent } from './sync/syncEngine'
import { NotificationHub } from './notifications/notificationHub'
import type { NotificationChannel } from './notifications/notificationTypes'
import { startWebServer } from './web/server'
import { getOrCreateJwtSecret } from './config/jwtSecret'
import { createSocketServer } from './socket/server'
import { SSEManager } from './sse/sseManager'
import { getOrCreateVapidKeys } from './config/vapidKeys'
import { PushService } from './push/pushService'
import { PushNotificationChannel } from './push/pushNotificationChannel'
import { VisibilityTracker } from './visibility/visibilityTracker'
import type { Server as BunServer } from 'bun'
import type { WebSocketData } from '@socket.io/bun-engine'

/** Format config source for logging */
function formatSource(source: ConfigSource | 'generated'): string {
    switch (source) {
        case 'env':
            return 'environment'
        case 'file':
            return 'settings.json'
        case 'default':
            return 'default'
        case 'generated':
            return 'generated'
    }
}


function normalizeOrigin(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) {
        return ''
    }
    try {
        return new URL(trimmed).origin
    } catch {
        return trimmed
    }
}

function normalizeOrigins(origins: string[]): string[] {
    const normalized = origins
        .map(normalizeOrigin)
        .filter(Boolean)
    if (normalized.includes('*')) {
        return ['*']
    }
    return Array.from(new Set(normalized))
}

let syncEngine: SyncEngine | null = null
let webServer: BunServer<WebSocketData> | null = null
let sseManager: SSEManager | null = null
let visibilityTracker: VisibilityTracker | null = null
let notificationHub: NotificationHub | null = null

async function main() {
    console.log('Zhushen Hub starting...')

    // Load configuration (async - loads from env/file with persistence)
    const config = await createConfiguration()
    const corsOrigins = normalizeOrigins(config.corsOrigins)

    // Display CLI API token information
    if (config.cliApiTokenIsNew) {
        console.log('')
        console.log('='.repeat(70))
        console.log('  NEW CLI_API_TOKEN GENERATED')
        console.log('='.repeat(70))
        console.log('')
        console.log(`  Token: ${config.cliApiToken}`)
        console.log('')
        console.log(`  Saved to: ${config.settingsFile}`)
        console.log('')
        console.log('='.repeat(70))
        console.log('')
    } else {
        console.log(`[Hub] CLI_API_TOKEN: loaded from ${formatSource(config.sources.cliApiToken)}`)
    }

    // Display other configuration sources
    console.log(`[Hub] ZS_LISTEN_HOST: ${config.listenHost} (${formatSource(config.sources.listenHost)})`)
    console.log(`[Hub] ZS_LISTEN_PORT: ${config.listenPort} (${formatSource(config.sources.listenPort)})`)
    console.log(`[Hub] ZS_PUBLIC_URL: ${config.publicUrl} (${formatSource(config.sources.publicUrl)})`)


    const store = new Store(config.dbPath)
    const jwtSecret = await getOrCreateJwtSecret()
    const vapidKeys = await getOrCreateVapidKeys(config.dataDir)
    const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@zhushen.run'
    const pushService = new PushService(vapidKeys, vapidSubject, store)

    visibilityTracker = new VisibilityTracker()
    sseManager = new SSEManager(30_000, visibilityTracker)

    const socketServer = createSocketServer({
        store,
        jwtSecret,
        corsOrigins,
        getSession: (sessionId) => {
            if (syncEngine) {
                return syncEngine.getSession(sessionId) ?? null
            }
            return store.sessions.getSession(sessionId)
        },
        onWebappEvent: (event: SyncEvent) => syncEngine?.handleRealtimeEvent(event),
        onSessionAlive: (payload) => syncEngine?.handleSessionAlive(payload),
        onSessionEnd: (payload) => syncEngine?.handleSessionEnd(payload),
        onMachineAlive: (payload) => syncEngine?.handleMachineAlive(payload)
    })

    syncEngine = new SyncEngine(store, socketServer.io, socketServer.rpcRegistry, sseManager)

    const notificationChannels: NotificationChannel[] = [
        new PushNotificationChannel(pushService, sseManager, visibilityTracker, config.publicUrl)
    ]

    notificationHub = new NotificationHub(syncEngine, notificationChannels)

    // Start HTTP service
    webServer = await startWebServer({
        getSyncEngine: () => syncEngine,
        getSseManager: () => sseManager,
        getVisibilityTracker: () => visibilityTracker,
        jwtSecret,
        store,
        vapidPublicKey: vapidKeys.publicKey,
        socketEngine: socketServer.engine,
        corsOrigins
    })

    console.log('')
    console.log('[Web] Hub listening on :' + config.listenPort)
    console.log('[Web] Local:  http://localhost:' + config.listenPort)

    console.log('')
    console.log('Zhushen Hub is ready!')

    // Handle shutdown
    const shutdown = async () => {
        console.log('\nShutting down...')
        notificationHub?.stop()
        syncEngine?.stop()
        sseManager?.stop()
        webServer?.stop()
        process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Keep process running
    await new Promise(() => {})
}

main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
})
