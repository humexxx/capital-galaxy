"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Copy, Highlighter, MoreHorizontal, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mono, Text } from "@/components/ui/typography";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  clonePlanAction,
  deletePlanAction,
  setMainPlanAction,
} from "@/app/actions/finance-plans";
import { PlanColorPicker } from "./plan-color-picker";
import { formatCurrency } from "@/lib/utils/format";
import type { FinancePlan, PlanSummary, Projection } from "@/types/finance";

// Same rationale as plan-editor / compare-view: defer recharts to a lazy chunk
// so the list page's first paint stays light.
const ComparePlansChart = dynamic(
  () => import("./projection-chart").then((mod) => mod.ComparePlansChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full sm:h-80 lg:h-[460px]" />,
  }
);

type Metric = "netWorth" | "totalDebt";

const METRIC_LABEL: Record<Metric, string> = {
  netWorth: "Net worth",
  totalDebt: "Total debt",
};

/** Horizon options, in periods. `0` means "as far as the projections run". */
const RANGES = [
  { value: "12", label: "12 months" },
  { value: "24", label: "24 months" },
  { value: "36", label: "3 years" },
  { value: "60", label: "5 years" },
  { value: "0", label: "Full plan" },
] as const;

const DEFAULT_RANGE = "24";
/** Periods before today kept in view, regardless of the horizon picked. */
const PAST_MONTHS = 3;

const POSITIVE = "text-success";
const NEGATIVE = "text-destructive";

/**
 * Polymarket-style plans workspace: a giant comparison chart on the left and a
 * rail of plans on the right (stacked below on mobile). The rail rows double as
 * the chart's series toggles — checking a plan adds its line to the chart —
 * while still linking through to the plan and exposing clone / delete / set-main.
 *
 * Rows also drive emphasis: pointing at one fades every other series back, and
 * its colour swatch pins that focus so it survives the pointer leaving (and is
 * reachable on touch, where there is no hover at all).
 */
