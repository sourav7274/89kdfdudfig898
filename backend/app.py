"""HTTP API; run with: uvicorn backend.app:app --reload"""
from contextlib import closing
from functools import lru_cache
import hashlib
import json
from typing import Annotated
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from backend.analysis import DATABASE, connect, decision_view, review_view

app = FastAPI(title="Wind Forecast Decision Support", version="0.1.0")
DateParameter = Annotated[str, Query(pattern=r"^2026-01-\d{2}$")]
CutoffParameter = Annotated[str, Query(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]


@app.middleware("http")
async def cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        # React Query owns analysis caching; a new page must recheck the snapshot.
        response.headers["Cache-Control"] = "no-store"
    elif request.url.path.startswith("/assets/") and response.status_code == 200:
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    else:
        response.headers["Cache-Control"] = "no-cache"
    return response


@lru_cache(maxsize=1)
def snapshot_metadata():
    manifest = json.loads(DATABASE.with_name("manifest.json").read_text())
    return {"snapshot_id": hashlib.sha256(DATABASE.read_bytes()).hexdigest()[:20],
            "imported_at": manifest["generated_at"], "records": manifest["counts"]}


@app.get("/api/snapshot")
def snapshot():
    return snapshot_metadata()


@app.get("/api/health")
def health():
    with closing(connect()) as connection:
        counts = {table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                  for table in ("forecasts", "actuals")}
    return {"status": "ok", "records": counts}


def analyse(view, decision_date, cutoff):
    try:
        with closing(connect()) as connection:
            return view(connection, decision_date, cutoff)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/decision")
def decision(decision_date: DateParameter, cutoff: CutoffParameter = "09:00"):
    return analyse(decision_view, decision_date, cutoff)


@app.get("/api/review")
def review(decision_date: DateParameter, cutoff: CutoffParameter = "09:00"):
    return analyse(review_view, decision_date, cutoff)


frontend_build = DATABASE.parent.parent / "frontend" / "dist"
if frontend_build.is_dir():
    app.mount("/", StaticFiles(directory=frontend_build, html=True), name="frontend")
