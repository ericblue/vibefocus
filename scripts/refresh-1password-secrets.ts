#!/usr/bin/env npx tsx
/**
 * Refresh local env files from 1Password.
 *
 * Reads `dev:vibefocus` from 1Password and upserts keys into .env.local
 * and .env.cli based on field label prefixes:
 *   local.KEY  →  .env.local  (strip prefix)
 *   cli.KEY    →  .env.cli    (strip prefix)
 *   KEY        →  .env.local  (no prefix — fallback)
 *
 * Usage:
 *   npx tsx scripts/refresh-1password-secrets.ts
 *   npx tsx scripts/refresh-1password-secrets.ts --dry-run
 *   npx tsx scripts/refresh-1password-secrets.ts --item dev:my-app
 */

import { execFile } from 'node:child_process'
import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

interface Args {
  item: string
  dryRun: boolean
  output?: string
}

interface Summary {
  generatedAt: string
  item: string
  dryRun: boolean
  targets: Array<{
    file: string
    updated: string[]
    added: string[]
  }>
}

function parseArgs(argv: string[]): Args {
  let item = 'dev:vibefocus'
  let dryRun = false
  let output: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--item') {
      item = argv[i + 1]
      i++
    } else if (arg.startsWith('--item=')) {
      item = arg.slice('--item='.length)
    } else if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--output') {
      output = argv[i + 1]
      i++
    } else if (arg.startsWith('--output=')) {
      output = arg.slice('--output='.length)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return { item, dryRun, output }
}

function formatEnvValue(value: string): string {
  if (value === '') return '""'
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value
  const escaped = value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')
  return `"${escaped}"`
}

async function resolveEnvPath(relativePath: string): Promise<string> {
  const workspacePath = resolve(process.cwd(), relativePath)
  try {
    return await realpath(workspacePath)
  } catch {
    return workspacePath
  }
}

async function readOpItem(item: string): Promise<{ local: Record<string, string>; cli: Record<string, string> }> {
  const { stdout } = await execFileAsync('op', ['item', 'get', item, '--format', 'json'], {
    maxBuffer: 10 * 1024 * 1024,
  })

  const parsed = JSON.parse(stdout) as {
    fields?: Array<{ label?: string; value?: string }>
  }

  const local: Record<string, string> = {}
  const cli: Record<string, string> = {}

  for (const field of parsed.fields ?? []) {
    if (!field.label || typeof field.value !== 'string') continue
    if (field.label.startsWith('local.')) {
      local[field.label.slice('local.'.length)] = field.value
    } else if (field.label.startsWith('cli.')) {
      cli[field.label.slice('cli.'.length)] = field.value
    } else {
      // Unprefixed fields fall back to .env.local
      local[field.label] = field.value
    }
  }

  return { local, cli }
}

async function ensureFileExists(path: string): Promise<void> {
  try {
    await access(path)
  } catch {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '', 'utf8')
  }
}

async function upsertEnvFile(
  path: string,
  updates: Record<string, string>,
): Promise<{ updated: string[]; added: string[] }> {
  await ensureFileExists(path)
  const original = await readFile(path, 'utf8')
  const lines = original === '' ? [] : original.split('\n')
  const updated = new Set<string>()
  const added: string[] = []

  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)
    if (!match) return line
    const key = match[1]
    if (!(key in updates)) return line
    updated.add(key)
    return `${key}=${formatEnvValue(updates[key])}`
  })

  for (const [key, value] of Object.entries(updates)) {
    if (updated.has(key)) continue
    added.push(key)
    nextLines.push(`${key}=${formatEnvValue(value)}`)
  }

  const nextText = `${nextLines.join('\n').replace(/\n*$/, '\n')}`
  await writeFile(path, nextText, 'utf8')

  return { updated: Array.from(updated).sort(), added: added.sort() }
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { local: localValues, cli: cliValues } = await readOpItem(args.item)

  const appPath = await resolveEnvPath('.env.local')
  const cliPath = await resolveEnvPath('.env.cli')

  const summary: Summary = {
    generatedAt: new Date().toISOString(),
    item: args.item,
    dryRun: args.dryRun,
    targets: [],
  }

  for (const [path, updates] of [
    [appPath, localValues],
    [cliPath, cliValues],
  ] as const) {
    await ensureFileExists(path)
    const existing = await readFile(path, 'utf8')
    const lines = existing === '' ? [] : existing.split('\n')
    const presentKeys = new Set(
      lines
        .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
        .filter((v): v is string => Boolean(v)),
    )

    const updatedKeys = Object.keys(updates).filter((k) => presentKeys.has(k)).sort()
    const addedKeys = Object.keys(updates).filter((k) => !presentKeys.has(k)).sort()

    summary.targets.push({ file: path, updated: updatedKeys, added: addedKeys })

    if (!args.dryRun && Object.keys(updates).length > 0) {
      await upsertEnvFile(path, updates)
    }
  }

  if (args.output) await writeJson(args.output, summary)

  console.log(`Item: ${args.item}`)
  console.log(`Mode: ${args.dryRun ? 'DRY RUN' : 'LIVE'}`)
  for (const target of summary.targets) {
    console.log(`${target.file}`)
    console.log(`  updated: ${target.updated.join(', ') || '(none)'}`)
    console.log(`  added:   ${target.added.join(', ') || '(none)'}`)
  }
}

main().catch((error) => {
  console.error('Secret refresh failed:', error)
  process.exit(1)
})
