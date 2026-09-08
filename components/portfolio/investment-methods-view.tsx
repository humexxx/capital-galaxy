"use client";

import { useMemo, useState } from "react";
import { EyeOff, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eyebrow, Heading, Mono, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { maskValue } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/utils/format";
import { useRegisterDevTool } from "@/components/dev-tools/dev-tools-context";

import type { InvestmentMethod } from "@/types/portfolio";

export type MethodCapital = {
  methodId: string;
  /** Cash contributed, at face value. */
  invested: number;
  /** What those contributions are worth today under the promised return. */
  holding: number;
  investorCount: number;
};

type InvestmentMethodsViewProps = {
  methods: InvestmentMethod[];
  /** Ids of the methods this user runs. Only these are editable, and only
   *  these carry the internal allocation. */
  ownedMethodIds?: string[];
  /** Allocation per owned method — never populated for anyone else. */
  allocations?: { methodId: string; allocations: { assetId: string; symbol: string; percent: number }[] }[];
  onEditMethod?: (method: InvestmentMethod) => void;
  /** Money sitting in each method. Only supplied for methods you run — a
   *  client browsing the catalogue has no business seeing other people's
   *  capital. */
  capital?: MethodCapital[];
  hideValues?: boolean;
};

type RiskTone = "low" | "medium" | "high";

const RISK_BADGE: Record<RiskTone, { label: string; className: string }> = {
  low: {
    label: "Low risk",
    className:
      "bg-success/15 text-success border-success/30",
  },
  medium: {
    label: "Medium risk",
    className:
      "bg-warning/15 text-warning border-warning/30",
  },
  high: {
    label: "High risk",
    className:
      "bg-destructive/15 text-destructive border-destructive/30",
  },
};

function normaliseRisk(level: string): RiskTone {
  const l = level.toLowerCase();
  if (l.startsWith("h")) return "high";
  if (l.startsWith("m")) return "medium";
  return "low";
}

export function InvestmentMethodsView({
  methods,
  ownedMethodIds = [],
  allocations = [],
  onEditMethod,
  capital = [],
  hideValues = false,
}: InvestmentMethodsViewProps) {
  const owned = useMemo(() => new Set(ownedMethodIds), [ownedMethodIds]);
  const [showDisabled, setShowDisabled] = useState(false);

  const showDisabledTool = useMemo(
    () => ({
      id: "investment-methods:show-disabled",
      kind: "toggle" as const,
      label: "Show disabled methods",
      description:
        "Reveal methods hidden from the portfolio selector (they only surface in plan auto-invest pickers).",
      section: "View",
      checked: showDisabled,
      onChange: setShowDisabled,
    }),
    [showDisabled]
  );
  useRegisterDevTool(showDisabledTool);

  const enabledMethods = useMemo(
    () => methods.filter((m) => m.enabled),
    [methods]
  );
  // Owners see every method they run, disabled included — those are theirs and
  // hiding half of them behind a dev toggle makes the tab lie about what
  // exists. Clients browsing the catalogue still only see what they can pick.
  const isOwnerView = ownedMethodIds.length > 0;
  const visibleMethods = isOwnerView || showDisabled ? methods : enabledMethods;

  const sortedMethods = useMemo(
    () =>
      [...visibleMethods].sort(
        (a, b) =>
          Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name)
      ),
    [visibleMethods]
  );

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <Heading level="h3" className="font-semibold">
          Investment Methods
        </Heading>
        <Text variant="muted">
          {isOwnerView
            ? "The methods you run and the capital sitting in each."
            : "Strategies you can invest in."}
        </Text>
      </div>

      {methods.length === 0 ? (
        <EmptyState
          title="No investment methods yet"
          description={
            isOwnerView
              ? "Create a method and investors will be able to put money into it."
              : "Methods appear here once a provider publishes one."
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedMethods.map((method) => (
              <MethodCard
                key={method.id}
                method={method}
                allocation={
                  allocations.find((a) => a.methodId === method.id)?.allocations ?? []
                }
                capital={capital.find((c) => c.methodId === method.id)}
                hideValues={hideValues}
                onEdit={
                  owned.has(method.id) && onEditMethod
                    ? () => onEditMethod(method)
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function MethodCard({
  method,
  allocation,
  capital,
  hideValues = false,
  onEdit,
}: {
  method: InvestmentMethod;
  allocation: { symbol: string; percent: number }[];
  capital?: MethodCapital;
  hideValues?: boolean;
  /** Absent for methods this user does not run — no edit affordance, and no
   *  internal allocation shown. */
  onEdit?: () => void;
}) {
  const risk = normaliseRisk(method.riskLevel);
  const badge = RISK_BADGE[risk];
  const roi = parseFloat(method.monthlyRoi);
  return (
    <Card
      className={cn(
        "transition-shadow hover:shadow-md",
        !method.enabled && "opacity-60"
      )}
    >
      <CardHeader className="pb-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={cn("shrink-0", badge.className)}>
                {badge.label}
              </Badge>
              {!method.enabled && (
                <Badge variant="secondary" className="shrink-0 gap-1">
                  <EyeOff className="h-3 w-3" /> Closed
                </Badge>
              )}
            </div>
            {onEdit && (
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={`Edit ${method.name}`}
                onClick={onEdit}
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
          </div>
          <CardTitle className="line-clamp-1">{method.name}</CardTitle>
          {method.description && (
            <Text variant="small" className="line-clamp-2">
              {method.description}
            </Text>
          )}
        </div>
        {/* Internal, and only ever rendered for the person who runs it. */}
        {onEdit && (
          <Text className="text-2xs text-muted-foreground">
            {allocation.length === 0
              ? "No allocation set"
              : `Invests in ${allocation.map((a) => `${a.percent}% ${a.symbol}`).join(" · ")}`}
          </Text>
        )}
      </CardHeader>
      <CardContent className="mt-auto">
        <div className="flex items-baseline justify-between border-t pt-3">
          <div className="space-y-0.5">
            <Eyebrow>Monthly ROI</Eyebrow>
            <Mono
              className={cn(
                "block text-2xl font-semibold",
                roi >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {Number.isFinite(roi) ? `${roi.toFixed(2)}%` : "—"}
            </Mono>
          </div>

          {/* What is actually sitting in this method. Only present for methods
              this user runs; a client browsing has no business seeing it. */}
          {capital && (
            <div className="space-y-0.5 text-right">
              <Eyebrow>Invested</Eyebrow>
              <Mono className="block text-2xl font-semibold tabular-nums">
                {hideValues
                  ? maskValue(formatCurrency(capital.invested))
                  : formatCurrency(capital.invested)}
              </Mono>
              <Text className="text-2xs text-muted-foreground">
                {capital.investorCount === 0
                  ? "nobody yet"
                  : `${capital.investorCount} ${
                      capital.investorCount === 1 ? "investor" : "investors"
                    } · now ${
                      hideValues
                        ? maskValue(formatCurrency(capital.holding))
                        : formatCurrency(capital.holding)
                    }`}
              </Text>
            </div>
          )}

        </div>
      </CardContent>
    </Card>
  );
}
