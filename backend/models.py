from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Date, Text, ForeignKey, JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from database import Base
import uuid


def new_id() -> str:
    return uuid.uuid4().hex[:8]


class Bucket(Base):
    __tablename__ = "buckets"

    id        = Column(String, primary_key=True, default=new_id)
    name      = Column(String, nullable=False)
    color     = Column(String, default="#2563eb")
    position  = Column(Integer, default=0)

    projects  = relationship("Project", back_populates="bucket_rel",
                             foreign_keys="Project.bucket_id")


class State(Base):
    __tablename__ = "states"

    id        = Column(String, primary_key=True, default=new_id)
    name      = Column(String, nullable=False)
    color     = Column(String, default="#2563eb")
    position  = Column(Integer, default=0)

    projects  = relationship("Project", back_populates="state_rel",
                             foreign_keys="Project.state_id")


class Project(Base):
    __tablename__ = "projects"

    id          = Column(String, primary_key=True, default=new_id)
    name        = Column(String, nullable=False)
    description = Column(Text, default="")
    notes       = Column(Text, default="")
    bucket_id   = Column(String, ForeignKey("buckets.id"), nullable=False)
    state_id    = Column(String, ForeignKey("states.id"), nullable=True)

    # Source links
    github_url  = Column(String, nullable=True)   # https://github.com/user/repo
    local_path  = Column(String, nullable=True)   # /Users/eric/code/myproject

    # Cached git / GitHub stats (refreshed on demand)
    git_last_commit     = Column(String, nullable=True)   # "fix auth: 3 days ago"
    git_branch          = Column(String, nullable=True)
    git_uncommitted     = Column(Boolean, default=False)
    github_stars        = Column(Integer, nullable=True)
    github_open_issues  = Column(Integer, nullable=True)
    github_last_push    = Column(DateTime, nullable=True)
    stats_updated_at    = Column(DateTime, nullable=True)

    # Agent SDK analysis (cached, generated on demand)
    code_summary        = Column(Text, nullable=True)
    code_tech_stack     = Column(JSON, nullable=True)   # ["Python", "FastAPI", ...]
    code_todos          = Column(JSON, nullable=True)   # [{"file": ..., "line": ..., "text": ...}]
    last_analyzed_at    = Column(DateTime, nullable=True)

    # Git log sync
    last_git_sync_at    = Column(DateTime, nullable=True)

    # Completion tracking
    completion_pct      = Column(Integer, default=0)
    ai_completion_pct   = Column(Integer, nullable=True)
    ai_completion_reason = Column(Text, nullable=True)
    target_date         = Column(Date, nullable=True)
    priority            = Column(String, default="medium")  # "low" | "medium" | "high"
    kanban_position     = Column(Integer, default=0)

    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    bucket_rel  = relationship("Bucket", back_populates="projects",
                               foreign_keys=[bucket_id])
    state_rel   = relationship("State", back_populates="projects",
                               foreign_keys=[state_id])
    next_steps  = relationship("NextStep", back_populates="project",
                               cascade="all, delete-orphan", order_by="NextStep.position")
    sub_goals   = relationship("SubGoal", back_populates="project",
                               cascade="all, delete-orphan")
    links       = relationship("ProjectLink", back_populates="project",
                               cascade="all, delete-orphan")
    insights    = relationship("Insight", back_populates="project",
                               cascade="all, delete-orphan",
                               order_by="Insight.saved_at.desc()")
    project_notes = relationship("ProjectNote", back_populates="project",
                               cascade="all, delete-orphan",
                               order_by="ProjectNote.created_at.desc()")
    docs        = relationship("ProjectDoc", back_populates="project",
                               cascade="all, delete-orphan",
                               order_by="ProjectDoc.created_at")
    commits     = relationship("CommitLog", back_populates="project",
                               cascade="all, delete-orphan",
                               order_by="CommitLog.committed_at.desc()")
    health_snapshots = relationship("HealthSnapshot", back_populates="project",
                                    cascade="all, delete-orphan",
                                    order_by="HealthSnapshot.recorded_at.desc()")


