import { getCloudflareContext } from "@opennextjs/cloudflare"
import type { RuntimeActivitySummary } from "./activity-monitor"

export type ActivitySnapshotRow = {
  id: number
  observed_at: number
  created_at: number
  hosts_with_assignment: number
  hosts_present: number
  hosts_stale: number
  rooms_assigned: number
  rooms_active: number
  rooms_missing: number
  rooms_inactive: number
  controllers_joined: number
  controllers_active: number
  controllers_stale: number
}

type D1ResultLike = {
  success: boolean
}

type D1StatementLike = {
  bind: (...values: unknown[]) => {
    run: () => Promise<D1ResultLike>
    all: <T = unknown>() => Promise<{ results: T[] }>
  }
}

type D1DatabaseLike = {
  prepare: (sql: string) => D1StatementLike
}

export async function getDatabase(): Promise<D1DatabaseLike | null> {
  try {
    const context = await getCloudflareContext({ async: true })
    const env = context?.env as { HROOF_DB?: unknown } | undefined
    const database = env?.HROOF_DB
    if (!database || typeof database !== "object") {
      return null
    }

    const candidate = database as D1DatabaseLike
    if (typeof candidate.prepare !== "function") {
      return null
    }
    return candidate
  } catch {
    return null
  }
}

export async function saveActivitySnapshot(summary: RuntimeActivitySummary): Promise<boolean> {
  const db = await getDatabase()
  if (!db) return false

  try {
    await db
      .prepare(
        `INSERT INTO activity_snapshots (
          observed_at,
          hosts_with_assignment, hosts_present, hosts_stale,
          rooms_assigned, rooms_active, rooms_missing, rooms_inactive,
          controllers_joined, controllers_active, controllers_stale
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        summary.observedAt,
        summary.summary.hosts.withActiveRoomAssignment,
        summary.summary.hosts.present,
        summary.summary.hosts.stale,
        summary.summary.rooms.assigned,
        summary.summary.rooms.active,
        summary.summary.rooms.missing,
        summary.summary.rooms.inactive,
        summary.summary.controllers.joinedInActiveRooms,
        summary.summary.controllers.activeInActiveRooms,
        summary.summary.controllers.staleInActiveRooms
      )
      .run()
    
    return true
  } catch (err) {
    console.error("Failed to save activity snapshot", err)
    return false
  }
}

export async function getActivityHistory(rangeMs: number): Promise<ActivitySnapshotRow[]> {
  const db = await getDatabase()
  if (!db) return []

  const since = Date.now() - rangeMs

  try {
    const { results } = await db
      .prepare(
        `SELECT * FROM activity_snapshots 
         WHERE observed_at >= ? 
         ORDER BY observed_at ASC`
      )
      .bind(since)
      .all<ActivitySnapshotRow>()
      
    return results || []
  } catch (err) {
    console.error("Failed to fetch activity history", err)
    return []
  }
}
