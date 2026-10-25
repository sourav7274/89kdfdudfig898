import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Period, ReviewPeriod } from "./api";
import { clock } from "./format";

export default function ForecastChart({
  periods,
  review,
  focus,
  onFocus,
}: {
  periods: (Period | ReviewPeriod)[];
  review: boolean;
  focus: number | null;
  onFocus: (index: number | null) => void;
}) {
  const rows = periods.map((period) => ({
    time: clock(period.start_time),
    forecast: period.forecast_mw,
    actual: "actual_mw" in period ? period.actual_mw : undefined,
  }));
  const focused = focus == null ? null : rows[focus];
  return (
    <div
      className="chart"
      role="img"
      aria-label={
        review
          ? "Hourly forecast and actual wind generation in megawatts. Exact values are available in the hourly records panel."
          : "Hourly next-day wind forecast in megawatts. Exact values are available in the hourly records panel."
      }
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart
          data={rows}
          margin={{ top: 16, right: 18, bottom: 8, left: 5 }}
          accessibilityLayer
          onMouseMove={(state) => {
            const index = Number(state?.activeTooltipIndex);
            onFocus(Number.isInteger(index) && index >= 0 ? index : null);
          }}
          onMouseLeave={() => onFocus(null)}
        >
          <defs>
            <linearGradient id="forecast-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#148937" stopOpacity={0.16} />
              <stop offset="100%" stopColor="#148937" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#e9ece6"
            vertical={false}
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="time"
            axisLine={false}
            tickLine={false}
            minTickGap={35}
            ticks={[
              "00:00",
              "04:00",
              "08:00",
              "12:00",
              "16:00",
              "20:00",
              "23:00",
            ]}
            interval="preserveStartEnd"
            tick={{ fontSize: 11, fill: "#62665f" }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={55}
            tick={{ fontSize: 11, fill: "#62665f" }}
            tickFormatter={(value) => `${Number(value) / 1000}k`}
            domain={[0, "auto"]}
          />
          {/* Values are shown in the readout above the chart, not a floating box. */}
          <Tooltip content={() => null} cursor={false} />
          {focused && (
            <ReferenceLine
              x={focused.time}
              stroke="#2b2a2a"
              strokeOpacity={0.28}
              strokeDasharray="2 3"
            />
          )}
          <Area
            type="linear"
            dataKey="forecast"
            stroke="#148937"
            strokeWidth={2.5}
            fill="url(#forecast-fill)"
            isAnimationActive={false}
            connectNulls={false}
            activeDot={false}
          />
          {review && (
            <Line
              type="linear"
              dataKey="actual"
              stroke="#546e85"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              strokeDasharray="5 4"
              isAnimationActive={false}
              connectNulls={false}
            />
          )}
          {focused?.forecast != null && (
            <ReferenceDot
              x={focused.time}
              y={focused.forecast}
              r={5}
              fill="#fff"
              stroke="#148937"
              strokeWidth={2.5}
            />
          )}
          {review && focused?.actual != null && (
            <ReferenceDot
              x={focused.time}
              y={focused.actual}
              r={4}
              fill="#fff"
              stroke="#546e85"
              strokeWidth={2}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
