# ── Build frontend ───────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Final image ──────────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/* \
    && git config --system --add safe.directory '*'

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .
COPY VERSION /app/VERSION

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist /app/static

# Create non-root user and data directory
RUN groupadd -r vibefocus && useradd -r -g vibefocus -d /app vibefocus \
    && mkdir -p /app/data \
    && chown -R vibefocus:vibefocus /app

ENV DATABASE_URL=sqlite:///./data/vibefocus.db

USER vibefocus

EXPOSE 8000

CMD ["python", "main.py"]
