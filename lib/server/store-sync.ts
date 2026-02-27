import { getCloudflareContext } from "@opennextjs/cloudflare"

import { exportStoreSnapshot, importStoreSnapshot } from "@/lib/server/store"

const GLOBAL_STORE_DO_NAME = "hroof-global-store-v1"
const STORE_STATE_URL = "https://hroof-store/state"

type DurableObjectNamespaceLike = {
  idFromName: (name: string) => unknown
  get: (id: unknown) => {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  }
}

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
  const stub = await getSharedStoreStub()
  if (!stub) {
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

    importStoreSnapshot(payload.snapshot)
  } catch {
    // Intentionally non-fatal in local/dev runtimes without DO context.
  }
}

export async function persistSharedStoreToDurable() {
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
  } catch {
    // Intentionally non-fatal in local/dev runtimes without DO context.
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
