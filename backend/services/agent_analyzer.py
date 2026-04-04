"""
Agent SDK code analyzer.

Given a local_path, spins up an Agent SDK session with Read + Bash tools
and produces a structured CodeAnalysis result. The agent reads the codebase
itself — no manual file traversal needed.
"""

from __future__ import annotations
import json
import os
import sys
from pathlib import Path
from datetime import datetime

from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage
from schemas import CodeAnalysis, DetectedDoc


ANALYSIS_PROMPT = """\
You are analyzing a software project at the path: {path}

Your goal is to produce a structured JSON summary that will be used as context
in a portfolio management tool. The owner is a solo developer who wants to
understand the current state of this project at a glance.

Please do the following:
1. Read the README.md (or README, README.rst) if it exists
2. Look at the top-level directory structure
3. Identify the primary language(s) and framework(s)
4. Run `git log --oneline -10` to see recent commit history
5. Run `git status --short` to check for uncommitted changes
6. Search for TODO, FIXME, and HACK comments across source files
   (use something like: grep -r "TODO\\|FIXME\\|HACK" --include="*.py" --include="*.ts" --include="*.js" --include="*.go" -n . 2>/dev/null | head -20)
7. Note any obvious docs, tests, or CI/CD setup
8. Look for key project documents:
   - PRD, product requirements, or spec files (prd.md, PRD.md, spec.md, requirements.md, REQUIREMENTS.md)
   - Development plans, architecture, or design docs (ARCHITECTURE.md, DESIGN.md, plan.md, dev-plan.md, DEVELOPMENT_PLAN.md)
   - Changelogs (CHANGELOG.md, CHANGES.md)
   - Any docs/ or documentation/ folder — list the key files within
   - Any .md files in the project root that aren't README
   For each found document, read the first few lines to produce a brief summary.
9. Estimate the overall completion percentage of this project (0-100):
   - Consider: TODO density relative to codebase size, code maturity (tests, error handling, docs),
     feature completeness signals, development plan progress if a plan document exists,
     commit patterns (are they adding features or polishing?), README completeness
   - 0-20: very early / skeleton / proof of concept
   - 20-50: core features being built, significant work remaining
   - 50-75: most core features work, needs polish/testing/docs
   - 75-90: feature complete, needs hardening and launch prep
   - 90-100: production ready or launched
   Provide a brief explanation of your reasoning.

Then respond with ONLY a valid JSON object (no markdown, no explanation) in this exact shape:

{{
  "summary": "2-3 sentence plain-English summary of what this project is, its current state, and anything notable about recent activity",
  "tech_stack": ["Python", "FastAPI"],
  "recent_activity": "Brief description of the last few commits",
  "has_uncommitted": false,
  "todos": [
    {{"file": "relative/path.py", "line": 42, "text": "TODO: add rate limiting"}}
  ],
  "documents": [
    {{"name": "PRD", "file_path": "docs/prd.md", "summary": "First 2-3 sentences of the document"}}
  ],
  "completion_pct": 45,
  "completion_reason": "Core API and models are built but no tests, no auth, and 12 TODOs remain.",
  "readme_excerpt": "First 2-3 sentences of the README, or null if no README",
  "health_signal": "active|cooling|dormant",
  "notes_for_owner": "One specific, honest observation about the project state that would be useful for prioritization"
}}

health_signal rules:
- "active": commits in the last 2 weeks
- "cooling": last commit 2-6 weeks ago
- "dormant": last commit more than 6 weeks ago, or no git history

Be direct and specific. Do not pad or flatter.
"""


async def analyze_local_project(local_path: str) -> CodeAnalysis:
    """
    Run Agent SDK analysis on a local codebase.
    Returns a CodeAnalysis schema with cached results.
    """
    path = Path(local_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Local path does not exist: {local_path}")
    if not path.is_dir():
        raise ValueError(f"Local path is not a directory: {local_path}")

    prompt = ANALYSIS_PROMPT.format(path=str(path))

    # Collect all output from the agent loop
    result_text = ""
    async for message in query(
        prompt=prompt,
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Bash", "Glob", "LS"],
            cwd=str(path),
            permission_mode="acceptEdits",
            max_turns=12,
        ),
    ):
        # Collect text from assistant messages; keep the last text block
        if isinstance(message, AssistantMessage):
            for block in (message.content or []):
                if hasattr(block, "text"):
                    result_text = block.text

    # Parse the JSON response — handle text before/after JSON, markdown fences, etc.
    try:
        clean = result_text.strip()

        # Try to extract JSON from markdown code fences (```json ... ```)
        if "```" in clean:
            parts = clean.split("```")
            for part in parts:
                candidate = part.strip()
                if candidate.startswith("json"):
                    candidate = candidate[4:].strip()
                if candidate.startswith("{"):
                    try:
                        data = json.loads(candidate)
                        break
                    except json.JSONDecodeError:
                        continue
            else:
                raise json.JSONDecodeError("No valid JSON in fenced blocks", clean, 0)
        else:
            # No fences — find the first { and last } to extract JSON object
            first_brace = clean.find("{")
            last_brace = clean.rfind("}")
            if first_brace != -1 and last_brace > first_brace:
                data = json.loads(clean[first_brace:last_brace + 1])
            else:
                data = json.loads(clean)
    except (json.JSONDecodeError, IndexError) as e:
        # If parsing fails, store the raw text as the summary
        return CodeAnalysis(
            code_summary=result_text[:2000] if result_text else "Analysis failed — could not parse agent output.",
            last_analyzed_at=datetime.utcnow(),
        )

    # Map the agent's structured output to our schema
    todos = [
        {"file": t.get("file", ""), "line": t.get("line", 0), "text": t.get("text", "")}
        for t in data.get("todos", [])
    ]

    summary_parts = [data.get("summary", "")]
    if data.get("recent_activity"):
        summary_parts.append(f"Recent activity: {data['recent_activity']}")
    if data.get("readme_excerpt"):
        summary_parts.append(f"README: {data['readme_excerpt']}")
    if data.get("notes_for_owner"):
        summary_parts.append(f"Note: {data['notes_for_owner']}")

    detected_docs = [
        DetectedDoc(
            name=d.get("name", "Untitled"),
            file_path=d.get("file_path", ""),
            summary=d.get("summary"),
        )
        for d in data.get("documents", [])
        if d.get("file_path")
    ]

    # Parse completion estimate
    ai_completion_pct = data.get("completion_pct")
    if isinstance(ai_completion_pct, (int, float)):
        ai_completion_pct = max(0, min(100, int(ai_completion_pct)))
    else:
        ai_completion_pct = None

    return CodeAnalysis(
        code_summary="\n\n".join(p for p in summary_parts if p),
        code_tech_stack=data.get("tech_stack", []),
        code_todos=todos,
        detected_docs=detected_docs or None,
        ai_completion_pct=ai_completion_pct,
        ai_completion_reason=data.get("completion_reason"),
        last_analyzed_at=datetime.utcnow(),
    )
