# <Short, action-oriented title>

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository uses `.agent/PLANS.md` as the governing standard for ExecPlans. Keep this document aligned with that contract.

## Purpose / Big Picture

Explain what users gain after this change, what they can do that they could not do before, and how to observe the result.

## Progress

- [ ] (YYYY-MM-DD HH:MMZ) Initial planning completed.
- [ ] Implementation in progress.
- [ ] Validation complete.

## Surprises & Discoveries

- Observation: None yet.
  Evidence: N/A.

## Decision Log

- Decision: Initial placeholder.
  Rationale: Replace with first real technical decision.
  Date/Author: YYYY-MM-DD / <name>

## Outcomes & Retrospective

Summarize outcomes, remaining gaps, and lessons learned at milestone boundaries and at completion.

## Context and Orientation

Describe repository areas relevant to this change as if the reader has no prior context. Name exact files and modules that matter.

## Plan of Work

Describe the sequence of edits in prose. For each change, include the file path and what to modify.

## Concrete Steps

From repository root:

    make install
    make fe-build
    cd backend && python -m py_compile main.py import_local_projects.py services/*.py routers/*.py

Add any task-specific commands with expected outcomes.

## Validation and Acceptance

Define behavior-level acceptance criteria with explicit inputs and observable outputs.

## Idempotence and Recovery

State which steps are safe to re-run and how to recover from partial failures.

## Artifacts and Notes

Add concise command outputs, logs, or diffs that prove success.

## Interfaces and Dependencies

List key interfaces, function signatures, modules, and external dependencies that must exist or change.

## Change Log

- YYYY-MM-DD: Created the plan from template.
