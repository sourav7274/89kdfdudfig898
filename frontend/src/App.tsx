/*
THESIS: A decision-time wind workspace, with the generation profile leading.
OWN-WORLD: REint's Inter, near-white, charcoal and green, translated into precise controls.
STORY: Choose a decision, inspect eligible forecasts, then inspect historical evidence.
FIRST VIEWPORT: Navigation rail, compact context bar, date toolbar and large generation plot.
SIGNATURE: One shared date/cutoff context connects the decision and retrospective views.
*/
import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Grid2X2,
  History,
  Info,
  RotateCw,
  Wind,
} from "lucide-react";
import { analysisOptions, filtersSchema, snapshotOptions } from "./api";
import type {
  Analysis,
  Filters,
  Metrics,
  Period,
  ReviewPeriod,
  View,
} from "./api";
import {
  clock,
  formatDate,
  formatNumber,
  formatSigned,
  publication,
} from "./format";

const ForecastChart = lazy(() => import("./ForecastChart"));
const defaultFilters = { date: "2026-01-15", cutoff: "09:00" };
function initialState() {
  const params = new URLSearchParams(window.location.search);
  const parsed = filtersSchema.safeParse({
    date: params.get("date") ?? defaultFilters.date,
    cutoff: params.get("cutoff") ?? defaultFilters.cutoff,
  });
  return {
    filters: parsed.success ? parsed.data : defaultFilters,
    view:
      params.get("view") === "review"
        ? ("review" as const)
        : ("decision" as const),
  };
}
const initial = initialState();

function Loading({
  text = "Loading the selected analysis…",
}: {
  text?: string;
}) {
  return (
    <div className="loading" role="status">
      <RotateCw size={19} className="spin" />
      <p>{text}</p>
    </div>
  );
}
function Failure({ retry }: { retry: () => void }) {
  return (
    <section className="error-state" role="alert">
      <CircleHelp size={26} />
      <h2>We couldn’t load this analysis</h2>
      <p>
        Check that the Python API is running, then try again. Your selection has
        been kept.
      </p>
      <button className="primary" onClick={retry}>
        <RotateCw size={15} />
        Try again
      </button>
    </section>
  );
}
function changeDay(value: string, direction: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + direction);
  return date.toISOString().slice(0, 10);
}
function MetricsRow({
  metrics,
  historical,
}: {
  metrics: Metrics;
  historical: boolean;
}) {
  const direction =
    metrics.average_signed_error_mw == null
      ? "No eligible observations yet"
      : metrics.average_signed_error_mw > 0
        ? "Forecasts were higher than actuals on average"
        : metrics.average_signed_error_mw < 0
          ? "Forecasts were lower than actuals on average"
          : "Positive and negative errors balance";
  return (
    <div className="metrics-row">
      <div>
        <span className="metric-label">
          Mean absolute error{" "}
          <span title="Average absolute difference between forecast and actual generation">
            <Info size={13} />
          </span>
        </span>
        <strong>
          {formatNumber(metrics.mae_mw)} <small>MW</small>
        </strong>
        <p>
          {metrics.matched_hours
            ? "Average miss, regardless of direction"
            : "No eligible historical data"}
        </p>
      </div>
      <div>
        <span className="metric-label">Average signed error</span>
        <strong>
          {formatSigned(metrics.average_signed_error_mw)} <small>MW</small>
        </strong>
        <p>{direction}</p>
      </div>
      <div>
        <span className="metric-label">Matched coverage</span>
        <strong>
          {metrics.coverage_percent == null
            ? "—"
            : `${formatNumber(metrics.coverage_percent)}%`}
        </strong>
        <p>
          {metrics.matched_hours} of {metrics.expected_hours}{" "}
          {historical ? "historical " : ""}hours evaluated
        </p>
      </div>
    </div>
  );
}

