"""
Data import/export endpoints for VibeFocus.
Supports JSON (full/per-project), CSV, SQLite backup, and JSON import.
"""

import csv
import io
import json
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session

from database import get_db, settings
from models import (
    Project, Bucket, State, NextStep, SubGoal, ProjectLink,
    ProjectDoc, ProjectNote, Insight, WeeklyFocus, ChatSession,
    CommitLog, HealthSnapshot,
)

router = APIRouter(prefix="/api/data", tags=["data"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _serialize_project(p: Project) -> dict:
    """Serialize a project and all its relations to a dict."""
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "notes": p.notes,
        "bucket_id": p.bucket_id,
        "state_id": p.state_id,
        "github_url": p.github_url,
        "local_path": p.local_path,
        "priority": p.priority,
        "completion_pct": p.completion_pct,
        "ai_completion_pct": p.ai_completion_pct,
        "ai_completion_reason": p.ai_completion_reason,
        "target_date": str(p.target_date) if p.target_date else None,
        "kanban_position": p.kanban_position,
        "git_last_commit": p.git_last_commit,
        "git_branch": p.git_branch,
        "git_uncommitted": p.git_uncommitted,
        "code_summary": p.code_summary,
        "code_tech_stack": p.code_tech_stack,
        "code_todos": p.code_todos,
        "last_analyzed_at": str(p.last_analyzed_at) if p.last_analyzed_at else None,
        "created_at": str(p.created_at),
        "updated_at": str(p.updated_at),
        "next_steps": [{"id": s.id, "text": s.text, "done": s.done, "position": s.position} for s in p.next_steps],
        "sub_goals": [{"id": g.id, "text": g.text, "category": g.category, "done": g.done} for g in p.sub_goals],
        "links": [{"id": l.id, "label": l.label, "url": l.url} for l in p.links],
        "docs": [{"id": d.id, "name": d.name, "doc_type": d.doc_type, "source": d.source,
                   "file_path": d.file_path, "content": d.content, "summary": d.summary} for d in p.docs],
        "project_notes": [{"id": n.id, "text": n.text, "category": n.category,
                           "created_at": str(n.created_at)} for n in p.project_notes],
        "insights": [{"id": i.id, "text": i.text, "prompt": i.prompt,
                       "saved_at": str(i.saved_at)} for i in p.insights],
    }


# ── Export ───────────────────────────────────────────────────────────────────

@router.get("/export")
def export_all(db: Session = Depends(get_db)):
    """Export the entire portfolio as JSON."""
    projects = db.query(Project).all()
    buckets = db.query(Bucket).all()
    states = db.query(State).all()
    focuses = db.query(WeeklyFocus).all()
    chat_sessions = db.query(ChatSession).all()

    data = {
        "export_version": "1.0",
        "exported_at": datetime.utcnow().isoformat(),
        "app": "vibefocus",
        "buckets": [{"id": b.id, "name": b.name, "color": b.color, "position": b.position} for b in buckets],
        "states": [{"id": s.id, "name": s.name, "color": s.color, "position": s.position} for s in states],
        "projects": [_serialize_project(p) for p in projects],
        "weekly_focuses": [
            {"id": f.id, "project_id": f.project_id, "commitment": f.commitment,
             "tasks": f.tasks, "notes": f.notes, "notes_pinned": f.notes_pinned,
             "position": f.position}
            for f in focuses
        ],
        "chat_sessions": [
            {"id": c.id, "scope_type": c.scope_type, "scope_id": c.scope_id,
             "messages": c.messages, "summary": c.summary}
            for c in chat_sessions
        ],
    }

    content = json.dumps(data, indent=2, default=str)
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=vibefocus-export-{datetime.utcnow().strftime('%Y%m%d')}.json"},
    )


@router.get("/export/{project_id}")
def export_project(project_id: str, db: Session = Depends(get_db)):
    """Export a single project as JSON."""
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")

    data = {
        "export_version": "1.0",
        "exported_at": datetime.utcnow().isoformat(),
        "app": "vibefocus",
        "project": _serialize_project(p),
    }

    safe_name = p.name.lower().replace(" ", "-")[:30]
    content = json.dumps(data, indent=2, default=str)
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=vibefocus-{safe_name}-{datetime.utcnow().strftime('%Y%m%d')}.json"},
    )


