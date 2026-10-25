"""Download and validate the fixed Elexon snapshot. Uses Python's standard library."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import time
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets/"


def days(first, last):
    while first <= last:
        yield first
        first += timedelta(days=1)


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.utcoffset() != timedelta(0):
        raise ValueError(f"Expected UTC timestamp: {value}")
    return parsed


def fetch(job):
    dataset, day, refresh = job
    if dataset == "WINDFOR":
        params = {"publishDateTimeFrom": f"{day}T00:00:00Z",
                  "publishDateTimeTo": f"{day}T23:59:59.999999Z"}
    else:
        params = {"settlementDateFrom": str(day), "settlementDateTo": str(day),
                  "fuelType": "WIND"}
    url = BASE + dataset + "/stream?" + urlencode(params)
    path = ROOT / "data" / "raw" / dataset / f"{day}.json"
    metadata_path = path.with_suffix(".meta.json")
    if path.exists() and metadata_path.exists() and not refresh:
        payload = path.read_bytes()
        meta = json.loads(metadata_path.read_text())
        if hashlib.sha256(payload).hexdigest() != meta["sha256"]:
            raise ValueError(f"Snapshot checksum mismatch: {path}")
    else:
        for attempt in range(3):
            try:
                with urlopen(url, timeout=90) as response:
                    payload = response.read()
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        # Validate JSON before persisting a response.
        json.loads(payload)
        meta = {"url": url, "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "sha256": hashlib.sha256(payload).hexdigest()}
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        metadata_path.write_text(json.dumps(meta, indent=2) + "\n")
    rows = json.loads(payload)
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"Expected nonempty record list: {url}")
    for row in rows:
        if row["dataset"] != dataset:
            raise ValueError(f"Unexpected dataset: {row}")
        start, published = timestamp(row["startTime"]), timestamp(row["publishTime"])
        generation = row["generation"]
        if isinstance(generation, bool) or not isinstance(generation, (int, float)):
            raise ValueError(f"Invalid generation: {row}")
        if not (0 <= generation < float("inf")):
            raise ValueError(f"Invalid WIND generation: {row}")
        if dataset == "WINDFOR" and published.date() != day:
            raise ValueError(f"Publication filter not respected: {row}")
        if dataset == "FUELHH":
            if row["fuelType"] != "WIND" or row["settlementDate"] != str(day):
                raise ValueError(f"Actual filter not respected: {row}")
            if start.minute not in (0, 30) or start.second != 0:
                raise ValueError(f"Unexpected actual resolution: {row}")
    print(f"{dataset} {day}: {len(rows)} records", flush=True)
    return dataset, rows, {**meta, "file": str(path.relative_to(ROOT)), "records": len(rows)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Replace cached source responses")
    args = parser.parse_args()
    # Three-day publication buffer precedes the first January decision.
    jobs = [("WINDFOR", d, args.refresh) for d in days(date(2025, 12, 29), date(2026, 1, 31))]
    jobs += [("FUELHH", d, args.refresh) for d in days(date(2026, 1, 1), date(2026, 2, 1))]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(fetch, jobs))
    data_dir = ROOT / "data"
    temporary = data_dir / "elexon.build.sqlite3"
    temporary.unlink(missing_ok=True)
    connection = sqlite3.connect(temporary)
    connection.executescript("""
        CREATE TABLE forecasts (
            start_time TEXT NOT NULL, publish_time TEXT NOT NULL,
            generation_mw REAL NOT NULL CHECK(generation_mw >= 0),
            PRIMARY KEY(start_time, publish_time));
        CREATE INDEX forecast_publication ON forecasts(publish_time);
        CREATE TABLE actuals (
            start_time TEXT NOT NULL, publish_time TEXT NOT NULL,
            generation_mw REAL NOT NULL CHECK(generation_mw >= 0),
            settlement_date TEXT NOT NULL, settlement_period INTEGER NOT NULL,
            PRIMARY KEY(start_time, publish_time));
    """)
    duplicates = {"WINDFOR": 0, "FUELHH": 0}
    for dataset, rows, _ in results:
        table = "forecasts" if dataset == "WINDFOR" else "actuals"
        for row in rows:
            values = (row["startTime"], row["publishTime"], row["generation"])
            existing = connection.execute(
                f"SELECT generation_mw FROM {table} WHERE start_time=? AND publish_time=?", values[:2]
            ).fetchone()
            if existing:
                if existing[0] != values[2]:
                    raise ValueError(f"Conflicting values for the same record identity: {row}")
                duplicates[dataset] += 1
                continue
            if dataset == "FUELHH":
                values += (row["settlementDate"], row["settlementPeriod"])
            connection.execute(f"INSERT INTO {table} VALUES ({','.join('?' for _ in values)})", values)
    coverage = []
    for decision in days(date(2026, 1, 1), date(2026, 1, 31)):
        delivery = decision + timedelta(days=1)
        cutoff = f"{decision}T09:00:00Z"
        forecasts = connection.execute(
            "SELECT COUNT(DISTINCT start_time) FROM forecasts WHERE start_time>=? AND start_time<? AND publish_time<=?",
            (f"{delivery}T00:00:00Z", f"{delivery + timedelta(days=1)}T00:00:00Z", cutoff)
        ).fetchone()[0]
        actuals = connection.execute(
            "SELECT COUNT(DISTINCT start_time) FROM actuals WHERE settlement_date=?", (str(delivery),)
        ).fetchone()[0]
        coverage.append({"decision_date": str(decision), "delivery_date": str(delivery),
                         "eligible_forecast_targets_at_0900_utc": forecasts,
                         "actual_half_hours": actuals})
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "decision_dates": ["2026-01-01", "2026-01-31"],
        "forecast_publication_dates": ["2025-12-29", "2026-01-31"],
        "actual_delivery_dates": ["2026-01-01", "2026-02-01"],
        "counts": {t: connection.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                   for t in ("forecasts", "actuals")},
        "identical_duplicates_removed": duplicates,
        "forecast_target_minutes": [r[0] for r in connection.execute(
            "SELECT DISTINCT substr(start_time,15,2) FROM forecasts ORDER BY 1")],
        "coverage": coverage, "sources": [meta for _, _, meta in results],
        "limitations": ["Preserves all versions returned by these endpoints; does not prove that all historical actual revisions are retained by Elexon.",
                        "09:00 UTC coverage is an audit scenario, not a configured application rule.",
                        "No forecast-to-actual alignment or error metrics have been applied."]}
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise ValueError(integrity)
    connection.commit()
    connection.close()
    temporary.replace(data_dir / "elexon.sqlite3")
    (data_dir / "manifest.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({"counts": summary["counts"], "coverage": coverage,
                      "identical_duplicates_removed": duplicates}, indent=2))


if __name__ == "__main__":
    main()
