import { getCloudflareContext } from "@opennextjs/cloudflare"

import { exportStoreSnapshot, getStoreRevision, importStoreSnapshot } from "@/lib/server/store"

const GLOBAL_STORE_DO_NAME = "hroof-global-store-v1"
const STORE_STATE_URL = "https://hroof-store/state"
const HYDRATE_TTL_MS = 350

type DurableObjectNamespaceLike = {
  idFromName: (name: string) => unknown
  get: (id: unknown) => {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  }
}

let lastHydratedAt = 0
let lastPersistedRevision = -1
let hydrateInFlight: Promise<void> | null = null
let persistInFlight: Promise<void> | null = null

async function getSharedStoreStub() {
  try {
    const context = await getCloudflareContext({ async: true })
    const namespace = (context?.env as unknown as { ROOMS_DO?: unknown } | undefined)?.ROOMS_DO as
      | DurableObjectNamespaceLike
      | undefined

    if (!namespace) {
      return null
    }

    const id = namespace.idFromName(GLOBAL_STORE_DO_NAME)
    return namespace.get(id)
  } catch {
    return null
  }
}

export async function hydrateSharedStoreFromDurable() {
  if (Date.now() - lastHydratedAt < HYDRATE_TTL_MS) {
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
      const response = await stub.fetch(STORE_STATE_URL)
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
      await stub.fetch(STORE_STATE_URL, {
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

export async function withSharedStore<T>(operation: () => Promise<T>): Promise<T> {
  await hydrateSharedStoreFromDurable()

  try {
    return await operation()
  } finally {
    await persistSharedStoreToDurable()
  }
}