@router.get("/export-csv")
def export_csv(db: Session = Depends(get_db)):
    """Export all projects as a flat CSV."""
    projects = db.query(Project).all()
    buckets = {b.id: b.name for b in db.query(Bucket).all()}
    states = {s.id: s.name for s in db.query(State).all()}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Name", "Description", "State", "Category", "Priority",
        "Completion %", "Target Date", "Local Path", "GitHub URL",
        "Tech Stack", "Health", "Next Steps (pending)", "Goals (done/total)",
        "Created", "Updated",
    ])

    for p in projects:
        pending_steps = sum(1 for s in p.next_steps if not s.done)
        goals_done = sum(1 for g in p.sub_goals if g.done)
        goals_total = len(p.sub_goals)
        tech = ", ".join(p.code_tech_stack) if p.code_tech_stack else ""

        writer.writerow([
            p.name, p.description,
            states.get(p.state_id, ""), buckets.get(p.bucket_id, ""),
            p.priority, p.completion_pct,
            str(p.target_date) if p.target_date else "",
            p.local_path or "", p.github_url or "",
            tech, "",
            pending_steps, f"{goals_done}/{goals_total}" if goals_total else "",
            str(p.created_at), str(p.updated_at),
        ])

    content = output.getvalue()
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=vibefocus-export-{datetime.utcnow().strftime('%Y%m%d')}.csv"},
    )


@router.get("/export-db")
def export_database():
    """Download the SQLite database file directly."""
    db_url = settings.database_url
    # Extract path from sqlite:///./path
    db_path = db_url.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = db_path[2:]

    db_file = Path(db_path)
    if not db_file.exists():
        raise HTTPException(404, "Database file not found")

    # Copy to temp location to avoid locking issues
    backup_path = db_file.parent / f"vibefocus-backup-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.db"
    shutil.copy2(db_file, backup_path)

    def cleanup():
        backup_path.unlink(missing_ok=True)

    return FileResponse(
        path=str(backup_path),
        media_type="application/x-sqlite3",
        filename=f"vibefocus-backup-{datetime.utcnow().strftime('%Y%m%d')}.db",
        background=cleanup,
    )


@router.get("/export-markdown/{project_id}")
def export_markdown(project_id: str, db: Session = Depends(get_db)):
    """Export a single project as a Markdown status report."""
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")

    buckets = {b.id: b.name for b in db.query(Bucket).all()}
    states = {s.id: s.name for s in db.query(State).all()}

    lines = [
        f"# {p.name}",
        "",
        f"**State:** {states.get(p.state_id, 'Unknown')}  ",
        f"**Category:** {buckets.get(p.bucket_id, 'Unknown')}  ",
        f"**Priority:** {p.priority}  ",
        f"**Completion:** {p.completion_pct}%  ",
    ]
    if p.target_date:
        lines.append(f"**Target Date:** {p.target_date}  ")
    lines.append("")

    if p.description:
        lines.extend([f"> {p.description}", ""])

    if p.code_tech_stack:
        lines.extend([f"**Tech Stack:** {', '.join(p.code_tech_stack)}", ""])

    if p.code_summary:
        lines.extend(["## Code Analysis", "", p.code_summary, ""])

    pending = [s for s in p.next_steps if not s.done]
    done = [s for s in p.next_steps if s.done]
    if pending or done:
        lines.append("## Next Steps")
        lines.append("")
        for s in pending:
            lines.append(f"- [ ] {s.text}")
        for s in done:
            lines.append(f"- [x] {s.text}")
        lines.append("")

    if p.sub_goals:
        lines.append("## Sub-Goals")
        lines.append("")
        for g in p.sub_goals:
            check = "x" if g.done else " "
            lines.append(f"- [{check}] {g.text} *({g.category})*")
        lines.append("")

    if p.project_notes:
        lines.append("## Notes")
        lines.append("")
        for n in p.project_notes:
            lines.append(f"### {n.category.title()} — {str(n.created_at)[:16]}")
            lines.append("")
            lines.append(n.text)
            lines.append("")

    if p.insights:
        lines.append("## AI Insights")
        lines.append("")
        for i in p.insights:
            lines.append(f"*{str(i.saved_at)[:16]}*")
            lines.append("")
            lines.append(i.text)
            lines.append("")

    content = "\n".join(lines)
    safe_name = p.name.lower().replace(" ", "-")[:30]
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename={safe_name}-report.md"},
    )


# ── Import ───────────────────────────────────────────────────────────────────

