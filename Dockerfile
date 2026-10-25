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

# ---- Stage 2: install Python dependencies (pip stays in this stage) ----------
# Same Alpine release and Python minor version (3.14) as the runtime below,
# so the compiled musl wheels match.
FROM python:3.14.9-alpine3.24 AS deps
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_ROOT_USER_ACTION=ignore
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --target /deps --no-compile -r requirements.txt \
 && find /deps -depth -type d -name tests -prune -exec rm -rf {} +
# *.dist-info metadata is kept (tiny) so scanners and SBOM tools can see packages.

# ---- Stage 3: minimal runtime ------------------------------------------------
# Plain Alpine plus its own Python package: no pip, compilers or Node.
FROM alpine:3.24 AS runtime

LABEL org.opencontainers.image.title="GridBricks wind forecast decision support" \
      org.opencontainers.image.description="FastAPI + React app for January 2026 Elexon wind forecasts" \
      org.opencontainers.image.source="https://github.com/sourav7274/89kdfdudfig898"

# Trim everything the app never uses, in the same layer so it is really gone:
# - stdlib installer, IDE, docs, test suites and test/terminal extension modules
# - precompiled stdlib caches (~12 MB; costs ~0.5 s once at container start)
# - the apk package manager itself
RUN apk add --no-cache python3 \
 && cd /usr/lib/python3.14 \
 && rm -rf ensurepip idlelib pydoc_data test turtledemo tkinter lib2to3 venv \
           curses dbm config-3.14-* \
           lib-dynload/_test* lib-dynload/xx* lib-dynload/_ctypes_test* \
           lib-dynload/_curses* lib-dynload/_dbm* lib-dynload/readline* \
 && find /usr/lib/python3.14 -name __pycache__ -type d -prune -exec rm -rf {} + \
 && apk del --no-cache apk-tools \
 && adduser -S -D -H -u 10001 app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/deps

WORKDIR /app
# Application files stay root-owned and read-only to the app user.
COPY --from=deps /deps deps
COPY backend/ backend/
COPY data/elexon.sqlite3 data/manifest.json data/
COPY --from=frontend /app/frontend/dist frontend/dist

USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"]

# Exec form: Python is PID 1 and receives SIGTERM directly for a clean shutdown.
CMD ["python3", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "10"]
