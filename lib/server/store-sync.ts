import { getCloudflareContext } from "@opennextjs/cloudflare"

import {
  exportRoomShardSnapshot,
  exportStoreSnapshot,
  getRoom,
  getStoreRevision,
  importRoomShardSnapshot,
  importStoreSnapshot,
} from "@/lib/server/store"

const GLOBAL_STORE_DO_NAME = "hroof-global-store-v1"
const ROOM_STORE_DO_PREFIX = "hroof-room-store-v1:"
const STORE_STATE_URL = "https://hroof-store/state"
const GLOBAL_HYDRATE_TTL_MS = 350
const ROOM_SCOPED_STORE_FLAG = "HROOF_ROOM_SCOPED_DO_STORE"
const DEFAULT_ROOM_HYDRATE_TTL_MS = 250
const DEFAULT_STORE_FETCH_TIMEOUT_MS = 450
const DEFAULT_STORE_NAMESPACE_CACHE_TTL_MS = 5000

type DurableObjectNamespaceLike = {
  idFromName: (name: string) => unknown
  get: (id: unknown) => {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  }
}

type RoomShardPersistSnapshot = {
  room?: {
    version?: number
    state?: string
  } | null
}

let lastHydratedAt = 0
let lastPersistedRevision = -1
let hydrateInFlight: Promise<void> | null = null
let persistInFlight: Promise<void> | null = null
let cachedRoomsNamespace: DurableObjectNamespaceLike | null | undefined
let cachedRoomsNamespaceAt = 0

type ScopeSyncState = {
  lastHydratedAt: number
  lastPersistedRevision: number
  hydrateInFlight: Promise<void> | null
  persistInFlight: Promise<void> | null
}

const roomScopeSyncByRoomId = new Map<string, ScopeSyncState>()

type HydrateRoomShardOptions = {
  force?: boolean
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function getRoomHydrateTtlMs() {
  return parsePositiveInt(process.env.HROOF_ROOM_HYDRATE_TTL_MS, DEFAULT_ROOM_HYDRATE_TTL_MS)
}

function getStoreFetchTimeoutMs() {
  return parsePositiveInt(process.env.HROOF_STORE_SYNC_FETCH_TIMEOUT_MS, DEFAULT_STORE_FETCH_TIMEOUT_MS)
}

function getStoreNamespaceCacheTtlMs() {
  return parsePositiveInt(process.env.HROOF_STORE_SYNC_NAMESPACE_CACHE_TTL_MS, DEFAULT_STORE_NAMESPACE_CACHE_TTL_MS)
}

async function fetchWithTimeout(
  stub: { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> },
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const controller = new AbortController()
  const timeoutMs = getStoreFetchTimeoutMs()
  let timer: ReturnType<typeof setTimeout> | null = null

  try {
    const fetchPromise = stub.fetch(input, {
      ...(init ?? {}),
      signal: controller.signal,
    })

    const timeoutPromise = new Promise<Response>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error("STORE_SYNC_TIMEOUT"))
      }, timeoutMs)
    })

    return await Promise.race([fetchPromise, timeoutPromise])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function getRoomsNamespace() {
  const now = Date.now()
  if (
    cachedRoomsNamespace !== undefined &&
    now - cachedRoomsNamespaceAt < getStoreNamespaceCacheTtlMs()
  ) {
    return cachedRoomsNamespace
  }

  try {
    const context = await getCloudflareContext({ async: true })
    const namespace = (context?.env as unknown as { ROOMS_DO?: unknown } | undefined)?.ROOMS_DO as
      | DurableObjectNamespaceLike
      | undefined
    cachedRoomsNamespace = namespace ?? null
    cachedRoomsNamespaceAt = now
    return cachedRoomsNamespace
  } catch {
    cachedRoomsNamespace = null
    cachedRoomsNamespaceAt = now
    return null
  }
}

function getRoomScopeSyncState(roomId: string): ScopeSyncState {
  const existing = roomScopeSyncByRoomId.get(roomId)
  if (existing) {
    return existing
  }

  const created: ScopeSyncState = {
    lastHydratedAt: 0,
    lastPersistedRevision: -1,
    hydrateInFlight: null,
    persistInFlight: null,
  }
  roomScopeSyncByRoomId.set(roomId, created)
  return created
}

