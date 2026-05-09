# Re-scan Local Repos Button

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

## Purpose / Big Picture

Users can now click **Re-scan** in Settings to pick up newly added local git repositories without running `make import-projects` in a terminal. The scan path is editable, so users can override `PROJECTS_DIR` on the fly.

## Progress

- [x] (2026-05-09) Initial planning completed.
- [x] (2026-05-09) `scan_repos()` extracted from `import_local_projects.py`.
- [x] (2026-05-09) `PROJECTS_DIR` added to `Settings` in `database.py`.
- [x] (2026-05-09) `GET /api/data/scan-config` and `POST /api/data/scan` added to `data.py`.
- [x] (2026-05-09) `ScanSection` component added to `SettingsView.tsx`.
- [ ] Validation complete.

## Surprises & Discoveries

- Observation: `PROJECTS_DIR` was only a Makefile variable; it was never read by the Python backend.
  Evidence: `grep -r PROJECTS_DIR backend/` returned no results before this change.

## Decision Log

- Decision: Reuse the existing import logic by extracting `scan_repos()` from `import_local_projects.py` rather than duplicating it in the router.
  Rationale: Single source of truth; CLI and API stay in sync.
  Date/Author: 2026-05-09 / Ciaran Lyons

- Decision: Add scan endpoints to the existing `data.py` router (under `/api/data/`) rather than a new router.
  Rationale: Thematically related to import/export; avoids a new file and router registration.
  Date/Author: 2026-05-09 / Ciaran Lyons

- Decision: `ScanSection` is placed above Export/Import in Settings.
  Rationale: It's the most commonly used action for an active user adding new repos.
  Date/Author: 2026-05-09 / Ciaran Lyons

## Outcomes & Retrospective

_To be filled in after validation._

## Context and Orientation

- `backend/import_local_projects.py` — standalone CLI that scans a directory for git repos and upserts them into the DB.
- `backend/database.py` — Pydantic-settings `Settings` class; reads `backend/.env`.
- `backend/routers/data.py` — FastAPI router mounted at `/api/data`; handles export and import.
- `frontend/src/components/SettingsView.tsx` — Settings page with Export and Import sections.

## Plan of Work

1. **`import_local_projects.py`** — Extract the scan loop into `scan_repos(db, root, recursive, fetch_all) -> dict` so routers can call it without going through the CLI entry point. Refactor `main()` to call `scan_repos()`.

2. **`database.py`** — Add `projects_dir: str | None = None` to `Settings`.

3. **`routers/data.py`** — Add two endpoints:
   - `GET /api/data/scan-config` — returns `{projects_dir, projects_dir_raw}` so the UI can pre-fill the directory field.
   - `POST /api/data/scan?root=...&recursive=...` — calls `scan_repos()`, returns summary.

4. **`backend/.env.example`** — Document `PROJECTS_DIR=~/conductor/repos`.

5. **`frontend/src/components/SettingsView.tsx`** — Add `ScanSection` component at the top of Settings. It pre-fetches the configured dir, provides an editable path input, a recursive checkbox, a Re-scan button, and a result display.

## Concrete Steps

```bash
# From repo root
cd backend && python -m py_compile main.py import_local_projects.py routers/data.py database.py

# Start the backend and frontend
make run

# Test the config endpoint
curl http://localhost:8000/api/data/scan-config

# Test the scan endpoint
curl -X POST "http://localhost:8000/api/data/scan?root=~/conductor/repos"
```

## Validation and Acceptance

1. `GET /api/data/scan-config` returns `{"projects_dir": "/Users/xxx/conductor/repos", "projects_dir_raw": "~/conductor/repos"}` when `PROJECTS_DIR` is set in `.env`.
2. `POST /api/data/scan` with no `root` param uses `PROJECTS_DIR`; with `?root=/some/path` overrides it.
3. Scanning a directory with new repos creates them and returns `"created" > 0`.
4. Re-scanning the same directory returns `"created": 0` and updates existing projects.
5. Settings page shows "Scan Local Repos" section above Export, with the configured path pre-filled.

## Idempotence and Recovery

- The scan endpoint is idempotent: re-running it updates existing projects rather than duplicating them (matching by `local_path`, then `github_url`, then `name`).
- No destructive DB operations; partial runs leave valid data.

## Artifacts and Notes

_To be filled in after validation._

## Interfaces and Dependencies

```python
# import_local_projects.py
def scan_repos(db, root: Path, recursive: bool = False, fetch_all: bool = False) -> dict:
    """Returns {root, total, created, updated, commits_added, projects: [{action, name, commits_added}]}"""

# routers/data.py
GET  /api/data/scan-config           -> {projects_dir: str|None, projects_dir_raw: str|None}
POST /api/data/scan?root&recursive   -> scan_repos() result dict
```

## Change Log

- 2026-05-09: Created and implemented.