class NextStep(Base):
    __tablename__ = "next_steps"

    id         = Column(String, primary_key=True, default=new_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    text       = Column(String, nullable=False)
    done       = Column(Boolean, default=False)
    position   = Column(Integer, default=0)

    project    = relationship("Project", back_populates="next_steps")


class SubGoal(Base):
    __tablename__ = "sub_goals"

    id         = Column(String, primary_key=True, default=new_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    text       = Column(String, nullable=False)
    category   = Column(String, default="Other")   # Users|Marketing|Revenue|Dev|Experiments|Other
    done       = Column(Boolean, default=False)

    project    = relationship("Project", back_populates="sub_goals")


class ProjectLink(Base):
    __tablename__ = "project_links"

    id         = Column(String, primary_key=True, default=new_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    label      = Column(String, nullable=False)
    url        = Column(String, nullable=False)

    project    = relationship("Project", back_populates="links")


class ProjectNote(Base):
    __tablename__ = "project_notes"

    id         = Column(String, primary_key=True, default=new_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    text       = Column(Text, nullable=False)
    category   = Column(String, default="general")  # "general" | "decision" | "blocker" | "idea" | "meeting"
    created_at = Column(DateTime, default=datetime.utcnow)

    project    = relationship("Project", back_populates="project_notes")


class ProjectDoc(Base):
    __tablename__ = "project_docs"

    id          = Column(String, primary_key=True, default=new_id)
    project_id  = Column(String, ForeignKey("projects.id"), nullable=False)
    name        = Column(String, nullable=False)          # "PRD", "Architecture", etc.
    doc_type    = Column(String, default="manual")         # "detected" | "manual"
    source      = Column(String, nullable=True)            # "pasted" | "file"
    file_path   = Column(String, nullable=True)            # absolute path for file-sourced docs
    content     = Column(Text, nullable=True)              # full text for pasted docs
    summary     = Column(Text, nullable=True)              # AI-generated or truncated summary
    detected_at = Column(DateTime, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    project     = relationship("Project", back_populates="docs")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id         = Column(String, primary_key=True, default=new_id)
    scope_type = Column(String, nullable=False)         # "portfolio" | "project"
    scope_id   = Column(String, nullable=True)           # project_id or None
    messages   = Column(JSON, nullable=False, default=list)
    summary    = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CommitLog(Base):
    __tablename__ = "commit_logs"

    id            = Column(String, primary_key=True, default=new_id)
    project_id    = Column(String, ForeignKey("projects.id"), nullable=False)
    sha           = Column(String(40), nullable=False)
    short_sha     = Column(String(8), nullable=False)
    author_name   = Column(String, nullable=False)
    author_email  = Column(String, nullable=True)
    committed_at  = Column(DateTime, nullable=False)
    message       = Column(Text, nullable=False)
    files_changed = Column(Integer, default=0)
    insertions    = Column(Integer, default=0)
    deletions     = Column(Integer, default=0)

    project       = relationship("Project", back_populates="commits")


class HealthSnapshot(Base):
    __tablename__ = "health_snapshots"

    id          = Column(String, primary_key=True, default=new_id)
    project_id  = Column(String, ForeignKey("projects.id"), nullable=False)
    recorded_at = Column(DateTime, default=datetime.utcnow)
    status      = Column(String)       # "active" | "cooling" | "dormant"
    commits_7d  = Column(Integer, default=0)
    commits_30d = Column(Integer, default=0)

    project     = relationship("Project", back_populates="health_snapshots")


class Insight(Base):
    __tablename__ = "insights"

    id         = Column(String, primary_key=True, default=new_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    text       = Column(Text, nullable=False)
    prompt     = Column(Text, nullable=True)   # the user message that generated this
    saved_at   = Column(DateTime, default=datetime.utcnow)

    project    = relationship("Project", back_populates="insights")


class WeeklyFocus(Base):
    __tablename__ = "weekly_focuses"
    __table_args__ = (UniqueConstraint('project_id'),)

    id           = Column(String, primary_key=True, default=new_id)
    project_id   = Column(String, ForeignKey("projects.id"), nullable=False)
    commitment   = Column(Text, default="")
    tasks        = Column(JSON, nullable=False, default=list)   # [{text, done}]
    notes        = Column(Text, default="")
    notes_pinned = Column(Boolean, default=False)
    position     = Column(Integer, default=0)
    created_at   = Column(DateTime, default=datetime.utcnow)

    project      = relationship("Project")
