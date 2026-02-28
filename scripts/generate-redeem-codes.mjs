import { randomBytes } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const countArg = Number.parseInt(process.argv[2] ?? "500", 10)
const outputArg = process.argv[3] ?? "docs/seeds/host-redeem-codes.csv"
const codeLengthArg = Number.parseInt(process.argv[4] ?? "12", 10)

const count = Number.isFinite(countArg) && countArg > 0 ? countArg : 500
const codeLength = Number.isFinite(codeLengthArg) && codeLengthArg >= 8 ? codeLengthArg : 12
const outputPath = resolve(process.cwd(), outputArg)

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
Array.from(uniqueCodes).forEach((code) => {
  rows.push(code)
})

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${rows.join("\n")}\n`, "utf8")

console.log(`Generated ${count} redeem codes at ${outputPath}`)