export function PlansWorkspace({
  plans,
  summaries,
  projections,
}: {
  plans: FinancePlan[];
  summaries: Record<string, PlanSummary>;
  projections: Projection[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingDelete, setPendingDelete] = useState<FinancePlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(plans.map((p) => p.id))
  );
  const [metric, setMetric] = useState<Metric>("netWorth");
  const [range, setRange] = useState<string>(DEFAULT_RANGE);
  // "Full plan" still windows (so past stays solid and future dashed) — it just
  // uses the longest projection as the horizon.
  const longestProjection = useMemo(
    () => Math.max(1, ...projections.map((p) => p.months.length)),
    [projections]
  );
  const months = Number(range) || longestProjection;
  // Two sources of emphasis: pointing at a rail row (transient) and pinning one
  // via its colour swatch (sticky, and the only route on touch, where there is
  // no hover). A pin always wins over a hover.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const focusedId = pinnedId ?? hoveredId;
  const focusedPlan = plans.find((p) => p.id === focusedId) ?? null;

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

  const handleClone = (plan: FinancePlan) => {
    startTransition(async () => {
      const result = await clonePlanAction(plan.id, `${plan.name} (copy)`);
      if (result.success) {
        toast.success("Plan cloned");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleSetMain = (plan: FinancePlan) => {
    if (plan.isMain) return;
    startTransition(async () => {
      const result = await setMainPlanAction(plan.id);
      if (result.success) {
        toast.success(`${plan.name} is now your main plan`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    startTransition(async () => {
      const result = await deletePlanAction(pendingDelete.id);
      if (result.success) {
        toast.success("Plan deleted");
        setPendingDelete(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      {/* Hero grid: chart fills 2/3 on desktop, the plan rail rides the right
          1/3 — a quarter squeezed plan names down to ~4 characters. Single
          column on mobile (chart first, then the rail). */}
      {/* min-w-0 on both grid children: grid items default to min-width:auto,
          so recharts' measured svg would inflate the column past the viewport
          on mobile instead of shrinking. No items-start — the rail card
          stretches to match the chart card's height. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <CardTitle>Projection comparison</CardTitle>
                {focusedPlan && (
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: focusedPlan.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{focusedPlan.name}</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={range} onValueChange={setRange}>
                  <SelectTrigger size="sm" className="w-38">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
                  <TabsList>
                    {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
                      <TabsTrigger key={m} value={m}>
                        {METRIC_LABEL[m]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>
          {/* The Card default of px-6 costs 48 of a 375px screen before a
              single pixel of chart is drawn. Data ink wins on phones; desktop
              keeps the standard gutter. */}
          <CardContent className="px-3 sm:px-6">
            {filtered.length === 0 ? (
              <div className="flex h-64 items-center justify-center sm:h-80 lg:h-[460px]">
                <Text variant="muted">Select at least one plan to chart.</Text>
              </div>
            ) : (
              <ComparePlansChart
                projections={filtered}
                metric={metric}
                heightClass="h-64 sm:h-80 lg:h-[460px]"
                focusedPlanId={focusedId}
                months={months}
                pastMonths={PAST_MONTHS}
              />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xs font-medium uppercase tracking-wide text-muted-foreground lg:text-xs">
              Your plans
            </CardTitle>
            <Text variant="small" className="text-muted-foreground">
              Point at a plan to highlight it. Its dot sets the line colour.
            </Text>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {plans.map((plan) => {
                const s = summaries[plan.id];
                const inChart = selected.has(plan.id);
                return (
                  <li
                    key={plan.id}
                    onMouseEnter={() => setHoveredId(plan.id)}
                    onMouseLeave={() =>
                      setHoveredId((cur) => (cur === plan.id ? null : cur))
                    }
                    className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors hover:border-foreground/20 ${
                      focusedId === plan.id ? "border-foreground/30 bg-muted/50" : ""
                    }`}
                  >
                    <Checkbox
                      checked={inChart}
                      onCheckedChange={() => toggle(plan.id)}
                      aria-label={`Toggle ${plan.name} in chart`}
                    />
                    <PlanColorPicker
                      plan={plan}
                      pinned={pinnedId === plan.id}
                      onChanged={() => router.refresh()}
                    />
                    <Link
                      href={`/portal/plans/${plan.id}`}
                      className="min-w-0 flex-1"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="truncate text-sm font-medium"
                          title={plan.name}
                        >
                          {plan.name}
                        </span>
                        {plan.isMain && (
                          <Star
                            className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-500"
                            aria-label="Main plan"
                          />
                        )}
                      </div>
                      {s && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            NW
                            <Mono
                              className={`tabular-nums ${
                                s.endingNetWorth >= 0 ? POSITIVE : NEGATIVE
                              }`}
                            >
                              {formatCurrency(s.endingNetWorth)}
                            </Mono>
                          </span>
                          <span aria-hidden="true">·</span>
                          {s.monthsToDebtFree !== null ? (
                            <span className={POSITIVE}>
                              Debt-free {s.monthsToDebtFree} mo
                            </span>
                          ) : s.endingDebt <= 0.01 ? (
                            <span>No debt</span>
                          ) : (
                            <span className={NEGATIVE}>Debt beyond horizon</span>
                          )}
                        </div>
                      )}
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label={`Actions for ${plan.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Pinning lives here rather than on the swatch (which
                            now opens the colour picker) so it stays reachable
                            on touch, where there is no hover to highlight. */}
                        <DropdownMenuItem
                          onSelect={() =>
                            setPinnedId((cur) =>
                              cur === plan.id ? null : plan.id
                            )
                          }
                        >
                          <Highlighter className="mr-2 h-4 w-4" />
                          {pinnedId === plan.id
                            ? "Stop highlighting"
                            : "Highlight in chart"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleSetMain(plan)}
                          disabled={plan.isMain}
                        >
                          <Star className="mr-2 h-4 w-4" />
                          {plan.isMain ? "Main plan" : "Set as main"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleClone(plan)}>
                          <Copy className="mr-2 h-4 w-4" /> Clone
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setPendingDelete(plan);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{pendingDelete?.name}</strong> and all its income, expense
              and debt rows will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
