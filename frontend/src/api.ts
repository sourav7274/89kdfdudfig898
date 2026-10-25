import { QueryClient, queryOptions } from "@tanstack/react-query";
import { z } from "zod";

const nullableNumber = z.number().finite().nullable();
const methodologySchema = z.object({
  alignment: z.string(),
  alignment_note: z.string(),
  error_convention: z.literal("forecast_minus_actual"),
  timezone: z.string(),
  cutoff_note: z.string(),
  history_policy: z.string(),
  actual_revision_limit: z.string(),
});
const periodSchema = z.object({
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  forecast_mw: nullableNumber,
  forecast_publish_time: z.string().datetime().nullable(),
  forecast_age_hours: nullableNumber,
});
const reviewPeriodSchema = periodSchema.extend({
  actual_mw: nullableNumber,
  signed_error_mw: nullableNumber,
  absolute_error_mw: nullableNumber,
  actual_half_hours_available: z.number().int().min(0).max(2),
  actual_publish_times: z.array(z.string().datetime().nullable()).length(2),
});
const metricsSchema = z.object({
  expected_hours: z.number().int().nonnegative(),
  matched_hours: z.number().int().nonnegative(),
  missing_forecast_hours: z.number().int().nonnegative(),
  incomplete_actual_hours: z.number().int().nonnegative(),
  coverage_percent: nullableNumber,
  mae_mw: nullableNumber,
  average_signed_error_mw: nullableNumber,
  status: z.enum(["available", "no_eligible_data"]),
});
const decisionSchema = z.object({
  view: z.literal("decision"),
  decision_date: z.string(),
  delivery_date: z.string(),
  cutoff: z.string().datetime(),
  methodology: methodologySchema,
  forecasts: z.array(periodSchema).length(24),
  forecast_coverage: z.object({
    expected_hours: z.number(),
    available_hours: z.number(),
  }),
  historical_accuracy: metricsSchema.extend({
    decision_dates: z.array(z.string()),
    delivery_date_from: z.string().nullable(),
    delivery_date_to: z.string().nullable(),
  }),
});
const reviewSchema = z.object({
  view: z.literal("retrospective"),
  decision_date: z.string(),
  delivery_date: z.string(),
  cutoff: z.string().datetime(),
  methodology: methodologySchema,
  actuals_note: z.string(),
  periods: z.array(reviewPeriodSchema).length(24),
  metrics: metricsSchema,
});
const snapshotSchema = z.object({
  snapshot_id: z.string(),
  imported_at: z.string(),
  records: z.object({ forecasts: z.number(), actuals: z.number() }),
});
export type Period = z.infer<typeof periodSchema>;
export type ReviewPeriod = z.infer<typeof reviewPeriodSchema>;
export type Metrics = z.infer<typeof metricsSchema>;
export type Analysis =
  z.infer<typeof decisionSchema> | z.infer<typeof reviewSchema>;
export type View = "decision" | "review";
export type Filters = { date: string; cutoff: string };

export const filtersSchema = z.object({
  date: z.string().regex(/^2026-01-(0[1-9]|[12]\d|3[01])$/),
  cutoff: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
});

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: (count, error) =>
        count < 1 &&
        !(error instanceof z.ZodError) &&
        (!(error instanceof ApiError) || error.status >= 500),
    },
  },
});

async function get<T>(
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new ApiError(
      response.status === 422
        ? "The decision date or cutoff is invalid. Choose a January date and a valid time."
        : "The analysis service could not respond. Check that the Python API is running, then retry.",
      response.status,
    );
  return schema.parse(await response.json());
}

export const snapshotOptions = queryOptions({
  queryKey: ["snapshot"],
  queryFn: ({ signal }) => get("/api/snapshot", snapshotSchema, signal),
});
export function analysisOptions(
  snapshot: string,
  view: View,
  filters: Filters,
) {
  const params = new URLSearchParams({
    decision_date: filters.date,
    cutoff: filters.cutoff,
  });
  return queryOptions<Analysis>({
    queryKey: ["analysis", snapshot, view, filters.date, filters.cutoff],
    queryFn: ({ signal }) =>
      view === "decision"
        ? get(`/api/decision?${params}`, decisionSchema, signal)
        : get(`/api/review?${params}`, reviewSchema, signal),
    enabled: Boolean(snapshot),
  });
}
