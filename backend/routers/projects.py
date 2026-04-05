from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

import asyncio
import logging

from pathlib import Path

from database import get_db, SessionLocal
from models import Project, NextStep, SubGoal, ProjectLink, ProjectDoc, ProjectNote, WeeklyFocus
import schemas
from services.agent_analyzer import analyze_local_project
from services.git_service import refresh_stats, sync_git_log
from models import CommitLog, HealthSnapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _project_or_404(project_id: str, db: Session) -> Project:
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.updated_at.desc()).all()


@router.post("", response_model=schemas.ProjectOut, status_code=201)
def create_project(
    body: schemas.ProjectCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    project = Project(**body.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)

    # Auto-analyze if local_path is set
    if project.local_path:
        background_tasks.add_task(_bg_analyze, project.id, project.local_path)

    return project


async def _bg_analyze(project_id: str, local_path: str):
    """Run code analysis in the background after project creation."""
    try:
        analysis = await analyze_local_project(local_path)
        with SessionLocal() as db:
            p = db.get(Project, project_id)
            if p:
                p.code_summary = analysis.code_summary
                p.code_tech_stack = analysis.code_tech_stack
                p.code_todos = analysis.code_todos
                p.last_analyzed_at = analysis.last_analyzed_at
                p.ai_completion_pct = analysis.ai_completion_pct
                p.ai_completion_reason = analysis.ai_completion_reason
                _store_detected_docs(db, project_id, local_path, analysis)
                db.commit()
                logger.info(f"Auto-analyzed project '{p.name}'")
    except Exception as e:
        logger.warning(f"Auto-analysis failed for project {project_id}: {e}")


def _store_detected_docs(db, project_id: str, local_path: str, analysis):
    """Replace detected docs with fresh results from analysis."""
    if not analysis.detected_docs:
        return
    # Remove old detected docs (keep manual ones)
    db.query(ProjectDoc).filter(
        ProjectDoc.project_id == project_id,
        ProjectDoc.doc_type == "detected",
    ).delete()
    for doc in analysis.detected_docs:
        abs_path = str(Path(local_path) / doc.file_path)
        db.add(ProjectDoc(
            project_id=project_id,
            name=doc.name,
            doc_type="detected",
            source="file",
            file_path=abs_path,
            summary=doc.summary,
            detected_at=datetime.utcnow(),
        ))


# ── Weekly Focus (must be before /{project_id} routes) ───────────────────────

@router.get("/focus", response_model=list[schemas.WeeklyFocusOut])
def list_focuses(db: Session = Depends(get_db)):
    return db.query(WeeklyFocus).order_by(WeeklyFocus.position).all()


@router.post("/focus", response_model=schemas.WeeklyFocusOut, status_code=201)
def create_focus(body: schemas.WeeklyFocusCreate, db: Session = Depends(get_db)):
    _project_or_404(body.project_id, db)
    existing = db.query(WeeklyFocus).filter(WeeklyFocus.project_id == body.project_id).first()
    if existing:
        existing.commitment = body.commitment
        db.commit()
        db.refresh(existing)
        return existing
    focus = WeeklyFocus(**body.model_dump())
    db.add(focus)
    db.commit()
    db.refresh(focus)
    return focus


@router.patch("/focus/{focus_id}", response_model=schemas.WeeklyFocusOut)
def update_focus(focus_id: str, body: schemas.WeeklyFocusUpdate, db: Session = Depends(get_db)):
    f = db.get(WeeklyFocus, focus_id)
    if not f:
        raise HTTPException(404, "Focus not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(f, field, value)
    db.commit()
    db.refresh(f)
    return f


@router.delete("/focus/{focus_id}", status_code=204)
def delete_focus(focus_id: str, db: Session = Depends(get_db)):
    f = db.get(WeeklyFocus, focus_id)
    if not f:
        raise HTTPException(404, "Focus not found")
    db.delete(f)
    db.commit()


# ── Single project ───────────────────────────────────────────────────────────

@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db)):
    return _project_or_404(project_id, db)


