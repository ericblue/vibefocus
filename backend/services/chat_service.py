"""
Chat service: builds the portfolio system prompt and streams responses.
The system prompt includes full project data + code summaries + git stats.
"""

from __future__ import annotations
from datetime import date as date_type, datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncIterator

import anthropic
from sqlalchemy.orm import Session

from database import settings
from models import Project, Bucket, State, ChatSession, CommitLog


def _days_ago(dt: datetime | None) -> str:
    if not dt:
        return "never"
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    days = diff.days
    if days == 0:
        return "today"
    if days == 1:
        return "yesterday"
    return f"{days} days ago"


def _staleness(dt: datetime | None) -> str:
    if not dt:
        return "UNKNOWN"
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    days = (now - dt).days
    if days <= 7:
        return "ACTIVE"
    if days <= 21:
        return "COOLING"
    return "STALE"


def _read_doc_content(doc, max_chars: int = 4000) -> str | None:
    """Read doc content from pasted text or file, with fallback to summary."""
    if doc.source == "pasted" and doc.content:
        return doc.content[:max_chars]
    if doc.source == "file" and doc.file_path:
        try:
            return Path(doc.file_path).read_text(errors="replace")[:max_chars]
        except (OSError, PermissionError):
            return doc.summary
    return doc.summary


def _read_baseline_code_files(local_path: str, tech_stack: list[str] | None = None) -> str:
    """Read key project files for baseline code context in chat."""
    root = Path(local_path)
    if not root.is_dir():
        return ""

    # Prioritized file list
    candidates = [
        # Manifests
        "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile",
        # Config
        ".env.example", "Makefile", "docker-compose.yml", "Dockerfile",
    ]

    # Auto-detect entry point
    entry_candidates = [
        "main.py", "app.py", "src/main.py", "src/app.py",
        "index.ts", "src/index.ts", "index.js", "src/index.js",
        "main.go", "cmd/main.go",
        "src/main.rs", "src/lib.rs",
    ]

    # Check manifest for entry point hints
    if (root / "package.json").exists():
        try:
            import json
            pkg = json.loads((root / "package.json").read_text(errors="replace"))
            main = pkg.get("main", "")
            if main and (root / main).exists():
                entry_candidates.insert(0, main)
        except Exception:
            pass

    # Find entry point
    for entry in entry_candidates:
        if (root / entry).exists():
            candidates.append(entry)
            break

    # Read files
    blocks = []
    for filename in candidates:
        fp = root / filename
        if fp.exists() and fp.is_file():
            try:
                content = fp.read_text(errors="replace")[:2048]
                blocks.append(f"--- {filename} ---\n{content}")
            except (OSError, PermissionError):
                continue
        if len(blocks) >= 5:
            break

    if not blocks:
        return ""

    return "CODE FILES (from " + local_path + "):\n\n" + "\n\n".join(blocks)


def _build_analytics_context(db: Session, projects: list[Project]) -> str:
    """Build an analytics summary block for the AI system prompt."""
    from sqlalchemy import func

    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    total_commits_7d = db.query(func.count(CommitLog.id)).filter(
        CommitLog.committed_at >= seven_days_ago
    ).scalar() or 0

    total_commits_30d = db.query(func.count(CommitLog.id)).filter(
        CommitLog.committed_at >= thirty_days_ago
    ).scalar() or 0

    if total_commits_7d == 0 and total_commits_30d == 0:
        return ""

    # Per-project velocity this week
    project_velocity = (
        db.query(
            CommitLog.project_id,
            func.count().label("commits"),
        )
        .filter(CommitLog.committed_at >= seven_days_ago)
        .group_by(CommitLog.project_id)
        .all()
    )
    proj_names = {p.id: p.name for p in projects}
    velocity_lines = []
    for row in sorted(project_velocity, key=lambda r: -r.commits):
        name = proj_names.get(row.project_id, "Unknown")
        velocity_lines.append(f"  {name}: {row.commits} commits")

    # Health statuses
    health_lines = []
    for p in projects:
        c7 = db.query(func.count(CommitLog.id)).filter(
            CommitLog.project_id == p.id, CommitLog.committed_at >= seven_days_ago
        ).scalar() or 0
        c30 = db.query(func.count(CommitLog.id)).filter(
            CommitLog.project_id == p.id, CommitLog.committed_at >= thirty_days_ago
        ).scalar() or 0
        total = db.query(func.count(CommitLog.id)).filter(CommitLog.project_id == p.id).scalar() or 0
        if total == 0:
            continue
        if c7 > 0:
            status = "ACTIVE"
        elif c30 > 0:
            status = "COOLING"
        else:
            status = "DORMANT"
        health_lines.append(f"  {p.name}: {status} ({c7} commits/7d, {c30}/30d)")

    # Streaks
    commit_days = db.query(func.date(CommitLog.committed_at)).distinct().order_by(func.date(CommitLog.committed_at)).all()
    current_streak = 0
    if commit_days:
        dates = sorted(set(
            date_type.fromisoformat(str(r[0])) if isinstance(r[0], str) else r[0]
            for r in commit_days
        ))
        today = date_type.today()
        if dates and dates[-1] >= today - timedelta(days=1):
            current_streak = 1
            for i in range(len(dates) - 1, 0, -1):
                if (dates[i] - dates[i - 1]).days == 1:
                    current_streak += 1
                else:
                    break

    block = f"""

---

PRODUCTIVITY ANALYTICS:
Commits this week: {total_commits_7d} | This month: {total_commits_30d}
Current streak: {current_streak} day{'s' if current_streak != 1 else ''}"""

    if velocity_lines:
        block += "\n\nThis week's velocity:\n" + "\n".join(velocity_lines)
    if health_lines:
        block += "\n\nProject health:\n" + "\n".join(health_lines)

    return block


