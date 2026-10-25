# syntax=docker/dockerfile:1.7
# Build:  docker build -t gridbricks-wind .
# Run:    docker run --rm -p 8000:8000 gridbricks-wind   ->  http://localhost:8000

# ---- Stage 1: build the React frontend ---------------------------------------
# Exact versions keep builds reproducible; bump them deliberately.
FROM node:24.22.1-alpine3.24 AS frontend
WORKDIR /app/frontend
# Copy only the manifests first so dependency installs are cached until they change.
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python runtime serving the API and the built frontend ----------
FROM python:3.14.9-slim-trixie AS runtime

LABEL org.opencontainers.image.title="GridBricks wind forecast decision support" \
      org.opencontainers.image.description="FastAPI + React app for January 2026 Elexon wind forecasts" \
      org.opencontainers.image.source="https://github.com/sourav7274/89kdfdudfig898"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore

WORKDIR /app
COPY requirements.txt ./
# pip is only needed to install; removing it drops its bundled libraries
# (urllib3, msgpack) and their CVEs from the final image.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt \
 && pip uninstall -y pip

# Application files stay root-owned and read-only to the app user.
COPY backend/ backend/
COPY data/elexon.sqlite3 data/manifest.json data/
COPY --from=frontend /app/frontend/dist frontend/dist

RUN useradd --system --no-create-home --uid 10001 app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"]

# Exec form: uvicorn is PID 1 and receives SIGTERM directly for a clean shutdown.
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "10"]
