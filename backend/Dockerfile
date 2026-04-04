FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY VERSION /app/VERSION

# Create data directory for SQLite (mounted as volume)
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["python", "main.py"]