def build_system_prompt(db: Session, focus_project_id: str | None = None) -> str:
    today = datetime.now().strftime("%A, %B %-d, %Y")

    projects = db.query(Project).all()
    buckets = {b.id: b for b in db.query(Bucket).all()}
    states = {s.id: s for s in db.query(State).all()}

    project_blocks = []
    for p in projects:
        bucket = buckets.get(p.bucket_id)
        bucket_name = bucket.name if bucket else "Unknown"
        state = states.get(p.state_id) if p.state_id else None
        state_name = state.name if state else "Unknown"

        pending = [s.text for s in p.next_steps if not s.done]
        done_steps = [s.text for s in p.next_steps if s.done]
        goals = [f"{g.text} [{g.category}] {'✓' if g.done else 'pending'}" for g in p.sub_goals]
        saved_insights = [i.text for i in p.insights]

        staleness = _staleness(p.updated_at)

        block = f"""PROJECT: {p.name}  [{staleness}]
State: {state_name}
Category: {bucket_name}
Last update: {_days_ago(p.updated_at)}
Description: {p.description or 'None'}
Notes: {p.notes or 'None'}"""

        # Code / git context — this is what makes the advice actually grounded
        if p.local_path:
            block += f"\nLocal path: {p.local_path}"
        if p.github_url:
            block += f"\nGitHub: {p.github_url}"
        if p.git_last_commit:
            block += f"\nLast git commit: {p.git_last_commit}"
        if p.git_branch:
            block += f"\nBranch: {p.git_branch}"
        if p.git_uncommitted:
            block += "\nUncommitted changes: yes"
        if p.github_stars is not None:
            block += f"\nGitHub stars: {p.github_stars}"
        if p.github_open_issues is not None:
            block += f"\nOpen issues: {p.github_open_issues}"
        if p.code_tech_stack:
            block += f"\nTech stack: {', '.join(p.code_tech_stack)}"
        if p.code_summary:
            block += f"\nCode analysis: {p.code_summary[:600]}"
        if p.code_todos:
            todo_lines = [f"  - {t['file']}:{t.get('line','')} {t['text']}" for t in p.code_todos[:5]]
            block += f"\nOpen TODOs:\n" + "\n".join(todo_lines)

        block += f"\nPending next steps ({len(pending)}): " + (", ".join(f'"{s}"' for s in pending) or "None")
        if done_steps:
            block += f"\nCompleted steps: " + ", ".join(f'"{s}"' for s in done_steps[:3])
        block += f"\nSub-goals: " + ("; ".join(goals) or "None")
        if saved_insights:
            block += f"\nPreviously saved insights:\n" + "\n".join(f"  - {i}" for i in saved_insights[-3:])

        # Project documents — full content for focus project, summaries for others
        if p.docs:
            is_focus = (focus_project_id and p.id == focus_project_id)
            if is_focus:
                doc_lines = []
                for d in p.docs:
                    content = _read_doc_content(d, max_chars=4000)
                    if content:
                        doc_lines.append(f"  [{d.name}] ({d.doc_type}): {content}")
                if doc_lines:
                    block += f"\nProject documents:\n" + "\n".join(doc_lines)
            else:
                doc_summaries = []
                for d in p.docs[:3]:
                    summary = (d.summary or "")[:200]
                    if summary:
                        doc_summaries.append(f"{d.name}: {summary}")
                if doc_summaries:
                    block += f"\nDocs: " + "; ".join(doc_summaries)

        # Baseline code files for focus project
        if focus_project_id and p.id == focus_project_id and p.local_path:
            code_context = _read_baseline_code_files(p.local_path, p.code_tech_stack)
            if code_context:
                block += f"\n{code_context}"

        project_blocks.append(block)

    portfolio = "\n\n---\n\n".join(project_blocks)

    # ── Analytics context ────────────────────────────────────────────────
    analytics_block = _build_analytics_context(db, projects)

    focus_note = ""
    if focus_project_id:
        fp = db.get(Project, focus_project_id)
        if fp:
            focus_note = f"""

STARTING FOCUS: "{fp.name}"
The user opened this conversation from that project's page. Start your analysis there — but you always have full portfolio context. Move naturally between project-depth and portfolio-level analysis as the conversation develops. If a pattern connects this project to others, name it."""

    return f"""You are a portfolio intelligence advisor for a solo founder and builder. Today is {today}.

You have full context on every project — including code analysis, git activity, and saved insights from past sessions. Your job spans two modes, and you move fluidly between them:

PROJECT DEPTH: Dig into why something is stalling. What's the real blocker — technical, psychological, or strategic? What non-dev work is being avoided? What assumptions need testing? Use the actual code data (git commits, TODOs, tech stack) to ground your analysis in specifics, not generalities.

PORTFOLIO INTELLIGENCE: Identify cross-cutting patterns. Which projects are drifting vs. alive? Is there an imbalance (all open source, no revenue progress)? What does the overall shape suggest about real priorities? Ask the uncomfortable questions when you see them.

TONE:
- Match the user's energy. If they say "hi" or "hey", respond warmly and briefly — say hello back, remind them what you can help with (portfolio review, project deep-dives, prioritization, spotting stalls), and ask what they'd like to explore. Don't launch into unsolicited analysis on casual greetings.
- When they ask a real question, be direct and specific. Name the real blocker. Ground your analysis in actual code data, git history, and project state.
- Move between project and portfolio naturally — if someone asks about one project and you see a relevant pattern elsewhere, say so.
- Ask clarifying questions that would actually change your answer.
- When you give a real insight — a diagnosis, a pattern, an assumption to test — write it as if it will be read back weeks later. The user can save any response directly to a project.
- Never recommend adding more projects or features. Focus is the product.
{focus_note}

FULL PORTFOLIO:

{portfolio}
{analytics_block}"""