function isTruthyFlag(value: string | undefined) {
  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on"
}

export function isRoomScopedStoreEnabled() {
  return isTruthyFlag(process.env[ROOM_SCOPED_STORE_FLAG])
}

async function getStoreStubByName(storeName: string) {
  try {
    const namespace = await getRoomsNamespace()
    if (!namespace) {
      return null
    }
    const id = namespace.idFromName(storeName)
    return namespace.get(id)
  } catch {
    return null
  }
}

async function getSharedStoreStub() {
  return getStoreStubByName(GLOBAL_STORE_DO_NAME)
}

async function getRoomStoreStub(roomId: string) {
  return getStoreStubByName(`${ROOM_STORE_DO_PREFIX}${roomId}`)
}

export async function hydrateSharedStoreFromDurable() {
  if (Date.now() - lastHydratedAt < GLOBAL_HYDRATE_TTL_MS) {
    return
  }

  if (hydrateInFlight) {
    await hydrateInFlight
    return
  }

  hydrateInFlight = (async () => {
    const stub = await getSharedStoreStub()
    if (!stub) {
      lastHydratedAt = Date.now()
      return
    }

    try {
      const response = await fetchWithTimeout(stub, STORE_STATE_URL)
      if (!response.ok) {
        return
      }

      const payload = (await response.json().catch(() => null)) as { snapshot?: unknown } | null
      if (!payload || payload.snapshot === undefined) {
        return
      }

      if (importStoreSnapshot(payload.snapshot)) {
        lastPersistedRevision = getStoreRevision()
      }
    } catch {
      // Intentionally non-fatal in local/dev runtimes without DO context.
    } finally {
      lastHydratedAt = Date.now()
    }
  })()

  try {
    await hydrateInFlight
  } finally {
    hydrateInFlight = null
  }
}

export async function persistSharedStoreToDurable() {
  const currentRevision = getStoreRevision()
  if (currentRevision === lastPersistedRevision) {
    return
  }

  if (persistInFlight) {
    await persistInFlight
    return
  }

  persistInFlight = (async () => {
    const stub = await getSharedStoreStub()
    if (!stub) {
      return
    }

    try {
      await fetchWithTimeout(stub, STORE_STATE_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          snapshot: exportStoreSnapshot(),
          updatedAt: Date.now(),
        }),
      })
      lastPersistedRevision = currentRevision
      lastHydratedAt = Date.now()
    } catch {
      // Intentionally non-fatal in local/dev runtimes without DO context.
    }
  })()

  try {
    await persistInFlight
  } finally {
    persistInFlight = null
  }
}

export async function hydrateRoomShardFromDurable(roomId: string, options: HydrateRoomShardOptions = {}) {
  if (!roomId) {
    return
  }

  const syncState = getRoomScopeSyncState(roomId)
  if (!options.force && Date.now() - syncState.lastHydratedAt < getRoomHydrateTtlMs()) {
    return
  }

  if (syncState.hydrateInFlight) {
    await syncState.hydrateInFlight
    if (!options.force) {
      return
    }
  }

  syncState.hydrateInFlight = (async () => {
    const stub = await getRoomStoreStub(roomId)
    if (!stub) {
      syncState.lastHydratedAt = Date.now()
      return
    }

    try {
      const response = await fetchWithTimeout(stub, STORE_STATE_URL)
      if (!response.ok) {
        return
      }

      const payload = (await response.json().catch(() => null)) as { snapshot?: unknown } | null
      if (!payload || payload.snapshot === undefined) {
        return
      }

      if (importRoomShardSnapshot(roomId, payload.snapshot)) {
        syncState.lastPersistedRevision = getStoreRevision()
      }
    } catch {
      // Intentionally non-fatal in runtimes where room-scoped snapshot is unavailable.
    } finally {
      syncState.lastHydratedAt = Date.now()
    }
  })()

  try {
    await syncState.hydrateInFlight
  } finally {
    syncState.hydrateInFlight = null
  }
}

