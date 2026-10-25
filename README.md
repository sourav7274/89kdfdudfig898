# Wind forecast decision support

**Live app: https://89kdfdudfig898.vercel.app**

A pilot web app for a UK utility's day-ahead buying team. For any January 2026
decision day it shows the latest national wind forecast that was available at the
buying cutoff, and quantifies how accurate those forecasts have been, using only
Elexon `WINDFOR` forecasts and `FUELHH` actuals (fuel type `WIND`).

React frontend, Python (FastAPI) backend, Docker image, deployed on Vercel.

## AI tools used

AI assistants were used during development, as permitted by the brief:

- **OpenAI Codex**: data import, backend analysis, API, tests and the first frontend.
- **Claude (Anthropic, via Claude Code)**: UI redesign (wide layout, side rail,
  collapsible panels, "Show actuals" toggle), Docker setup, code review and
  README updates.

All generated code was reviewed, run and tested locally before committing.

## Using the app

- Pick a **decision date** (1–31 January 2026). The chart shows the forecast for the
  next day (the delivery day), using only forecasts published before the cutoff.
- Change the **buying cutoff** (default 09:00 UK time) and press Apply to see which
  forecasts were available at another time.
- Tick **Show actuals** (top bar) to reveal generation recorded after delivery and
  compare it with the forecast. Untick to return to the decision-time view.
- The right-hand rail shows the day's forecast range, peak and historical accuracy
  (MAE, average signed error, coverage). **Hourly records** and **Methodology**
  open in the rail (Esc or the back arrow returns to the summary).
- One focused hour is shared by the chart, the readout above it and the hourly
  records: hover the chart, a record row or the peak value to inspect that hour.
  With nothing hovered, the readout shows the peak forecast hour.
- Collapse the sidebar with `[` and the rail with `]`, or fold any rail section to
  a one-line summary. Layout choices are remembered in the browser.
- Export the hourly data as CSV. Date, cutoff and view are kept in the URL.
- Below 1080px wide the rail stacks under the chart; on phones the navigation moves
  to the top. Animations are switched off when the system asks for reduced motion.

## What the January 2026 data shows

With the default 09:00 cutoff, across all 31 decisions (delivery 2 January to
1 February, 744 hours, 100% matched coverage):

- Mean absolute error about **2,039 MW**, roughly 18% of mean actual wind output
  (about 11,280 MW).
- Average signed error about **+1,748 MW**: the forecast available at the cutoff
  was higher than the outcome on 27 of 31 delivery days.
- The largest miss was early on 12 January: about 20,900 MW forecast against
  about 14,100 MW actual (+6,900 MW).

These figures describe this sample only. The app does not explain the cause of
the bias (for example curtailment or dataset definitions) or turn it into a
purchase quantity.

## How to start the application

### Option 1: Docker (recommended)

Requires Docker. From the repository root:

```bash
docker compose up --build
```

Open http://localhost:8000. One container builds the React frontend and serves it
together with the API. Without Compose:

```bash
docker build -t gridbricks-wind .
docker run --rm -p 8000:8000 gridbricks-wind
```

The image contains the saved Elexon snapshot, so it needs no network access, API
keys or database. Docker practices used:

- Two-stage build: Node only builds the frontend; the final image is Python slim
  with no Node, no build tools and no pip (removed after installing dependencies).
- Exact base image versions, dependency layers cached before source code, BuildKit
  cache mounts for npm/pip, and a `.dockerignore` keeping the build context small.
- Runs as a non-root user; application files are root-owned and read-only to it.
- `docker-compose.yml` adds a read-only root filesystem, drops all Linux
  capabilities and sets `no-new-privileges`.
- Health check on `/api/health`; exec-form command so uvicorn shuts down cleanly
  on `docker stop`.

### Option 2: run locally without Docker

