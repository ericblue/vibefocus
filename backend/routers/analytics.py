"""
Analytics router — portfolio-level and per-project productivity insights.
All endpoints are read-only queries against commit_logs and health_snapshots.
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, case

from database import get_db
from models import CommitLog, HealthSnapshot, Project

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _lookback(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


# ── Heatmap ──────────────────────────────────────────────────────────────────

@router.get("/heatmap")
def portfolio_heatmap(
    days: int = 365,
    db: Session = Depends(get_db),
):
    """Daily commit counts across all projects."""
    since = _lookback(days)
    rows = (
        db.query(
            func.date(CommitLog.committed_at).label("day"),
            func.count().label("commits"),
        )
        .filter(CommitLog.committed_at >= since)
        .group_by(func.date(CommitLog.committed_at))
        .order_by(func.date(CommitLog.committed_at))
        .all()
    )
    return [{"day": str(r.day), "commits": r.commits} for r in rows]


@router.get("/heatmap/{project_id}")
def project_heatmap(
    project_id: str,
    days: int = 365,
    db: Session = Depends(get_db),
):
    """Daily commit counts for a specific project."""
    since = _lookback(days)
    rows = (
        db.query(
            func.date(CommitLog.committed_at).label("day"),
            func.count().label("commits"),
        )
        .filter(CommitLog.project_id == project_id, CommitLog.committed_at >= since)
        .group_by(func.date(CommitLog.committed_at))
        .order_by(func.date(CommitLog.committed_at))
        .all()
    )
    return [{"day": str(r.day), "commits": r.commits} for r in rows]


# ── Velocity ─────────────────────────────────────────────────────────────────

@router.get("/velocity")
def portfolio_velocity(
    days: int = 90,
    db: Session = Depends(get_db),
):
    """Weekly commit counts and lines changed per project."""
    since = _lookback(days)
    rows = (
        db.query(
            func.strftime("%Y-%W", CommitLog.committed_at).label("week"),
            CommitLog.project_id,
            func.count().label("commits"),
            func.sum(CommitLog.insertions + CommitLog.deletions).label("lines_changed"),
        )
        .filter(CommitLog.committed_at >= since)
        .group_by("week", CommitLog.project_id)
        .order_by("week")
        .all()
    )
    # Also fetch project names
    projects = {p.id: p.name for p in db.query(Project.id, Project.name).all()}
    return [
        {
            "week": r.week,
            "project_id": r.project_id,
            "project_name": projects.get(r.project_id, "Unknown"),
            "commits": r.commits,
            "lines_changed": r.lines_changed or 0,
        }
        for r in rows
    ]


@router.get("/velocity/{project_id}")
def project_velocity(
    project_id: str,
    days: int = 90,
    db: Session = Depends(get_db),
):
    """Weekly velocity for a specific project."""
    since = _lookback(days)
    rows = (
        db.query(
            func.strftime("%Y-%W", CommitLog.committed_at).label("week"),
            func.count().label("commits"),
            func.sum(CommitLog.insertions + CommitLog.deletions).label("lines_changed"),
        )
        .filter(CommitLog.project_id == project_id, CommitLog.committed_at >= since)
        .group_by("week")
        .order_by("week")
        .all()
    )
    return [
        {"week": r.week, "commits": r.commits, "lines_changed": r.lines_changed or 0}
        for r in rows
    ]


# ── Focus Distribution ───────────────────────────────────────────────────────

@router.get("/focus")
def focus_distribution(
    period: str = "month",
    days: int | None = None,
    db: Session = Depends(get_db),
):
    """Commit share by project for the given period."""
    if days is None:
        days = {"week": 7, "month": 30, "quarter": 90}.get(period, 30)
    since = _lookback(days)

    rows = (
        db.query(
            CommitLog.project_id,
            func.count().label("commits"),
            func.sum(CommitLog.insertions + CommitLog.deletions).label("lines_changed"),
        )
        .filter(CommitLog.committed_at >= since)
        .group_by(CommitLog.project_id)
        .order_by(func.count().desc())
        .all()
    )

    projects = {p.id: {"name": p.name, "bucket_id": p.bucket_id}
                for p in db.query(Project).all()}
    total_commits = sum(r.commits for r in rows) or 1

    return [
        {
            "project_id": r.project_id,
            "project_name": projects.get(r.project_id, {}).get("name", "Unknown"),
            "bucket_id": projects.get(r.project_id, {}).get("bucket_id"),
            "commits": r.commits,
            "lines_changed": r.lines_changed or 0,
            "percentage": round(r.commits / total_commits * 100, 1),
        }
        for r in rows
    ]


# ── Health ───────────────────────────────────────────────────────────────────

@router.get("/health")
def portfolio_health(db: Session = Depends(get_db)):
    """Current health status for all projects with commit history."""
    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    projects = db.query(Project).all()
    results = []

    for p in projects:
        commits_7d = db.query(CommitLog).filter(
            CommitLog.project_id == p.id,
            CommitLog.committed_at >= seven_days_ago,
        ).count()
        commits_30d = db.query(CommitLog).filter(
            CommitLog.project_id == p.id,
            CommitLog.committed_at >= thirty_days_ago,
        ).count()
        total = db.query(CommitLog).filter(CommitLog.project_id == p.id).count()

        if total == 0:
            continue

        if commits_7d > 0:
            status = "active"
        elif commits_30d > 0:
            status = "cooling"
        else:
            status = "dormant"

        # Get last health snapshot to detect transitions
        last_snapshot = (
            db.query(HealthSnapshot)
            .filter(HealthSnapshot.project_id == p.id)
            .order_by(HealthSnapshot.recorded_at.desc())
            .first()
        )
        prev_status = last_snapshot.status if last_snapshot else None
        transition = None
        if prev_status and prev_status != status:
            transition = {"from": prev_status, "to": status, "at": str(last_snapshot.recorded_at)}

        results.append({
            "project_id": p.id,
            "project_name": p.name,
            "status": status,
            "commits_7d": commits_7d,
            "commits_30d": commits_30d,
            "total_commits": total,
            "transition": transition,
        })

    return results


@router.get("/health/{project_id}")
def project_health_history(
    project_id: str,
    days: int = 90,
    db: Session = Depends(get_db),
):
    """Health snapshot history for a project."""
    since = _lookback(days)
    snapshots = (
        db.query(HealthSnapshot)
        .filter(HealthSnapshot.project_id == project_id, HealthSnapshot.recorded_at >= since)
        .order_by(HealthSnapshot.recorded_at)
        .all()
    )
    return [
        {
            "recorded_at": str(s.recorded_at),
            "status": s.status,
            "commits_7d": s.commits_7d,
            "commits_30d": s.commits_30d,
        }
        for s in snapshots
    ]


# ── Tech Stack ───────────────────────────────────────────────────────────────

@router.get("/tech-stack")
def portfolio_tech_stack(db: Session = Depends(get_db)):
    """Aggregated tech stack across all projects."""
    projects = db.query(Project).filter(Project.code_tech_stack.isnot(None)).all()

    lang_projects: dict[str, list[str]] = {}
    for p in projects:
        if not p.code_tech_stack:
            continue
        for tech in p.code_tech_stack:
            lang_projects.setdefault(tech, []).append(p.name)

    return [
        {"tech": tech, "project_count": len(names), "projects": names}
        for tech, names in sorted(lang_projects.items(), key=lambda x: -len(x[1]))
    ]


# ── Contribution Patterns ────────────────────────────────────────────────────

@router.get("/patterns")
def contribution_patterns(
    project_id: str | None = None,
    days: int = 365,
    db: Session = Depends(get_db),
):
    """Time-of-day and day-of-week commit distribution."""
    since = _lookback(days)
    q = db.query(CommitLog).filter(CommitLog.committed_at >= since)
    if project_id:
        q = q.filter(CommitLog.project_id == project_id)

    commits = q.all()
    if not commits:
        return {"by_hour": [], "by_dow": [], "avg_commit_size": []}

    # By hour of day
    hour_counts = [0] * 24
    dow_counts = [0] * 7
    weekly_sizes: dict[str, list[int]] = {}

    for c in commits:
        hour_counts[c.committed_at.hour] += 1
        dow_counts[c.committed_at.weekday()] += 1
        week_key = c.committed_at.strftime("%Y-%W")
        weekly_sizes.setdefault(week_key, []).append(c.insertions + c.deletions)

    by_hour = [{"hour": h, "commits": count} for h, count in enumerate(hour_counts)]
    dow_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    by_dow = [{"day": dow_names[d], "day_num": d, "commits": count} for d, count in enumerate(dow_counts)]
    avg_sizes = [
        {"week": w, "avg_size": round(sum(sizes) / len(sizes), 1)}
        for w, sizes in sorted(weekly_sizes.items())
    ]

    return {"by_hour": by_hour, "by_dow": by_dow, "avg_commit_size": avg_sizes}


# ── Streaks ──────────────────────────────────────────────────────────────────

@router.get("/streaks")
def commit_streaks(
    project_id: str | None = None,
    db: Session = Depends(get_db),
):
    """Current and longest commit streaks."""
    q = db.query(func.date(CommitLog.committed_at).label("day")).distinct()
    if project_id:
        q = q.filter(CommitLog.project_id == project_id)
    q = q.order_by(func.date(CommitLog.committed_at))

    days_with_commits = [r.day for r in q.all()]
    if not days_with_commits:
        return {"current_streak": 0, "longest_streak": 0, "total_active_days": 0, "days_tracked": 0}

    # Parse dates
    from datetime import date as date_type
    active_dates: list[date_type] = []
    for d in days_with_commits:
        if isinstance(d, str):
            active_dates.append(date_type.fromisoformat(d))
        else:
            active_dates.append(d)

    active_dates.sort()

    # Calculate streaks
    longest = 1
    current = 1
    for i in range(1, len(active_dates)):
        if (active_dates[i] - active_dates[i - 1]).days == 1:
            current += 1
            longest = max(longest, current)
        else:
            current = 1

    # Check if current streak is still alive (includes today or yesterday)
    today = date_type.today()
    if active_dates[-1] >= today - timedelta(days=1):
        # Count backwards from the end
        current_streak = 1
        for i in range(len(active_dates) - 1, 0, -1):
            if (active_dates[i] - active_dates[i - 1]).days == 1:
                current_streak += 1
            else:
                break
    else:
        current_streak = 0

    days_tracked = (today - active_dates[0]).days + 1

    return {
        "current_streak": current_streak,
        "longest_streak": longest,
        "total_active_days": len(active_dates),
        "days_tracked": days_tracked,
    }


# ── Lifecycle ────────────────────────────────────────────────────────────────

@router.get("/lifecycle")
def project_lifecycle(
    days: int = 365,
    db: Session = Depends(get_db),
):
    """Timeline data for all projects — first/last commit, activity by month."""
    since = _lookback(days)
    projects = db.query(Project).all()
    results = []

    for p in projects:
        first_commit = (
            db.query(func.min(CommitLog.committed_at))
            .filter(CommitLog.project_id == p.id)
            .scalar()
        )
        if not first_commit:
            continue

        last_commit = (
            db.query(func.max(CommitLog.committed_at))
            .filter(CommitLog.project_id == p.id)
            .scalar()
        )
        total = db.query(CommitLog).filter(CommitLog.project_id == p.id).count()

        # Monthly activity
        monthly = (
            db.query(
                func.strftime("%Y-%m", CommitLog.committed_at).label("month"),
                func.count().label("commits"),
            )
            .filter(CommitLog.project_id == p.id, CommitLog.committed_at >= since)
            .group_by("month")
            .order_by("month")
            .all()
        )

        results.append({
            "project_id": p.id,
            "project_name": p.name,
            "first_commit": str(first_commit),
            "last_commit": str(last_commit),
            "total_commits": total,
            "monthly_activity": [
                {"month": m.month, "commits": m.commits} for m in monthly
            ],
        })

    return sorted(results, key=lambda x: x["first_commit"])
