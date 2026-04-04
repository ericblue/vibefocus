# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is VibeFocus

Portfolio intelligence for multi-project builders. A personal mission control for solo founders running multiple projects — see your portfolio at a glance, understand stalling, commit to weekly focus, with an AI advisor that has full context including actual code.

## Commands

### Setup
```bash
make install          # Install all dependencies (frontend + backend + mcp)
make install-fe       # Frontend only: cd frontend && npm install
make install-be       # Backend only: creates venv, pip install -r requirements.txt
make install-mcp      # MCP server only: creates venv, pip install mcp httpx
```

### Development
```bash
make run              # Start both backend (port 8000) and frontend (port 5173)
make stop             # Stop both servers
make be               # Backend only (requires venv activated)
make fe               # Frontend only
make mcp              # Run MCP server (requires backend running)
```

### Build
```bash
make fe-build         # Production frontend build: tsc && vite build
```

### Docker
```bash
make docker-build     # Build images
make docker-run       # Run containers (detached)
make docker-stop      # Stop containers
```

There are no test suites, linters, or formatters configured in this project.

## Architecture

### Backend (Python/FastAPI)

Entry point: `backend/main.py` — mounts three routers under `/api/`:
- `/api/projects` — CRUD + sub-resources (steps, goals, links, insights) + code analysis + git stats refresh + git log sync + weekly focus
- `/api/buckets` — project categories (6 seeded on startup: Uncategorized, Open Source, Commercial, etc.)
- `/api/states` — lifecycle states (Idea, Exploring, Building, MVP, Launched, Stalled, Archived)
- `/api/analytics` — portfolio analytics (heatmap, velocity, focus distribution, health, tech stack, patterns, streaks, lifecycle)
- `/api/chat` — streaming SSE chat with portfolio-wide AI context + analytics summary

**Database**: SQLite (`vibefocus.db`) via SQLAlchemy ORM. Models in `backend/models.py`, Pydantic schemas in `backend/schemas.py`. All entity IDs are 8-char truncated UUIDs.

**Services layer** (`backend/services/`):
- `chat_service.py` — builds a system prompt containing the full portfolio (all projects, git stats, code analysis, insights) then streams via Anthropic Messages API (claude-sonnet). Every chat message gets complete cross-project context.
- `agent_analyzer.py` — on-demand codebase analysis using Anthropic Agent SDK with tool use (Read, Bash, Glob, LS). Called via `POST /api/projects/{id}/analyze`. Returns structured JSON: summary, tech stack, TODOs, health signal (active/cooling/dormant).
- `git_service.py` — local git stats (last commit, branch, uncommitted) + GitHub public API (stars, issues, last push). Called via `POST /api/projects/{id}/refresh-stats`.

**Settings**: loaded from `backend/.env` (copy `.env.example`). Key: `ANTHROPIC_API_KEY`.

### Frontend (React/TypeScript/Vite)

**State management split**:
- **Zustand** (`src/store/appStore.ts`) — UI state: view mode (dashboard/kanban), drawer open/close, AI panel visibility
- **TanStack Query** (`src/hooks/useProjects.ts`) — server state: projects, buckets. 30s stale time, auto-invalidation on mutations.

**API client** (`src/api/client.ts`) — fetch-based with typed helpers. Vite proxies `/api` to `localhost:8000` in dev.

**Layout**: `App.tsx` conditionally renders Dashboard or KanbanBoard. ProjectDrawer slides in from the right (tabbed: overview, notes, steps, goals, code, insights). AIPanel is a bottom chat panel with SSE streaming.

**No component library** — raw React with CSS classes in `index.css`. Charts via Recharts.

### MCP Server

`mcp-server/server.py` — standalone MCP server (stdio transport) that exposes VibeFocus as tools for Claude and other AI assistants.

**32 tools** across 8 categories: project state, next steps, goals, notes/insights, focus/priorities, completion tracking, analytics/health, docs, reporting, and git sync.

**Config**: set `VIBEFOCUS_API_URL` env var (defaults to `http://localhost:8000`). Communicates with the VibeFocus API via HTTP — requires the backend to be running.

**Claude Code integration**: copy `mcp-server/claude-mcp-config.json` into your Claude Code MCP settings, adjusting the path to match your local checkout.
