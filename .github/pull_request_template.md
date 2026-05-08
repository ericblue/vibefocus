## Summary

Describe what changed and why.

## ExecPlan

ExecPlan path (required for substantial work):

- `.agent/execplans/YYYY-MM-DD-<slug>.md`

If not required, explain why:

- N/A reason:

## Validation Evidence

- [ ] `make fe-build`
- [ ] `cd backend && python -m py_compile main.py import_local_projects.py services/*.py routers/*.py`
- [ ] Other task-specific checks

Paste concise output snippets:

```text
<command output excerpts>
```

## Risks / Follow-ups

List known risks, deferred items, or migration considerations.