function exportCsv(data: Analysis) {
  const review = data.view === "retrospective";
  const rows = review ? data.periods : data.forecasts;
  const header = [
    "delivery_start_utc",
    "forecast_mw",
    "forecast_publish_time_utc",
    ...(review ? ["actual_hourly_mean_mw", "signed_error_mw"] : []),
  ];
  const contents = [
    header,
    ...rows.map((row) => [
      row.start_time,
      row.forecast_mw,
      row.forecast_publish_time,
      ...("actual_mw" in row && "signed_error_mw" in row
        ? [row.actual_mw, row.signed_error_mw]
        : []),
    ]),
  ]
    .map((row) =>
      row
        .map((value) =>
          value == null ? "" : `"${String(value).replaceAll('"', '""')}"`,
        )
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([contents], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `wind-${data.decision_date}-${data.cutoff.slice(11, 16).replace(":", "")}-${review ? "review" : "decision"}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DataTable({
  rows,
  review,
}: {
  rows: (Period | ReviewPeriod)[];
  review: boolean;
}) {
  const [limit, setLimit] = useState(12);
  return (
    <div className="record-section">
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Hourly source records"
      >
        <table>
          <caption className="sr-only">
            Forecast provenance
            {review ? " and retrospective actual generation" : ""}. All times
            UK, GMT.
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Delivery hour</th>
              <th scope="col">Forecast, MW</th>
              {review && (
                <>
                  <th scope="col">Actual mean, MW</th>
                  <th scope="col">Error, MW</th>
                </>
              )}
              <th scope="col">Forecast published</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((row, index) => (
              <tr key={row.start_time}>
                <td className="muted">{String(index + 1).padStart(2, "0")}</td>
                <th scope="row">
                  {clock(row.start_time)}–{clock(row.end_time)}
                </th>
                <td>{formatNumber(row.forecast_mw)}</td>
                {review && "actual_mw" in row && (
                  <>
                    <td>{formatNumber(row.actual_mw)}</td>
                    <td>{formatSigned(row.signed_error_mw)}</td>
                  </>
                )}
                <td>{publication(row.forecast_publish_time)}</td>
                <td>
                  <span
                    className={`record-status ${row.forecast_mw == null || ("actual_mw" in row && row.actual_mw == null) ? "missing" : ""}`}
                  >
                    {row.forecast_mw == null
                      ? "No forecast"
                      : "actual_mw" in row && row.actual_mw == null
                        ? "Incomplete actuals"
                        : "actual_mw" in row
                          ? "Matched"
                          : "Eligible"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          Showing {Math.min(limit, rows.length)} of {rows.length} hours · UK
          time (GMT)
        </span>
        {limit < rows.length && (
          <button className="text-button" onClick={() => setLimit(rows.length)}>
            Show all 24 hours <ChevronDown size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function AnalysisPanel({ data }: { data: Analysis }) {
  const review = data.view === "retrospective";
  const periods = review ? data.periods : data.forecasts;
  const [showTable, setShowTable] = useState(false);
  const values = periods.flatMap((row) =>
    row.forecast_mw == null ? [] : [row.forecast_mw],
  );
  const peak = periods.reduce<Period | null>(
    (best, row) =>
      row.forecast_mw != null &&
      (best?.forecast_mw == null || row.forecast_mw > best.forecast_mw)
        ? row
        : best,
    null,
  );
  const publications = [
    ...new Set(
      periods.flatMap((row) =>
        row.forecast_publish_time ? [row.forecast_publish_time] : [],
      ),
    ),
  ].sort();
  const metrics = review ? data.metrics : data.historical_accuracy;
  return (
    <>
      <div className={`context-note ${review ? "review-note" : ""}`}>
        <Info size={16} />
        <p>
          {review ? (
            <>
              Retrospective review. Actual generation was recorded{" "}
              <strong>after delivery</strong> and was not available at the
              buying cutoff.
            </>
          ) : (
            <>
              Decision-time view. Forecasts use information published by{" "}
              <strong>
                {clock(data.cutoff)} on {formatDate(data.decision_date, true)}
              </strong>
              . Next-day actuals are hidden.
            </>
          )}
        </p>
      </div>
      <div className="analysis-layout">
        <section className="chart-panel" aria-labelledby="chart-heading">
          <div className="panel-heading">
            <div>
              <p className="section-label">
                Delivery · {formatDate(data.delivery_date)}
              </p>
              <h2 id="chart-heading">
                {review
                  ? "Forecast meets outcome"
                  : "The next-day wind outlook"}
              </h2>
            </div>
            <button
              className="icon-button export-button"
              onClick={() => exportCsv(data)}
              aria-label="Export hourly data as CSV"
              title="Export hourly data as CSV"
            >
              <ArrowDownToLine size={18} />
            </button>
          </div>
          <div className="chart-meta">
            <span>
              Generation <strong>MW</strong>
            </span>
            <div className="legend">
              <span>
                <i className="forecast-line" />
                Eligible forecast
              </span>
              {review && (
                <span>
                  <i className="actual-line" />
                  Actual hourly mean
                </span>
              )}
            </div>
          </div>
          {values.length ? (
            <Suspense fallback={<Loading text="Preparing generation chart…" />}>
              <ForecastChart periods={periods} review={review} />
            </Suspense>
          ) : (
            <div className="loading">
              <Wind size={26} />
              <h3>No eligible forecast</h3>
              <p>
                No forecast in this snapshot was published before your cutoff.
                Try a later time.
              </p>
            </div>
          )}
          <div className="chart-footnote">
            <span>
              <span className="status-dot" />
              {values.length}/24 forecast hours available
            </span>
            <span>00:00–24:00 · UK time (GMT)</span>
          </div>
        </section>
        <aside className="day-summary" aria-label="Selected forecast summary">
          <span className="summary-icon">
            <Wind size={25} strokeWidth={1.5} />
          </span>
          <h2>A day at a glance</h2>
          <p>
            National wind generation.
            <br />
            The forecast available at your cutoff.
          </p>
          <dl>
            <div>
              <dt>Forecast range</dt>
              <dd>
                {values.length
                  ? `${formatNumber(Math.min(...values))}–${formatNumber(Math.max(...values))}`
                  : "Unavailable"}{" "}
                <small>MW</small>
              </dd>
            </div>
            <div>
              <dt>Peak forecast</dt>
              <dd>
                {formatNumber(peak?.forecast_mw)} <small>MW</small>
              </dd>
              <span>
                {peak
                  ? `At ${clock(peak.start_time)} UK time`
                  : "No eligible forecast"}
              </span>
            </div>
            <div>
              <dt>Forecast publication</dt>
              <dd className="publication-value">
                {publications.length === 1
                  ? publication(publications[0])
                  : publications.length
                    ? `${publications.length} publication times`
                    : "Unavailable"}
              </dd>
              <span>
                {publications.length
                  ? "Latest eligible revision per hour"
                  : "Try another cutoff"}
              </span>
            </div>
          </dl>
          <div className="summary-bottom">
            <Database size={14} />
            <span>Elexon · WINDFOR</span>
          </div>
        </aside>
      </div>
      <section className="accuracy-section" aria-labelledby="accuracy-heading">
        <div className="section-heading">
          <div>
            <p className="section-label">
              {review
                ? "Delivery-day results"
                : "Evidence available at the decision"}
            </p>
            <h2 id="accuracy-heading">
              {review
                ? "How did this forecast perform?"
                : "Historical forecast accuracy"}
            </h2>
          </div>
          <span className="date-window">
            {data.view === "decision"
              ? data.historical_accuracy.delivery_date_from
                ? `${formatDate(data.historical_accuracy.delivery_date_from, true)}–${formatDate(data.historical_accuracy.delivery_date_to!, true)} delivery`
                : "No earlier eligible delivery days"
              : `${formatDate(data.delivery_date, true)} delivery`}
          </span>
        </div>
        <MetricsRow metrics={metrics} historical={!review} />
        <p className="metric-note">
          {metrics.matched_hours
            ? "Historical errors describe the evaluated sample. They do not establish tomorrow’s error range or a purchase quantity."
            : "There are no matched observations in this window. A missing metric is not zero error."}
          {metrics.missing_forecast_hours > 0 ||
          metrics.incomplete_actual_hours > 0
            ? ` Missing forecasts: ${metrics.missing_forecast_hours} hours. Incomplete actuals: ${metrics.incomplete_actual_hours} hours. Counts may overlap.`
            : ""}
        </p>
      </section>
      <section className="source-section">
        <button
          className="disclosure-button"
          onClick={() => setShowTable((value) => !value)}
          aria-expanded={showTable}
          aria-controls="hourly-records"
        >
          <span>
            <Database size={17} />
            <strong>Inspect hourly records</strong>
            <span className="muted">Forecast values & publication times</span>
          </span>
          <ChevronDown size={18} className={showTable ? "rotated" : ""} />
        </button>
        {showTable && (
          <div id="hourly-records">
            <DataTable
              key={`${data.decision_date}-${data.cutoff}-${data.view}`}
              rows={periods}
              review={review}
            />
          </div>
        )}
      </section>
      <details className="methodology" id="methodology">
        <summary>
          <span>
            <BookOpen size={17} />
            Methodology & assumptions
          </span>
          <span className="assumption-label">
            Hourly alignment assumption <ChevronDown size={15} />
          </span>
        </summary>
        <div className="methodology-content">
          <div>
            <h3>Hourly alignment is an assumption</h3>
            <p>
              {data.methodology.alignment_note} Both actual half-hours are
              required; missing values are never replaced with zero.
            </p>
          </div>
          <div>
            <h3>Information available at the cutoff</h3>
            <p>
              {data.methodology.history_policy} Each historical forecast uses
              its own decision-day cutoff.
            </p>
          </div>
          <div>
            <h3>Interpreting the numbers</h3>
            <p>
              Signed error = forecast − actual. Positive means overestimation;
              negative means underestimation. MAE averages absolute errors
              across matched hours only.
            </p>
          </div>
          <div>
            <h3>Scope & source limitations</h3>
            <p>
              {data.methodology.actual_revision_limit} National wind output does
              not establish a utility’s contracted supply or purchase
              requirement. {data.methodology.cutoff_note}
            </p>
          </div>
        </div>
      </details>
    </>
  );
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [view, setView] = useState<View>(initial.view);
  const [draftCutoff, setDraftCutoff] = useState(initial.filters.cutoff);
  const [formError, setFormError] = useState("");
  const client = useQueryClient();
  const snapshot = useQuery(snapshotOptions);
  const query = useQuery(
    analysisOptions(snapshot.data?.snapshot_id ?? "", view, filters),
  );
  useEffect(() => {
    const params = new URLSearchParams({
      date: filters.date,
      cutoff: filters.cutoff,
      view,
    });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params}`,
    );
  }, [filters, view]);
  function prefetch(next: View) {
    if (snapshot.data)
      void client.prefetchQuery(
        analysisOptions(snapshot.data.snapshot_id, next, filters),
      );
  }
  function openMethodology() {
    const details = document.getElementById(
      "methodology",
    ) as HTMLDetailsElement | null;
    if (details) {
      details.open = true;
      details.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      details.querySelector("summary")?.focus({ preventScroll: true });
    }
  }
  const failed = snapshot.isError || query.isError;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to analysis
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="GridBricks pilot home">
          <span className="brand-symbol">
            <Grid2X2 size={23} strokeWidth={2.3} />
          </span>
          <span>
            GridBricks
            <span className="brand-caption">by REint · assignment pilot</span>
          </span>
        </a>
        <div className="workspace-label">Energy intelligence</div>
        <nav aria-label="Workspace navigation">
          <button
            className={view === "decision" ? "nav-item active" : "nav-item"}
            aria-current={view === "decision" ? "page" : undefined}
            onClick={() => setView("decision")}
            onMouseEnter={() => prefetch("decision")}
            onFocus={() => prefetch("decision")}
          >
            <Wind size={18} />
            Wind outlook
          </button>
          <button
            className={view === "review" ? "nav-item active" : "nav-item"}
            aria-current={view === "review" ? "page" : undefined}
            onClick={() => setView("review")}
            onMouseEnter={() => prefetch("review")}
            onFocus={() => prefetch("review")}
          >
            <History size={18} />
            Historical review
          </button>
          <button
            className="nav-item methodology-nav"
            onClick={openMethodology}
            disabled={!query.data}
          >
            <BookOpen size={18} />
            Methodology
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="snapshot-indicator">
            <span className="status-dot" />
            Historical snapshot
          </div>
          <p>
            January 2026 decisions
            <br />
            Elexon wind data only
          </p>
          <a href="https://reint.ai/" target="_blank" rel="noreferrer">
            Explore REint <ArrowUpRight size={14} />
          </a>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Forecasts <ChevronRight size={14} />
            <strong>Wind generation</strong>
          </div>
          <span className="market-badge">
            <span className="uk-mark" aria-hidden="true">
              GB
            </span>
            Great Britain <span className="topbar-divider" />
            January 2026
          </span>
        </header>
        <main id="workspace" className="workspace">
          <div className="page-heading">
            <div>
              <p className="page-kicker">Day-ahead decision support</p>
              <h1>
                {view === "decision"
                  ? "A clearer view of tomorrow."
                  : "Look back. Understand the miss."}
              </h1>
              <p>
                {view === "decision"
                  ? "Inspect the wind forecast you could have used, with evidence from earlier decisions."
                  : "Compare the forecast available at the buying cutoff with what happened after delivery."}
              </p>
            </div>
            <span className="pilot-badge">Wind forecast pilot</span>
          </div>
          <section className="toolbar" aria-label="Decision controls">
            <div className="date-control">
              <label htmlFor="decision-date">
                <CalendarDays size={15} />
                Decision date
              </label>
              <div className="date-input-group">
                <button
                  className="icon-button"
                  aria-label="Previous decision day"
                  disabled={filters.date === "2026-01-01"}
                  onClick={() =>
                    setFilters((value) => ({
                      ...value,
                      date: changeDay(value.date, -1),
                    }))
                  }
                >
                  <ChevronLeft size={17} />
                </button>
                <input
                  id="decision-date"
                  type="date"
                  min="2026-01-01"
                  max="2026-01-31"
                  value={filters.date}
                  onChange={(event) => {
                    const result = filtersSchema.safeParse({
                      ...filters,
                      date: event.target.value,
                    });
                    if (result.success) {
                      setFilters(result.data);
                      setFormError("");
                    } else
                      setFormError(
                        "Choose a decision date from 1–31 January 2026.",
                      );
                  }}
                />
                <button
                  className="icon-button"
                  aria-label="Next decision day"
                  disabled={filters.date === "2026-01-31"}
                  onClick={() =>
                    setFilters((value) => ({
                      ...value,
                      date: changeDay(value.date, 1),
                    }))
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
            <span className="delivery-arrow">
              <ArrowRight size={18} />
            </span>
            <div className="delivery-label">
              <span>Delivery day</span>
              <strong>
                {formatDate(changeDay(filters.date, 1), true)} <span>2026</span>
              </strong>
            </div>
            <form
              className="cutoff-control"
              onSubmit={(event) => {
                event.preventDefault();
                const result = filtersSchema.safeParse({
                  ...filters,
                  cutoff: draftCutoff,
                });
                if (result.success) {
                  setFilters(result.data);
                  setFormError("");
                } else
                  setFormError("Enter a valid cutoff, from 00:00 to 23:59.");
              }}
            >
              <label htmlFor="cutoff">
                <Clock3 size={15} />
                Buying cutoff <span>UK time</span>
              </label>
              <div>
                <input
                  id="cutoff"
                  type="time"
                  required
                  value={draftCutoff}
                  onChange={(event) => setDraftCutoff(event.target.value)}
                  aria-describedby="cutoff-help"
                />
                <button
                  className={
                    draftCutoff !== filters.cutoff
                      ? "apply-button changed"
                      : "apply-button"
                  }
                  type="submit"
                  disabled={draftCutoff === filters.cutoff}
                >
                  Apply <Check size={14} />
                </button>
              </div>
            </form>
          </section>
          <p id="cutoff-help" className="cutoff-help">
            Assumed decision time · change the cutoff to explore which forecasts
            were available.
          </p>
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          <div className="view-tabs" role="group" aria-label="Analysis view">
            <button
              className={view === "decision" ? "selected" : ""}
              aria-pressed={view === "decision"}
              onClick={() => setView("decision")}
              onMouseEnter={() => prefetch("decision")}
            >
              Decision outlook
            </button>
            <button
              className={view === "review" ? "selected" : ""}
              aria-pressed={view === "review"}
              onClick={() => setView("review")}
              onMouseEnter={() => prefetch("review")}
            >
              After-delivery review <ArrowUpRight size={13} />
            </button>
            <span className="data-status" role="status">
              {query.isFetching || snapshot.isPending ? (
                "Loading snapshot…"
              ) : failed ? (
                "Connection issue"
              ) : (
                <>
                  <span className="status-dot" />
                  Saved Elexon snapshot
                </>
              )}
            </span>
          </div>
          {failed ? (
            <Failure
              retry={() => {
                if (snapshot.isError) void snapshot.refetch();
                else void query.refetch();
              }}
            />
          ) : !query.data ? (
            <Loading />
          ) : (
            <AnalysisPanel
              key={`${view}-${filters.date}-${filters.cutoff}`}
              data={query.data}
            />
          )}
          <footer className="workspace-footer">
            <span>Built for considered energy decisions.</span>
            <span>
              January 2026 · Assignment prototype ·{" "}
              <a
                href="https://bmrs.elexon.co.uk/wind-generation"
                target="_blank"
                rel="noreferrer"
              >
                Elexon source <ArrowUpRight size={11} />
              </a>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