@router.post("/import")
async def import_data(
    file: UploadFile = File(...),
    mode: str = Query(default="merge", description="'merge' (skip existing) or 'overwrite' (replace all)"),
    db: Session = Depends(get_db),
):
    """Import portfolio data from a JSON export file."""
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(400, "File must be a .json file")

    content = await file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON file")

    if data.get("app") != "vibefocus":
        raise HTTPException(400, "Not a VibeFocus export file")

    stats = {"buckets": 0, "states": 0, "projects": 0, "skipped": 0}

    if mode == "overwrite":
        # Delete all existing data
        db.query(WeeklyFocus).delete()
        db.query(ChatSession).delete()
        db.query(Insight).delete()
        db.query(ProjectNote).delete()
        db.query(ProjectDoc).delete()
        db.query(ProjectLink).delete()
        db.query(SubGoal).delete()
        db.query(NextStep).delete()
        db.query(CommitLog).delete()
        db.query(HealthSnapshot).delete()
        db.query(Project).delete()
        db.query(Bucket).delete()
        db.query(State).delete()
        db.commit()

    # Import buckets
    for b in data.get("buckets", []):
        existing = db.get(Bucket, b["id"])
        if existing and mode == "merge":
            continue
        if not existing:
            db.add(Bucket(id=b["id"], name=b["name"], color=b["color"], position=b.get("position", 0)))
            stats["buckets"] += 1

    # Import states
    for s in data.get("states", []):
        existing = db.get(State, s["id"])
        if existing and mode == "merge":
            continue
        if not existing:
            db.add(State(id=s["id"], name=s["name"], color=s["color"], position=s.get("position", 0)))
            stats["states"] += 1

    db.commit()

    # Import projects
    for proj_data in data.get("projects", []):
        existing = db.get(Project, proj_data["id"])
        if existing and mode == "merge":
            stats["skipped"] += 1
            continue

        # Ensure bucket_id and state_id exist
        if not db.get(Bucket, proj_data["bucket_id"]):
            first_bucket = db.query(Bucket).first()
            if first_bucket:
                proj_data["bucket_id"] = first_bucket.id
            else:
                continue

        if proj_data.get("state_id") and not db.get(State, proj_data["state_id"]):
            proj_data["state_id"] = None

        p = Project(
            id=proj_data["id"],
            name=proj_data["name"],
            description=proj_data.get("description", ""),
            notes=proj_data.get("notes", ""),
            bucket_id=proj_data["bucket_id"],
            state_id=proj_data.get("state_id"),
            github_url=proj_data.get("github_url"),
            local_path=proj_data.get("local_path"),
            priority=proj_data.get("priority", "medium"),
            completion_pct=proj_data.get("completion_pct", 0),
            ai_completion_pct=proj_data.get("ai_completion_pct"),
            ai_completion_reason=proj_data.get("ai_completion_reason"),
            kanban_position=proj_data.get("kanban_position", 0),
            code_summary=proj_data.get("code_summary"),
            code_tech_stack=proj_data.get("code_tech_stack"),
            code_todos=proj_data.get("code_todos"),
        )
        db.add(p)
        db.commit()

        # Import sub-items
        for s in proj_data.get("next_steps", []):
            db.add(NextStep(id=s.get("id"), project_id=p.id, text=s["text"],
                            done=s.get("done", False), position=s.get("position", 0)))
        for g in proj_data.get("sub_goals", []):
            db.add(SubGoal(id=g.get("id"), project_id=p.id, text=g["text"],
                           category=g.get("category", "Other"), done=g.get("done", False)))
        for l in proj_data.get("links", []):
            db.add(ProjectLink(id=l.get("id"), project_id=p.id, label=l["label"], url=l["url"]))
        for d in proj_data.get("docs", []):
            db.add(ProjectDoc(id=d.get("id"), project_id=p.id, name=d["name"],
                              doc_type=d.get("doc_type", "manual"), source=d.get("source"),
                              content=d.get("content"), summary=d.get("summary")))
        for n in proj_data.get("project_notes", []):
            db.add(ProjectNote(id=n.get("id"), project_id=p.id, text=n["text"],
                               category=n.get("category", "general")))
        for i in proj_data.get("insights", []):
            db.add(Insight(id=i.get("id"), project_id=p.id, text=i["text"],
                           prompt=i.get("prompt")))

        stats["projects"] += 1

    # Import weekly focuses
    for f in data.get("weekly_focuses", []):
        existing = db.get(WeeklyFocus, f["id"])
        if existing and mode == "merge":
            continue
        if not existing and db.get(Project, f["project_id"]):
            db.add(WeeklyFocus(id=f["id"], project_id=f["project_id"],
                               commitment=f.get("commitment", ""),
                               tasks=f.get("tasks", []),
                               notes=f.get("notes", ""),
                               notes_pinned=f.get("notes_pinned", False),
                               position=f.get("position", 0)))

    db.commit()

    return {
        "status": "ok",
        "mode": mode,
        "imported": stats,
    }


@router.post("/import/preview")
async def import_preview(file: UploadFile = File(...)):
    """Preview what an import file contains without importing."""
    content = await file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON file")

    if data.get("app") != "vibefocus":
        raise HTTPException(400, "Not a VibeFocus export file")

    projects = data.get("projects", [])
    return {
        "export_version": data.get("export_version"),
        "exported_at": data.get("exported_at"),
        "counts": {
            "buckets": len(data.get("buckets", [])),
            "states": len(data.get("states", [])),
            "projects": len(projects),
            "weekly_focuses": len(data.get("weekly_focuses", [])),
            "chat_sessions": len(data.get("chat_sessions", [])),
        },
        "projects": [{"name": p["name"], "completion_pct": p.get("completion_pct", 0)} for p in projects],
    }
