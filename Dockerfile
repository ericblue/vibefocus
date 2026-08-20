# ── Build frontend ───────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Final image ──────────────────────────────────────────────────────────────
# Alpine keeps the runtime surface minimal: git here has no perl dependency,
# which drops the largest sources of OS-level CVEs in the debian-slim base.
FROM python:3.12-alpine

WORKDIR /app

# Install system dependencies (git is needed at runtime for repo sync)
RUN apk add --no-cache git \
    && git config --system --add safe.directory '*'

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip uninstall -y setuptools wheel pip

# Copy backend code
COPY backend/ .
COPY VERSION /app/VERSION

# Build hygiene check: fail the build if local config or database files
# ever make it into the build context
RUN if ls .env* *.db >/dev/null 2>&1; then \
      echo "ERROR: local config/database files found in image - check .dockerignore" && exit 1; \
    fi

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist /app/static

# Create non-root user and data directory
RUN addgroup -S vibefocus && adduser -S -G vibefocus -h /app -s /sbin/nologin vibefocus \
    && mkdir -p /app/data \
    && chown -R vibefocus:vibefocus /app

ENV DATABASE_URL=sqlite:///./data/vibefocus.db

USER vibefocus

EXPOSE 8000

CMD ["python", "main.py"]