Backend, Python 3.11+ (3.14 used for verification):

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn backend.app:app --reload
```

Frontend, Node.js 22.12+ (Node 24 used for verification), in a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to the Python server on port 8000.
Alternatively run `npm run build`, then restart the Python server: it also serves
the built frontend at http://127.0.0.1:8000.

### Tests

```powershell
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m unittest discover -s tests -v   # 7 backend tests
cd frontend; npm test                                    # 5 frontend tests
```

### API

API documentation (local only): http://127.0.0.1:8000/docs

- `/api/health`: snapshot availability and record counts.
- `/api/snapshot`: database fingerprint and import metadata for frontend cache keys.
- `/api/decision?decision_date=2026-01-15&cutoff=09:00`: next-day forecasts
  without future actuals, plus eligible historical metrics.
- `/api/review?decision_date=2026-01-15&cutoff=09:00`: retrospective next-day
  forecast/actual comparisons. Actuals are explicitly identified as post-delivery.

## Files and directories

```
.
├── backend/
│   ├── analysis.py        Forecast selection at the cutoff, hourly alignment, error metrics
│   └── app.py             FastAPI endpoints, input validation, cache headers, static frontend
├── data/
│   ├── elexon.sqlite3     Saved January 2026 snapshot (19,856 forecasts, 1,536 actuals), read-only
│   ├── manifest.json      Source provenance, record counts and coverage audit
│   └── README.md          How the snapshot was built
├── scripts/
│   └── import_elexon.py   Repeatable download of WINDFOR/FUELHH and SQLite import
├── tests/
│   ├── test_analysis.py   Decision timing, alignment and missing-data checks
│   └── test_api.py        HTTP validation and all 31 January decision/review pairs
├── frontend/
│   ├── src/App.tsx        Workspace: controls, chart panel, side rail, records, methodology
│   ├── src/ForecastChart.tsx  Lazy-loaded Recharts chart with shared hour focus
│   ├── src/api.ts         Zod-validated API client and TanStack Query cache policy
│   ├── src/api.test.ts    Cache, cancellation and validation tests
│   ├── src/format.ts      Number, date and time formatting
│   ├── src/styles.css     Layout, responsive rules and motion
│   └── vite.config.ts     Dev proxy to the API (disabled under Vercel)
├── Dockerfile             Two-stage build: Node builds the frontend, Python serves app + API
├── docker-compose.yml     One-command local run on port 8000
├── vercel.json            Vercel multi-service config (FastAPI + Vite)
├── requirements.txt       Runtime Python dependencies
├── requirements-dev.txt   Test dependencies
├── PRODUCT.md             Product context, users and constraints
└── DESIGN.md              Visual system and layout rules
```

Raw Elexon responses (`data/raw/`) are not committed. Re-create them, and the
database, with `python scripts/import_elexon.py`; cached responses are reused.

## Analysis conventions

Decision dates are 1–31 January 2026, targeting the next calendar day. UK local time
is UTC throughout this scope. The default 09:00 cutoff is a product assumption,
not a universal auction deadline. Other times are exploratory scenarios.

Select the latest forecast published at or before each decision's cutoff for each
target. **Provisional alignment assumption:** each hourly forecast describes the
following hour. Compare it with the mean of the two half-hour actuals. Source
documentation inspected so far does not establish that hourly-average meaning;
this assumption is exposed in every analysis response. No interpolation or
forecast-derived energy totals are used. Both actual halves are required, and
explicit zero generation is valid.

Historical metrics include earlier January decisions whose delivery days precede
the selected decision day. Each historical forecast uses its own decision-day
cutoff; actual publication times are bounded by the currently selected decision
cutoff. Preserve the newest eligible actual version returned in the snapshot.
Complete actual revision history is not established. Retrospective review uses
the newest available actual versions in the snapshot.

Signed error is forecast minus actual: positive means overestimation. MAE, signed
mean error and coverage use only matched hours. Missing pairs are excluded;
zero matches produce null metrics, never a misleading zero. Missing-forecast and
incomplete-actual counts can overlap.

## Frontend data handling

TanStack Query keys include the database fingerprint, view, date and cutoff.
The fixed snapshot's results remain fresh during the session; unused results stay
cached for 30 minutes. The actuals view prefetches on hover/focus. There is no
polling or focus refetch, and no persistent browser cache. A fresh page load checks
the snapshot fingerprint. Restart the Python process after replacing the snapshot.

Fetch requests consume cancellation signals and a 20-second timeout. Transient
failures retry once; invalid inputs and invalid response schemas do not retry.
Zod validates API responses at the frontend boundary. Changing inputs shows a
loading state instead of relabelling previous results. Cutoff edits are applied
explicitly, and a pending edit identifies the cutoff still used by the results.

Fingerprinted production assets use one-year immutable browser caching; HTML
revalidates, and API responses use `no-store` because React Query manages their
in-memory cache.

The interface follows reint.ai's light surfaces, Inter type and green accent,
adapted to a decision workspace. It is explicitly an assignment pilot.

## Deployment (Vercel)

Deployed at https://89kdfdudfig898.vercel.app from the `main` branch.

`vercel.json` defines two independently built services in one project, with the
project Root Directory set to the repository root (`.`):

- `app`: root `.`, FastAPI entrypoint `backend.app:app`. Public requests to
  `/api/...` go here, preserving the full path and query string.
- `frontend`: root `frontend`, Vite build via `npm ci` and `npm run build`, with
  `dist` output. All other public requests go here.

The frontend fetches same-origin `/api/...` URLs. There are no server-to-server
calls, so no service binding is needed. FastAPI's `/docs`, `/redoc` and
`/openapi.json` are not publicly routed; they remain available locally.

The backend bundles `data/elexon.sqlite3` and `data/manifest.json` and opens the
database read-only; no external database, build-time Elexon fetching or secrets are
required. When `VERCEL` is set the backend does not mount `frontend/dist`, because
the frontend service owns static files. `.vercelignore` excludes local environments,
dependencies, build output, Docker files, raw downloads and test artifacts.

To check routing locally with the Vercel CLI (after `vercel login` and linking):

```powershell
npx vercel dev --listen 3000
```

References: [Services](https://vercel.com/docs/services),
[routing](https://vercel.com/docs/services/routing),
[runtime bindings](https://vercel.com/docs/services/bindings).
