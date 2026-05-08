# 1Password Env Sync Template

Use this pattern when you want 1Password to be the source of truth for developer secrets, while local `.env` files remain the zero-friction working copy.

This design supports two flows in a fresh repo:

1. `publish`: create `dev:<repo-name>` in 1Password from local env files if it does not already exist, or update it if it does.
2. `refresh`: create or update the repo's symlinked `.env.local` and `.env.cli` from the 1Password item on demand.

## Goals

- Keep normal local development free of repeated `op` prompts.
- Preserve a single synced source of truth in 1Password.
- Work with shared symlinked env files across worktrees.
- Never overwrite `.env.local` wholesale.
- Be repo-agnostic: no hardcoded allowlists of app-specific keys.

## Naming Convention

- 1Password item name: `dev:<repo-name>`
- Examples:
  - `dev:mental-fitness-coaching`
  - `dev:my-next-app`

`<repo-name>` should default to the basename of the git repo root, with a CLI override.

## File Model

Use two local env files:

- `.env.local`
  - Runtime and app-facing configuration.
- `.env.cli`
  - CLI-only and admin credentials.

If either file is a symlink, resolve and edit the real target.

## Core Rule

Do not replace `.env.local` or `.env.cli` with whole-file writes.

Always:

- update an existing key in place, or
- append a missing key to the end of the file.

This preserves unrelated keys, comments, ordering, and shared worktree secrets.

## Required Scripts

Add two scripts:

- `scripts/publish-1password-secrets.ts`
- `scripts/refresh-1password-secrets.ts`

Suggested `package.json` entries:

```json
{
  "scripts": {
    "secrets:publish": "tsx scripts/publish-1password-secrets.ts",
    "secrets:refresh": "tsx scripts/refresh-1password-secrets.ts"
  }
}
```

## `publish` Behavior

Command:

```bash
npm run secrets:publish
npm run secrets:publish -- --dry-run
```

Expected behavior:

1. Resolve `.env.local` and `.env.cli` symlink targets.
2. Parse both env files if present.
3. Merge keys into one map.
4. Ignore blank lines and comments.
5. Ignore internal reserved keys such as:
   - `PWD`
   - `SHLVL`
   - `_`
6. Check whether `op item get "dev:<repo-name>" --format json` exists.
7. If the item does not exist:
   - create it from the merged env map.
8. If the item exists:
   - upsert keys from the merged env map into the existing item.
9. Do not delete unknown existing fields from the 1Password item unless an explicit `--prune` mode is requested.
10. Write a JSON report to `.context/`.

Recommended flags:

- `--item <name>`
- `--env-file <path>` repeatable
- `--dry-run`
- `--prune`
- `--output <path>`

## `refresh` Behavior

Command:

```bash
npm run secrets:refresh
npm run secrets:refresh -- --dry-run
```

Expected behavior:

1. Read `dev:<repo-name>` from 1Password.
2. Convert item fields into key/value env pairs.
3. Split fields between `.env.local` and `.env.cli`.
4. Resolve symlink targets for those files.
5. For each key:
   - replace the line if it already exists
   - append the line if it does not
6. Preserve unrelated keys and comments.
7. Create missing target files if needed.
8. Write a JSON report to `.context/`.

Recommended flags:

- `--item <name>`
- `--env-local <path>`
- `--env-cli <path>`
- `--dry-run`
- `--output <path>`

## Generic Field Routing

Do not use per-repo allowlists.

Instead, use one of these generic routing strategies:

### Preferred: explicit item sections

Store fields in 1Password with a section or prefix that indicates destination:

- `local.DATABASE_URL`
- `local.NEXT_PUBLIC_APP_URL`
- `cli.SUPABASE_ACCESS_TOKEN`
- `cli.POSTHOG_PERSONAL_API_KEY`

Routing rule:

- keys prefixed with `local.` go to `.env.local`
- keys prefixed with `cli.` go to `.env.cli`
- strip the prefix before writing

This is the cleanest option for mixed repos.

### Fallback: default to `.env.local`

If you do not want prefixes:

- write all fields to `.env.local` by default
- send only obvious admin keys to `.env.cli` using generic suffix heuristics such as:
  - `_TOKEN`
  - `_PAT`
  - `_PERSONAL_API_KEY`

This is less precise and should only be used when item structure cannot be changed.

## 1Password Item Shape

Preferred item structure:

- Title: `dev:<repo-name>`
- Vault: your normal development vault
- Fields:
  - `local.*` fields for app/runtime values
  - `cli.*` fields for CLI/admin values

Example:

```text
local.DATABASE_URL=postgresql://...
local.NEXT_PUBLIC_APP_URL=http://localhost:3000
local.OPENAI_API_KEY=...
cli.SUPABASE_ACCESS_TOKEN=...
cli.POSTHOG_PERSONAL_API_KEY=...
```

## Parsing Rules

Your env parser should:

- support `KEY=value`
- preserve quoted values
- preserve embedded `=` in values
- ignore comments and blank lines
- trim surrounding whitespace around keys

Your formatter should:

- emit `KEY=value` when safe
- quote values containing spaces, `#`, or newlines
- escape embedded quotes when quoting

## Safety Rules

- Never overwrite `.env.local` using heredoc, redirect, or full-file write.
- Never delete unrelated existing lines from env files.
- Never assume the worktree file is the real file; resolve symlinks first.
- Fail clearly if `op` is not installed or not authenticated.
- Support `--dry-run` for both directions.
- Record what changed in `.context/` artifacts.

## Suggested Reports

Each run should emit JSON with:

- `item`
- `mode`
- `envFiles`
- `created`
- `updated`
- `skipped`
- `missing`
- `warnings`
- `timestamp`

Suggested filenames:

- `.context/secrets-publish-dry-run.json`
- `.context/secrets-publish-live.json`
- `.context/secrets-refresh-dry-run.json`
- `.context/secrets-refresh-live.json`

## Fresh Repo Bootstrap

For a brand new repo:

1. Create `.env.local` with working secrets.
2. Optionally create `.env.cli` for admin-only credentials.
3. Run `npm run secrets:publish`.
4. This creates `dev:<repo-name>` in 1Password if it is missing.
5. On another machine or fresh clone, run `npm run secrets:refresh`.
6. That reconstructs the local env files from 1Password.

## Recommended README Snippet

```md
## Secrets

This repo uses 1Password as the source of truth for developer secrets.

- Push local env files into 1Password:
  - `npm run secrets:publish`
- Refresh local env files from 1Password:
  - `npm run secrets:refresh`

The 1Password item name defaults to `dev:<repo-name>`.

Both commands support `--dry-run`.

`.env.local` and `.env.cli` are updated in place. Existing unrelated keys are preserved.
```

## Notes

- This pattern is optimized for local development, not CI.
- For CI or non-interactive automation, prefer a service account or another non-interactive secret source.
- If you want zero friction during normal development, run `secrets:refresh` once and let the app use local env files afterward instead of calling `op` for every command.
