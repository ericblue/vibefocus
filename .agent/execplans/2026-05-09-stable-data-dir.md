# Store Docker data in a stable user-level directory

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository uses `.agent/PLANS.md` as the governing standard for ExecPlans. Keep this document aligned with that contract.

## Purpose / Big Picture

Previously the SQLite database was stored at `./data/vibefocus.db` — a path relative to wherever `docker compose` was run. This tied data to the repo location. Moving the repo, re-cloning it, or running it from an ephemeral Conductor workspace all risked orphaning or duplicating data.

After this change the database lives at `~/.vibefocus/data/vibefocus.db` on the host, independent of the repo. Users can move the repo freely, and the redeploy workflow becomes:

```bash
git pull && make docker-run
```

Docker rebuilds the image from updated local code; the data directory is untouched.

## Progress

- [x] (2026-05-09 19:00Z) Plan written.
- [x] (2026-05-09 19:10Z) `docker-compose.yml` volume updated to `${VIBEFOCUS_DATA:-$HOME/.vibefocus/data}:/app/data`.
- [x] (2026-05-09 19:10Z) `Makefile`: `VIBEFOCUS_DATA` var added, exported, `mkdir -p` guard added to `docker-run`.
- [x] (2026-05-09 19:10Z) `conductor.json` setup script creates data dir on workspace init.
- [x] (2026-05-09 19:10Z) `backend/.env.example` documents `VIBEFOCUS_DATA`.
- [x] (2026-05-09 19:15Z) `README.md`, `INSTALL.md`, `CLAUDE.md` updated.
- [x] (2026-05-09 19:20Z) Committed and PR opened: clyons/vibefocus#8.

## Surprises & Discoveries

- Observation: Docker Compose does not expand `~` in volume paths; must use `$HOME` instead.
  Evidence: `${VIBEFOCUS_DATA:-$HOME/.vibefocus/data}` is the correct form; `~/.vibefocus/data` would fail at compose parse time.

## Decision Log

- Decision: Use `$HOME/.vibefocus/data` as the default data dir rather than a named Docker volume.
  Rationale: A named volume (`vibefocus_data`) is opaque — hard to back up, inspect, or migrate. A host bind mount at a predictable path is transparent, easy to back up with a file copy, and inspectable with any SQLite client.
  Date/Author: 2026-05-09 / Ciaran Lyons

- Decision: Keep `DATABASE_URL=sqlite:///./data/vibefocus.db` unchanged inside the container.
  Rationale: The container always mounts the host data dir to `/app/data`, so the in-container relative path stays stable regardless of the host path. No backend code changes needed.
  Date/Author: 2026-05-09 / Ciaran Lyons

## Outcomes & Retrospective

All milestones completed. The code/data split is now clean:

| Concern | Location |
|---|---|
| Code | Repo (anywhere) |
| Docker data (SQLite) | `~/.vibefocus/data/` (host, stable) |
| Local dev data (SQLite) | `backend/vibefocus.db` (in repo, separate) |

No regressions. The change is additive — `VIBEFOCUS_DATA` can be overridden per-run without touching the repo.

## Context and Orientation

- `docker-compose.yml` — defines the single `vibefocus` service, volumes, and env.
- `Makefile` — `docker-run` target builds and starts the container.
- `conductor.json` — Conductor workspace setup script; runs once on workspace init.
- `backend/.env.example` — template for `backend/.env`; documents all env vars.

## Plan of Work

1. Change the data volume in `docker-compose.yml` from `./data` to `${VIBEFOCUS_DATA:-$HOME/.vibefocus/data}`.
2. Add `VIBEFOCUS_DATA ?= $(HOME)/.vibefocus/data` and export it in `Makefile`; add `mkdir -p` before `docker compose up`.
3. Append `mkdir -p "$VIBEFOCUS_DATA"` to the `conductor.json` setup one-liner.
4. Add `VIBEFOCUS_DATA=~/.vibefocus/data` to `backend/.env.example`.
5. Update `README.md`, `INSTALL.md`, `CLAUDE.md` to document the code/data split and redeploy workflow.

## Concrete Steps

From repository root:

```bash
# No Python or frontend compilation needed — config/docs only.
# Validate compose file parses correctly:
docker compose config
```

## Validation and Acceptance

1. `make docker-run PROJECTS_DIR=~/conductor/repos` succeeds and prints `Data dir: /Users/<you>/.vibefocus/data`.
2. `ls ~/.vibefocus/data/` shows `vibefocus.db` after first run.
3. Stop container, re-clone repo to a different path, run `make docker-run` pointing at same `VIBEFOCUS_DATA` — existing DB rows are present.
4. `VIBEFOCUS_DATA=/tmp/vf-test make docker-run` — data goes to `/tmp/vf-test/`.

## Idempotence and Recovery

- `mkdir -p` is idempotent; safe to re-run.
- `docker compose up -d --build` is idempotent; re-running updates the image and restarts the container without data loss.
- To revert: change the volume line in `docker-compose.yml` back to `./data:/app/data` and remove the `VIBEFOCUS_DATA` lines from `Makefile`.

## Artifacts and Notes

```
[clyons/stable-data-dir b45499e] Store Docker data in ~/.vibefocus/data, separate from the repo
 7 files changed, 24 insertions(+), 15 deletions(-)
```

PR: https://github.com/clyons/vibefocus/pull/8

## Interfaces and Dependencies

- `docker-compose.yml` `volumes[0]`: `${VIBEFOCUS_DATA:-$HOME/.vibefocus/data}:/app/data`
- `Makefile` var: `VIBEFOCUS_DATA ?= $(HOME)/.vibefocus/data`
- `DATABASE_URL` inside container: unchanged (`sqlite:///./data/vibefocus.db` — relative to `/app`)

## Change Log

- 2026-05-09: Created and completed from template.
