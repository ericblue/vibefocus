#!/usr/bin/env python3
"""Sync git stats + commit logs for every VibeFocus project with a local repo.

Intended to run nightly via launchd (see scripts/com.ericblue.vibefocus-sync.plist)
but safe to run by hand any time. Requires the backend to be reachable.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime

API = os.environ.get("VIBEFOCUS_API_URL", "http://localhost:4010") + "/api"


def call(method: str, path: str):
    req = urllib.request.Request(f"{API}{path}", method=method)
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read()
        return json.loads(body) if body else {}


def main() -> int:
    print(f"[{datetime.now().isoformat(timespec='seconds')}] vibefocus sync-all start")
    try:
        projects = call("GET", "/projects")
    except Exception as e:
        print(f"ERROR: backend unreachable at {API}: {e}")
        return 1

    synced, skipped, failed = 0, 0, []
    for p in projects:
        path = p.get("local_path")
        if not path or not os.path.isdir(os.path.join(path, ".git")):
            skipped += 1
            continue
        try:
            call("POST", f"/projects/{p['id']}/refresh-stats")
            call("POST", f"/projects/{p['id']}/sync-git-log")
            synced += 1
        except Exception as e:
            failed.append(f"{p['name']}: {e}")

    print(f"synced {synced}, skipped {skipped} (no repo), failed {len(failed)}")
    for f in failed:
        print(f"  FAIL {f}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
