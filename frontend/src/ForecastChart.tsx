import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Period, ReviewPeriod } from "./api";
import { clock, formatNumber } from "./format";

export default function ForecastChart({
  periods,
  review,
}: {
  periods: (Period | ReviewPeriod)[];
  review: boolean;
}) {
  const rows = periods.map((period) => ({
    time: clock(period.start_time),
    forecast: period.forecast_mw,
    actual: "actual_mw" in period ? period.actual_mw : undefined,
  }));
  return (
    <div
      className="chart"
      role="img"
      aria-label={
        review
          ? "Hourly forecast and actual wind generation in megawatts. Exact values are available in the data table below."
          : "Hourly next-day wind forecast in megawatts. Exact values are available in the data table below."
      }
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart
          data={rows}
          margin={{ top: 16, right: 18, bottom: 8, left: 5 }}
          accessibilityLayer
        >
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
          <Tooltip
            contentStyle={{
              border: "1px solid #e1e5dc",
              borderRadius: 8,
              fontSize: 12,
              boxShadow: "0 4px 16px #2b2a2a10",
            }}
            formatter={(value, name) => [
              `${formatNumber(Number(value))} MW`,
              name === "forecast" ? "Eligible forecast" : "Actual hourly mean",
            ]}
            labelFormatter={(label) =>
              `${label}–${String((Number(String(label).slice(0, 2)) + 1) % 24).padStart(2, "0")}:00 UK`
            }
          />
          <Area
            type="linear"
            dataKey="forecast"
            stroke="#148937"
            strokeWidth={2.5}
            fill="#148937"
            fillOpacity={0.07}
            isAnimationActive={false}
            connectNulls={false}
          />
          {review && (
            <Line
              type="linear"
              dataKey="actual"
              stroke="#546e85"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 4"
              isAnimationActive={false}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
