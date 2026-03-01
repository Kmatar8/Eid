#!/usr/bin/env node
import { spawn } from "node:child_process"

const attempts = Number(process.env.CF_DEPLOY_MAX_ATTEMPTS ?? 3)
const baseDelayMs = Number(process.env.CF_DEPLOY_RETRY_DELAY_MS ?? 8000)
const cliArgs = process.argv.slice(2)
const wranglerArgs = cliArgs.length > 0 ? cliArgs : ["deploy"]

if (!Number.isFinite(attempts) || attempts < 1) {
  console.error("CF_DEPLOY_MAX_ATTEMPTS must be a positive number.")
  process.exit(1)
}

if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
  console.error("CF_DEPLOY_RETRY_DELAY_MS must be a non-negative number.")
  process.exit(1)
}

function isTransientDeployError(output) {
  const transientPatterns = [
    /malformed response from the API/i,
    /\b502\b.*bad gateway/i,
    /\b503\b.*service unavailable/i,
    /\b504\b.*gateway timeout/i,
    /workers\/scripts\/.+\/deployments -> 5\d\d/i,
    /fetch failed/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /EAI_AGAIN/i,
  ]
  return transientPatterns.some((pattern) => pattern.test(output))
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runWranglerOnce(args) {
  return new Promise((resolve) => {
    const child = spawn("npx", ["wrangler", ...args], {
      stdio: ["inherit", "pipe", "pipe"],
      shell: false,
      env: process.env,
    })

    let combinedOutput = ""
    child.stdout.on("data", (chunk) => {
      const text = String(chunk)
      combinedOutput += text
      process.stdout.write(chunk)
    })
    child.stderr.on("data", (chunk) => {
      const text = String(chunk)
      combinedOutput += text
      process.stderr.write(chunk)
    })

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        output: combinedOutput,
      })
    })
  })
}

async function main() {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(`[deploy-retry] Wrangler attempt ${attempt}/${attempts}: wrangler ${wranglerArgs.join(" ")}`)
    const result = await runWranglerOnce(wranglerArgs)
    if (result.code === 0) {
      console.log("[deploy-retry] Deployment succeeded.")
      process.exit(0)
    }

    const transient = isTransientDeployError(result.output)
    if (!transient || attempt >= attempts) {
      console.error(
        `[deploy-retry] Deployment failed${transient ? " after retries" : " with non-transient error"}.`
      )
      process.exit(result.code || 1)
    }

    const delayMs = baseDelayMs * 2 ** (attempt - 1)
    console.warn(`[deploy-retry] Transient deploy error detected. Retrying in ${Math.round(delayMs / 1000)}s...`)
    await wait(delayMs)
  }
}

await main()
