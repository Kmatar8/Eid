import { createHash } from "crypto"

import { getCloudflareContext } from "@opennextjs/cloudflare"

import { verifyPassword } from "@/lib/server/password"

const ACCESS_DURATION_MONTHS = 2

type D1RowLike = Record<string, unknown>

type D1ResultLike = {
  success: boolean
}

type D1StatementLike = {
  bind: (...values: unknown[]) => {
    first: <T = D1RowLike>() => Promise<T | null>
    run: () => Promise<D1ResultLike>
  }
}

type D1DatabaseLike = {
  prepare: (sql: string) => D1StatementLike
}

type HostAccessCodeRow = {
  code: string
  password_hash: string
  status: string
  activated_at: number | null
  redeemed_at: number | null
  access_expires_at: number | null
}

export type HostAccessCodeAuthSuccess = {
  ok: true
  code: string
  hostId: string
  passwordHash: string
  activatedAt: number
  accessExpiresAt: number
}

export type HostAccessCodeAuthErrorReason =
  | "DB_UNAVAILABLE"
  | "DB_ERROR"
  | "CREDENTIAL_NOT_FOUND"
  | "INVALID_PASSWORD"
  | "ACCESS_EXPIRED"

type HostAccessCodeAuthError = {
  ok: false
  reason: HostAccessCodeAuthErrorReason
}

export type HostAccessCodeAuthResult = HostAccessCodeAuthSuccess | HostAccessCodeAuthError

function nowMs() {
  return Date.now()
}

function normalizeCode(input: string) {
  return input.trim().toUpperCase()
}

export function deriveHostIdFromCode(codeInput: string) {
  const normalized = normalizeCode(codeInput)
  const digest = createHash("sha256").update(normalized).digest("hex")
  return `host_code_${digest.slice(0, 24)}`
}

function addUtcMonths(fromMs: number, months: number) {
  const from = new Date(fromMs)
  const targetMonth = from.getUTCMonth() + months
  const targetYear = from.getUTCFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const maxDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
  const targetDay = Math.min(from.getUTCDate(), maxDay)

  return Date.UTC(
    targetYear,
    normalizedMonth,
    targetDay,
    from.getUTCHours(),
    from.getUTCMinutes(),
    from.getUTCSeconds(),
    from.getUTCMilliseconds()
  )
}

async function getDatabase(): Promise<D1DatabaseLike | null> {
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

async function markCodeExpired(database: D1DatabaseLike, code: string, at: number) {
  await database
    .prepare("UPDATE host_access_codes SET status = 'expired', updated_at = ? WHERE code = ?")
    .bind(at, code)
    .run()
}

async function activateCode(database: D1DatabaseLike, code: string, activatedAt: number, accessExpiresAt: number) {
  await database
    .prepare(
      "UPDATE host_access_codes SET status = 'redeemed', activated_at = ?, redeemed_at = COALESCE(redeemed_at, ?), access_expires_at = ?, updated_at = ? WHERE code = ?"
    )
    .bind(activatedAt, activatedAt, accessExpiresAt, activatedAt, code)
    .run()
}

export async function authenticateHostAccessCode(
  codeInput: string,
  password: string
): Promise<HostAccessCodeAuthResult> {
  const code = normalizeCode(codeInput)
  if (!code) {
    return { ok: false, reason: "CREDENTIAL_NOT_FOUND" }
  }

  const database = await getDatabase()
  if (!database) {
    return { ok: false, reason: "DB_UNAVAILABLE" }
  }

  try {
    const row = await database
      .prepare(
        "SELECT code, password_hash, status, activated_at, redeemed_at, access_expires_at FROM host_access_codes WHERE code = ? LIMIT 1"
      )
      .bind(code)
      .first<HostAccessCodeRow>()

    if (!row) {
      return { ok: false, reason: "CREDENTIAL_NOT_FOUND" }
    }

    if (!verifyPassword(password, row.password_hash)) {
      return { ok: false, reason: "INVALID_PASSWORD" }
    }

    const now = nowMs()
    if (typeof row.access_expires_at === "number" && now > row.access_expires_at) {
      await markCodeExpired(database, row.code, now)
      return { ok: false, reason: "ACCESS_EXPIRED" }
    }

    let activatedAt = typeof row.activated_at === "number" ? row.activated_at : null
    let accessExpiresAt =
      typeof row.access_expires_at === "number" ? row.access_expires_at : null

    if (activatedAt === null || accessExpiresAt === null) {
      activatedAt = now
      accessExpiresAt = addUtcMonths(activatedAt, ACCESS_DURATION_MONTHS)
      await activateCode(database, row.code, activatedAt, accessExpiresAt)
    } else if (row.status !== "redeemed") {
      await database
        .prepare("UPDATE host_access_codes SET status = 'redeemed', updated_at = ? WHERE code = ?")
        .bind(now, row.code)
        .run()
    }

    return {
      ok: true,
      code: row.code,
      hostId: deriveHostIdFromCode(row.code),
      passwordHash: row.password_hash,
      activatedAt,
      accessExpiresAt,
    }
  } catch {
    return { ok: false, reason: "DB_ERROR" }
  }
}
