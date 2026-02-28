import { randomBytes } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const countArg = Number.parseInt(process.argv[2] ?? "500", 10)
const outputArg = process.argv[3] ?? "docs/seeds/host-redeem-codes.csv"
const codeLengthArg = Number.parseInt(process.argv[4] ?? "12", 10)
const passwordLengthArg = Number.parseInt(process.argv[5] ?? "12", 10)
const outputJsonArg = process.argv[6] ?? "lib/server/host-credentials.generated.json"

const count = Number.isFinite(countArg) && countArg > 0 ? countArg : 500
const codeLength = Number.isFinite(codeLengthArg) && codeLengthArg >= 8 ? codeLengthArg : 12
const passwordLength = Number.isFinite(passwordLengthArg) && passwordLengthArg >= 8 ? passwordLengthArg : 12
const outputPath = resolve(process.cwd(), outputArg)
const outputJsonPath = resolve(process.cwd(), outputJsonArg)

function randomPart(length) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  while (out.length < length) {
    const random = randomBytes(1)[0] ?? 0
    out += alphabet[random % alphabet.length]
  }
  return out
}

function buildCode() {
  return randomPart(codeLength)
}

function buildPassword() {
  return randomPart(passwordLength)
}

const credentials = []
const usedCodes = new Set()
while (credentials.length < count) {
  const code = buildCode()
  if (usedCodes.has(code)) {
    continue
  }
  usedCodes.add(code)
  credentials.push({ code, password: buildPassword() })
}
credentials.sort((a, b) => a.code.localeCompare(b.code))

const rows = ["code,password"]
for (const credential of credentials) {
  rows.push(`${credential.code},${credential.password}`)
}

const jsonPayload = credentials.map((credential) => ({
  username: credential.code,
  password: credential.password,
}))

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${rows.join("\n")}\n`, "utf8")
mkdirSync(dirname(outputJsonPath), { recursive: true })
writeFileSync(outputJsonPath, `${JSON.stringify(jsonPayload, null, 2)}\n`, "utf8")

console.log(`Generated ${count} host credentials at ${outputPath} and ${outputJsonPath}`)
