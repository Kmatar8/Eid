import { randomBytes } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const countArg = Number.parseInt(process.argv[2] ?? "500", 10)
const outputArg = process.argv[3] ?? "docs/seeds/host-redeem-codes.csv"
const codeLengthArg = Number.parseInt(process.argv[4] ?? "12", 10)
const outputJsonArg = process.argv[5] ?? "lib/server/redeem-codes.generated.json"

const count = Number.isFinite(countArg) && countArg > 0 ? countArg : 500
const codeLength = Number.isFinite(codeLengthArg) && codeLengthArg >= 8 ? codeLengthArg : 12
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

const uniqueCodes = new Set()
while (uniqueCodes.size < count) {
  uniqueCodes.add(buildCode())
}

const rows = ["code"]
const sortedCodes = Array.from(uniqueCodes).sort()
sortedCodes.forEach((code) => {
  rows.push(code)
})

const jsonPayload = sortedCodes.map((code) => ({ code }))

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${rows.join("\n")}\n`, "utf8")
mkdirSync(dirname(outputJsonPath), { recursive: true })
writeFileSync(outputJsonPath, `${JSON.stringify(jsonPayload, null, 2)}\n`, "utf8")

console.log(`Generated ${count} redeem codes at ${outputPath} and ${outputJsonPath}`)
