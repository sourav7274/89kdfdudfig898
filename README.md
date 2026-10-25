# Wind forecast decision support

React frontend, Python API and a reproducible Elexon snapshot for January
2026 purchasing decisions. AI assistance (OpenAI Codex) is used in development.

## Run the backend

Python 3.11+:

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn backend.app:app --reload
```

API documentation: http://127.0.0.1:8000/docs

- `/api/health`: snapshot availability and record counts.
- `/api/snapshot`: database fingerprint and import metadata for frontend cache keys.
- `/api/decision?decision_date=2026-01-15&cutoff=09:00`: next-day forecasts
  without future actuals, plus eligible historical metrics.
- `/api/review?decision_date=2026-01-15&cutoff=09:00`: retrospective next-day
  forecast/actual comparisons. Actuals are explicitly identified as post-delivery.

## Run the frontend

Node.js 22.12+ (Node 24 used for verification). In a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to the Python server on port 8000.
Run `npm run build` for TypeScript checking and the production bundle.
After building, restart the Python server: it also serves the built frontend at
http://127.0.0.1:8000, without the Vite development server. Fingerprinted production
assets use one-year immutable browser caching; HTML revalidates, and API responses
use `no-store` because React Query manages their in-memory cache.

The responsive interface follows reint.ai's light surfaces, Inter type and green
accent, adapted to a decision workspace. It is explicitly an assignment pilot.
Switch between decision outlook and after-delivery review, change January dates,
apply a cutoff, inspect the hourly provenance table, or download its numeric CSV.
Date, cutoff and view are reflected in the URL for sharing or reloading.

### Request caching

TanStack Query keys include the database fingerprint, view, date and cutoff.
The fixed snapshot's results remain fresh during the session; unused results stay
cached for 30 minutes. View navigation prefetches on hover/focus. There is no
polling or focus refetch, and no persistent browser cache. A fresh page load checks
the snapshot fingerprint. Restart the Python process after replacing the snapshot.

Fetch requests consume cancellation signals and a 20-second timeout. Transient
failures retry once; invalid inputs and invalid response schemas do not retry.
Zod validates API responses at the frontend boundary. Changing inputs shows a
loading state instead of relabelling previous results. Cutoff edits are applied
explicitly, and a pending edit identifies the cutoff still used by the results.
`npm test` runs focused checks for cache reuse, concurrent request deduplication,
cache-key isolation, cancellation, response validation and invalid inputs.

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

## Files and verification

- `backend/analysis.py`: source selection, alignment and metrics.
- `backend/app.py`: FastAPI HTTP endpoints and validation.
- `scripts/import_elexon.py`: repeatable source download and SQLite import.
- `data/`: source responses, provenance and database; see `data/README.md`.
- `tests/test_analysis.py`: decision timing, alignment and missing-data checks.
- `tests/test_api.py`: HTTP validation and all 31 January decision/review pairs.
- `frontend/src/api.ts`: validated API schemas and query-cache policy.
- `frontend/src/App.tsx`: decision/review workspace and record inspection.
- `frontend/src/ForecastChart.tsx`: lazy-loaded generation chart.
- `PRODUCT.md`, `DESIGN.md`: product constraints and reference-derived visual rules.

Install `requirements-dev.txt` and run `.venv/Scripts/python -m unittest discover -s tests -v`.
The API integration checks use the saved snapshot. Download the snapshot using
`python scripts/import_elexon.py`; cached source responses are reused.

Docker, deployment and video remain to be implemented. This is a local application;
no public deployment is claimed.
