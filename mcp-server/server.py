"""
VibeFocus MCP Server — Portfolio intelligence for AI assistants.

This MCP server gives Claude (and other AI tools) full read/write access to
the user's VibeFocus portfolio: projects, next steps, goals, notes, insights,
weekly focus, analytics, and docs.

Use these tools when:
1. The user asks about any project by name — check VibeFocus for context
2. The user asks what to work on, what's next, or priorities — pull focus + health
3. The user completes work matching a known step — offer to mark it done
4. The user has a strategic realization — offer to save it as an insight
5. The user asks for status/reports — use reporting tools
6. Starting a coding session — pull project state for context
7. End of session — offer to update progress or add next steps

The user manages multiple projects simultaneously. VibeFocus has their notes,
next steps, sub-goals, completion %, weekly focus commitments, commit history,
code analysis, and saved AI insights for every project.
"""

import os
import json
from datetime import datetime

import httpx
from mcp.server.fastmcp import FastMCP

# ── Config ───────────────────────────────────────────────────────────────────

BASE_URL = os.environ.get("VIBEFOCUS_API_URL", "http://localhost:8000")
API = f"{BASE_URL}/api"


# ── HTTP helpers ─────────────────────────────────────────────────────────────

def _get(path: str, params: dict | None = None) -> dict | list:
    r = httpx.get(f"{API}{path}", params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def _post(path: str, body: dict | None = None) -> dict | list:
    r = httpx.post(f"{API}{path}", json=body, timeout=30)
    r.raise_for_status()
    if r.status_code == 204:
        return {"ok": True}
    return r.json()


def _patch(path: str, body: dict) -> dict:
    r = httpx.patch(f"{API}{path}", json=body, timeout=15)
    r.raise_for_status()
    return r.json()


def _delete(path: str) -> dict:
    r = httpx.delete(f"{API}{path}", timeout=15)
    r.raise_for_status()
    return {"ok": True}


# ── Lookup helpers ───────────────────────────────────────────────────────────

def _find_project(name_or_id: str) -> dict | None:
    """Find a project by ID or fuzzy name match."""
    projects = _get("/projects")
    # Exact ID match
    for p in projects:
        if p["id"] == name_or_id:
            return p
    # Case-insensitive name match
    lower = name_or_id.lower()
    for p in projects:
        if p["name"].lower() == lower:
            return p
    # Substring match
    for p in projects:
        if lower in p["name"].lower():
            return p
    return None


def _find_step(project: dict, step_text_or_id: str) -> dict | None:
    """Find a step by ID or fuzzy text match."""
    lower = step_text_or_id.lower()
    for s in project.get("next_steps", []):
        if s["id"] == step_text_or_id:
            return s
    for s in project.get("next_steps", []):
        if lower in s["text"].lower():
            return s
    return None


def _find_goal(project: dict, goal_text_or_id: str) -> dict | None:
    """Find a goal by ID or fuzzy text match."""
    lower = goal_text_or_id.lower()
    for g in project.get("sub_goals", []):
        if g["id"] == goal_text_or_id:
            return g
    for g in project.get("sub_goals", []):
        if lower in g["text"].lower():
            return g
    return None


def _fmt_project_brief(p: dict) -> str:
    """Format a project as a brief one-liner."""
    state = p.get("state_id", "")
    pct = p.get("completion_pct", 0)
    return f"[{p['id']}] {p['name']} — {pct}% complete, updated {p.get('updated_at', 'unknown')}"


def _fmt_project_detail(p: dict) -> str:
    """Format a project with full context."""
    lines = [
        f"# {p['name']}",
        f"ID: {p['id']}",
        f"Description: {p.get('description') or 'None'}",
        f"Completion: {p.get('completion_pct', 0)}%",
    ]
    if p.get("ai_completion_pct") is not None:
        lines.append(f"AI Completion Estimate: {p['ai_completion_pct']}% — {p.get('ai_completion_reason', '')}")
    if p.get("target_date"):
        lines.append(f"Target Date: {p['target_date']}")
    if p.get("local_path"):
        lines.append(f"Local Path: {p['local_path']}")
    if p.get("github_url"):
        lines.append(f"GitHub: {p['github_url']}")
    if p.get("git_last_commit"):
        lines.append(f"Last Commit: {p['git_last_commit']}")
    if p.get("git_branch"):
        lines.append(f"Branch: {p['git_branch']}")
    if p.get("git_uncommitted"):
        lines.append("Uncommitted Changes: YES")
    if p.get("github_stars") is not None:
        lines.append(f"GitHub Stars: {p['github_stars']}")
    if p.get("code_tech_stack"):
        lines.append(f"Tech Stack: {', '.join(p['code_tech_stack'])}")
    if p.get("code_summary"):
        lines.append(f"Code Summary: {p['code_summary'][:500]}")

    # Next steps
    steps = p.get("next_steps", [])
    pending = [s for s in steps if not s["done"]]
    done = [s for s in steps if s["done"]]
    if pending:
        lines.append(f"\nPending Steps ({len(pending)}):")
        for s in pending:
            lines.append(f"  - [{s['id']}] {s['text']}")
    if done:
        lines.append(f"Completed Steps ({len(done)}):")
        for s in done[:5]:
            lines.append(f"  - [done] {s['text']}")

    # Goals
    goals = p.get("sub_goals", [])
    if goals:
        lines.append(f"\nSub-Goals ({len(goals)}):")
        for g in goals:
            status = "done" if g["done"] else "pending"
            lines.append(f"  - [{status}] {g['text']} [{g['category']}]")

    # Insights
    insights = p.get("insights", [])
    if insights:
        lines.append(f"\nSaved Insights ({len(insights)}):")
        for ins in insights[:3]:
            lines.append(f"  - {ins['text'][:200]}")

    # Notes
    if p.get("notes"):
        lines.append(f"\nNotes:\n{p['notes'][:500]}")

    return "\n".join(lines)


# ── MCP Server ───────────────────────────────────────────────────────────────

mcp = FastMCP(
    "VibeFocus",
    instructions="""VibeFocus is the user's portfolio intelligence system tracking all their software projects.

Use these tools when:
- The user asks about any project by name — check VibeFocus first for context (steps, goals, health, notes, insights)
- The user asks what to work on, what's next, or seems uncertain about priorities — pull focus projects and health status
- The user completes work that matches a known next step — offer to mark it done
- The user has a strategic realization about a project — offer to save it as an insight
- The user asks for a status update or report — use the reporting tools
- You're starting a coding session — pull project state for context
- End of session — offer to update completion % or add next steps

The user manages multiple projects simultaneously. VibeFocus has their notes, next steps, sub-goals, completion %, weekly focus commitments, commit history, code analysis, and saved AI insights for every project.""",
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PROJECT STATE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
def get_project(name_or_id: str) -> str:
    """Get full details for a project by name or ID.

    Returns description, notes, next steps, goals, insights, code analysis,
    git stats, completion %, and more. Use this when the user mentions a
    specific project or you need context about what a project is and its
    current state.

    Args:
        name_or_id: Project name (fuzzy matched) or 8-char ID
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"
    return _fmt_project_detail(p)


@mcp.tool()
def list_projects(filter_by: str | None = None) -> str:
    """List all projects in the portfolio.

    Use this when the user asks "what projects do I have?", wants an overview,
    or you need to find project IDs. Returns a brief listing of all projects
    with their status, completion %, and last update.

    Args:
        filter_by: Optional filter — 'active', 'cooling', 'dormant', a bucket name, or a state name
    """
    projects = _get("/projects")
    if not projects:
        return "No projects in the portfolio."

    if filter_by:
        lower = filter_by.lower()
        # Try health status filter via analytics
        if lower in ("active", "cooling", "dormant"):
            try:
                health = _get("/analytics/health")
                ids = {h["project_id"] for h in health if h["status"] == lower}
                projects = [p for p in projects if p["id"] in ids]
            except Exception:
                pass
        else:
            # Filter by bucket or state name
            states = _get("/states")
            buckets = _get("/buckets")
            state_map = {s["name"].lower(): s["id"] for s in states}
            bucket_map = {b["name"].lower(): b["id"] for b in buckets}
            if lower in state_map:
                sid = state_map[lower]
                projects = [p for p in projects if p.get("state_id") == sid]
            elif lower in bucket_map:
                bid = bucket_map[lower]
                projects = [p for p in projects if p.get("bucket_id") == bid]

    lines = [f"Portfolio: {len(projects)} projects\n"]
    for p in projects:
        pct = p.get("completion_pct", 0)
        steps_pending = len([s for s in p.get("next_steps", []) if not s["done"]])
        tech = ", ".join(p.get("code_tech_stack") or [])
        line = f"  [{p['id']}] {p['name']} — {pct}%"
        if steps_pending:
            line += f", {steps_pending} pending steps"
        if tech:
            line += f" ({tech})"
        lines.append(line)

    return "\n".join(lines)


@mcp.tool()
def create_project(
    name: str,
    description: str = "",
    local_path: str | None = None,
    github_url: str | None = None,
    category: str | None = None,
    state: str | None = None,
) -> str:
    """Create a new project in the portfolio.

    Use this when the user mentions a new project they're starting, or asks
    to add a project to VibeFocus.

    Args:
        name: Project name
        description: What this project is about
        local_path: Absolute path to the local git repo (enables code analysis)
        github_url: GitHub repo URL (e.g. https://github.com/user/repo)
        category: Category/bucket name (e.g. 'Open Source', 'Commercial', 'Personal'). Defaults to first available.
        state: Lifecycle state (e.g. 'Idea', 'Building', 'MVP'). Defaults to 'Idea'.
    """
    # Resolve bucket
    buckets = _get("/buckets")
    bucket_id = buckets[0]["id"] if buckets else None
    if category:
        match = next((b for b in buckets if b["name"].lower() == category.lower()), None)
        if match:
            bucket_id = match["id"]
        else:
            return f"Unknown category '{category}'. Available: {', '.join(b['name'] for b in buckets)}"

    if not bucket_id:
        return "No categories configured. Create one first."

    # Resolve state
    state_id = None
    states = _get("/states")
    if state:
        match = next((s for s in states if s["name"].lower() == state.lower()), None)
        if match:
            state_id = match["id"]
        else:
            return f"Unknown state '{state}'. Available: {', '.join(s['name'] for s in states)}"
    elif states:
        state_id = states[0]["id"]  # Default to first state (Idea)

    body: dict = {
        "name": name,
        "description": description,
        "bucket_id": bucket_id,
    }
    if state_id:
        body["state_id"] = state_id
    if local_path:
        body["local_path"] = local_path
    if github_url:
        body["github_url"] = github_url

    result = _post("/projects", body)
    msg = f"Created project: {result['name']} [{result['id']}]"
    if local_path:
        msg += "\nCode analysis will run in the background."
    return msg


@mcp.tool()
def update_project(
    name_or_id: str,
    description: str | None = None,
    local_path: str | None = None,
    github_url: str | None = None,
    completion_pct: int | None = None,
    target_date: str | None = None,
    priority: str | None = None,
    state: str | None = None,
) -> str:
    """Update a project's fields.

    Use this when the user wants to change a project's description,
    local path, GitHub URL, completion percentage, target date, priority, or lifecycle state.

    Args:
        name_or_id: Project name or ID
        description: New description text
        local_path: Absolute path to the local git repo (enables code analysis)
        github_url: GitHub repo URL (e.g. https://github.com/user/repo)
        completion_pct: Completion percentage (0-100)
        target_date: Target date in YYYY-MM-DD format
        priority: Priority level — 'low', 'medium', or 'high'
        state: Lifecycle state name (e.g., 'Building', 'MVP', 'Launched', 'Stalled')
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    body: dict = {}
    if description is not None:
        body["description"] = description
    if local_path is not None:
        body["local_path"] = local_path
    if github_url is not None:
        body["github_url"] = github_url
    if completion_pct is not None:
        body["completion_pct"] = max(0, min(100, completion_pct))
    if target_date is not None:
        body["target_date"] = target_date
    if priority is not None:
        if priority not in ("low", "medium", "high"):
            return f"Invalid priority '{priority}'. Must be 'low', 'medium', or 'high'."
        body["priority"] = priority
    if state is not None:
        states = _get("/states")
        match = next((s for s in states if s["name"].lower() == state.lower()), None)
        if match:
            body["state_id"] = match["id"]
        else:
            return f"Unknown state '{state}'. Available: {', '.join(s['name'] for s in states)}"

    if not body:
        return "No fields to update."

    result = _patch(f"/projects/{p['id']}", body)
    return f"Updated {result['name']}: " + ", ".join(f"{k}={v}" for k, v in body.items())


@mcp.tool()
def get_project_state(name_or_id: str) -> str:
    """Get a quick status recap for a project — ideal for session start.

    Returns: last commit, uncommitted changes, pending steps, last insight,
    health status, and completion %. Use this at the start of a coding session
    to quickly understand where a project stands.

    Args:
        name_or_id: Project name or ID
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    pending = [s for s in p.get("next_steps", []) if not s["done"]]
    insights = p.get("insights", [])
    last_insight = insights[0]["text"][:200] if insights else "None"

    # Try to get health
    health_status = "unknown"
    try:
        health = _get("/analytics/health")
        for h in health:
            if h["project_id"] == p["id"]:
                health_status = f"{h['status']} ({h['commits_7d']} commits/7d, {h['commits_30d']}/30d)"
                break
    except Exception:
        pass

    lines = [
        f"# {p['name']} — Quick Status",
        f"Health: {health_status}",
        f"Completion: {p.get('completion_pct', 0)}%",
    ]
    if p.get("target_date"):
        lines.append(f"Target: {p['target_date']}")
    if p.get("git_last_commit"):
        lines.append(f"Last Commit: {p['git_last_commit']}")
    if p.get("git_uncommitted"):
        lines.append("Uncommitted Changes: YES")
    if p.get("git_branch"):
        lines.append(f"Branch: {p['git_branch']}")
    if pending:
        lines.append(f"\nPending Steps ({len(pending)}):")
        for s in pending[:5]:
            lines.append(f"  - {s['text']}")
    if last_insight != "None":
        lines.append(f"\nLast Insight: {last_insight}")

    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# NEXT STEPS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
def list_steps(name_or_id: str) -> str:
    """List all next steps for a project.

    Use when the user asks "what's next?" or "what are my tasks?" for a project.

    Args:
        name_or_id: Project name or ID
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    steps = p.get("next_steps", [])
    if not steps:
        return f"No next steps for {p['name']}."

    pending = [s for s in steps if not s["done"]]
    done = [s for s in steps if s["done"]]

    lines = [f"# {p['name']} — Next Steps\n"]
    if pending:
        lines.append(f"Pending ({len(pending)}):")
        for s in pending:
            lines.append(f"  [ ] {s['text']}  (id: {s['id']})")
    if done:
        lines.append(f"\nCompleted ({len(done)}):")
        for s in done:
            lines.append(f"  [x] {s['text']}")

    return "\n".join(lines)


@mcp.tool()
def add_step(name_or_id: str, text: str) -> str:
    """Add a next step to a project.

    Use when the user identifies something that needs to be done next, or when
    you identify a follow-up action from code changes, TODOs, or discussion.

    Args:
        name_or_id: Project name or ID
        text: The step description
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    result = _post(f"/projects/{p['id']}/steps", {"text": text})
    return f"Added step to {p['name']}: \"{text}\""


@mcp.tool()
def complete_step(name_or_id: str, step_text_or_id: str) -> str:
    """Mark a next step as done.

    Matches by step ID or fuzzy text match. Use when the user finishes work
    that corresponds to a known step, or explicitly says to mark something done.

    Args:
        name_or_id: Project name or ID
        step_text_or_id: Step ID or text to fuzzy-match against
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    step = _find_step(p, step_text_or_id)
    if not step:
        pending = [s["text"] for s in p.get("next_steps", []) if not s["done"]]
        return f"No step matching '{step_text_or_id}'. Pending steps: {pending}"

    if step["done"]:
        return f"Step already done: \"{step['text']}\""

    _patch(f"/projects/{p['id']}/steps/{step['id']}", {"done": True})
    return f"Completed step on {p['name']}: \"{step['text']}\""


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GOALS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
def list_goals(name_or_id: str) -> str:
    """List all sub-goals for a project, grouped by category.

    Categories: Users, Marketing, Revenue, Dev, Experiments, Other.
    Use when the user asks about goals or non-dev progress.

    Args:
        name_or_id: Project name or ID
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    goals = p.get("sub_goals", [])
    if not goals:
        return f"No sub-goals for {p['name']}."

    by_cat: dict[str, list] = {}
    for g in goals:
        by_cat.setdefault(g["category"], []).append(g)

    lines = [f"# {p['name']} — Sub-Goals\n"]
    for cat, cat_goals in by_cat.items():
        lines.append(f"{cat}:")
        for g in cat_goals:
            mark = "x" if g["done"] else " "
            lines.append(f"  [{mark}] {g['text']}  (id: {g['id']})")
        lines.append("")

    done = len([g for g in goals if g["done"]])
    lines.append(f"Progress: {done}/{len(goals)} complete")
    return "\n".join(lines)


@mcp.tool()
def add_goal(name_or_id: str, text: str, category: str = "Dev") -> str:
    """Add a sub-goal to a project.

    Args:
        name_or_id: Project name or ID
        text: Goal description
        category: One of: Users, Marketing, Revenue, Dev, Experiments, Other
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    valid_cats = ["Users", "Marketing", "Revenue", "Dev", "Experiments", "Other"]
    cat = next((c for c in valid_cats if c.lower() == category.lower()), "Other")

    result = _post(f"/projects/{p['id']}/goals", {"text": text, "category": cat})
    return f"Added {cat} goal to {p['name']}: \"{text}\""


@mcp.tool()
def complete_goal(name_or_id: str, goal_text_or_id: str) -> str:
    """Mark a sub-goal as done.

    Args:
        name_or_id: Project name or ID
        goal_text_or_id: Goal ID or text to fuzzy-match
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    goal = _find_goal(p, goal_text_or_id)
    if not goal:
        return f"No goal matching '{goal_text_or_id}'"

    if goal["done"]:
        return f"Goal already done: \"{goal['text']}\""

    _patch(f"/projects/{p['id']}/goals/{goal['id']}", {"done": True})
    return f"Completed goal on {p['name']}: \"{goal['text']}\" [{goal['category']}]"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# NOTES & INSIGHTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
def get_notes(name_or_id: str) -> str:
    """Get a project's notes.

    Args:
        name_or_id: Project name or ID
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    notes = p.get("notes", "")
    if not notes:
        return f"No notes for {p['name']}."
    return f"# {p['name']} — Notes\n\n{notes}"


@mcp.tool()
def append_note(name_or_id: str, text: str) -> str:
    """Append text to a project's notes. Does not overwrite existing notes.

    Use when the user wants to jot something down, or you want to record
    a decision or observation during a coding session.

    Args:
        name_or_id: Project name or ID
        text: Text to append
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    existing = p.get("notes", "") or ""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    new_notes = f"{existing}\n\n[{timestamp}] {text}".strip()
    _patch(f"/projects/{p['id']}", {"notes": new_notes})
    return f"Appended note to {p['name']}"


@mcp.tool()
def save_insight(name_or_id: str, text: str, prompt: str | None = None) -> str:
    """Save a strategic insight to a project.

    Insights are high-value observations — a diagnosis, a pattern,
    an assumption to test, a strategic recommendation. They're pinned
    to the project and visible in the dashboard. Use when the user or
    you arrive at a realization worth preserving.

    Args:
        name_or_id: Project name or ID
        text: The insight text
        prompt: Optional — the question that led to this insight
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    body: dict = {"text": text}
    if prompt:
        body["prompt"] = prompt
    _post(f"/projects/{p['id']}/insights", body)
    return f"Saved insight to {p['name']}: \"{text[:100]}...\""


@mcp.tool()
def list_insights(name_or_id: str) -> str:
    """List saved insights for a project.

    Args:
        name_or_id: Project name or ID
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    insights = p.get("insights", [])
    if not insights:
        return f"No saved insights for {p['name']}."

    lines = [f"# {p['name']} — Insights ({len(insights)})\n"]
    for ins in insights:
        date = ins.get("saved_at", "")[:10]
        lines.append(f"[{date}] {ins['text'][:300]}")
        if ins.get("prompt"):
            lines.append(f"  Prompted by: \"{ins['prompt'][:100]}\"")
        lines.append("")

    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# FOCUS & PRIORITIES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
def get_focus_projects() -> str:
    """Get the user's current weekly focus projects and commitments.

    Use when the user asks what they should be working on, or to check
    if current work aligns with their declared priorities.
    """
    focuses = _get("/projects/focus")
    if not focuses:
        return "No weekly focus projects set."

    projects = _get("/projects")
    proj_map = {p["id"]: p for p in projects}

    lines = ["# Weekly Focus Projects\n"]
    for f in focuses:
        p = proj_map.get(f["project_id"], {})
        name = p.get("name", "Unknown")
        pct = p.get("completion_pct", 0)
        commitment = f.get("commitment", "")
        lines.append(f"- {name} ({pct}% complete)")
        if commitment:
            lines.append(f"  Commitment: {commitment}")

    return "\n".join(lines)


@mcp.tool()
def set_focus(name_or_id: str, commitment: str = "") -> str:
    """Add a project to weekly focus.

    Args:
        name_or_id: Project name or ID
        commitment: Optional commitment text — what you plan to accomplish this week
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    _post("/projects/focus", {"project_id": p["id"], "commitment": commitment})
    msg = f"Set {p['name']} as a focus project"
    if commitment:
        msg += f" with commitment: \"{commitment}\""
    return msg


@mcp.tool()
def remove_focus(name_or_id: str) -> str:
    """Remove a project from weekly focus.

    Args:
        name_or_id: Project name or ID
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    focuses = _get("/projects/focus")
    focus = next((f for f in focuses if f["project_id"] == p["id"]), None)
    if not focus:
        return f"{p['name']} is not in weekly focus."

    _delete(f"/projects/focus/{focus['id']}")
    return f"Removed {p['name']} from weekly focus"


@mcp.tool()
def check_focus_alignment() -> str:
    """Check if recent work aligns with declared weekly focus.

    Compares actual commit distribution against focus projects.
    Use when the user asks "am I working on what I said I would?"
    or to gently remind them about focus drift.
    """
    focuses = _get("/projects/focus")
    if not focuses:
        return "No weekly focus projects set — can't check alignment."

    projects = _get("/projects")
    proj_map = {p["id"]: p for p in projects}
    focus_ids = {f["project_id"] for f in focuses}
    focus_names = {f["project_id"]: proj_map.get(f["project_id"], {}).get("name", "Unknown") for f in focuses}

    try:
        distribution = _get("/analytics/focus", params={"period": "week"})
    except Exception:
        return "No commit data available for this week."

    total = sum(d["commits"] for d in distribution)
    if total == 0:
        return "No commits this week yet."

    focus_commits = sum(d["commits"] for d in distribution if d["project_id"] in focus_ids)
    other_commits = total - focus_commits
    score = round(focus_commits / total * 100) if total else 0

    lines = [
        f"# Focus Alignment — This Week\n",
        f"Focus Score: {score}% of commits went to focus projects",
        f"Total commits: {total}\n",
        f"Focus projects ({focus_commits} commits):",
    ]
    for d in distribution:
        if d["project_id"] in focus_ids:
            lines.append(f"  - {d['project_name']}: {d['commits']} commits ({d['percentage']}%)")

    if other_commits > 0:
        lines.append(f"\nNon-focus projects ({other_commits} commits):")
        for d in distribution:
            if d["project_id"] not in focus_ids:
                lines.append(f"  - {d['project_name']}: {d['commits']} commits ({d['percentage']}%)")

    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# COMPLETION TRACKING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
def set_completion(name_or_id: str, pct: int) -> str:
    """Update a project's completion percentage.

    Use when the user says a project is X% done, or after significant
    progress to update the tracker.

    Args:
        name_or_id: Project name or ID
        pct: Completion percentage (0-100)
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    pct = max(0, min(100, pct))
    _patch(f"/projects/{p['id']}", {"completion_pct": pct})
    return f"Updated {p['name']} completion to {pct}%"


@mcp.tool()
def get_completion(name_or_id: str) -> str:
    """Get completion tracking info for a project.

    Returns manual completion %, AI estimate %, and target date.

    Args:
        name_or_id: Project name or ID
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    lines = [f"# {p['name']} — Completion"]
    lines.append(f"Manual: {p.get('completion_pct', 0)}%")
    if p.get("ai_completion_pct") is not None:
        lines.append(f"AI Estimate: {p['ai_completion_pct']}%")
        if p.get("ai_completion_reason"):
            lines.append(f"Reason: {p['ai_completion_reason']}")
    if p.get("target_date"):
        lines.append(f"Target Date: {p['target_date']}")

    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ANALYTICS & HEALTH
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
def get_health(name_or_id: str | None = None) -> str:
    """Get project health status — active, cooling, or dormant.

    Without a project name, returns health for all projects.
    Based on commit frequency: active (commits in 7d), cooling (in 30d), dormant (none in 30d).

    Args:
        name_or_id: Optional project name or ID. Omit for portfolio-wide health.
    """
    health = _get("/analytics/health")
    if not health:
        return "No health data. Sync git logs first."

    if name_or_id:
        p = _find_project(name_or_id)
        if not p:
            return f"No project found matching '{name_or_id}'"
        h = next((h for h in health if h["project_id"] == p["id"]), None)
        if not h:
            return f"No health data for {p['name']}. Run git log sync first."
        lines = [
            f"# {p['name']} — Health",
            f"Status: {h['status'].upper()}",
            f"Commits (7d): {h['commits_7d']}",
            f"Commits (30d): {h['commits_30d']}",
            f"Total commits: {h['total_commits']}",
        ]
        if h.get("transition"):
            t = h["transition"]
            lines.append(f"Recent transition: {t['from']} → {t['to']} at {t['at']}")
        return "\n".join(lines)

    # Portfolio health
    active = [h for h in health if h["status"] == "active"]
    cooling = [h for h in health if h["status"] == "cooling"]
    dormant = [h for h in health if h["status"] == "dormant"]

    lines = [
        f"# Portfolio Health",
        f"Active: {len(active)} | Cooling: {len(cooling)} | Dormant: {len(dormant)}\n",
    ]
    for label, items in [("Active", active), ("Cooling", cooling), ("Dormant", dormant)]:
        if items:
            lines.append(f"{label}:")
            for h in items:
                lines.append(f"  - {h['project_name']}: {h['commits_7d']} commits/7d, {h['commits_30d']}/30d")
            lines.append("")

    transitions = [h for h in health if h.get("transition")]
    if transitions:
        lines.append("Recent transitions:")
        for h in transitions:
            t = h["transition"]
            lines.append(f"  - {h['project_name']}: {t['from']} → {t['to']}")

    return "\n".join(lines)


@mcp.tool()
def get_velocity(name_or_id: str | None = None, days: int = 90) -> str:
    """Get weekly commit velocity trends.

    Shows commits per week, either portfolio-wide or for a specific project.

    Args:
        name_or_id: Optional project name or ID
        days: Lookback window in days (default 90)
    """
    if name_or_id:
        p = _find_project(name_or_id)
        if not p:
            return f"No project found matching '{name_or_id}'"
        data = _get(f"/analytics/velocity/{p['id']}", params={"days": days})
        if not data:
            return f"No velocity data for {p['name']}."
        lines = [f"# {p['name']} — Velocity (last {days}d)\n"]
        for w in data:
            lines.append(f"  Week {w['week']}: {w['commits']} commits, {w['lines_changed']} lines changed")
        return "\n".join(lines)

    data = _get("/analytics/velocity", params={"days": days})
    if not data:
        return "No velocity data. Sync git logs first."

    # Aggregate by week
    weeks: dict[str, dict] = {}
    for row in data:
        w = weeks.setdefault(row["week"], {"commits": 0, "projects": []})
        w["commits"] += row["commits"]
        w["projects"].append(f"{row['project_name']}:{row['commits']}")

    lines = [f"# Portfolio Velocity (last {days}d)\n"]
    for week, info in sorted(weeks.items()):
        lines.append(f"  Week {week}: {info['commits']} commits — {', '.join(info['projects'])}")
    return "\n".join(lines)


@mcp.tool()
def get_streaks(name_or_id: str | None = None) -> str:
    """Get commit streak data — current streak, longest streak, total active days.

    Args:
        name_or_id: Optional project name or ID
    """
    params = {}
    if name_or_id:
        p = _find_project(name_or_id)
        if not p:
            return f"No project found matching '{name_or_id}'"
        params["project_id"] = p["id"]

    data = _get("/analytics/streaks", params=params)
    label = f"{p['name']}" if name_or_id else "Portfolio"
    return (
        f"# {label} — Streaks\n"
        f"Current Streak: {data['current_streak']} days\n"
        f"Longest Streak: {data['longest_streak']} days\n"
        f"Total Active Days: {data['total_active_days']}"
    )


@mcp.tool()
def get_focus_distribution(period: str = "month") -> str:
    """Get commit distribution across projects for a time period.

    Shows where your commits actually went — useful for understanding
    where time is being spent vs. where you intended it to go.

    Args:
        period: 'week', 'month', or 'quarter'
    """
    data = _get("/analytics/focus", params={"period": period})
    if not data:
        return f"No commit data for the last {period}."

    lines = [f"# Focus Distribution — {period.title()}\n"]
    for d in data:
        bar = "█" * int(d["percentage"] / 5) if d["percentage"] >= 5 else "▎"
        lines.append(f"  {d['project_name']:20s} {bar} {d['percentage']}% ({d['commits']} commits)")

    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
def list_docs(name_or_id: str) -> str:
    """List documents attached to a project (PRDs, architecture docs, plans).

    Args:
        name_or_id: Project name or ID
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    docs = p.get("docs", [])
    if not docs:
        return f"No documents for {p['name']}."

    lines = [f"# {p['name']} — Documents ({len(docs)})\n"]
    for d in docs:
        dtype = d.get("doc_type", "manual")
        source = d.get("source", "")
        lines.append(f"  [{d['id']}] {d['name']} ({dtype}, {source})")
        if d.get("summary"):
            lines.append(f"    {d['summary'][:150]}")

    return "\n".join(lines)


@mcp.tool()
def get_doc_content(name_or_id: str, doc_name_or_id: str) -> str:
    """Get the full content of a project document.

    Use when you need to reference a PRD, architecture doc, or plan
    to ground your advice in the project's documented design.

    Args:
        name_or_id: Project name or ID
        doc_name_or_id: Document name (fuzzy match) or ID
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    docs = p.get("docs", [])
    # Find by ID
    doc = next((d for d in docs if d["id"] == doc_name_or_id), None)
    # Or fuzzy name
    if not doc:
        lower = doc_name_or_id.lower()
        doc = next((d for d in docs if lower in d["name"].lower()), None)

    if not doc:
        names = [d["name"] for d in docs]
        return f"No doc matching '{doc_name_or_id}'. Available: {names}"

    content = _get(f"/projects/{p['id']}/docs/{doc['id']}/content")
    return f"# {doc['name']}\n\n{content.get('content', 'No content available')}"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# REPORTING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
def project_status_report(name_or_id: str) -> str:
    """Generate a comprehensive status report for a project.

    Includes: health, velocity trend, completion %, pending steps, open goals
    by category, recent insights, tech stack, and stall risk assessment.

    Use when the user asks "how's [project] doing?" or wants a full status update.

    Args:
        name_or_id: Project name or ID
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"

    lines = [f"# Status Report: {p['name']}", f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"]

    # Basic info
    lines.append(f"Description: {p.get('description') or 'None'}")
    lines.append(f"Completion: {p.get('completion_pct', 0)}%")
    if p.get("ai_completion_pct") is not None:
        lines.append(f"AI Estimate: {p['ai_completion_pct']}% — {p.get('ai_completion_reason', '')}")
    if p.get("target_date"):
        lines.append(f"Target Date: {p['target_date']}")
    if p.get("code_tech_stack"):
        lines.append(f"Tech Stack: {', '.join(p['code_tech_stack'])}")

    # Health
    try:
        health = _get("/analytics/health")
        h = next((h for h in health if h["project_id"] == p["id"]), None)
        if h:
            lines.append(f"\n## Health: {h['status'].upper()}")
            lines.append(f"Commits: {h['commits_7d']}/7d, {h['commits_30d']}/30d, {h['total_commits']} total")
            if h.get("transition"):
                t = h["transition"]
                lines.append(f"Transition: {t['from']} → {t['to']}")
    except Exception:
        pass

    # Velocity
    try:
        vel = _get(f"/analytics/velocity/{p['id']}", params={"days": 30})
        if vel:
            recent = vel[-4:] if len(vel) >= 4 else vel
            trend = [w["commits"] for w in recent]
            if len(trend) >= 2:
                direction = "increasing" if trend[-1] > trend[0] else "decreasing" if trend[-1] < trend[0] else "steady"
                lines.append(f"Velocity Trend: {direction} (last 4 weeks: {trend})")
    except Exception:
        pass

    # Steps
    steps = p.get("next_steps", [])
    pending = [s for s in steps if not s["done"]]
    done = [s for s in steps if s["done"]]
    lines.append(f"\n## Next Steps: {len(pending)} pending, {len(done)} done")
    for s in pending[:5]:
        lines.append(f"  - {s['text']}")

    # Goals by category
    goals = p.get("sub_goals", [])
    if goals:
        lines.append(f"\n## Goals: {len([g for g in goals if g['done']])}/{len(goals)} complete")
        by_cat: dict[str, list] = {}
        for g in goals:
            by_cat.setdefault(g["category"], []).append(g)
        for cat, gs in by_cat.items():
            done_count = len([g for g in gs if g["done"]])
            lines.append(f"  {cat}: {done_count}/{len(gs)}")

    # Recent insights
    insights = p.get("insights", [])
    if insights:
        lines.append(f"\n## Recent Insights ({len(insights)} total)")
        for ins in insights[:3]:
            lines.append(f"  - {ins['text'][:150]}")

    # Git info
    if p.get("git_last_commit"):
        lines.append(f"\n## Git")
        lines.append(f"Last Commit: {p['git_last_commit']}")
        if p.get("git_uncommitted"):
            lines.append("Uncommitted Changes: YES")

    # Code summary
    if p.get("code_summary"):
        lines.append(f"\n## Code Analysis")
        lines.append(p["code_summary"][:400])

    return "\n".join(lines)


@mcp.tool()
def portfolio_summary() -> str:
    """Generate a cross-project portfolio summary.

    Includes: project count, health distribution, focus alignment,
    velocity trends, stall alerts, and tech stack spread.

    Use when the user asks "how are my projects?" or wants a big-picture view.
    """
    projects = _get("/projects")
    lines = [
        f"# Portfolio Summary",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"Total Projects: {len(projects)}\n",
    ]

    # Health
    try:
        health = _get("/analytics/health")
        active = [h for h in health if h["status"] == "active"]
        cooling = [h for h in health if h["status"] == "cooling"]
        dormant = [h for h in health if h["status"] == "dormant"]
        lines.append(f"## Health: {len(active)} active, {len(cooling)} cooling, {len(dormant)} dormant")
        if cooling:
            lines.append(f"Cooling: {', '.join(h['project_name'] for h in cooling)}")
        if dormant:
            lines.append(f"Dormant: {', '.join(h['project_name'] for h in dormant)}")
        transitions = [h for h in health if h.get("transition")]
        if transitions:
            lines.append("Transitions:")
            for h in transitions:
                t = h["transition"]
                lines.append(f"  - {h['project_name']}: {t['from']} → {t['to']}")
    except Exception:
        pass

    # Focus
    try:
        focuses = _get("/projects/focus")
        if focuses:
            proj_map = {p["id"]: p["name"] for p in projects}
            focus_names = [proj_map.get(f["project_id"], "?") for f in focuses]
            lines.append(f"\n## Weekly Focus: {', '.join(focus_names)}")
    except Exception:
        pass

    # Velocity
    try:
        dist = _get("/analytics/focus", params={"period": "week"})
        if dist:
            lines.append(f"\n## This Week's Activity:")
            for d in dist[:5]:
                lines.append(f"  - {d['project_name']}: {d['commits']} commits ({d['percentage']}%)")
    except Exception:
        pass

    # Streaks
    try:
        streaks = _get("/analytics/streaks")
        lines.append(f"\n## Streaks")
        lines.append(f"Current: {streaks['current_streak']}d | Longest: {streaks['longest_streak']}d | Active Days: {streaks['total_active_days']}")
    except Exception:
        pass

    # Tech stack
    try:
        tech = _get("/analytics/tech-stack")
        if tech:
            lines.append(f"\n## Tech Stack ({len(tech)} technologies)")
            for t in tech[:8]:
                lines.append(f"  - {t['tech']}: {t['project_count']} projects ({', '.join(t['projects'][:3])})")
    except Exception:
        pass

    # Completion overview
    lines.append(f"\n## Project Completion")
    for p in sorted(projects, key=lambda x: x.get("completion_pct", 0), reverse=True):
        pct = p.get("completion_pct", 0)
        if pct > 0:
            lines.append(f"  - {p['name']}: {pct}%")

    return "\n".join(lines)


@mcp.tool()
def weekly_review() -> str:
    """Generate a weekly review of activity across all projects.

    Shows: commits by project, steps completed, goals progressed,
    focus alignment score, and notable changes.

    Use when the user asks "how was my week?" or wants a retrospective.
    """
    lines = [
        f"# Weekly Review",
        f"Week ending: {datetime.now().strftime('%Y-%m-%d')}\n",
    ]

    # Commit distribution
    try:
        dist = _get("/analytics/focus", params={"period": "week"})
        total_commits = sum(d["commits"] for d in dist)
        lines.append(f"## Commits: {total_commits} total")
        for d in dist:
            bar = "█" * int(d["percentage"] / 5) if d["percentage"] >= 5 else "▎"
            lines.append(f"  {d['project_name']:20s} {bar} {d['percentage']}% ({d['commits']})")
        lines.append("")
    except Exception:
        lines.append("No commit data for this week.\n")

    # Focus alignment
    try:
        focuses = _get("/projects/focus")
        if focuses and dist:
            focus_ids = {f["project_id"] for f in focuses}
            focus_commits = sum(d["commits"] for d in dist if d["project_id"] in focus_ids)
            score = round(focus_commits / total_commits * 100) if total_commits else 0
            lines.append(f"## Focus Score: {score}%")
            lines.append(f"({focus_commits}/{total_commits} commits went to focus projects)\n")
    except Exception:
        pass

    # Streaks
    try:
        streaks = _get("/analytics/streaks")
        lines.append(f"## Streak: {streaks['current_streak']} days (longest: {streaks['longest_streak']})\n")
    except Exception:
        pass

    # Health changes
    try:
        health = _get("/analytics/health")
        transitions = [h for h in health if h.get("transition")]
        if transitions:
            lines.append("## Health Changes")
            for h in transitions:
                t = h["transition"]
                lines.append(f"  - {h['project_name']}: {t['from']} → {t['to']}")
            lines.append("")
    except Exception:
        pass

    # Pattern insights
    try:
        patterns = _get("/analytics/patterns", params={"days": 7})
        if patterns.get("by_dow"):
            peak_day = max(patterns["by_dow"], key=lambda d: d["commits"])
            lines.append(f"Most productive day: {peak_day['day']} ({peak_day['commits']} commits)")
        if patterns.get("by_hour"):
            peak_hour = max(patterns["by_hour"], key=lambda h: h["commits"])
            lines.append(f"Peak hour: {peak_hour['hour']}:00 ({peak_hour['commits']} commits)")
    except Exception:
        pass

    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GIT SYNC
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@mcp.tool()
def sync_git_log(name_or_id: str, fetch_all: bool = False) -> str:
    """Sync commit history from a project's local git repo into VibeFocus.

    Incremental by default — only fetches new commits since last sync.
    Use fetch_all=True for first-time sync of full history.

    Args:
        name_or_id: Project name or ID
        fetch_all: If True, fetch complete history instead of incremental
    """
    p = _find_project(name_or_id)
    if not p:
        return f"No project found matching '{name_or_id}'"
    if not p.get("local_path"):
        return f"{p['name']} has no local_path set."

    params = {"fetch_all": "true"} if fetch_all else {}
    result = _post(f"/projects/{p['id']}/sync-git-log?{'fetch_all=true' if fetch_all else ''}")
    return (
        f"Synced {p['name']}: {result['synced']} new commits, "
        f"{result['total_commits']} total, health: {result['health_status']}"
    )


@mcp.tool()
def sync_all_git_logs() -> str:
    """Sync git logs for all projects that have a local_path set.

    Use this to refresh analytics data across the entire portfolio.
    """
    projects = _get("/projects")
    with_path = [p for p in projects if p.get("local_path")]

    if not with_path:
        return "No projects have a local_path set."

    results = []
    for p in with_path:
        try:
            result = _post(f"/projects/{p['id']}/sync-git-log")
            results.append(f"  {p['name']}: {result['synced']} new, {result['total_commits']} total ({result['health_status']})")
        except Exception as e:
            results.append(f"  {p['name']}: FAILED — {e}")

    return f"Synced {len(with_path)} projects:\n" + "\n".join(results)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ENTRY POINT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if __name__ == "__main__":
    mcp.run()
