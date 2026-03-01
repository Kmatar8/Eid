#!/usr/bin/env node
import { mkdirSync, readdirSync, statSync } from "node:fs"
import { resolve, extname, basename, join } from "node:path"
import sharp from "sharp"

const sourceDirArg = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "public/images/haraj"
const qualityFlag = process.argv.find((arg) => arg.startsWith("--quality="))
const maxWidthFlag = process.argv.find((arg) => arg.startsWith("--max-width="))

const quality = qualityFlag ? Number(qualityFlag.split("=")[1]) : 82
const maxWidth = maxWidthFlag ? Number(maxWidthFlag.split("=")[1]) : 1920
const sourceDir = resolve(process.cwd(), sourceDirArg)

if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
  console.error("Invalid --quality value. Expected 1..100.")
  process.exit(1)
}

if (!Number.isFinite(maxWidth) || maxWidth < 320) {
  console.error("Invalid --max-width value. Expected >= 320.")
  process.exit(1)
}

const supportedInputs = new Set([".jpg", ".jpeg", ".png", ".webp"])
const entries = readdirSync(sourceDir)
const images = entries.filter((name) => supportedInputs.has(extname(name).toLowerCase()))

if (images.length === 0) {
  console.log(`No supported images found in ${sourceDir}`)
  process.exit(0)
}

let converted = 0
let skipped = 0

mkdirSync(sourceDir, { recursive: true })

for (const fileName of images) {
  const inputPath = join(sourceDir, fileName)
  const outputPath = join(sourceDir, `${basename(fileName, extname(fileName))}.webp`)

  const metadata = await sharp(inputPath).metadata()
  const width = metadata.width ?? null
  const resizeWidth = width && width > maxWidth ? maxWidth : null

  const inputStats = statSync(inputPath)
  const outputExists = (() => {
    try {
      statSync(outputPath)
      return true
    } catch {
      return false
    }
  })()

  if (outputExists && outputPath === inputPath) {
    skipped += 1
    continue
  }

  await sharp(inputPath)
    .rotate()
    .resize(resizeWidth ? { width: resizeWidth, withoutEnlargement: true } : undefined)
    .webp({ quality, effort: 4 })
    .toFile(outputPath)

  const outputStats = statSync(outputPath)
  const delta = inputStats.size - outputStats.size
  const ratio = inputStats.size > 0 ? Math.round((delta / inputStats.size) * 100) : 0
  converted += 1
  console.log(
    `${fileName} -> ${basename(outputPath)} | ${Math.round(inputStats.size / 1024)}KB -> ${Math.round(outputStats.size / 1024)}KB (${ratio}% smaller)`
  )
}

console.log(`WebP conversion complete. Converted: ${converted}, skipped: ${skipped}, dir: ${sourceDir}`)
