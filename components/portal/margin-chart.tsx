"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, XAxis, YAxis } from "recharts";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Mono, Text } from "@/components/ui/typography";
import { maskValue } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/utils/format";
import { buildMarginHistory } from "@/lib/finance/margin-history";
import { cn } from "@/lib/utils";

export type MarginHistoryInputView = {
  contributions: {
    month: string;
    assetId: string;
    quantity: number;
    amount: number;
    investorId: string;
    methodId: string;
  }[];
  liabilities: {
    month: string;
    currentValue: number;
    monthlyRoi: number;
    isOwn: boolean;
    investorId: string;
    methodId: string;
  }[];
  prices: [string, number][];
  today: string;
  investors: { id: string; name: string; isOwn: boolean }[];
  methods: { id: string; name: string }[];
};

const CONFIG = {
  deployed: { label: "Allocations", color: "var(--chart-1)" },
  liability: { label: "Owed to investors", color: "var(--chart-2)" },
} as const;

/**
 * The one chart an owner gets: what the deployed capital is really worth
 * against what is owed, month by month.
 *
 * Both series on one axis on purpose — the gap between them IS the margin, and
 * the whole point is to see it directly rather than infer it from two charts.
 * When Allocations sits below Owed, the promise is being paid out of pocket.
 *
 * Filtering re-derives the series in the browser from the raw contributions,
 * which is why no round trip happens when the filter changes.
 */
export function MarginChart({
  input,
  hideValues = false,
}: {
  input: MarginHistoryInputView;
  hideValues?: boolean;
}) {
  const [investorId, setInvestorId] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  // Months back from today, or null for everything. Trimming the range is a
  // different question from filtering who is in it, so it gets its own control
  // rather than hiding inside the popover.
  const [months, setMonths] = useState<number | null>(null);

  const data = useMemo(() => {
    const keep = <T extends { investorId: string; methodId: string }>(rows: T[]) =>
      rows.filter(
        (r) =>
          (investorId === null || r.investorId === investorId) &&
          (methodId === null || r.methodId === methodId)
      );

    const series = buildMarginHistory({
      contributions: keep(input.contributions),
      liabilities: keep(input.liabilities),
      prices: new Map(input.prices),
      today: input.today,
    });

    // Trim AFTER building: the series has to be derived from every
    // contribution, or a window that starts mid-history would forget the units
    // bought before it and draw a position that never existed.
    return months === null ? series : series.slice(-months);
  }, [input, investorId, methodId, months]);

  const filtered = investorId !== null || methodId !== null;

  if (data.length < 2) {
    return (
      <Text variant="small" className="text-muted-foreground">
        {filtered
          ? "Nothing to plot for this filter."
          : "Not enough history yet — the chart needs at least two months of contributions."}
      </Text>
    );
  }

  const latest = data[data.length - 1];
  const money = (v: number) =>
    hideValues ? maskValue(formatCurrency(v)) : formatCurrency(v);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Text variant="small" className="text-muted-foreground">
            Margin {filtered && <span className="text-2xs">(filtered)</span>}
          </Text>
          <Mono
            className={cn(
              "text-2xl font-semibold tabular-nums sm:text-3xl",
              latest.margin >= 0
                ? "text-success"
                : "text-destructive"
            )}
          >
            {money(latest.margin)}
          </Mono>
          <Text className="text-2xs text-muted-foreground">
            {money(latest.deployed)} deployed against {money(latest.liability)} owed
          </Text>
        </div>

        <div className="flex items-center gap-2">
          <div role="group" aria-label="Date range" className="flex items-center gap-1">
            {(
              [
                [3, "3M"],
                [6, "6M"],
                [12, "1Y"],
                [null, "All"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={label}
                variant="ghost"
                size="sm"
                data-active={months === value}
                className="h-8 rounded-full px-2.5 font-mono text-xs tabular-nums text-muted-foreground data-[active=true]:bg-foreground/5 data-[active=true]:text-foreground"
                onClick={() => setMonths(value)}
              >
                {label}
              </Button>
            ))}
          </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-active={filtered}>
              <SlidersHorizontal className="size-4" />
              Filters
              {filtered && <span className="ml-1 text-2xs">on</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-4">
            <FilterGroup
              label="Investor"
              options={input.investors.map((i) => ({
                id: i.id,
                label: i.isOwn ? `${i.name} (you)` : i.name,
              }))}
              value={investorId}
              onChange={setInvestorId}
            />
            <FilterGroup
              label="Method"
              options={input.methods.map((m) => ({ id: m.id, label: m.name }))}
              value={methodId}
              onChange={setMethodId}
            />
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setInvestorId(null);
                  setMethodId(null);
                }}
              >
                Clear filters
              </Button>
            )}
          </PopoverContent>
        </Popover>
        </div>
      </div>

      <ChartContainer config={CONFIG} className="h-64 w-full sm:h-80">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.4} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(m: string) => {
              const [y, mo] = m.split("-");
              return new Date(Number(y), Number(mo) - 1).toLocaleDateString("en-US", {
                month: "short",
              });
            }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={hideValues ? 8 : 56}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) =>
              hideValues
                ? ""
                : Math.abs(v) >= 1000
                  ? `$${Math.round(v / 1000)}k`
                  : `$${Math.round(v)}`
            }
          />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">
                      {CONFIG[name as keyof typeof CONFIG]?.label ?? name}
                    </span>
                    <Mono className="tabular-nums">{money(value as number)}</Mono>
                  </span>
                )}
                labelFormatter={(m: string) => {
                  const [y, mo] = m.split("-");
                  return new Date(Number(y), Number(mo) - 1).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  });
                }}
              />
            }
          />
          <Legend
            verticalAlign="top"
            height={28}
            iconType="plainline"
            formatter={(v) => (
              <span className="text-xs text-muted-foreground">
                {CONFIG[v as keyof typeof CONFIG]?.label ?? v}
              </span>
            )}
          />
          <Area
            dataKey="liability"
            type="monotone"
            stroke="var(--color-liability)"
            fill="var(--color-liability)"
            fillOpacity={0.12}
            strokeWidth={2}
          />
          <Area
            dataKey="deployed"
            type="monotone"
            stroke="var(--color-deployed)"
            fill="var(--color-deployed)"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>

      <Text className="text-2xs text-muted-foreground">
        Where Allocations sits below Owed, the promised return is being covered out
        of pocket.
      </Text>
    </section>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Text className="text-2xs font-medium text-muted-foreground">{label}</Text>
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          data-active={value === null}
          className="h-7 rounded-full px-2.5 text-xs data-[active=true]:border-foreground/30 data-[active=true]:bg-foreground/5"
          onClick={() => onChange(null)}
        >
          All
        </Button>
        {options.map((o) => (
          <Button
            key={o.id}
            variant="outline"
            size="sm"
            data-active={value === o.id}
            className="h-7 rounded-full px-2.5 text-xs data-[active=true]:border-foreground/30 data-[active=true]:bg-foreground/5"
            onClick={() => onChange(value === o.id ? null : o.id)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
