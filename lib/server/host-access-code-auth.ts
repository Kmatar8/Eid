import { createHash, randomUUID } from "crypto"

import { getCloudflareContext } from "@opennextjs/cloudflare"

import { hashPassword, verifyPassword } from "@/lib/server/password"

const HOST_ACCESS_DURATION_MS = 1000 * 60 * 60 * 24 * 60

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
  active_session_id: string | null
}

export type HostAccessCodeAuthSuccess = {
  ok: true
  code: string
  hostId: string
  activatedAt: number
  accessExpiresAt: number
  sessionId: string
}

export type HostAccessCodeSessionValidationSuccess = {
  ok: true
  code: string
  hostId: string
  accessExpiresAt: number
}

export type HostAccessCodeAuthErrorReason =
  | "DB_UNAVAILABLE"
  | "DB_ERROR"
  | "CREDENTIAL_NOT_FOUND"
  | "INVALID_PASSWORD"
  | "ACCESS_EXPIRED"
  | "NOT_ACTIVATED"
  | "ALREADY_ACTIVATED"
  | "SESSION_REVOKED"

type HostAccessCodeAuthError = {
  ok: false
  reason: HostAccessCodeAuthErrorReason
}

export type HostAccessCodeAuthResult = HostAccessCodeAuthSuccess | HostAccessCodeAuthError

export type HostAccessCodeSessionValidationResult =
  | HostAccessCodeSessionValidationSuccess
  | HostAccessCodeAuthError

function nowMs() {
  return Date.now()
}

function normalizeCode(input: string) {
  return input.trim().toUpperCase()
}

function normalizeSessionId(input: string) {
  return input.trim()
}

function resolveAccessExpiryFromActivation(activatedAt: number) {
  return activatedAt + HOST_ACCESS_DURATION_MS
}

export function deriveHostIdFromCode(codeInput: string) {
  const normalized = normalizeCode(codeInput)
  const digest = createHash("sha256").update(normalized).digest("hex")
  return `host_code_${digest.slice(0, 24)}`
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

async function readAccessCodeRow(
  database: D1DatabaseLike,
  code: string
): Promise<HostAccessCodeRow | null> {
  return database
    .prepare(
      "SELECT code, password_hash, status, activated_at, redeemed_at, access_expires_at, active_session_id FROM host_access_codes WHERE code = ? LIMIT 1"
    )
    .bind(code)
    .first<HostAccessCodeRow>()
}

async function markCodeExpired(database: D1DatabaseLike, code: string, at: number) {
  await database
    .prepare("UPDATE host_access_codes SET status = 'expired', active_session_id = NULL, updated_at = ? WHERE code = ?")
    .bind(at, code)
    .run()
}

async function rotateActiveSession(database: D1DatabaseLike, code: string, at: number) {
  const sessionId = randomUUID()
  await database
    .prepare("UPDATE host_access_codes SET active_session_id = ?, updated_at = ? WHERE code = ?")
    .bind(sessionId, at, code)
    .run()
  return sessionId
}

function parseActivatedAt(row: HostAccessCodeRow) {
  return typeof row.activated_at === "number" ? row.activated_at : null
}

function parseAccessExpiresAt(row: HostAccessCodeRow) {
  return typeof row.access_expires_at === "number" ? row.access_expires_at : null
}

function isAccessExpired(accessExpiresAt: number, at: number) {
  return at > accessExpiresAt
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
    const row = await readAccessCodeRow(database, code)
    if (!row) {
      return { ok: false, reason: "CREDENTIAL_NOT_FOUND" }
    }

    const now = nowMs()
    const activatedAt = parseActivatedAt(row)
    const accessExpiresAt = parseAccessExpiresAt(row)

    if (activatedAt === null || accessExpiresAt === null) {
      return { ok: false, reason: "NOT_ACTIVATED" }
    }

    if (isAccessExpired(accessExpiresAt, now)) {
      await markCodeExpired(database, row.code, now)
      return { ok: false, reason: "ACCESS_EXPIRED" }
    }

    if (!verifyPassword(password, row.password_hash)) {
      return { ok: false, reason: "INVALID_PASSWORD" }
    }

    if (row.status !== "redeemed") {
      await database
        .prepare("UPDATE host_access_codes SET status = 'redeemed', updated_at = ? WHERE code = ?")
        .bind(now, row.code)
        .run()
    }

    const sessionId = await rotateActiveSession(database, row.code, now)
    return {
      ok: true,
      code: row.code,
      hostId: deriveHostIdFromCode(row.code),
      activatedAt,
      accessExpiresAt,
      sessionId,
    }
  } catch {
    return { ok: false, reason: "DB_ERROR" }
  }
}

