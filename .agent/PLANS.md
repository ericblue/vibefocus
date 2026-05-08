# Codex Execution Plans (ExecPlans)

This document defines the required format and behavior for execution plans ("ExecPlans") in this repository. An ExecPlan is a self-contained implementation guide that a stateless coding agent or new contributor can execute end-to-end.

This file is the contract. If a task uses an ExecPlan, follow this document exactly.

## Purpose

ExecPlans exist to make multi-hour work reliable. The plan should let a reader understand why the change matters, implement it safely, and verify it works without relying on memory or outside context.

## When To Use

Use an ExecPlan for:

- Complex features or significant refactors.
- Work expected to exceed 60 minutes.
- Changes that affect auth, security, data model, or deployment.
- Tasks with material uncertainty that need proof-of-concept milestones.

Do not use an ExecPlan for tiny, low-risk edits.

## Non-Negotiable Requirements

- Every ExecPlan must be fully self-contained.
- Every ExecPlan must be a living document that is updated during implementation.
- Every ExecPlan must define jargon in plain language or avoid it.
- Every ExecPlan must describe observable, user-visible outcomes.
- Every ExecPlan must specify concrete file paths, commands, and expected results.

## Repository Baseline

- Backend source: `backend/` (FastAPI, SQLAlchemy, SQLite, service modules, routers).
- Frontend source: `frontend/src/` (Vite, React, TypeScript).
- MCP source: `mcp-server/server.py`.
- Documentation: `README.md`, `INSTALL.md`, `CLAUDE.md`.
- Core validation commands:
  - `make fe-build`
  - `cd backend && python -m py_compile main.py import_local_projects.py services/*.py routers/*.py`
  - Add task-specific API smoke checks or importer runs when backend behavior changes.

## Required Sections In Every ExecPlan

Every plan file in `.agent/execplans/` must include all sections below:

1. `# <Short action-oriented title>`
2. `## Purpose / Big Picture`
3. `## Progress`
4. `## Surprises & Discoveries`
5. `## Decision Log`
6. `## Outcomes & Retrospective`
7. `## Context and Orientation`
8. `## Plan of Work`
9. `## Concrete Steps`
10. `## Validation and Acceptance`
11. `## Idempotence and Recovery`
12. `## Artifacts and Notes`
13. `## Interfaces and Dependencies`
14. `## Change Log`

## Progress Rules

- `Progress` must use checkboxes with timestamps in UTC.
- At every pause point, update `Progress` so it matches reality.
- If a task is partially done, split it into completed and remaining entries.

Example format:

- [x] (2026-02-13 17:25Z) Added API route scaffold in `src/app/api/example/route.ts`.
- [ ] Add integration test for malformed request handling.

## Decision Logging Rules

Record each meaningful decision using:

- Decision: ...
- Rationale: ...
- Date/Author: ...

If the implementation strategy changes, add a new decision entry and update impacted sections.

## Milestone Rules

Milestones are encouraged for multi-step work. Each milestone must include:

- Scope and intended result.
- Files to change.
- Commands to run.
- Observable acceptance criteria.

Milestones must be independently verifiable.

## Validation Rules

Validation is mandatory. Every ExecPlan must define:

- Exact commands to run.
- Working directory for commands.
- Expected output or behavior.
- A clear statement of success/failure.

Minimum default validation for substantial work:

- `make fe-build` (or equivalent)

Add the following when relevant:

- `cd backend && python -m py_compile main.py import_local_projects.py services/*.py routers/*.py`
- Manual smoke checks as appropriate for your project

## Safety, Idempotence, Recovery

- Prefer additive, reversible edits.
- Write steps that can be re-run without damage.
- For risky steps (for example schema/data changes), include rollback or retry instructions.

## File Naming

Create new plans in:

- `.agent/execplans/YYYY-MM-DD-<short-kebab-title>.md`

Use specific names, not generic titles like `plan.md`.

## PR Expectations

Substantial PRs should include:

- The ExecPlan path.
- Summary of completed milestones.
- Validation evidence.
- Any intentionally deferred work.

## Skeleton

Use `.agent/execplans/TEMPLATE.md` as the starting point for every new plan.
