from __future__ import annotations
from datetime import date, datetime
from typing import Any
from pydantic import BaseModel


# ── Bucket ──────────────────────────────────────────────────────────────────

class BucketBase(BaseModel):
    name: str
    color: str = "#7c3aed"
    position: int = 0

class BucketCreate(BucketBase): pass

class BucketUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    position: int | None = None

class BucketOut(BucketBase):
    id: str
    model_config = {"from_attributes": True}


# ── State ──────────────────────────────────────────────────────────────────

class StateBase(BaseModel):
    name: str
    color: str = "#2563eb"
    position: int = 0

class StateCreate(StateBase): pass

class StateUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    position: int | None = None

class StateOut(StateBase):
    id: str
    model_config = {"from_attributes": True}


# ── Sub-items ────────────────────────────────────────────────────────────────

class NextStepOut(BaseModel):
    id: str
    text: str
    done: bool
    position: int
    model_config = {"from_attributes": True}

class NextStepCreate(BaseModel):
    text: str
    position: int = 0

class SubGoalOut(BaseModel):
    id: str
    text: str
    category: str
    done: bool
    model_config = {"from_attributes": True}

class SubGoalCreate(BaseModel):
    text: str
    category: str = "Other"

class ProjectLinkOut(BaseModel):
    id: str
    label: str
    url: str
    model_config = {"from_attributes": True}

class ProjectLinkCreate(BaseModel):
    label: str
    url: str

class InsightOut(BaseModel):
    id: str
    project_id: str
    text: str
    prompt: str | None
    saved_at: datetime
    model_config = {"from_attributes": True}

class InsightCreate(BaseModel):
    text: str
    prompt: str | None = None

class ProjectNoteOut(BaseModel):
    id: str
    project_id: str
    text: str
    category: str
    created_at: datetime
    model_config = {"from_attributes": True}

class ProjectNoteCreate(BaseModel):
    text: str
    category: str = "general"

class ProjectNoteUpdate(BaseModel):
    text: str | None = None
    category: str | None = None


class ProjectDocOut(BaseModel):
    id: str
    name: str
    doc_type: str
    source: str | None
    file_path: str | None
    content: str | None
    summary: str | None
    detected_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}

class ProjectDocCreate(BaseModel):
    name: str
    source: str = "pasted"
    file_path: str | None = None
    content: str | None = None

class ProjectDocUpdate(BaseModel):
    name: str | None = None
    content: str | None = None
    file_path: str | None = None


# ── Project ──────────────────────────────────────────────────────────────────

class ProjectBase(BaseModel):
    name: str
    description: str = ""
    notes: str = ""
    bucket_id: str
    state_id: str | None = None
    github_url: str | None = None
    local_path: str | None = None

class ProjectCreate(ProjectBase): pass

class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    notes: str | None = None
    bucket_id: str | None = None
    state_id: str | None = None
    github_url: str | None = None
    local_path: str | None = None
    completion_pct: int | None = None
    target_date: date | None = None
    priority: str | None = None
    kanban_position: int | None = None

class GitStats(BaseModel):
    git_last_commit: str | None = None
    git_branch: str | None = None
    git_uncommitted: bool = False
    github_stars: int | None = None
    github_open_issues: int | None = None
    github_last_push: datetime | None = None
    stats_updated_at: datetime | None = None

class DetectedDoc(BaseModel):
    name: str
    file_path: str
    summary: str | None = None

class CodeAnalysis(BaseModel):
    code_summary: str | None = None
    code_tech_stack: list[str] | None = None
    code_todos: list[dict[str, Any]] | None = None
    detected_docs: list[DetectedDoc] | None = None
    ai_completion_pct: int | None = None
    ai_completion_reason: str | None = None
    last_analyzed_at: datetime | None = None

class ProjectOut(ProjectBase):
    id: str
    state_id: str | None = None
    created_at: datetime
    updated_at: datetime

    # Git / GitHub stats
    git_last_commit: str | None = None
    git_branch: str | None = None
    git_uncommitted: bool = False
    github_stars: int | None = None
    github_open_issues: int | None = None
    github_last_push: datetime | None = None
    stats_updated_at: datetime | None = None

    # Code analysis
    code_summary: str | None = None
    code_tech_stack: list[str] | None = None
    code_todos: list[dict[str, Any]] | None = None
    last_analyzed_at: datetime | None = None

    # Completion tracking
    completion_pct: int = 0
    ai_completion_pct: int | None = None
    ai_completion_reason: str | None = None
    target_date: date | None = None
    priority: str = "medium"
    kanban_position: int = 0

    # Relations
    next_steps: list[NextStepOut] = []
    sub_goals: list[SubGoalOut] = []
    links: list[ProjectLinkOut] = []
    insights: list[InsightOut] = []
    docs: list[ProjectDocOut] = []
    project_notes: list[ProjectNoteOut] = []

    model_config = {"from_attributes": True}


# ── Weekly Focus ─────────────────────────────────────────────────────────────

class FocusTask(BaseModel):
    text: str
    done: bool = False

class WeeklyFocusOut(BaseModel):
    id: str
    project_id: str
    commitment: str
    tasks: list[dict] = []
    notes: str = ""
    notes_pinned: bool = False
    position: int = 0
    created_at: datetime
    model_config = {"from_attributes": True}

class WeeklyFocusCreate(BaseModel):
    project_id: str
    commitment: str = ""

class WeeklyFocusUpdate(BaseModel):
    commitment: str | None = None
    tasks: list[dict] | None = None
    notes: str | None = None
    notes_pinned: bool | None = None
    position: int | None = None


# ── Chat ─────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str          # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    focus_project_id: str | None = None   # optional project scope

class ChatSessionOut(BaseModel):
    id: str
    scope_type: str
    scope_id: str | None
    messages: list[dict]
    summary: str | None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
