"""
Import local git repositories into VibeFocus.

Usage:
    cd backend
    python import_local_projects.py --root /Users/you/Development
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from database import Base, SessionLocal, engine
from models import Bucket, Project, State
from services.git_service import get_local_git_stats


DEFAULT_STATES = [
    {"name": "Idea", "color": "#8b5cf6", "position": 0},
    {"name": "Exploring", "color": "#0ea5e9", "position": 1},
    {"name": "Building", "color": "#f59e0b", "position": 2},
    {"name": "MVP", "color": "#f97316", "position": 3},
    {"name": "Launched", "color": "#22c55e", "position": 4},
    {"name": "Stalled", "color": "#ef4444", "position": 5},
    {"name": "Archived", "color": "#64748b", "position": 6},
]

DEFAULT_BUCKETS = [
    {"name": "Uncategorized", "color": "#94a3b8", "position": 0},
    {"name": "Open Source", "color": "#0ea5e9", "position": 1},
    {"name": "Commercial", "color": "#f59e0b", "position": 2},
    {"name": "Personal", "color": "#ec4899", "position": 3},
    {"name": "Side Project", "color": "#8b5cf6", "position": 4},
    {"name": "Client Work", "color": "#10b981", "position": 5},
    {"name": "Experiment", "color": "#f97316", "position": 6},
]


def run(repo: Path, args: list[str]) -> str:
    result = subprocess.run(args, cwd=repo, capture_output=True, text=True, timeout=10)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def find_git_repos(root: Path, recursive: bool) -> Iterable[Path]:
    if (root / ".git").is_dir():
        yield root
        if not recursive:
            return

    if recursive:
        seen = {root.resolve()} if (root / ".git").is_dir() else set()
        for git_dir in root.rglob(".git"):
            if git_dir.is_dir():
                repo = git_dir.parent.resolve()
                if repo not in seen:
                    seen.add(repo)
                    yield repo
        return

    for child in sorted(root.iterdir()):
        if child.is_dir() and (child / ".git").is_dir():
            yield child


def normalize_github_url(remote: str) -> str | None:
    if not remote:
        return None
    remote = remote.removesuffix(".git")
    ssh_match = re.match(r"git@github\.com:([^/]+)/(.+)$", remote)
    if ssh_match:
        return f"https://github.com/{ssh_match.group(1)}/{ssh_match.group(2)}"
    https_match = re.match(r"https://github\.com/([^/]+)/(.+)$", remote)
    if https_match:
        return remote
    return None


def title_from_name(name: str) -> str:
    special = {"pq": "PQ", "api": "API", "mcp": "MCP", "sdk": "SDK"}
    parts = re.split(r"[-_\s]+", name)
    return " ".join(special.get(part.lower(), part.capitalize()) for part in parts if part)


def read_description(repo: Path) -> str:
    package_json = repo / "package.json"
    if package_json.exists():
        try:
            description = json.loads(package_json.read_text()).get("description")
            if description:
                return description.strip()
        except (OSError, json.JSONDecodeError):
            pass

    for name in ("README.md", "readme.md", "README"):
        readme = repo / name
        if not readme.exists():
            continue
        try:
            lines = [line.strip() for line in readme.read_text(errors="replace").splitlines()]
        except OSError:
            continue
        for line in lines:
            if not line or line.startswith("#") or line.startswith("[!"):
                continue
            return line[:500]
    return ""


def detect_stack(repo: Path) -> list[str]:
    stack: list[str] = []

    def add(name: str):
        if name not in stack:
            stack.append(name)

    if (repo / "package.json").exists():
        add("JavaScript/TypeScript")
        try:
            package = json.loads((repo / "package.json").read_text())
            deps = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
            if "next" in deps:
                add("Next.js")
            if "react" in deps:
                add("React")
            if "vite" in deps:
                add("Vite")
            if "tailwindcss" in deps:
                add("Tailwind CSS")
            if "prisma" in deps:
                add("Prisma")
        except (OSError, json.JSONDecodeError):
            pass
    if (repo / "pyproject.toml").exists() or (repo / "requirements.txt").exists():
        add("Python")
    if (repo / "composer.json").exists():
        add("PHP")
    if (repo / "Gemfile").exists():
        add("Ruby")
    if (repo / "go.mod").exists():
        add("Go")
    if (repo / "Cargo.toml").exists():
        add("Rust")
    if (repo / "Dockerfile").exists() or (repo / "docker-compose.yml").exists():
        add("Docker")

    return stack


def parse_last_commit_at(repo: Path) -> datetime | None:
    raw = run(repo, ["git", "log", "-1", "--format=%cI"])
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def state_for(last_commit_at: datetime | None, states: dict[str, str]) -> str:
    if not last_commit_at:
        return states["Building"]
    now = datetime.now(last_commit_at.tzinfo or timezone.utc)
    age_days = (now - last_commit_at).days
    if age_days <= 45:
        return states["Building"]
    if age_days <= 120:
        return states["MVP"]
    return states["Stalled"]


def priority_for(last_commit_at: datetime | None) -> str:
    if not last_commit_at:
        return "medium"
    now = datetime.now(last_commit_at.tzinfo or timezone.utc)
    age_days = (now - last_commit_at).days
    if age_days <= 14:
        return "high"
    if age_days <= 90:
        return "medium"
    return "low"


def bucket_for(buckets: dict[str, str]) -> str:
    return buckets["Uncategorized"]


def ensure_defaults(db) -> tuple[dict[str, str], dict[str, str]]:
    Base.metadata.create_all(bind=engine)
    for bucket in DEFAULT_BUCKETS:
        if not db.query(Bucket).filter(Bucket.name == bucket["name"]).first():
            db.add(Bucket(**bucket))
    for state in DEFAULT_STATES:
        if not db.query(State).filter(State.name == state["name"]).first():
            db.add(State(**state))
    db.commit()
    buckets = {b.name: b.id for b in db.query(Bucket).all()}
    states = {s.name: s.id for s in db.query(State).all()}
    return buckets, states


def import_repo(db, repo: Path, buckets: dict[str, str], states: dict[str, str]) -> tuple[str, str]:
    remote = run(repo, ["git", "remote", "get-url", "origin"])
    github_url = normalize_github_url(remote)
    local_path = str(repo.resolve())
    last_commit_at = parse_last_commit_at(repo)

    project = (
        db.query(Project).filter(Project.local_path == local_path).first()
        or (db.query(Project).filter(Project.github_url == github_url).first() if github_url else None)
        or db.query(Project).filter(Project.name == title_from_name(repo.name)).first()
    )
    created = project is None
    if created:
        project = Project(
            name=title_from_name(repo.name),
            bucket_id=bucket_for(buckets),
            state_id=state_for(last_commit_at, states),
            priority=priority_for(last_commit_at),
            kanban_position=db.query(Project).count(),
        )
        db.add(project)

    project.description = project.description or read_description(repo)
    project.github_url = project.github_url or github_url
    project.local_path = local_path
    project.code_tech_stack = project.code_tech_stack or detect_stack(repo)
    project.code_summary = project.code_summary or f"Imported from local git repository at {local_path}."

    for field, value in get_local_git_stats(local_path).items():
        setattr(project, field, value)
    project.stats_updated_at = utcnow_naive()
    project.updated_at = utcnow_naive()

    db.commit()
    return ("created" if created else "updated", project.name)


def scan_repos(db, root: Path, recursive: bool = False) -> dict:
    """Scan a directory for git repos and import/update them. Returns a summary dict."""
    buckets, states = ensure_defaults(db)
    repos = list(find_git_repos(root, recursive=recursive))

    results = []
    total_created = total_updated = total_skipped = 0
    for repo in repos:
        try:
            action, name = import_repo(db, repo, buckets, states)
        except Exception as exc:
            db.rollback()
            total_skipped += 1
            results.append({
                "action": "skipped",
                "name": repo.name,
                "path": str(repo),
                "error": str(exc),
            })
            continue

        results.append({"action": action, "name": name, "path": str(repo)})
        if action == "created":
            total_created += 1
        else:
            total_updated += 1

    return {
        "root": str(root),
        "total": len(repos),
        "created": total_created,
        "updated": total_updated,
        "skipped": total_skipped,
        "projects": results,
    }


def main():
    parser = argparse.ArgumentParser(description="Import local git repositories into VibeFocus.")
    parser.add_argument("--root", required=True, help="Directory containing local git repositories.")
    parser.add_argument("--recursive", action="store_true", help="Search recursively for .git directories.")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.is_dir():
        raise SystemExit(f"Root directory does not exist: {root}")

    with SessionLocal() as db:
        result = scan_repos(db, root, recursive=args.recursive)

    if result["total"] == 0:
        raise SystemExit(f"No git repositories found under {root}")

    for project in result["projects"]:
        suffix = f" ({project['error']})" if project.get("error") else ""
        print(f"{project['action']:7} {project['name']}{suffix}")
    print("")
    print(f"Imported {result['total']} repos: {result['created']} created, {result['updated']} updated, {result['skipped']} skipped.")


if __name__ == "__main__":
    main()
