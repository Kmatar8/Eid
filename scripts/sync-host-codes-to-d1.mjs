#!/usr/bin/env node
import { pbkdf2Sync, randomBytes } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const DEFAULT_DB_NAME = process.env.D1_DB_NAME ?? "hroof-main-db"
const csvArg = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "docs/seeds/host-redeem-codes.csv"
const runRemote = process.argv.includes("--remote")
const runLocal = process.argv.includes("--local")
const dbNameFlag = process.argv.find((arg) => arg.startsWith("--db="))
const dbName = dbNameFlag ? dbNameFlag.replace("--db=", "") : DEFAULT_DB_NAME

if (runRemote && runLocal) {
  console.error("Use either --remote or --local, not both.")
  process.exit(1)
}

const csvPath = resolve(process.cwd(), csvArg)
const raw = readFileSync(csvPath, "utf8")

function hashPassword(password) {
  const iterations = 100_000
  const keyLength = 32
  const digest = "sha256"
  const salt = randomBytes(16).toString("hex")
  const derived = pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("hex")
  return `pbkdf2$${iterations}$${salt}$${derived}`
}

function parseCsv(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return []
  }

  const header = lines[0].split(",").map((part) => part.trim().toLowerCase())
  const codeIndex = header.indexOf("code")
  const passwordIndex = header.indexOf("password")
  if (codeIndex < 0 || passwordIndex < 0) {
    throw new Error("CSV header must include code,password")
  }

  const rows = []
  for (let index = 1; index < lines.length; index += 1) {
    const values = lines[index].split(",").map((value) => value.trim())
    const code = (values[codeIndex] ?? "").toUpperCase()
    const password = values[passwordIndex] ?? ""
    if (!code || !password) {
      continue
    }
    if (!/^[A-Z0-9]+$/.test(code) || !/^[A-Z0-9]+$/.test(password)) {
      throw new Error(`Invalid code/password format at CSV row ${index + 1}. Only A-Z and 0-9 are allowed.`)
    }
    rows.push({ code, password })
  }
  return rows
}

const credentials = parseCsv(raw)
if (credentials.length === 0) {
  console.error("No credentials parsed from CSV.")
  process.exit(1)
}

const now = Date.now()
const statements = [
  "CREATE TABLE IF NOT EXISTS host_access_codes (code TEXT PRIMARY KEY, password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', activated_at INTEGER, redeemed_at INTEGER, access_expires_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);",
  "DELETE FROM host_access_codes WHERE activated_at IS NULL AND (status = 'active' OR status = 'expired' OR status IS NULL);",
]

for (const credential of credentials) {
  const passwordHash = hashPassword(credential.password)
  statements.push(
    `INSERT INTO host_access_codes (code, password_hash, status, activated_at, redeemed_at, access_expires_at, created_at, updated_at) VALUES ('${credential.code}', '${passwordHash}', 'active', NULL, NULL, NULL, ${now}, ${now}) ON CONFLICT(code) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at;`
  )
}

const sql = `${statements.join("\n")}\n`

const tempDir = mkdtempSync(join(tmpdir(), "hroof-host-codes-"))
const sqlFilePath = join(tempDir, "sync-host-codes.sql")
writeFileSync(sqlFilePath, sql, "utf8")

const commandArgs = ["d1", "execute", dbName]
if (runRemote) {
  commandArgs.push("--remote")
}
if (runLocal) {
  commandArgs.push("--local")
}
commandArgs.push("--file", sqlFilePath)

console.log(`Syncing ${credentials.length} credentials to D1 database "${dbName}" (${runRemote ? "remote" : runLocal ? "local" : "default target"})`)
const result = spawnSync("wrangler", commandArgs, { stdio: "inherit" })

rmSync(tempDir, { recursive: true, force: true })

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

console.log("Host credential sync completed.")