export async function retryWithFreshRoomShard<T>(
  roomId: string,
  read: () => Promise<T> | T,
  shouldRetry: (value: T) => boolean
): Promise<T> {
  const firstResult = await read()
  if (!roomId || !isRoomScopedStoreEnabled() || !shouldRetry(firstResult)) {
    return firstResult
  }

  await hydrateRoomShardFromDurable(roomId, { force: true })
  return await read()
}

export async function persistRoomShardToDurable(roomId: string) {
  if (!roomId) {
    return
  }

  const syncState = getRoomScopeSyncState(roomId)
  while (true) {
    const currentRevision = getStoreRevision()
    if (currentRevision === syncState.lastPersistedRevision) {
      return
    }

    if (syncState.persistInFlight) {
      await syncState.persistInFlight
      continue
    }

    syncState.persistInFlight = (async () => {
      const snapshot = exportRoomShardSnapshot(roomId)
      if (!snapshot) {
        syncState.lastPersistedRevision = currentRevision
        return
      }

      const stub = await getRoomStoreStub(roomId)
      if (!stub) {
        return
      }

      try {
        const response = await fetchWithTimeout(stub, STORE_STATE_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            snapshot,
            updatedAt: Date.now(),
          }),
        })
        if (!response.ok) {
          return
        }

        const payload = (await response.json().catch(() => null)) as { snapshot?: unknown } | null
        if (payload && payload.snapshot !== undefined) {
          importRoomShardSnapshot(roomId, payload.snapshot)
        }
        const parsedSnapshot = snapshot as RoomShardPersistSnapshot
        const roomVersion =
          parsedSnapshot?.room && typeof parsedSnapshot.room.version === "number"
            ? parsedSnapshot.room.version
            : undefined
        const roomState =
          parsedSnapshot?.room && typeof parsedSnapshot.room.state === "string" ? parsedSnapshot.room.state : undefined

        // Best-effort DO event publish for cross-instance realtime fanout consumers.
        void stub
          .fetch("https://hroof-store/publish", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              type: "room.state.delta",
              payload: {
                roomId,
                revision: currentRevision,
                roomVersion,
                roomState,
              },
            }),
          })
          .catch(() => undefined)
        syncState.lastPersistedRevision = currentRevision
        // Force the next room-scoped read to rehydrate from the DO so a process
        // that just wrote one branch of a concurrent merge does not keep serving
        // a partial local room view for the hydrate TTL window.
        syncState.lastHydratedAt = 0
      } catch {
        // Intentionally non-fatal in runtimes where room-scoped snapshot is unavailable.
      }
    })()

    try {
      await syncState.persistInFlight
    } finally {
      syncState.persistInFlight = null
    }
  }
}

export async function withSharedStore<T>(operation: () => Promise<T>): Promise<T> {
  await hydrateSharedStoreFromDurable()

  try {
    return await operation()
  } finally {
    await persistSharedStoreToDurable()
  }
}

async function withRoomStoreInternal<T>(roomId: string, operation: () => Promise<T>, syncGlobalStore: boolean): Promise<T> {
  if (!roomId || !isRoomScopedStoreEnabled()) {
    return withSharedStore(operation)
  }

  if (syncGlobalStore) {
    await hydrateSharedStoreFromDurable()
  }
  await hydrateRoomShardFromDurable(roomId)
  // Room creation currently starts in shared-store scope. If this process misses
  // the room shard on first read, hydrate shared state as a fallback to avoid
  // transient ROOM_NOT_FOUND responses during join/bootstrap.
  if (!syncGlobalStore && !getRoom(roomId)) {
    await hydrateSharedStoreFromDurable()
  }

  try {
    return await operation()
  } finally {
    await persistRoomShardToDurable(roomId)
    if (syncGlobalStore) {
      await persistSharedStoreToDurable()
    }
  }
}

export async function withRoomScopedStore<T>(roomId: string, operation: () => Promise<T>): Promise<T> {
  return withRoomStoreInternal(roomId, operation, true)
}

export async function withRoomShardStore<T>(roomId: string, operation: () => Promise<T>): Promise<T> {
  return withRoomStoreInternal(roomId, operation, false)
}
