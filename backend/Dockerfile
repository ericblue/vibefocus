FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY VERSION /app/VERSION

# Build hygiene check: fail the build if local config or database files
# ever make it into the build context
RUN if ls .env* *.db >/dev/null 2>&1; then \
      echo "ERROR: local config/database files found in image - check .dockerignore" && exit 1; \
    fi

# Create non-root user and data directory for SQLite (mounted as volume)
RUN groupadd -r vibefocus && useradd -r -g vibefocus -d /app vibefocus \
    && mkdir -p /app/data \
    && chown -R vibefocus:vibefocus /app

USER vibefocus

EXPOSE 8000

CMD ["python", "main.py"]
