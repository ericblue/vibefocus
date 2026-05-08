#!/usr/bin/env npx tsx
/**
 * Publish local env files to 1Password.
 *
 * Reads .env.local and .env.cli, then creates or upserts a 1Password item
 * named `dev:vibefocus`. Fields are stored with prefixes:
 *   .env.local keys  →  local.KEY
 *   .env.cli keys    →  cli.KEY
 *
 * This matches the routing convention used by refresh-1password-secrets.ts.
 *
 * Usage:
 *   npx tsx scripts/publish-1password-secrets.ts
 *   npx tsx scripts/publish-1password-secrets.ts --dry-run
 *   npx tsx scripts/publish-1password-secrets.ts --item dev:my-app
 */

import { execFile } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Keys that are internal to the shell/OS and should never be published.
const RESERVED_KEYS = new Set(['PWD', 'SHLVL', '_', 'HOME', 'USER', 'SHELL', 'TERM', 'PATH'])

interface Args {
  item: string
  dryRun: boolean
  prune: boolean
  output?: string
}

interface Summary {
  generatedAt: string
  item: string
  dryRun: boolean
  created: boolean
  upserted: string[]
  skipped: string[]
}

function parseArgs(argv: string[]): Args {
  let item = 'dev:vibefocus'
  let dryRun = false
  let prune = false
  let output: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--item') { item = argv[++i] }
    else if (arg.startsWith('--item=')) { item = arg.slice('--item='.length) }
    else if (arg === '--dry-run') { dryRun = true }
    else if (arg === '--prune') { prune = true }
    else if (arg === '--output') { output = argv[++i] }
    else if (arg.startsWith('--output=')) { output = arg.slice('--output='.length) }
    else { throw new Error(`Unknown argument: ${arg}`) }
  }

  return { item, dryRun, prune, output }
}

async function resolveEnvPath(relativePath: string): Promise<string> {
  const p = resolve(process.cwd(), relativePath)
  try { return await realpath(p) } catch { return p }
}

async function parseEnvFile(path: string): Promise<Record<string, string>> {
  let content: string
  try { content = await readFile(path, 'utf8') } catch { return {} }

  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    if (RESERVED_KEYS.has(key)) continue
    let value = trimmed.slice(eq + 1)
    // Strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

async function itemExists(item: string): Promise<boolean> {
  try {
    await execFileAsync('op', ['item', 'get', item, '--format', 'json'], { maxBuffer: 10 * 1024 * 1024 })
    return true
  } catch {
    return false
  }
}

function buildFieldArgs(fields: Record<string, string>): string[] {
  return Object.entries(fields).map(([key, value]) => `${key}[text]=${value}`)
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const appPath = await resolveEnvPath('.env.local')
  const cliPath = await resolveEnvPath('.env.cli')

  const appEnv = await parseEnvFile(appPath)
  const cliEnv = await parseEnvFile(cliPath)

  // Build prefixed field map
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(appEnv)) fields[`local.${k}`] = v
  for (const [k, v] of Object.entries(cliEnv)) fields[`cli.${k}`] = v

  const upserted = Object.keys(fields).sort()

  console.log(`Item: ${args.item}`)
  console.log(`Mode: ${args.dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Fields to publish: ${upserted.length}`)
  for (const key of upserted) console.log(`  ${key}`)

  const summary: Summary = {
    generatedAt: new Date().toISOString(),
    item: args.item,
    dryRun: args.dryRun,
    created: false,
    upserted,
    skipped: [],
  }

  if (!args.dryRun) {
    const exists = await itemExists(args.item)

    if (!exists) {
      console.log(`\nCreating item: ${args.item}`)
      await execFileAsync('op', [
        'item', 'create',
        '--category', 'Secure Note',
        '--title', args.item,
        ...buildFieldArgs(fields),
      ])
      summary.created = true
    } else {
      console.log(`\nUpserting into existing item: ${args.item}`)
      if (upserted.length > 0) {
        await execFileAsync('op', [
          'item', 'edit', args.item,
          ...buildFieldArgs(fields),
        ])
      }
    }

    console.log('Done.')
  }

  if (args.output) await writeJson(args.output, summary)
}

main().catch((error) => {
  console.error('Secret publish failed:', error)
  process.exit(1)
})
