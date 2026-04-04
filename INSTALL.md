# VibeFocus Installation Guide

## Prerequisites

- Python 3.12+ (arm64 recommended for macOS Apple Silicon)
- Node.js 18+
- An Anthropic API key

## Quick Start

```bash
# Clone the repo
git clone <repo-url> vibefocus
cd vibefocus

# Install everything (frontend + backend + MCP server)
make install

# Copy and configure the backend environment
cp backend/.env.example backend/.env
# Edit backend/.env and set your ANTHROPIC_API_KEY

# Start the app
make run
```

The backend runs on `http://localhost:8000` and the frontend on `http://localhost:5173` by default.

### Custom Ports

```bash
make run BE_PORT=9000 FE_PORT=4010
```

### Custom Python

If your default `python3` isn't arm64, specify the path:

```bash
make install-be PYTHON=/opt/homebrew/bin/python3.12
```

## MCP Server Setup

The MCP server exposes VibeFocus as tools for Claude Code and other MCP clients. It requires the backend to be running.

### Install

```bash
make install-mcp
```

### Option 1: Global Configuration (all projects)

Create `~/.mcp.json` in your home directory:

```json
{
  "mcpServers": {
    "vibe_focus": {
      "command": "/bin/bash",
      "args": [
        "-c",
        "cd /path/to/vibefocus/mcp-server && source venv/bin/activate && python server.py"
      ],
      "env": {
        "VIBEFOCUS_API_URL": "http://localhost:9000"
      }
    }
  }
}
```

Replace `/path/to/vibefocus` with your actual checkout path and adjust the port to match your `BE_PORT`.

This makes VibeFocus tools available in every Claude Code session, regardless of which directory you're working in.

### Option 2: Per-Project Configuration

Create `.mcp.json` in the root of any project where you want VibeFocus tools available:

```json
{
  "mcpServers": {
    "vibe_focus": {
      "command": "/bin/bash",
      "args": [
        "-c",
        "cd /path/to/vibefocus/mcp-server && source venv/bin/activate && python server.py"
      ],
      "env": {
        "VIBEFOCUS_API_URL": "http://localhost:9000"
      }
    }
  }
}
```

This only loads the VibeFocus MCP server when Claude Code is running in that specific project directory.

### Verify

After restarting Claude Code, run `/mcp` to confirm `vibe_focus` appears in the server list. You can also verify the tools are registered:

```bash
make mcp-inspect
```

### Notes

- The MCP server uses **stdio transport** — Claude Code launches it as a subprocess automatically. You do not need to run `make mcp` manually.
- The backend must be running for the MCP server to work (it calls the VibeFocus API over HTTP).
- If you add `.mcp.json` to a project, Claude Code will prompt you to approve the server on first use.
- A pre-built config file is available at `mcp-server/claude-mcp-config.json` for reference.

## Docker

Docker is the easiest way to run VibeFocus without installing Python or Node.js locally. Everything runs in a single container.

### Quick Start

```bash
docker run -d \
  -p 8000:8000 \
  -v ./data:/app/data \
  -e ANTHROPIC_API_KEY=your_key_here \
  ericblue/vibefocus:latest
```

Open `http://localhost:8000` — both the UI and API are served from one port.

### From Source

```bash
git clone <repo-url> vibefocus
cd vibefocus

cp backend/.env.example backend/.env
# Edit backend/.env and set your ANTHROPIC_API_KEY

make docker-build    # Build image (first time only)
make docker-run      # Start container (detached)
```

The app runs at `http://localhost:8000`.

### Data Persistence

The SQLite database is stored on your host filesystem at `./data/vibefocus.db` via a bind mount. This means:

- Your data survives container restarts and rebuilds
- You can back up the database by copying `./data/vibefocus.db`
- You can inspect or migrate the database directly from your host

If you need to change the database path, update `DATABASE_URL` in `backend/.env`:

```
DATABASE_URL=sqlite:///./data/vibefocus.db
```

### Management

```bash
make docker-stop     # Stop containers
make docker-logs     # Tail container logs
make docker-build    # Rebuild after code changes
```

### Docker + MCP

The MCP server runs outside Docker (it needs access to your local git repos). With Docker, just point the MCP config at the Docker backend port:

```json
{
  "mcpServers": {
    "vibe_focus": {
      "env": {
        "VIBEFOCUS_API_URL": "http://localhost:8000"
      }
    }
  }
}
```

## Local Development vs Docker

| | Local (`make run`) | Docker (`make docker-run`) |
|---|---|---|
| **Setup** | Requires Python 3.12+, Node.js 18+ | Just Docker |
| **Hot reload** | Yes (Vite + uvicorn) | Requires rebuild |
| **Ports** | 8000 (API) + 5173 (UI) | 8000 (single port) |
| **Database** | `backend/vibefocus.db` | `./data/vibefocus.db` |
| **Code analysis** | Works (Agent SDK accesses local repos) | Limited (repos not mounted) |
| **MCP server** | Works fully | Backend only, MCP runs on host |
| **Best for** | Active development | Quick demo / deployment |