@router.patch("/{project_id}", response_model=schemas.ProjectOut)
def update_project(
    project_id: str,
    body: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
):
    p = _project_or_404(project_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    p = _project_or_404(project_id, db)
    db.delete(p)
    db.commit()


# ── Next steps ───────────────────────────────────────────────────────────────

@router.post("/{project_id}/steps", response_model=schemas.NextStepOut, status_code=201)
def add_step(project_id: str, body: schemas.NextStepCreate, db: Session = Depends(get_db)):
    _project_or_404(project_id, db)
    step = NextStep(project_id=project_id, **body.model_dump())
    db.add(step)
    db.commit()
    db.refresh(step)
    return step


@router.patch("/{project_id}/steps/{step_id}", response_model=schemas.NextStepOut)
def update_step(
    project_id: str, step_id: str,
    body: dict, db: Session = Depends(get_db)
):
    step = db.get(NextStep, step_id)
    if not step or step.project_id != project_id:
        raise HTTPException(404, "Step not found")
    for k, v in body.items():
        if hasattr(step, k):
            setattr(step, k, v)
    db.commit()
    db.refresh(step)
    return step


@router.delete("/{project_id}/steps/{step_id}", status_code=204)
def delete_step(project_id: str, step_id: str, db: Session = Depends(get_db)):
    step = db.get(NextStep, step_id)
    if not step or step.project_id != project_id:
        raise HTTPException(404, "Step not found")
    db.delete(step)
    db.commit()


# ── Sub-goals ─────────────────────────────────────────────────────────────────

@router.post("/{project_id}/goals", response_model=schemas.SubGoalOut, status_code=201)
def add_goal(project_id: str, body: schemas.SubGoalCreate, db: Session = Depends(get_db)):
    _project_or_404(project_id, db)
    goal = SubGoal(project_id=project_id, **body.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.patch("/{project_id}/goals/{goal_id}", response_model=schemas.SubGoalOut)
def update_goal(project_id: str, goal_id: str, body: dict, db: Session = Depends(get_db)):
    goal = db.get(SubGoal, goal_id)
    if not goal or goal.project_id != project_id:
        raise HTTPException(404, "Goal not found")
    for k, v in body.items():
        if hasattr(goal, k):
            setattr(goal, k, v)
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/{project_id}/goals/{goal_id}", status_code=204)
def delete_goal(project_id: str, goal_id: str, db: Session = Depends(get_db)):
    goal = db.get(SubGoal, goal_id)
    if not goal or goal.project_id != project_id:
        raise HTTPException(404, "Goal not found")
    db.delete(goal)
    db.commit()


# ── Links ─────────────────────────────────────────────────────────────────────

@router.post("/{project_id}/links", response_model=schemas.ProjectLinkOut, status_code=201)
def add_link(project_id: str, body: schemas.ProjectLinkCreate, db: Session = Depends(get_db)):
    _project_or_404(project_id, db)
    link = ProjectLink(project_id=project_id, **body.model_dump())
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/{project_id}/links/{link_id}", status_code=204)
def delete_link(project_id: str, link_id: str, db: Session = Depends(get_db)):
    link = db.get(ProjectLink, link_id)
    if not link or link.project_id != project_id:
        raise HTTPException(404, "Link not found")
    db.delete(link)
    db.commit()


# ── Insights ──────────────────────────────────────────────────────────────────

@router.post("/{project_id}/insights", response_model=schemas.InsightOut, status_code=201)
def save_insight(
    project_id: str,
    body: schemas.InsightCreate,
    db: Session = Depends(get_db),
):
    from models import Insight
    _project_or_404(project_id, db)
    insight = Insight(project_id=project_id, **body.model_dump())
    db.add(insight)
    db.commit()
    db.refresh(insight)
    return insight


@router.delete("/{project_id}/insights/{insight_id}", status_code=204)
def delete_insight(project_id: str, insight_id: str, db: Session = Depends(get_db)):
    from models import Insight
    insight = db.get(Insight, insight_id)
    if not insight or insight.project_id != project_id:
        raise HTTPException(404, "Insight not found")
    db.delete(insight)
    db.commit()


# ── Docs ─────────────────────────────────────────────────────────────────────

@router.post("/{project_id}/docs", response_model=schemas.ProjectDocOut, status_code=201)
def add_doc(project_id: str, body: schemas.ProjectDocCreate, db: Session = Depends(get_db)):
    _project_or_404(project_id, db)
    doc = ProjectDoc(project_id=project_id, doc_type="manual", **body.model_dump())
    # Auto-generate summary from content for pasted docs
    if doc.source == "pasted" and doc.content:
        doc.summary = doc.content[:200]
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.patch("/{project_id}/docs/{doc_id}", response_model=schemas.ProjectDocOut)
def update_doc(project_id: str, doc_id: str, body: schemas.ProjectDocUpdate, db: Session = Depends(get_db)):
    doc = db.get(ProjectDoc, doc_id)
    if not doc or doc.project_id != project_id:
        raise HTTPException(404, "Doc not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    if doc.source == "pasted" and doc.content:
        doc.summary = doc.content[:200]
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{project_id}/docs/{doc_id}", status_code=204)
def delete_doc(project_id: str, doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(ProjectDoc, doc_id)
    if not doc or doc.project_id != project_id:
        raise HTTPException(404, "Doc not found")
    db.delete(doc)
    db.commit()


@router.get("/{project_id}/docs/{doc_id}/content")
def get_doc_content(project_id: str, doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(ProjectDoc, doc_id)
    if not doc or doc.project_id != project_id:
        raise HTTPException(404, "Doc not found")
    if doc.source == "pasted":
        return {"content": doc.content or ""}
    if doc.source == "file" and doc.file_path:
        try:
            text = Path(doc.file_path).read_text(errors="replace")[:50_000]
            return {"content": text}
        except (OSError, PermissionError):
            return {"content": doc.summary or "(file not readable)"}
    return {"content": doc.summary or ""}


# ── Project Notes ─────────────────────────────────────────────────────────────

@router.post("/{project_id}/notes", response_model=schemas.ProjectNoteOut, status_code=201)
def add_note(project_id: str, body: schemas.ProjectNoteCreate, db: Session = Depends(get_db)):
    _project_or_404(project_id, db)
    note = ProjectNote(project_id=project_id, **body.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{project_id}/notes/{note_id}", response_model=schemas.ProjectNoteOut)
def update_note(project_id: str, note_id: str, body: schemas.ProjectNoteUpdate, db: Session = Depends(get_db)):
    note = db.get(ProjectNote, note_id)
    if not note or note.project_id != project_id:
        raise HTTPException(404, "Note not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{project_id}/notes/{note_id}", status_code=204)
def delete_note(project_id: str, note_id: str, db: Session = Depends(get_db)):
    note = db.get(ProjectNote, note_id)
    if not note or note.project_id != project_id:
        raise HTTPException(404, "Note not found")
    db.delete(note)
    db.commit()


# ── Code analysis (Agent SDK) ─────────────────────────────────────────────────

@router.post("/{project_id}/analyze", response_model=schemas.ProjectOut)
async def analyze_project(project_id: str, db: Session = Depends(get_db)):
    """
    Trigger Agent SDK analysis of the project's local_path.
    Stores results in the project record and returns the updated project.
    Can take 15-60 seconds depending on codebase size.
    """
    p = _project_or_404(project_id, db)
    if not p.local_path:
        raise HTTPException(400, "Project has no local_path set")

    try:
        analysis = await analyze_local_project(p.local_path)
    except Exception as e:
        raise HTTPException(502, f"Code analysis failed: {e}")

    p.code_summary = analysis.code_summary
    p.code_tech_stack = analysis.code_tech_stack
    p.code_todos = analysis.code_todos
    p.last_analyzed_at = analysis.last_analyzed_at
    p.ai_completion_pct = analysis.ai_completion_pct
    p.ai_completion_reason = analysis.ai_completion_reason
    p.updated_at = datetime.utcnow()
    _store_detected_docs(db, project_id, p.local_path, analysis)

    db.commit()
    db.refresh(p)
    return p


# ── Git + GitHub stats ────────────────────────────────────────────────────────

@router.post("/{project_id}/refresh-stats", response_model=schemas.ProjectOut)
async def refresh_project_stats(project_id: str, db: Session = Depends(get_db)):
    """
    Refresh local git stats and GitHub stats for a project.
    Fast (< 5 seconds).
    """
    p = _project_or_404(project_id, db)
    stats = await refresh_stats(p.local_path, p.github_url)

    for field, value in stats.model_dump(exclude_none=True).items():
        setattr(p, field, value)

    db.commit()
    db.refresh(p)
    return p


# ── Git log sync ────────────────────────────────────────────────────────────

@router.post("/{project_id}/sync-git-log")
def sync_project_git_log(
    project_id: str,
    fetch_all: bool = False,
    db: Session = Depends(get_db),
):
    """
    Sync commit history from the local git repo into the database.
    Incremental by default — only fetches commits since last sync.
    """
    p = _project_or_404(project_id, db)
    if not p.local_path:
        raise HTTPException(400, "Project has no local_path set")

    commits_data = sync_git_log(p.local_path, since=None if fetch_all else p.last_git_sync_at, fetch_all=fetch_all)

    # Get existing SHAs to avoid duplicates
    existing_shas = set(
        row[0] for row in
        db.query(CommitLog.sha).filter(CommitLog.project_id == project_id).all()
    )

    new_commits = []
    for c in commits_data:
        if c["sha"] not in existing_shas:
            new_commits.append(CommitLog(project_id=project_id, **c))

    if new_commits:
        db.bulk_save_objects(new_commits)

    # Update health snapshot
    now = datetime.utcnow()
    seven_days_ago = datetime(now.year, now.month, now.day) - timedelta(days=7)
    thirty_days_ago = datetime(now.year, now.month, now.day) - timedelta(days=30)

    commits_7d = db.query(CommitLog).filter(
        CommitLog.project_id == project_id,
        CommitLog.committed_at >= seven_days_ago,
    ).count()
    commits_30d = db.query(CommitLog).filter(
        CommitLog.project_id == project_id,
        CommitLog.committed_at >= thirty_days_ago,
    ).count()

    if commits_7d > 0:
        status = "active"
    elif commits_30d > 0:
        status = "cooling"
    else:
        status = "dormant"

    db.add(HealthSnapshot(
        project_id=project_id,
        status=status,
        commits_7d=commits_7d,
        commits_30d=commits_30d,
    ))

    p.last_git_sync_at = now
    db.commit()

    return {
        "synced": len(new_commits),
        "total_commits": db.query(CommitLog).filter(CommitLog.project_id == project_id).count(),
        "health_status": status,
    }
