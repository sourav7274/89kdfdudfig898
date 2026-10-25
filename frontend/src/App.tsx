/*
THESIS: A decision-time wind workspace, with the generation profile leading.
OWN-WORLD: REint's Inter, near-white, charcoal and green, translated into precise controls.
STORY: Choose a decision, inspect eligible forecasts, then inspect historical evidence.
FIRST VIEWPORT: Controls, chart and a side rail holding the day summary and accuracy evidence.
SIGNATURE: One focused hour is shared by the chart, readout and hourly records.
*/
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Grid2X2,
  History,
  Info,
  RotateCw,
  Table2,
  Wind,
  X,
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
type Side = "summary" | "records" | "method";

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
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

/* Values glide from the previously shown number when the selection changes. */
const lastShown = new Map<string, number>();
function AnimatedNumber({
  id,
  value,
  format = formatNumber,
}: {
  id: string;
  value: number | null | undefined;
  format?: (value: number | null) => string;
}) {
  const shownRef = useRef<number | null>(
    value == null ? null : (lastShown.get(id) ?? value),
  );
  const [shown, setShown] = useState(shownRef.current);
  useEffect(() => {
    if (value == null) {
      shownRef.current = null;
      setShown(null);
      lastShown.delete(id);
      return;
    }
    const from = shownRef.current ?? value;
    if (from === value || reducedMotion()) {
      shownRef.current = value;
      lastShown.set(id, value);
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 520);
      const next = t < 1 ? from + (value - from) * (1 - (1 - t) ** 4) : value;
      shownRef.current = next;
      lastShown.set(id, next);
      setShown(t < 1 ? Math.round(next) : value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id, value]);
  return <>{format(shown)}</>;
}

function Hint({ children, id }: { children: ReactNode; id?: string }) {
  const generated = useId();
  const bubble = id ?? generated;
  return (
    <span className="hint">
      <button
        type="button"
        className="hint-trigger"
        aria-label="Explain"
        aria-describedby={bubble}
      >
        <Info size={13} />
      </button>
      <span role="tooltip" id={bubble} className="hint-bubble">
        {children}
      </span>
    </span>
  );
}

function Evidence({
  metrics,
  review,
  data,
}: {
  metrics: Metrics;
  review: boolean;
  data: Analysis;
}) {
  const direction =
    metrics.average_signed_error_mw == null
      ? "No eligible observations yet"
      : metrics.average_signed_error_mw > 0
        ? "Forecasts ran higher than actuals"
        : metrics.average_signed_error_mw < 0
          ? "Forecasts ran lower than actuals"
          : "Positive and negative errors balance";
  const coverage = metrics.coverage_percent ?? 0;
  return (
    <section className="evidence" aria-labelledby="accuracy-heading">
      <div className="rail-heading">
        <h2 id="accuracy-heading">
          {review ? "How did it perform?" : "Historical accuracy"}
        </h2>
        <span className="date-window">
          {data.view === "decision"
            ? data.historical_accuracy.delivery_date_from
              ? `${formatDate(data.historical_accuracy.delivery_date_from, true)}–${formatDate(data.historical_accuracy.delivery_date_to!, true)}`
              : "No earlier days"
            : formatDate(data.delivery_date, true)}
        </span>
      </div>
      <dl className="evidence-list">
        <div>
          <dt>
            Mean absolute error
            <Hint>
              Average absolute difference between forecast and actual
              generation, across matched hours only.
            </Hint>
          </dt>
          <dd>
            <AnimatedNumber id="mae" value={metrics.mae_mw} /> <small>MW</small>
          </dd>
          <span>
            {metrics.matched_hours
              ? "Average miss, regardless of direction"
              : "No eligible historical data"}
          </span>
        </div>
        <div>
          <dt>
            Average signed error
            <Hint>
              Forecast − actual. Positive means overestimation; negative means
              underestimation.
            </Hint>
          </dt>
          <dd>
            <AnimatedNumber
              id="signed"
              value={metrics.average_signed_error_mw}
              format={formatSigned}
            />{" "}
            <small>MW</small>
          </dd>
          <span>{direction}</span>
        </div>
        <div>
          <dt>Matched coverage</dt>
          <dd>
            {metrics.coverage_percent == null ? (
              "—"
            ) : (
              <>
                <AnimatedNumber id="coverage" value={metrics.coverage_percent} />
                %
              </>
            )}
          </dd>
          <span
            className="coverage-bar"
            style={{ "--coverage": `${coverage}%` } as CSSProperties}
            aria-hidden="true"
          />
          <span>
            {metrics.matched_hours} of {metrics.expected_hours}{" "}
            {review ? "" : "historical "}hours evaluated
          </span>
        </div>
      </dl>
      <p className="metric-note">
        {metrics.matched_hours
          ? "Errors describe the evaluated sample. They do not establish tomorrow’s error range or a purchase quantity."
          : "No matched observations in this window. A missing metric is not zero error."}
        {metrics.missing_forecast_hours > 0 ||
        metrics.incomplete_actual_hours > 0
          ? ` Missing forecasts: ${metrics.missing_forecast_hours} h. Incomplete actuals: ${metrics.incomplete_actual_hours} h. Counts may overlap.`
          : ""}
      </p>
    </section>
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

function status(row: Period | ReviewPeriod) {
  return row.forecast_mw == null
    ? "No forecast"
    : "actual_mw" in row && row.actual_mw == null
      ? "Incomplete actuals"
      : "actual_mw" in row
        ? "Matched"
        : "Eligible";
}

function DataTable({
  rows,
  review,
  focus,
  onFocus,
}: {
  rows: (Period | ReviewPeriod)[];
  review: boolean;
  focus: number | null;
  onFocus: (index: number | null) => void;
}) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Hourly source records"
      onMouseLeave={() => onFocus(null)}
    >
      <table>
        <caption className="sr-only">
          Forecast provenance
          {review ? " and retrospective actual generation" : ""}. All times UK,
          GMT.
        </caption>
        <thead>
          <tr>
            <th scope="col">Hour</th>
            <th scope="col">Forecast</th>
            {review && (
              <>
                <th scope="col">Actual</th>
                <th scope="col">Error</th>
              </>
            )}
            <th scope="col">Published</th>
            <th scope="col">
              <span className="sr-only">Status</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const label = status(row);
            return (
              <tr
                key={row.start_time}
                className={focus === index ? "focused" : undefined}
                onMouseEnter={() => onFocus(index)}
              >
                <th scope="row">{clock(row.start_time)}</th>
                <td>{formatNumber(row.forecast_mw)}</td>
                {review && "actual_mw" in row && (
                  <>
                    <td>{formatNumber(row.actual_mw)}</td>
                    <td>{formatSigned(row.signed_error_mw)}</td>
                  </>
                )}
                <td className="muted">
                  {row.forecast_publish_time
                    ? clock(row.forecast_publish_time)
                    : "—"}
                </td>
                <td>
                  <span
                    className={`record-status ${label === "Matched" || label === "Eligible" ? "" : "missing"}`}
                    title={label}
                  >
                    <span className="sr-only">{label}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Methodology({ data }: { data: Analysis }) {
  return (
    <div className="method-list">
      <div>
        <h3>Hourly alignment is an assumption</h3>
        <p>
          {data.methodology.alignment_note} Both actual half-hours are required;
          missing values are never replaced with zero.
        </p>
      </div>
      <div>
        <h3>Information available at the cutoff</h3>
        <p>
          {data.methodology.history_policy} Each historical forecast uses its
          own decision-day cutoff.
        </p>
      </div>
      <div>
        <h3>Interpreting the numbers</h3>
        <p>
          Signed error = forecast − actual. Positive means overestimation;
          negative means underestimation. MAE averages absolute errors across
          matched hours only.
        </p>
      </div>
      <div>
        <h3>Scope & source limitations</h3>
        <p>
          {data.methodology.actual_revision_limit} National wind output does not
          establish a utility’s contracted supply or purchase requirement.{" "}
          {data.methodology.cutoff_note}
        </p>
      </div>
    </div>
  );
}

function Readout({
  row,
  pinned,
  review,
}: {
  row: Period | ReviewPeriod | null;
  pinned: boolean;
  review: boolean;
}) {
  if (!row)
    return (
      <div className="readout" aria-live="polite">
        <span className="readout-tag">No eligible forecast</span>
      </div>
    );
  return (
    <div className="readout" aria-live="polite">
      <span className={pinned ? "readout-tag active" : "readout-tag"}>
        {pinned ? "Hour" : "Peak hour"}
      </span>
      <strong className="readout-time">
        {clock(row.start_time)}–{clock(row.end_time)}
      </strong>
      <span className="readout-value forecast">
        <i />
        {formatNumber(row.forecast_mw)} <small>MW</small>
      </span>
      {review && "actual_mw" in row && (
        <>
          <span className="readout-value actual">
            <i />
            {formatNumber(row.actual_mw)} <small>MW actual</small>
          </span>
          <span className="readout-value">
            {formatSigned(row.signed_error_mw)} <small>MW error</small>
          </span>
        </>
      )}
      <span className="readout-meta">
        Published {publication(row.forecast_publish_time)}
      </span>
    </div>
  );
}

function AnalysisPanel({
  data,
  side,
  openSide,
}: {
  data: Analysis;
  side: Side;
  openSide: (next: Side, trigger?: HTMLElement | null) => void;
}) {
  const review = data.view === "retrospective";
  const periods = review ? data.periods : data.forecasts;
  const [focus, setFocus] = useState<number | null>(null);
  const values = periods.flatMap((row) =>
    row.forecast_mw == null ? [] : [row.forecast_mw],
  );
  const peakIndex = periods.reduce<number | null>(
    (best, row, index) =>
      row.forecast_mw != null &&
      (best == null || row.forecast_mw > periods[best].forecast_mw!)
        ? index
        : best,
    null,
  );
  const peak = peakIndex == null ? null : periods[peakIndex];
  const publications = [
    ...new Set(
      periods.flatMap((row) =>
        row.forecast_publish_time ? [row.forecast_publish_time] : [],
      ),
    ),
  ].sort();
  const metrics = review ? data.metrics : data.historical_accuracy;
  const shown = focus == null ? peak : periods[focus];
  return (
    <>
      <div className={`context-note ${review ? "review-note" : ""}`}>
        <Info size={15} />
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
      <div className={`stage ${side === "summary" ? "" : "side-open"}`}>
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
            <div className="panel-actions">
              <button
                className={`chip ${side === "records" ? "on" : ""}`}
                aria-expanded={side === "records"}
                aria-controls="side-panel"
                onClick={(event) =>
                  openSide(
                    side === "records" ? "summary" : "records",
                    event.currentTarget,
                  )
                }
              >
                <Table2 size={15} />
                Hourly records
              </button>
              <button
                className={`chip ${side === "method" ? "on" : ""}`}
                aria-expanded={side === "method"}
                aria-controls="side-panel"
                onClick={(event) =>
                  openSide(
                    side === "method" ? "summary" : "method",
                    event.currentTarget,
                  )
                }
              >
                <BookOpen size={15} />
                Methodology
              </button>
              <button
                className="icon-button export-button"
                onClick={() => exportCsv(data)}
                aria-label="Export hourly data as CSV"
                title="Export hourly data as CSV"
              >
                <ArrowDownToLine size={17} />
              </button>
            </div>
          </div>
          <div className="chart-meta">
            <Readout row={shown} pinned={focus != null} review={review} />
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
              <ForecastChart
                periods={periods}
                review={review}
                focus={focus}
                onFocus={setFocus}
              />
            </Suspense>
          ) : (
            <div className="loading chart">
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
              {values.length}/24 forecast hours available · Generation, MW
            </span>
            <span>00:00–24:00 · UK time (GMT)</span>
          </div>
        </section>
        <aside
          id="side-panel"
          className="side"
          aria-label={
            side === "records"
              ? "Hourly records"
              : side === "method"
                ? "Methodology"
                : "Day summary and accuracy"
          }
          onKeyDown={(event) => {
            if (event.key === "Escape" && side !== "summary") openSide("summary");
          }}
        >
          {side === "summary" ? (
            <div className="side-view" key="summary">
              <section className="glance" aria-labelledby="glance-heading">
                <div className="rail-heading">
                  <h2 id="glance-heading">Day at a glance</h2>
                  <span className="date-window">
                    <Database size={12} /> Elexon · WINDFOR
                  </span>
                </div>
                <dl className="glance-list">
                  <div>
                    <dt>Forecast range</dt>
                    <dd>
                      {values.length ? (
                        <>
                          <AnimatedNumber id="min" value={Math.min(...values)} />
                          –
                          <AnimatedNumber id="max" value={Math.max(...values)} />
                        </>
                      ) : (
                        "Unavailable"
                      )}{" "}
                      <small>MW</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Peak forecast</dt>
                    <dd>
                      <button
                        className="peak-link"
                        disabled={peakIndex == null}
                        onMouseEnter={() => setFocus(peakIndex)}
                        onMouseLeave={() => setFocus(null)}
                        onFocus={() => setFocus(peakIndex)}
                        onBlur={() => setFocus(null)}
                      >
                        <AnimatedNumber id="peak" value={peak?.forecast_mw} />{" "}
                        <small>
                          MW{peak ? ` at ${clock(peak.start_time)}` : ""}
                        </small>
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      Forecast publication
                      <Hint>
                        The latest revision published before the cutoff is used
                        for each delivery hour.
                      </Hint>
                    </dt>
                    <dd className="publication-value">
                      {publications.length === 1
                        ? publication(publications[0])
                        : publications.length
                          ? `${publications.length} publication times`
                          : "Unavailable"}
                    </dd>
                  </div>
                </dl>
              </section>
              <Evidence metrics={metrics} review={review} data={data} />
            </div>
          ) : (
            <div className="side-view" key={side}>
              <div className="side-header">
                <button
                  className="icon-button"
                  onClick={() => openSide("summary")}
                  aria-label="Back to summary"
                >
                  <ArrowLeft size={17} />
                </button>
                <h2 id="side-heading" tabIndex={-1}>
                  {side === "records" ? "Hourly records" : "Methodology"}
                </h2>
                <button
                  className="icon-button"
                  onClick={() => openSide("summary")}
                  aria-label="Close panel"
                >
                  <X size={17} />
                </button>
              </div>
              {side === "records" ? (
                <>
                  <p className="side-caption">
                    Hover a row to locate it on the chart · UK time (GMT)
                  </p>
                  <DataTable
                    rows={periods}
                    review={review}
                    focus={focus}
                    onFocus={setFocus}
                  />
                </>
              ) : (
                <Methodology data={data} />
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [view, setView] = useState<View>(initial.view);
  const [side, setSide] = useState<Side>("summary");
  const [draftCutoff, setDraftCutoff] = useState(initial.filters.cutoff);
  const [formError, setFormError] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
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
  function openSide(next: Side, from?: HTMLElement | null) {
    if (next !== "summary") trigger.current = from ?? null;
    setSide(next);
    requestAnimationFrame(() => {
      if (next === "summary") {
        trigger.current?.focus({ preventScroll: true });
        trigger.current = null;
        return;
      }
      const panel = document.getElementById("side-panel");
      document
        .getElementById("side-heading")
        ?.focus({ preventScroll: true });
      if (panel && panel.getBoundingClientRect().top > window.innerHeight * 0.6)
        panel.scrollIntoView({
          behavior: reducedMotion() ? "instant" : "smooth",
          block: "start",
        });
    });
  }
  const failed = snapshot.isError || query.isError;
  const delivery = changeDay(filters.date, 1);
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
            className={`nav-item methodology-nav ${side === "method" ? "active" : ""}`}
            onClick={(event) =>
              openSide(side === "method" ? "summary" : "method", event.currentTarget)
            }
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
          <div
            className="view-switch"
            role="group"
            aria-label="Analysis view"
            data-view={view}
          >
            <span className="view-pill" aria-hidden="true" />
            <button
              aria-pressed={view === "decision"}
              onClick={() => setView("decision")}
              onMouseEnter={() => prefetch("decision")}
            >
              Decision outlook
            </button>
            <button
              aria-pressed={view === "review"}
              onClick={() => setView("review")}
              onMouseEnter={() => prefetch("review")}
            >
              After-delivery review
            </button>
          </div>
          <div className="topbar-end">
            <span className="data-status" role="status">
              {query.isFetching || snapshot.isPending ? (
                <>
                  <RotateCw size={11} className="spin" />
                  Loading snapshot…
                </>
              ) : failed ? (
                "Connection issue"
              ) : (
                <>
                  <span className="status-dot live" />
                  Saved Elexon snapshot
                </>
              )}
            </span>
            <span className="market-badge">
              <span className="uk-mark" aria-hidden="true">
                GB
              </span>
              Great Britain <span className="topbar-divider" />
              January 2026
            </span>
          </div>
        </header>
        <main id="workspace" className="workspace">
          <div className="page-heading">
            <div className="page-title">
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
            <section className="toolbar" aria-label="Decision controls">
              <div className="date-control">
                <label htmlFor="decision-date">
                  <CalendarDays size={14} />
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
              <span className="delivery-arrow" aria-hidden="true">
                <ArrowRight size={16} />
              </span>
              <div className="delivery-label">
                <span>Delivery day</span>
                <strong key={delivery}>
                  {formatDate(delivery, true)} <span>2026</span>
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
                  <Clock3 size={14} />
                  Buying cutoff <span>UK</span>
                  <Hint id="cutoff-help">
                    Assumed decision time. Change the cutoff to explore which
                    forecasts were available.
                  </Hint>
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
                    Apply <Check size={13} />
                  </button>
                </div>
              </form>
            </section>
          </div>
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
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
              side={side}
              openSide={openSide}
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
