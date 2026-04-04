"""
Git (local) and GitHub (public API) stats services.
Both are lightweight and run on-demand — no background polling.
"""

from __future__ import annotations
import re
import subprocess
from datetime import datetime
from pathlib import Path

import httpx

from schemas import GitStats


# ── Git log sync ─────────────────────────────────────────────────────────────

def sync_git_log(local_path: str, since: datetime | None = None, fetch_all: bool = False) -> list[dict]:
    """
    Parse git log with numstat and return list of commit dicts.
    If since is provided, only fetch commits after that date.
    If fetch_all is True, fetch entire history; otherwise default to 365 days.
    """
    path = Path(local_path).expanduser().resolve()
    if not path.exists():
        return []

    cmd = [
        "git", "log",
        "--format=__COMMIT__%H|%h|%an|%ae|%aI|%s",
        "--numstat",
    ]

    if since:
        cmd.append(f"--since={since.isoformat()}")
    elif not fetch_all:
        cmd.append("--since=365 days ago")

    try:
        result = subprocess.run(
            cmd, cwd=str(path),
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return []
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return []

    commits = []
    current: dict | None = None

    for line in result.stdout.splitlines():
        if line.startswith("__COMMIT__"):
            if current:
                commits.append(current)
            parts = line[len("__COMMIT__"):].split("|", 5)
            if len(parts) < 6:
                current = None
                continue
            try:
                committed_at = datetime.fromisoformat(parts[4])
            except ValueError:
                committed_at = datetime.utcnow()
            current = {
                "sha": parts[0],
                "short_sha": parts[1],
                "author_name": parts[2],
                "author_email": parts[3],
                "committed_at": committed_at,
                "message": parts[5],
                "files_changed": 0,
                "insertions": 0,
                "deletions": 0,
            }
        elif current and line.strip():
            # numstat line: insertions\tdeletions\tfilename
            stat_parts = line.split("\t")
            if len(stat_parts) >= 3:
                try:
                    ins = int(stat_parts[0]) if stat_parts[0] != "-" else 0
                    dels = int(stat_parts[1]) if stat_parts[1] != "-" else 0
                    current["files_changed"] += 1
                    current["insertions"] += ins
                    current["deletions"] += dels
                except ValueError:
                    pass

    if current:
        commits.append(current)

    return commits


# ── Local git stats ──────────────────────────────────────────────────────────

def get_local_git_stats(local_path: str) -> dict:
    """
    Run git commands against the local path and return raw stats.
    Safe — all commands are read-only.
    """
    path = Path(local_path).expanduser().resolve()
    if not path.exists():
        return {}

    def run(cmd: list[str]) -> str:
        try:
            result = subprocess.run(
                cmd, cwd=str(path),
                capture_output=True, text=True, timeout=5
            )
            return result.stdout.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return ""

    # Last commit: "abc1234 Fix auth token refresh (3 days ago)"
    log_raw = run(["git", "log", "--oneline", "--format=%h %s (%cr)", "-1"])

    # Current branch
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])

    # Uncommitted changes
    status = run(["git", "status", "--porcelain"])
    has_uncommitted = bool(status)

    return {
        "git_last_commit": log_raw or None,
        "git_branch": branch or None,
        "git_uncommitted": has_uncommitted,
    }


# ── GitHub public API ─────────────────────────────────────────────────────────

def parse_github_owner_repo(url: str) -> tuple[str, str] | None:
    """Extract (owner, repo) from a GitHub URL."""
    pattern = r"github\.com[:/]([^/]+)/([^/\s\.]+?)(?:\.git)?$"
    match = re.search(pattern, url)
    if match:
        return match.group(1), match.group(2)
    return None


async def get_github_stats(github_url: str) -> dict:
    """
    Fetch public repo stats from the GitHub API.
    No auth required for public repos (60 req/hour unauthenticated).
    """
    parsed = parse_github_owner_repo(github_url)
    if not parsed:
        return {}
    owner, repo = parsed

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}",
                headers={"Accept": "application/vnd.github.v3+json"},
            )
            if resp.status_code != 200:
                return {}
            data = resp.json()
    except httpx.RequestError:
        return {}

    pushed_at = None
    if data.get("pushed_at"):
        try:
            pushed_at = datetime.fromisoformat(data["pushed_at"].replace("Z", "+00:00"))
        except ValueError:
            pass

    return {
        "github_stars": data.get("stargazers_count"),
        "github_open_issues": data.get("open_issues_count"),
        "github_last_push": pushed_at,
    }


async def refresh_stats(local_path: str | None, github_url: str | None) -> GitStats:
    """
    Refresh both local git and GitHub stats for a project.
    Either source may be None.
    """
    combined: dict = {}

    if local_path:
        combined.update(get_local_git_stats(local_path))

    if github_url:
        gh = await get_github_stats(github_url)
        combined.update(gh)

    combined["stats_updated_at"] = datetime.utcnow()
    return GitStats(**{k: combined.get(k) for k in GitStats.model_fields})