CODE_QUERY_TOOL = {
    "name": "code_query",
    "description": (
        "Search and analyze the focus project's source code. Use this when the user "
        "asks questions that require reading actual source files, tracing code paths, "
        "finding implementations, or understanding how specific features work. "
        "The query should describe what you're looking for."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "What to search for or analyze in the codebase. Be specific."
            }
        },
        "required": ["query"]
    }
}


async def _execute_code_query(local_path: str, query: str, on_status=None) -> str:
    """Spawn an Agent SDK session to explore code and answer a question."""
    from claude_agent_sdk import query as sdk_query, ClaudeAgentOptions, AssistantMessage, ToolUseBlock, ToolResultBlock

    prompt = (
        f"You are exploring a codebase at {local_path}.\n"
        f"The user wants to know: {query}\n\n"
        "Read relevant files, search for patterns, and provide a clear, specific answer. "
        "Include relevant file paths and code snippets. Keep your answer under 1500 characters."
    )

    result_text = ""
    try:
        async for message in sdk_query(
            prompt=prompt,
            options=ClaudeAgentOptions(
                allowed_tools=["Read", "Bash", "Glob", "LS"],
                cwd=local_path,
                permission_mode="acceptEdits",
                max_turns=8,
            ),
        ):
            if isinstance(message, AssistantMessage):
                for block in (message.content or []):
                    if hasattr(block, "text"):
                        result_text = block.text
                    # Surface tool use steps
                    if on_status and isinstance(block, ToolUseBlock):
                        tool_name = block.name
                        tool_input = block.input or {}
                        if tool_name == "Read":
                            on_status(f"Reading {tool_input.get('file_path', '').split('/')[-1] or 'file'}...")
                        elif tool_name == "Bash":
                            cmd = tool_input.get("command", "")[:60]
                            on_status(f"Running: {cmd}")
                        elif tool_name == "Glob":
                            on_status(f"Searching for {tool_input.get('pattern', 'files')}...")
                        elif tool_name == "LS":
                            on_status(f"Listing directory...")
    except Exception as e:
        return f"Code exploration failed: {e}"

    return result_text[:3000] if result_text else "No results found."


