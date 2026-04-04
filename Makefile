# ── VibeFocus Makefile ────────────────────────────────────────────────────────

APP_NAME    := vibefocus
FE_DIR      := frontend
BE_DIR      := backend
MCP_DIR     := mcp-server
BE_VENV     := $(BE_DIR)/venv
MCP_VENV    := $(MCP_DIR)/venv
BE_PORT     ?= 8000
FE_PORT     ?= 5173
PYTHON      ?= /opt/homebrew/bin/python3.12

# ── Version (single source of truth: VERSION file) ──────────────────────────
CURRENT_VERSION := $(shell cat VERSION 2>/dev/null || echo "0.0.0")

# ── Docker ──────────────────────────────────────────────────────────────────
DOCKER_REGISTRY ?= ericblue
DOCKER_IMG      := $(APP_NAME)
DOCKER_TAG      ?= $(CURRENT_VERSION)

# ── Install / Setup ──────────────────────────────────────────────────────────

.PHONY: install install-fe install-be install-mcp

install: install-fe install-be install-mcp ## Install all dependencies

install-fe: ## Install frontend dependencies
	cd $(FE_DIR) && npm install

install-be: ## Create venv and install backend dependencies
	cd $(BE_DIR) && $(PYTHON) -m venv venv && . venv/bin/activate && pip install -r requirements.txt

install-mcp: ## Create venv and install MCP server dependencies
	cd $(MCP_DIR) && $(PYTHON) -m venv venv && . venv/bin/activate && pip install -r requirements.txt

# ── Frontend ─────────────────────────────────────────────────────────────────

.PHONY: fe fe-build fe-stop

fe: ## Start frontend dev server (background)
	cd $(FE_DIR) && VITE_API_PORT=$(BE_PORT) npx vite --port $(FE_PORT) &
	@echo "Frontend running on http://localhost:$(FE_PORT)"

fe-build: ## Build frontend for production
	cd $(FE_DIR) && npm run build

fe-stop: ## Stop frontend dev server
	@-pkill -f "vite" 2>/dev/null && echo "Frontend stopped" || echo "Frontend not running"

# ── Backend ──────────────────────────────────────────────────────────────────

.PHONY: be be-stop

be: ## Start backend dev server (background)
	cd $(BE_DIR) && . venv/bin/activate && PORT=$(BE_PORT) python main.py &
	@echo "Backend running on http://localhost:$(BE_PORT)"

be-stop: ## Stop backend dev server
	@-pkill -f "uvicorn" 2>/dev/null && echo "Backend stopped" || echo "Backend not running"

# ── Run / Stop All ───────────────────────────────────────────────────────────

.PHONY: run stop

run: be fe ## Start both backend and frontend

stop: fe-stop be-stop ## Stop both backend and frontend

# ── MCP Server ──────────────────────────────────────────────────────────────

.PHONY: mcp mcp-inspect

mcp: ## Run MCP server (stdio transport)
	cd $(MCP_DIR) && . venv/bin/activate && VIBEFOCUS_API_URL=http://localhost:$(BE_PORT) python server.py

mcp-inspect: ## Inspect MCP server tools
	cd $(MCP_DIR) && . venv/bin/activate && python -c "from server import mcp; [print(f'  {t}') for t in mcp._tool_manager._tools]"

# ── Docker ───────────────────────────────────────────────────────────────────

.PHONY: docker-build docker-run docker-stop docker-logs docker-push

docker-build: ## Build Docker images locally (use DOCKER_TAG=x.y.z to tag)
	DOCKER_BUILDKIT=1 docker compose build
	docker tag $(DOCKER_IMG)-backend:latest $(DOCKER_REGISTRY)/$(DOCKER_IMG)-backend:$(DOCKER_TAG)
	docker tag $(DOCKER_IMG)-frontend:latest $(DOCKER_REGISTRY)/$(DOCKER_IMG)-frontend:$(DOCKER_TAG)
	@echo "Built and tagged $(DOCKER_REGISTRY)/$(DOCKER_IMG)-{backend,frontend}:$(DOCKER_TAG)"

docker-run: ## Run Docker containers (detached)
	docker compose up -d
	@echo "App running at http://localhost:5173"

docker-stop: ## Stop and remove Docker containers
	docker compose down

docker-logs: ## Tail Docker container logs
	docker compose logs -f

docker-push: ## Build and push Docker images with provenance attestations
	@echo "Building and pushing with BuildKit provenance attestations..."
	docker buildx build \
		--provenance=true --sbom=true \
		-t $(DOCKER_REGISTRY)/$(DOCKER_IMG)-backend:$(DOCKER_TAG) \
		-t $(DOCKER_REGISTRY)/$(DOCKER_IMG)-backend:latest \
		-f backend/Dockerfile \
		--push .
	docker buildx build \
		--provenance=true --sbom=true \
		-t $(DOCKER_REGISTRY)/$(DOCKER_IMG)-frontend:$(DOCKER_TAG) \
		-t $(DOCKER_REGISTRY)/$(DOCKER_IMG)-frontend:latest \
		-f frontend/Dockerfile \
		--push .
	@echo "Pushed $(DOCKER_REGISTRY)/$(DOCKER_IMG)-{backend,frontend}:$(DOCKER_TAG) with provenance + SBOM"

