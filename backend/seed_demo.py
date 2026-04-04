"""
Seed script for VibeFocus demo database.
Creates realistic sample projects with commits, goals, steps, insights, etc.
Usage: cd backend && python seed_demo.py
"""

import os
import sys
import random
from datetime import datetime, timedelta

# Ensure we can import from backend/
sys.path.insert(0, os.path.dirname(__file__))

from database import engine, Base, SessionLocal
from models import (
    Bucket, State, Project, NextStep, SubGoal, ProjectLink,
    ProjectNote, Insight, CommitLog, HealthSnapshot, WeeklyFocus,
    new_id,
)

DB_PATH = os.path.join(os.path.dirname(__file__), "vibefocus.db")


def seed():
    # Remove existing db and create fresh
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print("Removed existing vibefocus.db")

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # ── Buckets ────────────────────────────────────────────────────────
    buckets = {}
    for b in [
        {"name": "Uncategorized", "color": "#94a3b8", "position": 0},
        {"name": "Open Source",   "color": "#0ea5e9", "position": 1},
        {"name": "Commercial",    "color": "#f59e0b", "position": 2},
        {"name": "Personal",      "color": "#ec4899", "position": 3},
        {"name": "Side Project",  "color": "#8b5cf6", "position": 4},
        {"name": "Client Work",   "color": "#10b981", "position": 5},
        {"name": "Experiment",    "color": "#f97316", "position": 6},
    ]:
        obj = Bucket(id=new_id(), **b)
        db.add(obj)
        buckets[b["name"]] = obj.id
    db.flush()

    # ── States ─────────────────────────────────────────────────────────
    states = {}
    for s in [
        {"name": "Idea",      "color": "#8b5cf6", "position": 0},
        {"name": "Exploring", "color": "#0ea5e9", "position": 1},
        {"name": "Building",  "color": "#f59e0b", "position": 2},
        {"name": "MVP",       "color": "#f97316", "position": 3},
        {"name": "Launched",  "color": "#22c55e", "position": 4},
        {"name": "Stalled",   "color": "#ef4444", "position": 5},
        {"name": "Archived",  "color": "#64748b", "position": 6},
    ]:
        obj = State(id=new_id(), **s)
        db.add(obj)
        states[s["name"]] = obj.id
    db.flush()

    now = datetime.utcnow()

    # ── Projects ───────────────────────────────────────────────────────
    projects_data = [
        {
            "name": "NexusAPI",
            "description": "Unified REST gateway that aggregates microservices behind a single auth layer. Handles rate limiting, API key management, and request routing.",
            "bucket": "Commercial",
            "state": "Building",
            "completion_pct": 68,
            "priority": "high",
            "target_date": (now + timedelta(days=30)).date(),
            "github_url": "https://github.com/demo/nexus-api",
            "git_last_commit": "feat: add tiered rate limiting per API key",
            "git_branch": "main",
            "github_stars": 42,
            "github_open_issues": 7,
            "github_last_push": now - timedelta(hours=6),
            "code_tech_stack": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker"],
            "code_summary": "API gateway with JWT auth, rate limiting middleware, and OpenAPI spec generation. Well-structured with clear separation between routing, auth, and business logic.",
            "kanban_position": 0,
            "notes": "Core gateway routing is solid. Need to finish the dashboard UI for API key management before beta launch.\n\nConsidering Stripe integration for usage-based billing — research metered billing API.",
            "steps": [
                {"text": "Build API key management dashboard", "done": False, "position": 0},
                {"text": "Add usage analytics endpoints", "done": False, "position": 1},
                {"text": "Write integration tests for rate limiting", "done": True, "position": 2},
                {"text": "Set up Stripe metered billing", "done": False, "position": 3},
                {"text": "Deploy staging environment", "done": True, "position": 4},
            ],
            "goals": [
                {"text": "10 beta users by end of month", "category": "Users", "done": False},
                {"text": "Launch on Product Hunt", "category": "Marketing", "done": False},
                {"text": "First paying customer", "category": "Revenue", "done": False},
                {"text": "99.9% uptime SLA", "category": "Dev", "done": False},
            ],
            "insights": [
                "The rate limiting implementation using Redis sliding windows is significantly more accurate than fixed-window approaches. This could be a selling point vs competitors who use simpler algorithms.",
                "API gateway market is crowded (Kong, Tyk) but none target solo developers managing 3-5 microservices. The sweet spot is simplicity — one YAML config, not a Kubernetes operator.",
            ],
            "notes_list": [
                {"text": "Talked to 3 potential beta users — all want webhook forwarding as a feature. Adding to backlog.", "category": "meeting"},
                {"text": "Decision: Go with usage-based pricing ($0.001/request after free tier) instead of flat monthly. Better alignment with value delivered.", "category": "decision"},
            ],
            "commits": _generate_commits("NexusAPI", now, count=45, days_back=60),
            "health": "active",
        },
        {
            "name": "Patchwork",
            "description": "CLI tool for intelligently merging configuration files across environments. Handles YAML, TOML, JSON with conflict detection and dry-run previews.",
            "bucket": "Open Source",
            "state": "Launched",
            "completion_pct": 90,
            "priority": "medium",
            "github_url": "https://github.com/demo/patchwork",
            "git_last_commit": "docs: add examples for TOML merge strategies",
            "git_branch": "main",
            "github_stars": 312,
            "github_open_issues": 12,
            "github_last_push": now - timedelta(days=2),
            "code_tech_stack": ["Rust", "Serde", "Clap", "GitHub Actions"],
            "code_summary": "Well-tested CLI with 94% code coverage. Uses tree-diffing algorithm for smart merges. Published on crates.io with 8k downloads.",
            "kanban_position": 1,
            "notes": "Community growing steadily. Got featured in This Week in Rust.\n\nNeed to address the Windows path normalization issue — 3 separate bug reports now.",
            "steps": [
                {"text": "Fix Windows path normalization (issue #47)", "done": False, "position": 0},
                {"text": "Add .env file support", "done": False, "position": 1},
                {"text": "Write migration guide for v2.0 breaking changes", "done": False, "position": 2},
                {"text": "Set up GitHub Sponsors", "done": True, "position": 3},
            ],
            "goals": [
                {"text": "500 GitHub stars", "category": "Users", "done": False},
                {"text": "Get featured in Awesome Rust list", "category": "Marketing", "done": True},
                {"text": "3 external contributors", "category": "Dev", "done": True},
            ],
            "insights": [
                "The tree-diffing merge algorithm handles nested YAML better than any competitor. Should write a blog post explaining the approach — good for SEO and credibility.",
            ],
            "notes_list": [
                {"text": "Contributor from Germany submitted a PR for TOML array handling — really clean code. Should invite them as a maintainer.", "category": "general"},
            ],
            "commits": _generate_commits("Patchwork", now, count=85, days_back=180),
            "health": "active",
        },
        {
            "name": "MindGraph",
            "description": "Knowledge graph builder that extracts entities and relationships from markdown notes. Visualizes connections between ideas across your note-taking system.",
            "bucket": "Side Project",
            "state": "MVP",
            "completion_pct": 55,
            "priority": "medium",
            "github_url": "https://github.com/demo/mindgraph",
            "git_last_commit": "fix: handle circular references in graph traversal",
            "git_branch": "feature/search",
            "github_stars": 89,
            "github_open_issues": 15,
            "github_last_push": now - timedelta(days=5),
            "code_tech_stack": ["TypeScript", "React", "D3.js", "SQLite", "Electron"],
            "code_summary": "Desktop app with force-directed graph visualization. NLP pipeline extracts entities from markdown using compromise.js. Local-first with SQLite storage.",
            "kanban_position": 2,
            "notes": "Graph visualization is working well but performance degrades above 500 nodes. Need to implement viewport culling.\n\nObsidian plugin version could unlock a much larger audience than standalone app.",
            "steps": [
                {"text": "Implement viewport culling for large graphs", "done": False, "position": 0},
                {"text": "Add full-text search across notes", "done": False, "position": 1},
                {"text": "Build Obsidian plugin prototype", "done": False, "position": 2},
                {"text": "Export graph as interactive HTML", "done": True, "position": 3},
            ],
            "goals": [
                {"text": "Support 2000+ node graphs smoothly", "category": "Dev", "done": False},
                {"text": "Ship Obsidian plugin to community plugins", "category": "Marketing", "done": False},
                {"text": "100 weekly active users", "category": "Users", "done": False},
            ],
            "insights": [
                "Users care more about the 'what connects to what' discovery than the visual graph itself. The sidebar showing unexpected connections between notes is the real value — the graph is just the hook.",
            ],
            "notes_list": [
                {"text": "Idea: offer a 'daily discovery' notification that surfaces a random connection you haven't explored. Low effort, high engagement.", "category": "idea"},
            ],
            "commits": _generate_commits("MindGraph", now, count=35, days_back=90),
            "health": "active",
        },
        {
            "name": "InvoiceForge",
            "description": "Automated invoicing platform for freelancers. Generates invoices from time tracking data, sends payment reminders, and tracks revenue.",
            "bucket": "Commercial",
            "state": "Launched",
            "completion_pct": 82,
            "priority": "high",
            "target_date": (now + timedelta(days=14)).date(),
            "github_url": None,
            "git_last_commit": "fix: Stripe webhook signature verification",
            "git_branch": "main",
            "github_stars": None,
            "github_open_issues": None,
            "github_last_push": now - timedelta(hours=18),
            "code_tech_stack": ["Next.js", "TypeScript", "Prisma", "PostgreSQL", "Stripe", "Resend"],
            "code_summary": "Full-stack Next.js app with App Router. Stripe for payments, Resend for transactional email. Clean architecture with server actions and Zod validation throughout.",
            "kanban_position": 0,
            "notes": "Revenue: $380 MRR across 14 paying customers. Growing ~15% month over month.\n\nBiggest feature request is recurring invoices — 6 customers have asked. Should be next priority after the Stripe webhook fix.",
            "steps": [
                {"text": "Implement recurring invoice schedules", "done": False, "position": 0},
                {"text": "Add multi-currency support (EUR, GBP)", "done": False, "position": 1},
                {"text": "Build dashboard analytics (revenue trends, payment times)", "done": False, "position": 2},
                {"text": "Set up customer onboarding email sequence", "done": True, "position": 3},
                {"text": "Add PDF export with custom branding", "done": True, "position": 4},
            ],
            "goals": [
                {"text": "$1K MRR", "category": "Revenue", "done": False},
                {"text": "50 paying customers", "category": "Users", "done": False},
                {"text": "Churn below 5%", "category": "Users", "done": True},
                {"text": "Launch affiliate program", "category": "Marketing", "done": False},
            ],
            "insights": [
                "Freelancers who use time tracking integration (Toggl, Harvest) have 3x higher retention than manual entry users. Should make the integration setup part of onboarding, not a settings page discovery.",
                "The PDF branding feature drove 4 upgrades from free to paid in the first week. Vanity features convert better than utility features for this audience.",
            ],
            "notes_list": [
                {"text": "Support ticket from user in Germany — tax calculation doesn't handle reverse charge VAT for EU B2B. Need to research this.", "category": "blocker"},
                {"text": "Decision: keep free tier at 3 invoices/month. Enough to hook users but low enough to convert.", "category": "decision"},
            ],
            "commits": _generate_commits("InvoiceForge", now, count=62, days_back=120),
            "health": "active",
        },
        {
            "name": "TerraSync",
            "description": "Infrastructure-as-code drift detector. Compares your Terraform state against live cloud resources and alerts on unauthorized changes.",
            "bucket": "Open Source",
            "state": "Building",
            "completion_pct": 35,
            "priority": "low",
            "github_url": "https://github.com/demo/terrasync",
            "git_last_commit": "wip: aws ec2 resource mapper",
            "git_branch": "develop",
            "github_stars": 23,
            "github_open_issues": 4,
            "github_last_push": now - timedelta(days=21),
            "code_tech_stack": ["Go", "AWS SDK", "Terraform", "Cobra CLI", "GitHub Actions"],
            "code_summary": "CLI tool with modular resource mappers. Currently supports EC2, S3, and RDS. Diff engine works but output formatting needs polish.",
            "kanban_position": 3,
            "notes": "Paused this while focusing on NexusAPI and InvoiceForge. The core diff engine works but only covers 3 AWS resource types.\n\nNeed to decide: build more resource mappers myself or design a plugin system for community contributions?",
            "steps": [
                {"text": "Design plugin interface for resource mappers", "done": False, "position": 0},
                {"text": "Add Lambda and DynamoDB support", "done": False, "position": 1},
                {"text": "Improve diff output formatting (table + JSON)", "done": False, "position": 2},
                {"text": "Write getting started guide", "done": False, "position": 3},
            ],
            "goals": [
                {"text": "Support top 10 AWS resource types", "category": "Dev", "done": False},
                {"text": "Plugin system for community resource mappers", "category": "Dev", "done": False},
            ],
            "insights": [
                "The plugin system is the right call — Terraform itself succeeded because of the provider ecosystem. Should prioritize the interface design over adding more built-in mappers.",
            ],
            "notes_list": [],
            "commits": _generate_commits("TerraSync", now, count=18, days_back=90, cooling=True),
            "health": "cooling",
        },
        {
            "name": "ChronoLog",
            "description": "Personal time capsule app. Record daily audio journals, auto-transcribe, and resurface entries from the same date in previous years.",
            "bucket": "Personal",
            "state": "Exploring",
            "completion_pct": 15,
            "priority": "low",
            "github_url": "https://github.com/demo/chronolog",
            "git_last_commit": "spike: whisper api transcription quality test",
            "git_branch": "main",
            "github_stars": 5,
            "github_open_issues": 0,
            "github_last_push": now - timedelta(days=45),
            "code_tech_stack": ["Swift", "SwiftUI", "Whisper API", "CloudKit"],
            "code_summary": "iOS app prototype with audio recording and Whisper transcription. Basic UI scaffold with recording and playback. No persistence layer yet beyond local files.",
            "kanban_position": 4,
            "notes": "Fun project but not a priority right now. The Whisper transcription quality is impressive — might be worth revisiting when I have a free weekend.\n\nCould be interesting as an Apple Watch complication for quick voice capture.",
            "steps": [
                {"text": "Design CloudKit schema for entries", "done": False, "position": 0},
                {"text": "Build 'on this day' resurfacing view", "done": False, "position": 1},
                {"text": "Add sentiment analysis to transcriptions", "done": False, "position": 2},
            ],
            "goals": [
                {"text": "Use it daily for 30 days myself", "category": "Experiments", "done": False},
            ],
            "insights": [],
            "notes_list": [
                {"text": "Idea: partner with journaling communities. 'Day One' users might want audio-first alternative.", "category": "idea"},
            ],
            "commits": _generate_commits("ChronoLog", now, count=8, days_back=60, cooling=True),
            "health": "dormant",
        },
        {
            "name": "FleetPing",
            "description": "Lightweight uptime monitor with status pages. Monitors HTTP, TCP, and DNS endpoints with configurable alerting via Slack, email, and PagerDuty.",
            "bucket": "Open Source",
            "state": "Launched",
            "completion_pct": 95,
            "priority": "medium",
            "github_url": "https://github.com/demo/fleetping",
            "git_last_commit": "chore: bump dependencies, fix CVE-2024-3421",
            "git_branch": "main",
            "github_stars": 567,
            "github_open_issues": 9,
            "github_last_push": now - timedelta(days=4),
            "code_tech_stack": ["Go", "SQLite", "htmx", "Tailwind CSS", "Docker"],
            "code_summary": "Single-binary uptime monitor. Zero external dependencies — embedded SQLite, built-in web UI with htmx. Docker image is 12MB. Clean, well-documented codebase.",
            "kanban_position": 1,
            "notes": "Mature project — mostly in maintenance mode. Gets steady organic traffic from the 'awesome-selfhosted' list.\n\n567 stars, consistent 200 Docker pulls/week. Community is healthy with regular issue reports and occasional PRs.",
            "steps": [
                {"text": "Add mTLS support for monitored endpoints", "done": False, "position": 0},
                {"text": "Implement incident timeline view", "done": False, "position": 1},
                {"text": "Review and merge community PR for Telegram alerts", "done": False, "position": 2},
            ],
            "goals": [
                {"text": "1000 GitHub stars", "category": "Users", "done": False},
                {"text": "Zero critical bugs for 90 days", "category": "Dev", "done": True},
            ],
            "insights": [
                "Single-binary, zero-dependency deployment is the #1 reason people choose FleetPing over Uptime Kuma. Never compromise this — it's the core differentiator.",
            ],
            "notes_list": [
                {"text": "User on Reddit compared FleetPing favorably to Uptime Kuma — cited simplicity and resource usage. Good signal that the positioning is working.", "category": "general"},
            ],
            "commits": _generate_commits("FleetPing", now, count=120, days_back=365),
            "health": "active",
        },
        {
            "name": "SpectraUI",
            "description": "Accessible React component library with built-in theme tokens, dark mode, and WCAG 2.1 AA compliance baked into every component.",
            "bucket": "Side Project",
            "state": "Stalled",
            "completion_pct": 40,
            "priority": "low",
            "github_url": "https://github.com/demo/spectra-ui",
            "git_last_commit": "feat: add combobox component",
            "git_branch": "main",
            "github_stars": 34,
            "github_open_issues": 8,
            "github_last_push": now - timedelta(days=67),
            "code_tech_stack": ["TypeScript", "React", "Storybook", "Radix UI", "CSS Variables"],
            "code_summary": "Component library with 12 components built. Uses Radix primitives for accessibility. Storybook docs for each component. No major issues, just needs more components to be useful.",
            "kanban_position": 5,
            "notes": "Stalled because Shadcn/ui took over this space. Need to find a differentiation angle or archive.\n\nPossible pivot: focus specifically on data-dense dashboard components (tables, charts, metric cards) — a niche Shadcn doesn't cover well.",
            "steps": [
                {"text": "Decide: pivot to dashboard components or archive", "done": False, "position": 0},
                {"text": "Build DataTable with sorting, filtering, pagination", "done": False, "position": 1},
                {"text": "Add MetricCard and SparklineChart components", "done": False, "position": 2},
            ],
            "goals": [
                {"text": "Validate dashboard-component pivot with 5 devs", "category": "Experiments", "done": False},
            ],
            "insights": [
                "Generic component libraries are a losing game post-Shadcn. The only viable path is deep specialization — dashboard components, data visualization, or industry-specific UI kits.",
            ],
            "notes_list": [
                {"text": "Blocker: can't compete with Shadcn on general components. Need to pivot or archive by end of month.", "category": "blocker"},
            ],
            "commits": _generate_commits("SpectraUI", now, count=28, days_back=120, cooling=True),
            "health": "dormant",
        },
    ]

    # ── Create projects and related data ───────────────────────────────
    project_objs = []
    for i, p in enumerate(projects_data):
        proj = Project(
            id=new_id(),
            name=p["name"],
            description=p["description"],
            notes=p.get("notes", ""),
            bucket_id=buckets[p["bucket"]],
            state_id=states[p["state"]],
            completion_pct=p["completion_pct"],
            priority=p.get("priority", "medium"),
            target_date=p.get("target_date"),
            github_url=p.get("github_url"),
            git_last_commit=p.get("git_last_commit"),
            git_branch=p.get("git_branch"),
            git_uncommitted=random.choice([True, False]),
            github_stars=p.get("github_stars"),
            github_open_issues=p.get("github_open_issues"),
            github_last_push=p.get("github_last_push"),
            stats_updated_at=now - timedelta(hours=random.randint(1, 24)),
            code_tech_stack=p.get("code_tech_stack"),
            code_summary=p.get("code_summary"),
            last_analyzed_at=now - timedelta(days=random.randint(1, 7)),
            kanban_position=p.get("kanban_position", i),
            created_at=now - timedelta(days=random.randint(30, 365)),
            updated_at=now - timedelta(hours=random.randint(1, 72)),
        )
        db.add(proj)
        db.flush()
        project_objs.append(proj)

        # Steps
        for s in p.get("steps", []):
            db.add(NextStep(id=new_id(), project_id=proj.id, **s))

        # Goals
        for g in p.get("goals", []):
            db.add(SubGoal(id=new_id(), project_id=proj.id, **g))

        # Insights
        for idx, text in enumerate(p.get("insights", [])):
            db.add(Insight(
                id=new_id(), project_id=proj.id, text=text,
                saved_at=now - timedelta(days=random.randint(1, 30)),
            ))

        # Notes
        for n in p.get("notes_list", []):
            db.add(ProjectNote(
                id=new_id(), project_id=proj.id, text=n["text"],
                category=n["category"],
                created_at=now - timedelta(days=random.randint(1, 30)),
            ))

        # Commits
        for c in p.get("commits", []):
            db.add(CommitLog(id=new_id(), project_id=proj.id, **c))

        # Health snapshots (last 4 weeks)
        health_status = p.get("health", "active")
        for w in range(4):
            snapshot_date = now - timedelta(weeks=w)
            c7 = random.randint(5, 20) if health_status == "active" else random.randint(0, 3)
            c30 = c7 * random.randint(3, 5) if health_status == "active" else random.randint(1, 8)
            db.add(HealthSnapshot(
                id=new_id(), project_id=proj.id,
                recorded_at=snapshot_date,
                status=health_status,
                commits_7d=c7, commits_30d=c30,
            ))

    # ── Weekly Focus (pick 3 projects) ─────────────────────────────────
    focus_projects = [project_objs[0], project_objs[3], project_objs[2]]  # NexusAPI, InvoiceForge, MindGraph
    focus_data = [
        {
            "commitment": "Ship API key management dashboard and deploy to staging",
            "tasks": [
                {"text": "Finish dashboard UI components", "done": True},
                {"text": "Write API endpoints for key CRUD", "done": True},
                {"text": "Integration tests for key rotation", "done": False},
                {"text": "Deploy to staging and test", "done": False},
            ],
            "notes": "Dashboard UI taking longer than expected — the permissions model is more complex than anticipated.",
        },
        {
            "commitment": "Launch recurring invoices and fix Stripe webhook issue",
            "tasks": [
                {"text": "Fix webhook signature verification", "done": True},
                {"text": "Design recurring schedule data model", "done": True},
                {"text": "Build schedule creation UI", "done": False},
                {"text": "Test with live Stripe test mode", "done": False},
            ],
            "notes": "Webhook fix was a one-liner — was using the wrong signing secret. Recurring invoices schema is clean.",
        },
        {
            "commitment": "Implement viewport culling for graph performance",
            "tasks": [
                {"text": "Research D3 viewport culling approaches", "done": True},
                {"text": "Implement quadtree spatial index", "done": False},
                {"text": "Benchmark with 1000+ node graph", "done": False},
            ],
            "notes": "",
        },
    ]

    for idx, (proj, fd) in enumerate(zip(focus_projects, focus_data)):
        db.add(WeeklyFocus(
            id=new_id(),
            project_id=proj.id,
            commitment=fd["commitment"],
            tasks=fd["tasks"],
            notes=fd["notes"],
            position=idx,
            created_at=now - timedelta(days=random.randint(0, 3)),
        ))

    # ── Links ──────────────────────────────────────────────────────────
    link_data = [
        (project_objs[0], [
            {"label": "API Docs (Swagger)", "url": "https://nexusapi.dev/docs"},
            {"label": "Competitor Analysis", "url": "https://notion.so/nexus/competitors"},
        ]),
        (project_objs[1], [
            {"label": "crates.io", "url": "https://crates.io/crates/patchwork"},
            {"label": "This Week in Rust Feature", "url": "https://this-week-in-rust.org/blog/2024/03/15"},
        ]),
        (project_objs[3], [
            {"label": "Stripe Dashboard", "url": "https://dashboard.stripe.com"},
            {"label": "Customer Feedback Board", "url": "https://invoiceforge.canny.io"},
        ]),
        (project_objs[6], [
            {"label": "awesome-selfhosted listing", "url": "https://github.com/awesome-selfhosted/awesome-selfhosted"},
            {"label": "Docker Hub", "url": "https://hub.docker.com/r/demo/fleetping"},
        ]),
    ]
    for proj, links in link_data:
        for link in links:
            db.add(ProjectLink(id=new_id(), project_id=proj.id, **link))

    db.commit()
    db.close()

    print(f"Seeded {len(projects_data)} projects with steps, goals, commits, insights, and weekly focus.")
    print("Projects:")
    for p in projects_data:
        print(f"  - {p['name']} ({p['state']}, {p['completion_pct']}%) [{p['bucket']}]")


