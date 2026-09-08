"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useMemo, useState } from "react";
import { subDays } from "date-fns";

import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Heading, Mono, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import type { ChartConfig } from "@/types/chart";

const chartConfig = {
  value: {
    label: "Portfolio Value",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const RANGES = ["1M", "3M", "YTD", "1Y", "All"] as const;
type Range = (typeof RANGES)[number];

type PerformanceChartProps = {
  data: Array<{
    date: string;
    value: number;
  }>;
};

export function PerformanceChart({
  data,
  hideValues = false,
}: PerformanceChartProps & { hideValues?: boolean }) {
  const [timeRange, setTimeRange] = useState<Range>("All");

  const filteredData = useMemo(() => {
    if (timeRange === "All" || data.length === 0) return data;

    const now = new Date();
    // YTD is a calendar boundary, not a rolling window — Jan 1 of this year.
    const startDate =
      timeRange === "YTD"
        ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
        : subDays(now, { "1M": 30, "3M": 90, "1Y": 365 }[timeRange]);
    return data.filter((point) => new Date(point.date) >= startDate);
  }, [data, timeRange]);

  const first = filteredData[0]?.value ?? 0;
  const last = filteredData[filteredData.length - 1]?.value ?? 0;
  const delta = last - first;
  const deltaPct = first === 0 ? 0 : (delta / first) * 100;
  const positive = delta >= 0;

  return (
    <section className="space-y-3">
      {/* Inline legend strip — no card chrome, sits on page bg. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Heading level="h5" as="h2" className="text-muted-foreground">
            Performance
          </Heading>
          <div className="flex items-baseline gap-2">
            <Mono className="text-2xl font-semibold tabular-nums sm:text-3xl">
              {hideValues
                ? `${positive ? "+" : "−"}${Math.abs(deltaPct).toFixed(1)}%`
                : `$${last.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}`}
            </Mono>
            {filteredData.length > 1 && (
              <Mono
                className={cn(
                  "text-sm",
                  positive
                    ? "text-success"
                    : "text-destructive"
                )}
              >
                {positive ? "↑" : "↓"}{" "}
                {hideValues
                  ? "over this range"
                  : `$${Math.abs(delta).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })} (${Math.abs(deltaPct).toFixed(1)}%)`}
              </Mono>
            )}
          </div>
        </div>
        <div
          role="group"
          aria-label="Time range"
          className="flex items-center gap-1"
        >
          {RANGES.map((r) => (
            <Button
              key={r}
              variant="ghost"
              size="sm"
              data-active={timeRange === r}
              className="h-7 rounded-full px-2.5 font-mono text-xs tabular-nums text-muted-foreground data-[active=true]:bg-foreground/5 data-[active=true]:text-foreground"
              onClick={() => setTimeRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      {/* Chart body — no card, no border. The page background carries it. */}
      <ChartContainer config={chartConfig} className="h-72 w-full sm:h-80">
        <AreaChart
          accessibilityLayer
          data={filteredData}
          margin={{ left: 0, right: 48, top: 8, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 3"
            strokeOpacity={0.4}
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={48}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
            }}
          />
          <YAxis
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            width={56}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) =>
              hideValues
                ? first === 0
                  ? ""
                  : `${(((value - first) / first) * 100).toFixed(0)}%`
                : `$${value.toLocaleString()}`
            }
            domain={["auto", "auto"]}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--foreground)", strokeWidth: 1, strokeOpacity: 0.3 }}
            content={
              <ChartTooltipContent
                indicator="line"
                // Hovering must not leak the amount the axis is hiding.
                formatter={(value) =>
                  hideValues
                    ? first === 0
                      ? "—"
                      : `${((((value as number) - first) / first) * 100).toFixed(1)}% vs start`
                    : `$${(value as number).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}`
                }
                labelFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  });
                }}
              />
            }
          />
          <Area
            dataKey="value"
            type="monotone"
            fill="var(--color-value)"
            fillOpacity={0.15}
            stroke="var(--color-value)"
            strokeWidth={2}
            activeDot={{ r: 4, strokeWidth: 2, fill: "var(--background)" }}
          />
        </AreaChart>
      </ChartContainer>

      {filteredData[0] && (
        <Text variant="small" className="text-muted-foreground">
          {new Date(filteredData[0].date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}{" "}
          — today
        </Text>
      )}
    </section>
  );
}