async def stream_chat(
    db: Session,
    messages: list[dict],
    focus_project_id: str | None,
) -> AsyncIterator[str]:
    """
    Stream a chat response using the Messages API.
    Supports tool use for code exploration when focus project has a local_path.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    system = build_system_prompt(db, focus_project_id)

    # Determine if code exploration tool is available
    project = db.get(Project, focus_project_id) if focus_project_id else None
    tools = [CODE_QUERY_TOOL] if (project and project.local_path) else []

    # Prepend conversation summary if session has one
    scope_type = "project" if focus_project_id else "portfolio"
    scope_id = focus_project_id
    session = db.query(ChatSession).filter(
        ChatSession.scope_type == scope_type,
        ChatSession.scope_id == scope_id if scope_id else ChatSession.scope_id.is_(None),
    ).first()

    api_messages = list(messages)
    if session and session.summary:
        api_messages = [
            {"role": "assistant", "content": f"[Previous conversation summary]\n{session.summary}"},
            {"role": "user", "content": "Thanks for the context. Let's continue."},
            *api_messages,
        ]

    # Status events are dicts: {"type": "status", "message": "..."}
    # Text chunks are plain strings
    # The router distinguishes between them for SSE formatting

    # Multi-turn loop to handle tool use
    while True:
        yield {"type": "status", "message": "Thinking..."}

        kwargs: dict = dict(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=system,
            messages=api_messages,
        )
        if tools:
            kwargs["tools"] = tools

        async with client.messages.stream(**kwargs) as stream:
            first_text = True
            async for event in stream:
                if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                    if first_text:
                        yield {"type": "status", "message": ""}  # clear status
                        first_text = False
                    yield event.delta.text

            response = await stream.get_final_message()

        # If no tool use, we're done
        if response.stop_reason != "tool_use":
            break

        # Extract tool use blocks
        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
        if not tool_use_blocks:
            break

        # Append assistant message (with tool_use blocks) to conversation
        api_messages.append({"role": "assistant", "content": response.content})

        # Execute tools and build results
        tool_results = []
        status_queue: list[str] = []

        def on_agent_status(msg: str):
            status_queue.append(msg)

        for tool_block in tool_use_blocks:
            if tool_block.name == "code_query" and project and project.local_path:
                yield {"type": "status", "message": f"Exploring code: {tool_block.input['query'][:80]}"}
                result = await _execute_code_query(
                    project.local_path,
                    tool_block.input["query"],
                    on_status=on_agent_status,
                )
                # Flush any agent status updates that were queued
                for s in status_queue:
                    yield {"type": "status", "message": s}
                status_queue.clear()

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_block.id,
                    "content": result,
                })

        yield {"type": "status", "message": "Analyzing results..."}

        # Append tool results and continue the loop
        api_messages.append({"role": "user", "content": tool_results})


# ── Auto-compaction ──────────────────────────────────────────────────────────

COMPACTION_THRESHOLD = 30  # messages (15 exchanges)
KEEP_RECENT = 6            # keep last 3 exchanges verbatim


async def maybe_compact_session(db: Session, session: ChatSession) -> None:
    """Summarize older messages if session exceeds threshold."""
    if len(session.messages) < COMPACTION_THRESHOLD:
        return

    old_messages = session.messages[:-KEEP_RECENT]
    recent_messages = session.messages[-KEEP_RECENT:]

    old_text = "\n".join(f"{m['role']}: {m['content']}" for m in old_messages)

    context = f"Previous summary:\n{session.summary}\n\n" if session.summary else ""

    summarization_prompt = f"""{context}Summarize the following conversation history into a concise summary (max 500 words). Preserve key decisions, insights, action items, and any project-specific conclusions. This summary will be used as context for continuing the conversation.

{old_text}"""

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=600,
        messages=[{"role": "user", "content": summarization_prompt}],
    )

    session.summary = response.content[0].text
    session.messages = recent_messages
    db.commit()
