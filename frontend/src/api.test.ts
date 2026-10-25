import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analysisOptions,
  filtersSchema,
  queryClient,
  snapshotOptions,
} from "./api";

function decisionResponse() {
  return {
    view: "decision",
    decision_date: "2026-01-15",
    delivery_date: "2026-01-16",
    cutoff: "2026-01-15T09:00:00Z",
    methodology: {
      alignment: "hourly_average_assumption",
      alignment_note: "Assumed hourly mean.",
      error_convention: "forecast_minus_actual",
      timezone: "Europe/London",
      cutoff_note: "Assumed cutoff.",
      history_policy: "Completed earlier days.",
      actual_revision_limit: "Snapshot versions only.",
    },
    forecasts: Array.from({ length: 24 }, (_, hour) => ({
      start_time: `2026-01-16T${String(hour).padStart(2, "0")}:00:00Z`,
      end_time:
        hour === 23
          ? "2026-01-17T00:00:00Z"
          : `2026-01-16T${String(hour + 1).padStart(2, "0")}:00:00Z`,
      forecast_mw: 1000,
      forecast_publish_time: "2026-01-15T07:30:00Z",
      forecast_age_hours: 1.5,
    })),
    forecast_coverage: { expected_hours: 24, available_hours: 24 },
    historical_accuracy: {
      expected_hours: 312,
      matched_hours: 312,
      missing_forecast_hours: 0,
      incomplete_actual_hours: 0,
      coverage_percent: 100,
      mae_mw: 500,
      average_signed_error_mw: -100,
      status: "available",
      decision_dates: ["2026-01-01"],
      delivery_date_from: "2026-01-02",
      delivery_date_to: "2026-01-14",
    },
  };
}
afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("snapshot query cache", () => {
  it("deduplicates concurrent requests and reuses the completed result", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(decisionResponse())));
    vi.stubGlobal("fetch", fetch);
    const options = analysisOptions("snapshot-a", "decision", {
      date: "2026-01-15",
      cutoff: "09:00",
    });
    const [first, second] = await Promise.all([
      queryClient.fetchQuery(options),
      queryClient.fetchQuery(options),
    ]);
    const revisit = await queryClient.fetchQuery(options);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(revisit).toBe(first);
  });

  it("separates cache identity by snapshot, view, date and cutoff", () => {
    const filters = { date: "2026-01-15", cutoff: "09:00" };
    const keys = [
      analysisOptions("a", "decision", filters),
      analysisOptions("b", "decision", filters),
      analysisOptions("a", "review", filters),
      analysisOptions("a", "decision", { ...filters, date: "2026-01-16" }),
      analysisOptions("a", "decision", { ...filters, cutoff: "12:00" }),
    ].map((options) => JSON.stringify(options.queryKey));
    expect(new Set(keys).size).toBe(5);
  });

  it("does not retry validation errors or malformed response schemas", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 422 }));
    vi.stubGlobal("fetch", fetch);
    await expect(queryClient.fetchQuery(snapshotOptions)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    queryClient.clear();
    fetch
      .mockClear()
      .mockResolvedValue(new Response(JSON.stringify({ records: "invalid" })));
    await expect(queryClient.fetchQuery(snapshotOptions)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts an obsolete in-flight request instead of caching its result", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            requestSignal = init.signal as AbortSignal;
            requestSignal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const options = analysisOptions("a", "decision", {
      date: "2026-01-15",
      cutoff: "09:00",
    });
    const request = queryClient.fetchQuery(options).catch((error) => error);
    await queryClient.cancelQueries({ queryKey: options.queryKey });
    await request;
    expect(requestSignal?.aborted).toBe(true);
    expect(queryClient.getQueryData(options.queryKey)).toBeUndefined();
  });
});

it("rejects invalid January dates and clock times before fetching", () => {
  expect(
    filtersSchema.safeParse({ date: "2026-01-32", cutoff: "09:00" }).success,
  ).toBe(false);
  expect(
    filtersSchema.safeParse({ date: "2026-02-01", cutoff: "09:00" }).success,
  ).toBe(false);
  expect(
    filtersSchema.safeParse({ date: "2026-01-01", cutoff: "24:00" }).success,
  ).toBe(false);
});
