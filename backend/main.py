"""
VibeFocus — FastAPI backend
Run: python main.py
"""

from contextlib import asynccontextmanager
from pathlib import Path
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import inspect as sa_inspect, text

from database import engine, Base, SessionLocal, settings
from models import Bucket, State, Project, WeeklyFocus
from routers import projects, buckets, chat, analytics, data
from routers import states as states_router


DEFAULT_STATES = [
    {"name": "Idea",      "color": "#8b5cf6", "position": 0},
    {"name": "Exploring", "color": "#0ea5e9", "position": 1},
    {"name": "Building",  "color": "#f59e0b", "position": 2},
    {"name": "MVP",       "color": "#f97316", "position": 3},
    {"name": "Launched",  "color": "#22c55e", "position": 4},
    {"name": "Stalled",   "color": "#ef4444", "position": 5},
    {"name": "Archived",  "color": "#64748b", "position": 6},
]

DEFAULT_BUCKETS = [
    {"name": "Uncategorized", "color": "#94a3b8", "position": 0},
    {"name": "Open Source",   "color": "#0ea5e9", "position": 1},
    {"name": "Commercial",    "color": "#f59e0b", "position": 2},
    {"name": "Personal",      "color": "#ec4899", "position": 3},
    {"name": "Side Project",  "color": "#8b5cf6", "position": 4},
    {"name": "Client Work",   "color": "#10b981", "position": 5},
    {"name": "Experiment",    "color": "#f97316", "position": 6},
]

# Map old lifecycle bucket names → state names for migration
_BUCKET_TO_STATE = {
    "Idea": "Idea",
    "In Production": "Launched",
    "Stalled": "Stalled",
    "Archived": "Archived",
}

# Old buckets that are lifecycle-only and should be removed after migration
_LIFECYCLE_BUCKETS = {"Idea", "In Production", "Stalled", "Archived", "Hybrid"}


def _migrate_states(db):
    """Idempotent migration: add state_id column, seed states, migrate projects."""

    # 1. Ensure state_id column exists on projects table
    inspector = sa_inspect(engine)
    columns = [c["name"] for c in inspector.get_columns("projects")]
    if "state_id" not in columns:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE projects ADD COLUMN state_id VARCHAR REFERENCES states(id)"
            ))

    # 2. Seed default states if table is empty
    if db.query(State).count() == 0:
        for s in DEFAULT_STATES:
            db.add(State(**s))
        db.commit()

    # 3. Migrate projects that have no state_id yet
    unmigrated = db.query(Project).filter(Project.state_id.is_(None)).all()
    if unmigrated:
        # Build lookups
        bucket_map = {b.id: b.name for b in db.query(Bucket).all()}
        state_by_name = {s.name: s.id for s in db.query(State).all()}
        default_state_id = state_by_name.get("Building", list(state_by_name.values())[0])

        # Ensure "Uncategorized" bucket exists for reassignment
        uncat = db.query(Bucket).filter(Bucket.name == "Uncategorized").first()
        if not uncat:
            uncat = Bucket(name="Uncategorized", color="#94a3b8", position=0)
            db.add(uncat)
            db.commit()
            db.refresh(uncat)

        for proj in unmigrated:
            old_bucket_name = bucket_map.get(proj.bucket_id, "")
            # Assign state based on old bucket name
            mapped_state = _BUCKET_TO_STATE.get(old_bucket_name)
            proj.state_id = state_by_name.get(mapped_state, default_state_id) if mapped_state else default_state_id
            # Reassign projects in lifecycle-only buckets to Uncategorized
            if old_bucket_name in _LIFECYCLE_BUCKETS:
                proj.bucket_id = uncat.id
        db.commit()

    # 4. Remove old lifecycle-only buckets that have no remaining projects
    for name in _LIFECYCLE_BUCKETS:
        old = db.query(Bucket).filter(Bucket.name == name).first()
        if old and db.query(Project).filter(Project.bucket_id == old.id).count() == 0:
            db.delete(old)
    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables (includes new states table)
    Base.metadata.create_all(bind=engine)

    # Add missing columns before any queries touch the Project model
    inspector = sa_inspect(engine)
    proj_cols = [c["name"] for c in inspector.get_columns("projects")]
    for col_name, col_type in [
        ("last_git_sync_at", "DATETIME"),
        ("completion_pct", "INTEGER DEFAULT 0"),
        ("ai_completion_pct", "INTEGER"),
        ("ai_completion_reason", "TEXT"),
        ("target_date", "DATE"),
        ("priority", "VARCHAR DEFAULT 'medium'"),
        ("kanban_position", "INTEGER DEFAULT 0"),
    ]:
        if col_name not in proj_cols:
            with engine.begin() as conn:
                conn.execute(text(
                    f"ALTER TABLE projects ADD COLUMN {col_name} {col_type}"
                ))

    # Add missing columns to weekly_focuses
    if "weekly_focuses" in inspector.get_table_names():
        wf_cols = [c["name"] for c in inspector.get_columns("weekly_focuses")]
        for col_name, col_type in [
            ("tasks", "JSON DEFAULT '[]'"),
            ("notes", "TEXT DEFAULT ''"),
            ("notes_pinned", "BOOLEAN DEFAULT 0"),
            ("position", "INTEGER DEFAULT 0"),
        ]:
            if col_name not in wf_cols:
                with engine.begin() as conn:
                    conn.execute(text(
                        f"ALTER TABLE weekly_focuses ADD COLUMN {col_name} {col_type}"
                    ))

    with SessionLocal() as db:
        # Seed default buckets if none exist
        if db.query(Bucket).count() == 0:
            for b in DEFAULT_BUCKETS:
                db.add(Bucket(**b))
            db.commit()

        # Run state migration (idempotent)
        _migrate_states(db)

    yield


def _read_version() -> str:
    """Read version from VERSION file (project root or Docker /app)."""
    for candidate in [
        Path(__file__).parent.parent / "VERSION",  # local dev: backend/../VERSION
        Path(__file__).parent / "VERSION",          # Docker: /app/VERSION
    ]:
        if candidate.exists():
            return candidate.read_text().strip()
    return "0.0.0"

APP_VERSION = _read_version()

app = FastAPI(
    title="VibeFocus API",
    version=APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(buckets.router)
app.include_router(states_router.router)
app.include_router(chat.router)
app.include_router(analytics.router)
app.include_router(data.router)


@app.get("/health")
def health():
    return {"status": "ok", "version": APP_VERSION}


@app.get("/version")
def version():
    return {"version": APP_VERSION}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=settings.port, reload=True)