# ── Version & Release ────────────────────────────────────────────────────────

.PHONY: version bump-version release release-retag

version: ## Show current version
	@echo "$(CURRENT_VERSION)"

bump-version: ## Bump version (VERSION=x.y.z required)
	@if [ -z "$(VERSION)" ]; then \
		echo "Error: VERSION is required"; \
		echo "Usage: make bump-version VERSION=2.1.0"; \
		exit 1; \
	fi
	@if ! echo "$(VERSION)" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$$'; then \
		echo "Error: VERSION must be semver format (e.g., 2.1.0)"; \
		exit 1; \
	fi
	@echo "Bumping version: $(CURRENT_VERSION) → $(VERSION)"
	@echo "$(VERSION)" > VERSION
	@sed -i '' 's/"version": "[^"]*"/"version": "$(VERSION)"/' $(FE_DIR)/package.json
	@echo "Updated:"
	@echo "  VERSION           → $(VERSION)"
	@echo "  package.json      → $(VERSION)"
	@echo "  backend (reads VERSION file at startup)"

release: ## Create a release (VERSION=x.y.z required)
	@if [ -z "$(VERSION)" ]; then \
		echo "Error: VERSION is required"; \
		echo "Usage: make release VERSION=2.1.0"; \
		exit 1; \
	fi
	@if ! echo "$(VERSION)" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$$'; then \
		echo "Error: VERSION must be semver format (e.g., 2.1.0)"; \
		exit 1; \
	fi
	@if git rev-parse "v$(VERSION)" >/dev/null 2>&1; then \
		echo "Error: Tag v$(VERSION) already exists. Use 'make release-retag VERSION=$(VERSION)' to replace it."; \
		exit 1; \
	fi
	@echo ""
	@echo "╔══════════════════════════════════════════╗"
	@echo "║  VibeFocus Release v$(VERSION)              ║"
	@echo "╚══════════════════════════════════════════╝"
	@echo ""
	@echo "This will:"
	@echo "  1. Bump version to $(VERSION)"
	@echo "  2. Commit version changes"
	@echo "  3. Create git tag v$(VERSION)"
	@echo "  4. Push to origin (main + tag)"
	@echo ""
	@read -p "Continue? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@echo ""
	@# Bump version files
	@echo "$(VERSION)" > VERSION
	@sed -i '' 's/"version": "[^"]*"/"version": "$(VERSION)"/' $(FE_DIR)/package.json
	@echo "✓ Version files updated to $(VERSION)"
	@# Commit
	git add VERSION $(FE_DIR)/package.json
	git commit -m "Release v$(VERSION)"
	@echo "✓ Version commit created"
	@# Tag
	git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	@echo "✓ Tag v$(VERSION) created"
	@# Push
	git push origin HEAD
	git push origin "v$(VERSION)"
	@echo "✓ Pushed to origin"
	@echo ""
	@echo "═══════════════════════════════════════════"
	@echo "  Release v$(VERSION) complete!"
	@echo ""
	@echo "  Next steps:"
	@echo "    • Create GitHub release:"
	@echo "      https://github.com/ericblue/vibefocus/releases/new?tag=v$(VERSION)"
	@echo "    • Build Docker images:"
	@echo "      make docker-build DOCKER_TAG=$(VERSION)"
	@echo "    • Push Docker images:"
	@echo "      make docker-push DOCKER_TAG=$(VERSION)"
	@echo "═══════════════════════════════════════════"

release-retag: ## Replace an existing release tag (VERSION=x.y.z required)
	@if [ -z "$(VERSION)" ]; then \
		echo "Error: VERSION is required"; \
		echo "Usage: make release-retag VERSION=2.1.0"; \
		exit 1; \
	fi
	@if ! git rev-parse "v$(VERSION)" >/dev/null 2>&1; then \
		echo "Error: Tag v$(VERSION) does not exist. Use 'make release VERSION=$(VERSION)' to create it."; \
		exit 1; \
	fi
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "Error: Working directory is not clean. Commit or stash changes first."; \
		exit 1; \
	fi
	@echo ""
	@echo "This will DELETE and RECREATE tag v$(VERSION)"
	@read -p "Continue? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	git tag -d "v$(VERSION)"
	git push origin --delete "v$(VERSION)" 2>/dev/null || echo "Remote tag not found"
	git tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	git push origin "v$(VERSION)"
	@echo ""
	@echo "✓ Tag v$(VERSION) retagged and pushed"

# ── Help ─────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
