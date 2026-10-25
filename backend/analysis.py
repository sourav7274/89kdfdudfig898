"""Selection and analysis rules, independent of the web framework."""
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
import re
import sqlite3

DATABASE = Path(__file__).resolve().parents[1] / "data" / "elexon.sqlite3"
METHODOLOGY = {
    "alignment": "hourly_average_assumption",
    "alignment_note": "Each hourly forecast is assumed to represent the following hour and compared with the mean of both half-hourly actuals. This interval interpretation is a documented assumption, not a verified source definition.",
    "error_convention": "forecast_minus_actual",
    "timezone": "Europe/London",
    "cutoff_note": "09:00 is an assumed buying decision time, not a universal market deadline. Other times are exploratory scenarios.",
    "history_policy": "Earlier January decisions with delivery completed before the selected decision day; actual publications must be available by the selected cutoff.",
    "actual_revision_limit": "Only versions returned by the source snapshot are available; complete historical revision retention is not established.",
}


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def decision_inputs(value, cutoff):
    day = date.fromisoformat(value)
    if day.year != 2026 or day.month != 1:
        raise ValueError("Decision date must be in January 2026.")
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", cutoff):
        raise ValueError("Cutoff must be HH:MM, from 00:00 to 23:59.")
    # January UK local time is UTC. Scope validation above is intentional.
    return day, datetime.combine(day, time.fromisoformat(cutoff), timezone.utc)


def connect(path=DATABASE):
    connection = sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def latest(connection, table, start, end, available_by):
    if table not in ("forecasts", "actuals"):
        raise ValueError("Unknown record type")
    # Parse timestamps rather than relying on lexicographic fractional-second order.
    rows = connection.execute(
        f"SELECT start_time,publish_time,generation_mw FROM {table} "
        "WHERE start_time>=? AND start_time<?", (iso(start), iso(end)))
    selected = {}
    for row in rows:
        published = datetime.fromisoformat(row["publish_time"].replace("Z", "+00:00"))
        if available_by is not None and published > available_by:
            continue
        target = row["start_time"]
        if target not in selected or published > selected[target][0]:
            selected[target] = (published, dict(row))
    return {target: record for target, (_, record) in selected.items()}


def periods(connection, day, cutoff_time, *, include_actuals, actuals_by=None):
    _, cutoff = decision_inputs(day.isoformat(), cutoff_time)
    start = datetime.combine(day + timedelta(days=1), time(), timezone.utc)
    end = start + timedelta(days=1)
    forecasts = latest(connection, "forecasts", start, end, cutoff)
    actuals = latest(connection, "actuals", start, end, actuals_by) if include_actuals else {}
    output = []
    for hour in range(24):
        target = start + timedelta(hours=hour)
        forecast = forecasts.get(iso(target))
        item = {"start_time": iso(target), "end_time": iso(target + timedelta(hours=1)),
                "forecast_mw": forecast["generation_mw"] if forecast else None,
                "forecast_publish_time": forecast["publish_time"] if forecast else None,
                "forecast_age_hours": round((cutoff - datetime.fromisoformat(forecast["publish_time"].replace("Z", "+00:00"))).total_seconds() / 3600, 3) if forecast else None}
        if include_actuals:
            halves = [actuals.get(iso(target + timedelta(minutes=m))) for m in (0, 30)]
            complete = all(halves)
            actual = sum(row["generation_mw"] for row in halves) / 2 if complete else None
            error = forecast["generation_mw"] - actual if forecast and complete else None
            item.update({"actual_mw": actual, "signed_error_mw": error,
                         "absolute_error_mw": abs(error) if error is not None else None,
                         "actual_half_hours_available": sum(row is not None for row in halves),
                         "actual_publish_times": [row["publish_time"] if row else None for row in halves]})
        output.append(item)
    return output


def metrics(rows):
    matched = [row for row in rows if row["signed_error_mw"] is not None]
    count = len(matched)
    return {"expected_hours": len(rows), "matched_hours": count,
            "missing_forecast_hours": sum(row["forecast_mw"] is None for row in rows),
            "incomplete_actual_hours": sum(row["actual_mw"] is None for row in rows),
            "coverage_percent": round(100 * count / len(rows), 3) if rows else None,
            "mae_mw": round(sum(row["absolute_error_mw"] for row in matched) / count, 3) if count else None,
            "average_signed_error_mw": round(sum(row["signed_error_mw"] for row in matched) / count, 3) if count else None,
            "status": "available" if count else "no_eligible_data"}


def decision_view(connection, decision_date, cutoff_time="09:00"):
    day, cutoff = decision_inputs(decision_date, cutoff_time)
    history, decision_days = [], []
    historical = date(2026, 1, 1)
    while historical + timedelta(days=1) < day:
        history.extend(periods(connection, historical, cutoff_time,
                               include_actuals=True, actuals_by=cutoff))
        decision_days.append(historical.isoformat())
        historical += timedelta(days=1)
    forecasts = periods(connection, day, cutoff_time, include_actuals=False)
    return {"view": "decision", "decision_date": decision_date, "cutoff": iso(cutoff),
            "delivery_date": (day + timedelta(days=1)).isoformat(),
            "methodology": METHODOLOGY, "forecasts": forecasts,
            "forecast_coverage": {"expected_hours": 24,
                                  "available_hours": sum(row["forecast_mw"] is not None for row in forecasts)},
            "historical_accuracy": {"decision_dates": decision_days,
                                    "delivery_date_from": (date.fromisoformat(decision_days[0]) + timedelta(days=1)).isoformat() if decision_days else None,
                                    "delivery_date_to": (day - timedelta(days=1)).isoformat() if decision_days else None,
                                    **metrics(history)}}


def review_view(connection, decision_date, cutoff_time="09:00"):
    day, cutoff = decision_inputs(decision_date, cutoff_time)
    rows = periods(connection, day, cutoff_time, include_actuals=True)
    return {"view": "retrospective", "decision_date": decision_date,
            "cutoff": iso(cutoff), "delivery_date": (day + timedelta(days=1)).isoformat(),
            "actuals_note": "Actuals are taken from the saved snapshot after delivery; they were not known at the purchasing cutoff.",
            "methodology": METHODOLOGY, "periods": rows, "metrics": metrics(rows)}