export async function activateHostAccessCode(
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
    const row = await readAccessCodeRow(database, code)
    if (!row) {
      return { ok: false, reason: "CREDENTIAL_NOT_FOUND" }
    }

    const now = nowMs()
    const activatedAt = parseActivatedAt(row)
    const accessExpiresAt = parseAccessExpiresAt(row)

    if (activatedAt !== null && accessExpiresAt !== null) {
      if (isAccessExpired(accessExpiresAt, now)) {
        await markCodeExpired(database, row.code, now)
        return { ok: false, reason: "ACCESS_EXPIRED" }
      }
      return { ok: false, reason: "ALREADY_ACTIVATED" }
    }

    const nextActivatedAt = now
    const nextAccessExpiresAt = resolveAccessExpiryFromActivation(nextActivatedAt)
    const sessionId = randomUUID()
    const passwordHash = hashPassword(password)

    await database
      .prepare(
        "UPDATE host_access_codes SET password_hash = ?, status = 'redeemed', activated_at = ?, redeemed_at = COALESCE(redeemed_at, ?), access_expires_at = ?, active_session_id = ?, updated_at = ? WHERE code = ?"
      )
      .bind(passwordHash, nextActivatedAt, nextActivatedAt, nextAccessExpiresAt, sessionId, now, row.code)
      .run()

    return {
      ok: true,
      code: row.code,
      hostId: deriveHostIdFromCode(row.code),
      activatedAt: nextActivatedAt,
      accessExpiresAt: nextAccessExpiresAt,
      sessionId,
    }
  } catch {
    return { ok: false, reason: "DB_ERROR" }
  }
}

export async function validateHostAccessCodeSession(
  codeInput: string,
  sessionIdInput: string
): Promise<HostAccessCodeSessionValidationResult> {
  const code = normalizeCode(codeInput)
  const sessionId = normalizeSessionId(sessionIdInput)
  if (!code || !sessionId) {
    return { ok: false, reason: "SESSION_REVOKED" }
  }

  const database = await getDatabase()
  if (!database) {
    return { ok: false, reason: "DB_UNAVAILABLE" }
  }

  try {
    const row = await readAccessCodeRow(database, code)
    if (!row) {
      return { ok: false, reason: "CREDENTIAL_NOT_FOUND" }
    }

    const now = nowMs()
    const activatedAt = parseActivatedAt(row)
    const accessExpiresAt = parseAccessExpiresAt(row)
    if (activatedAt === null || accessExpiresAt === null) {
      return { ok: false, reason: "NOT_ACTIVATED" }
    }

    if (isAccessExpired(accessExpiresAt, now)) {
      await markCodeExpired(database, row.code, now)
      return { ok: false, reason: "ACCESS_EXPIRED" }
    }

    if (row.active_session_id !== sessionId) {
      return { ok: false, reason: "SESSION_REVOKED" }
    }

    return {
      ok: true,
      code: row.code,
      hostId: deriveHostIdFromCode(row.code),
      accessExpiresAt,
    }
  } catch {
    return { ok: false, reason: "DB_ERROR" }
  }
}
