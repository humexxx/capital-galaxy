"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, Heading, Mono, Text } from "@/components/ui/typography";

import { formatCurrency } from "@/lib/utils/format";
import type { Projection } from "@/types/finance";

// Same rationale as plan-editor: defer recharts to a lazy chunk.
const ComparePlansChart = dynamic(
  () => import("./projection-chart").then((mod) => mod.ComparePlansChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-96 w-full" />,
  }
);

type Metric = "netWorth" | "totalDebt";

type CompareViewProps = {
  projections: Projection[];
  /** When false, hide the per-plan "Ending state" cards — used when the host
   *  page (e.g. the plans list) already shows those numbers on each plan card. */
  showEndingState?: boolean;
};

export function CompareView({
  projections,
  showEndingState = true,
}: CompareViewProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(projections.map((p) => p.plan.id))
  );
  const [metric, setMetric] = useState<Metric>("netWorth");

  const filtered = useMemo(
    () => projections.filter((p) => selected.has(p.plan.id)),
    [projections, selected]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <Eyebrow as="div">Plans in chart</Eyebrow>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {projections.map((p) => (
              <label
                key={p.plan.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2"
              >
                <Checkbox
                  checked={selected.has(p.plan.id)}
                  onCheckedChange={() => toggle(p.plan.id)}
                  aria-label={`Toggle ${p.plan.name}`}
                />
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: p.plan.color }}
                  aria-hidden="true"
                />
                <Label className="cursor-pointer">{p.plan.name}</Label>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Projection comparison</CardTitle>
            <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
              <TabsList>
                <TabsTrigger value="netWorth">Net worth</TabsTrigger>
                <TabsTrigger value="totalDebt">Total debt</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <Text variant="muted">Select at least one plan above.</Text>
          ) : (
            <ComparePlansChart projections={filtered} metric={metric} />
          )}
        </CardContent>
      </Card>

      {showEndingState && (
      <Card>
        <CardHeader>
          <CardTitle>Ending state per plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projections.map((p) => (
              <div
                key={p.plan.id}
                className="rounded-md border p-4"
                style={{ borderLeftColor: p.plan.color, borderLeftWidth: 4 }}
              >
                <div className="flex items-center justify-between">
                  <Heading level="h6" as="p">{p.plan.name}</Heading>
                  {p.monthsToDebtFree !== null && (
                    <Badge variant="outline">Debt-free in {p.monthsToDebtFree} mo</Badge>
                  )}
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Savings</dt>
                    <dd><Mono>{formatCurrency(p.endingSavings)}</Mono></dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Debt</dt>
                    <dd><Mono>{formatCurrency(p.endingDebt)}</Mono></dd>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <dt>Net worth</dt>
                    <dd>
                      <Mono className={p.endingNetWorth >= 0 ? "text-success" : "text-destructive"}>
                        {formatCurrency(p.endingNetWorth)}
                      </Mono>
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