def _generate_commits(project_name, now, count=30, days_back=90, cooling=False):
    """Generate realistic commit history."""
    messages_by_type = {
        "feat": [
            "add user authentication flow",
            "implement search functionality",
            "add export to CSV feature",
            "implement webhook notifications",
            "add dark mode support",
            "implement caching layer",
            "add pagination to list endpoints",
            "implement role-based access control",
            "add real-time updates via SSE",
            "implement batch operations API",
        ],
        "fix": [
            "handle edge case in date parsing",
            "resolve memory leak in connection pool",
            "correct timezone handling for UTC offsets",
            "fix race condition in concurrent writes",
            "handle null values in aggregation query",
            "resolve CSS overflow in mobile layout",
            "fix auth token refresh timing",
            "correct calculation in analytics rollup",
        ],
        "refactor": [
            "extract validation into middleware",
            "simplify error handling pipeline",
            "reorganize project structure",
            "improve type definitions",
            "consolidate duplicate query logic",
        ],
        "docs": [
            "update API reference with new endpoints",
            "add contributing guidelines",
            "improve getting started guide",
            "add architecture decision records",
            "update changelog for latest release",
        ],
        "chore": [
            "bump dependencies to latest",
            "update CI pipeline configuration",
            "add pre-commit hooks",
            "configure automated releases",
        ],
        "test": [
            "add integration tests for auth flow",
            "improve test coverage for edge cases",
            "add load testing script",
            "fix flaky test in CI",
        ],
    }

    commits = []
    for i in range(count):
        if cooling:
            # Cluster commits earlier, sparse recently
            day_offset = random.randint(days_back // 2, days_back) if i < count * 0.7 else random.randint(0, days_back // 3)
        else:
            day_offset = random.randint(0, days_back)

        commit_type = random.choice(list(messages_by_type.keys()))
        message_body = random.choice(messages_by_type[commit_type])
        message = f"{commit_type}: {message_body}"

        sha = f"{random.randint(0, 0xFFFFFFFFFF):010x}{random.randint(0, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF):030x}"

        committed_at = now - timedelta(
            days=day_offset,
            hours=random.randint(8, 22),
            minutes=random.randint(0, 59),
        )

        commits.append({
            "sha": sha[:40],
            "short_sha": sha[:8],
            "author_name": "Alex Chen",
            "author_email": "alex@example.com",
            "committed_at": committed_at,
            "message": message,
            "files_changed": random.randint(1, 15),
            "insertions": random.randint(5, 200),
            "deletions": random.randint(0, 80),
        })

    return commits


if __name__ == "__main__":
    seed()
