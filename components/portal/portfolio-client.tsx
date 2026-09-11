"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Camera, Download, Eye, EyeOff, ListFilter, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InvestmentMethodsView } from "@/components/portfolio/investment-methods-view";
import type { AssetOption } from "@/components/portal/allocation-dialog";
import type { MethodAllocationSummary } from "@/components/portal/allocation-dialog";
import { MethodEditorDialog } from "@/components/portfolio/method-editor-dialog";
import { AllocationDialog } from "@/components/portal/allocation-dialog";
import type { MarginHistoryInputView } from "@/components/portal/margin-chart";
import { OwnerKpiGrid } from "@/components/portal/owner-kpi-grid";
import type { InvestorBreakdownRow } from "@/components/portal/investor-breakdown";
import type { MarginOverview } from "@/lib/services/margin-service";

import { StatCard, maskValue, statToneClass } from "@/components/ui/stat-card";
import { Sparkline } from "@/components/portfolio/sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { Heading, Text } from "@/components/ui/typography";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/utils/format";

import { AddTransactionDialog } from "@/components/portfolio/add-transaction-dialog";
import { EmptyPortfolio } from "@/components/portfolio/empty-portfolio";
import { ManualSnapshotDialog } from "@/components/portfolio/manual-snapshot-dialog";
import { TransactionsTable } from "@/components/portfolio/transactions-table";
import { InvestorSummaryTable } from "@/components/portfolio/investor-summary-table";
import type { TransactionRow } from "@/components/portfolio/transactions-table";
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
import { useRegisterDevTool } from "@/components/dev-tools/dev-tools-context";

import { createTransactionAction } from "@/app/actions/transactions";
import { deleteManualSnapshotsAction } from "@/app/actions/portfolio-snapshots";
import { repriceContributionsAction } from "@/app/actions/allocations";
import type {
  InvestmentMethod,
  Portfolio,
  PortfolioStats,
  PortfolioTransaction,
  MethodInvestors,
} from "@/types/portfolio";

type ChartDataPoint = {
  date: string;
  value: number;
};

type User = {
  id: string;
  fullName: string | null;
  email: string | null;
};

type PortfolioData = {
  portfolio: Pick<Portfolio, "id" | "name"> | null;
  stats: PortfolioStats | null;
  transactions: PortfolioTransaction[];
  chartData: ChartDataPoint[];
  methods: InvestmentMethod[];
  isAdmin: boolean;
  users?: User[];
  /** Methods this user owns + who holds money in them. Empty for everyone
   *  who doesn't run any. Never folded into the portfolio totals. */
  methodInvestors: MethodInvestors[];
  /** The owner's side of the deal: real value of the deployed capital against
   *  the fixed return promised to investors. Null for anyone who runs no
   *  methods, and never visible to the investors themselves. */
  margin: MarginOverview | null;
  /** Catalogue of priceable assets, for configuring allocations. */
  priceAssets: AssetOption[];
  /** Each owned method's allocation policy — where new money goes. */
  methodAllocations: MethodAllocationSummary[];
  /** What other people did in the methods this user runs. Empty for everyone
   *  who runs none. */
  investorTransactions: TransactionRow[];
  /** The owner's own history, in the shared row shape. */
  transactionRows: TransactionRow[];
  /** Margin month by month, for the headline figures. */
  marginHistory: {
    month: string;
    deployed: number;
    liability: number;
    ownPosition: number;
    margin: number;
    invested: number;
  }[];
  /** Raw inputs so the chart can re-derive under a filter without a round trip. */
  marginHistoryInput: MarginHistoryInputView;
  /** Per-investor drill-down behind the margin. */
  investorBreakdown: InvestorBreakdownRow[];
  currentUserId: string;
};

// The owner-only panels pull recharts and a long table into the portfolio
// chunk for every visitor, though only method owners ever see them. Split them
// so an investor's bundle stops paying for the owner's dashboard.
const MarginChart = dynamic(
  () =>
    import("@/components/portal/margin-chart").then((mod) => mod.MarginChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-full rounded-xl" />,
  }
);

const InvestorBreakdown = dynamic(
  () =>
    import("@/components/portal/investor-breakdown").then(
      (mod) => mod.InvestorBreakdown
    ),
  { loading: () => <Skeleton className="h-64 w-full rounded-xl" /> }
);

const PerformanceChart = dynamic(
  () =>
    import("@/components/portfolio/performance-chart").then(
      (mod) => mod.PerformanceChart
    ),
  {
    ssr: false,
    loading: () => (
      <Card className="flex h-96 items-center justify-center bg-card">
        <Text variant="muted" className="text-sm">
          Loading chart…
        </Text>
      </Card>
    ),
  }
);

export default function PortfolioClientPage({ data }: { data: PortfolioData }) {
  const router = useRouter();
  // The transaction form only ever offered live methods; the Methods tab gets
  // the full list because it filters (and can reveal disabled) itself.
  // The Investors tab only exists for people who actually run methods.
  const ownsMethods = data.methodInvestors.length > 0;

  // Approved-only by default: those are the movements that actually happened.
  // Pending and rejected rows matter, but they are the exception you go
  // looking for, not the default reading of a history.
  const [detailedTransactions, setDetailedTransactions] = useState(false);

  const visibleRows = useMemo(() => {
    const approved = <T extends { status: string }>(list: T[]) =>
      detailedTransactions ? list : list.filter((t) => t.status === "approved");
    return {
      own: approved(data.transactionRows),
      investors: approved(data.investorTransactions),
      hiddenCount:
        data.transactionRows.length +
        data.investorTransactions.length -
        approved(data.transactionRows).length -
        approved(data.investorTransactions).length,
    };
  }, [data.transactionRows, data.investorTransactions, detailedTransactions]);

  // Capital per method, straight off the investor aggregate the Managed tab
  // already loads. Only methods this user runs appear here, so a client
  // browsing the catalogue gets nothing.
  const methodCapital = useMemo(
    () =>
      data.methodInvestors.map((m) => ({
        methodId: m.methodId,
        invested: m.totalInvested,
        holding: m.totalHolding,
        investorCount: m.investors.length,
      })),
    [data.methodInvestors]
  );

  // The default view: one row per person, summarising the relationship rather
  // than listing it. The per-transaction detail already exists a click away.
  const investorSummary = useMemo(
    () =>
      data.investorBreakdown
        .filter((b) => !b.isOwn)
        .map((b) => ({
          ...b,
          // By id: two investors can share a display name (or both fall back
          // to "Unknown"), and the name join summed their movements together.
          movements: data.investorTransactions.filter(
            (t) => t.investorId === b.investorId
          ).length,
        })),
    [data.investorBreakdown, data.investorTransactions]
  );

  const ownerKpis = useMemo(() => {
    const h = data.marginHistory;
    const last = h[h.length - 1];
    if (!last) {
      return { contributed: 0, deployed: 0, liability: 0, margin: 0, monthlyChange: null };
    }
    return {
      contributed: last.invested,
      deployed: last.deployed,
      liability: last.liability,
      margin: last.margin,
      monthlyChange: h.length >= 2 ? last.margin - h[h.length - 2].margin : null,
    };
  }, [data.marginHistory]);

  const enabledMethods = useMemo(
    () => data.methods.filter((m) => m.enabled),
    [data.methods]
  );

  const [editingMethod, setEditingMethod] = useState<InvestmentMethod | null>(null);
  const [allocatingMethod, setAllocatingMethod] = useState<InvestmentMethod | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showCharts, setShowCharts] = useState(true);
  const [hideValues, setHideValues] = useState(false);
  const [isSnapshotDialogOpen, setIsSnapshotDialogOpen] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // ── Dev-drawer registrations ──────────────────────────────────────────────
  // Helpers are memoised so `useRegisterDevTool` only re-registers when the
  // state actually flips, not on every parent render.
  const showChartsTool = useMemo(
    () => ({
      id: "portfolio:show-charts",
      kind: "toggle" as const,
      label: "Show charts",
      description: "Hide the performance chart on the overview tab.",
      section: "View",
      checked: showCharts,
      onChange: setShowCharts,
    }),
    [showCharts]
  );
  const hideValuesTool = useMemo(
    () => ({
      id: "portfolio:hide-values",
      kind: "toggle" as const,
      label: "Hide values",
      description: "Mask dollar amounts (screenshots, demos).",
      section: "View",
      checked: hideValues,
      onChange: setHideValues,
    }),
    [hideValues]
  );
  const repriceTool = useMemo(
    () =>
      ownsMethods
        ? {
            id: "portfolio:reprice",
            kind: "action" as const,
            label: "Reprice contributions",
            description:
              "Value any approved contribution that has no allocation yet, at the price on the day it landed.",
            section: "Admin",
            icon: RefreshCw,
            onRun: async () => {
              const result = await repriceContributionsAction();
              if (!result?.success) {
                toast.error(result?.error ?? "Could not reprice");
                return;
              }
              const priced = result.data?.priced ?? 0;
              if (priced > 0) toast.success(`Priced ${priced} contribution split(s)`);
              else toast.info("Nothing new to price");
              router.refresh();
            },
          }
        : null,
    [ownsMethods, router]
  );

  const manualSnapshotTool = useMemo(
    () =>
      data.isAdmin
        ? {
            id: "portfolio:manual-snapshot",
            kind: "action" as const,
            label: "Manual snapshot",
            description: "Record the portfolio's current value as a snapshot.",
            section: "Admin",
            icon: Camera,
            onRun: () => setIsSnapshotDialogOpen(true),
          }
        : null,
    [data.isAdmin]
  );
  const clearSnapshotsTool = useMemo(
    () =>
      data.isAdmin
        ? {
            id: "portfolio:clear-snapshots",
            kind: "action" as const,
            label: "Clear manual snapshots",
            description: "Delete every manually-created snapshot. System ones stay.",
            section: "Admin",
            icon: Trash2,
            variant: "destructive" as const,
            onRun: () => setIsClearDialogOpen(true),
          }
        : null,
    [data.isAdmin]
  );

  useRegisterDevTool(showChartsTool);
  useRegisterDevTool(hideValuesTool);
  useRegisterDevTool(repriceTool);
  useRegisterDevTool(manualSnapshotTool);
  useRegisterDevTool(clearSnapshotsTool);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddTransaction = async (transactionData: {
    investmentMethodId: string;
    amount: string;
    date: Date;
    notes?: string;
    userId?: string;
  }): Promise<boolean> => {
    const result = await createTransactionAction(transactionData);
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    const transaction = result.data;
    if (data.isAdmin && transaction?.status === "approved") {
      toast.success("Transaction added and approved successfully");
    } else {
      toast.success("Transaction added successfully");
    }
    router.refresh();
    return true;
  };

  const handleClearSnapshots = async (): Promise<void> => {
    try {
      setIsClearing(true);
      await deleteManualSnapshotsAction();
      toast.success("Manual snapshots deleted successfully");
      router.refresh();
    } catch {
      toast.error("Error deleting snapshots");
    } finally {
      setIsClearing(false);
      setIsClearDialogOpen(false);
    }
  };

  if (!data.portfolio) {
    // No portfolio yet — but the methods catalogue used to be its own page and
    // needs nothing from a portfolio, so it stays reachable. Browsing methods
    // is exactly what you do BEFORE you have one.
    return (
      <>
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="methods">Methods</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <EmptyPortfolio onAddTransaction={() => setIsDialogOpen(true)} />
          </TabsContent>
          <TabsContent value="methods">
            <InvestmentMethodsView
              methods={data.methods}
              ownedMethodIds={data.methodInvestors.map((m) => m.methodId)}
              allocations={data.methodAllocations}
              capital={methodCapital}
              hideValues={hideValues}
              onEditMethod={setEditingMethod}
            />
          </TabsContent>

        </Tabs>
        <AddTransactionDialog
          open={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          methods={enabledMethods}
          onSubmit={handleAddTransaction}
          isAdmin={data.isAdmin}
          users={data.users}
        />
      </>
    );
  }

  const stats = data.stats;

  // Only investors see this one; owners get the margin chart instead.
  const chartSeries = data.chartData;

  const performanceChart =
    chartSeries.length > 0 ? (
      <PerformanceChart data={chartSeries} hideValues={hideValues} />
    ) : (
      <Card className="flex h-96 items-center justify-center bg-card">
        <div className="text-center">
          <Text variant="muted">Not enough data for the chart.</Text>
          <Text variant="small" className="mt-1">
            Approve transactions or capture a snapshot to seed history.
          </Text>
        </div>
      </Card>
    );

  return (
    <>
      <div className="space-y-6">
        {/* Header: title + description on the left, primary action on the
            right. Mirrors plan-editor's PageHeader idiom (Heading h3 bold +
            muted Text). All transient controls (charts toggle, snapshots,
            destructive admin ops) moved into the dev drawer. */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Heading level="h3" as="h1">
                {data.portfolio.name}
              </Heading>
              <Badge variant="secondary" className="text-xs">
                Default
              </Badge>
            </div>
            <Text variant="muted">
              Snapshot of every approved buy and withdrawal across your
              investment methods.
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label={hideValues ? "Show values" : "Hide values"}
              aria-pressed={hideValues}
              title={hideValues ? "Show values" : "Hide values"}
              onClick={() => setHideValues((v) => !v)}
            >
              {hideValues ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>

            {/* A plain link, not a fetch + blob: the browser handles the
                download natively and the route's Content-Disposition names the
                file. Disabled with no rows so it can't hand back a header-only
                CSV. */}
            <Button
              asChild={data.transactions.length > 0}
              variant="outline"
              disabled={data.transactions.length === 0}
              title={
                data.transactions.length === 0
                  ? "No transactions to export yet"
                  : undefined
              }
            >
              {data.transactions.length > 0 ? (
                <a href="/api/portfolio/export" download>
                  <Download className="mr-1 h-4 w-4" /> Export CSV
                </a>
              ) : (
                <span>
                  <Download className="mr-1 h-4 w-4" /> Export CSV
                </span>
              )}
            </Button>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add transaction
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="methods">Methods</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Owners and investors need different headlines. An investor's
                portfolio value IS their position. An owner's "portfolio value"
                is the sum of what they OWE, so showing it as the headline made
                a badly underwater book read as growth. */}
            {ownsMethods ? (
              <OwnerKpiGrid kpis={ownerKpis} hideValues={hideValues} />
            ) : (
              stats && (
                <PortfolioKpiGrid
                  stats={stats}
                  hideValues={hideValues}
                  onToggleHideValues={() => setHideValues((v) => !v)}
                  sparkline={data.chartData}
                />
              )
            )}

            {/* Exactly one chart. Owners get allocations against what is owed —
                the gap between the two lines is the margin. Everyone else gets
                the ordinary performance chart. */}
            {ownsMethods ? (
              <>
                <Card className="bg-card">
                  <CardContent>
                    <MarginChart
                      input={data.marginHistoryInput}
                      hideValues={hideValues}
                    />
                  </CardContent>
                </Card>

                {data.investorBreakdown.length > 0 && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Heading level="h5" as="h2" className="text-muted-foreground">
                        By person
                      </Heading>
                      <Text variant="small" className="text-muted-foreground">
                        What each investor put in, what it bought, and what the promise
                        costs you.
                      </Text>
                    </div>
                    <InvestorBreakdown
                      rows={data.investorBreakdown}
                      hideValues={hideValues}
                    />
                  </div>
                )}
              </>
            ) : (
              showCharts && performanceChart
            )}
          </TabsContent>

          <TabsContent value="transactions" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Text variant="small" className="text-muted-foreground">
                {detailedTransactions
                  ? "Every movement, including pending and rejected."
                  : `Approved movements only${
                      visibleRows.hiddenCount > 0
                        ? ` · ${visibleRows.hiddenCount} hidden`
                        : ""
                    }`}
              </Text>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailedTransactions((v) => !v)}
              >
                <ListFilter className="size-4" />
                {detailedTransactions ? "Simple view" : "Detailed view"}
              </Button>
            </div>

            <div className="space-y-3">
              {ownsMethods && (
                <Heading level="h5" as="h2" className="text-muted-foreground">
                  Yours
                </Heading>
              )}
              <Card className="bg-card">
                <CardContent className="p-0 sm:p-6">
                  <TransactionsTable
                    rows={visibleRows.own}
                    showStatus={detailedTransactions}
                    hideValues={hideValues}
                  />
                </CardContent>
              </Card>
            </div>

            {ownsMethods && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Heading level="h5" as="h2" className="text-muted-foreground">
                    Investors
                  </Heading>
                  <Text variant="small" className="text-muted-foreground">
                    Movements other people made in the methods you run, pending ones
                    included.
                  </Text>
                </div>
                <Card className="bg-card">
                  <CardContent className="p-0 sm:p-6">
                    <InvestorSummaryTable
                      rows={investorSummary}
                      hideValues={hideValues}
                    />
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* The deep view of the methods catalogue, folded in from what used
              to be its own /portal/investment-methods page. */}
          <TabsContent value="methods">
            <InvestmentMethodsView
              methods={data.methods}
              ownedMethodIds={data.methodInvestors.map((m) => m.methodId)}
              allocations={data.methodAllocations}
              capital={methodCapital}
              hideValues={hideValues}
              onEditMethod={setEditingMethod}
            />
          </TabsContent>

        </Tabs>
      </div>

      {editingMethod && (
        <MethodEditorDialog
          method={editingMethod}
          allocations={
            data.methodAllocations.find((a) => a.methodId === editingMethod.id)
              ?.allocations ?? []
          }
          onEditAllocation={() => {
            setAllocatingMethod(editingMethod);
            setEditingMethod(null);
          }}
          onClose={() => setEditingMethod(null)}
        />
      )}

      {allocatingMethod && (
        <AllocationDialog
          open
          methodId={allocatingMethod.id}
          methodName={allocatingMethod.name}
          assets={data.priceAssets}
          initial={
            data.methodAllocations.find((a) => a.methodId === allocatingMethod.id)
              ?.allocations ?? []
          }
          onClose={() => setAllocatingMethod(null)}
        />
      )}

      <AddTransactionDialog
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        methods={enabledMethods}
        onSubmit={handleAddTransaction}
        isAdmin={data.isAdmin}
        users={data.users}
        adminUserId={data.currentUserId}
      />

      {data.isAdmin && (
        <ManualSnapshotDialog
          open={isSnapshotDialogOpen}
          onOpenChange={setIsSnapshotDialogOpen}
        />
      )}

      {data.isAdmin && (
        <AlertDialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear manual snapshots</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete every manual snapshot from your
                portfolio. Snapshots created by the system or through transaction
                approvals stay intact.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={handleClearSnapshots}
                disabled={isClearing}
              >
                {isClearing ? "Clearing…" : "Clear all manual snapshots"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function PortfolioKpiGrid({
  stats,
  hideValues,
  onToggleHideValues,
  sparkline,
}: {
  stats: PortfolioStats;
  hideValues: boolean;
  onToggleHideValues: () => void;
  /** Value history behind the headline figure — drawn as a bare trend line,
   *  no axes, so the number carries a direction without a second chart. */
  sparkline: ChartDataPoint[];
}) {
  const profitTone = stats.allTimeProfit >= 0 ? "positive" : "negative";
  const profitSublabel = (
    <span className={cn("font-medium", statToneClass(profitTone))}>
      {stats.allTimeProfit >= 0 ? "up" : "down"}{" "}
      {formatPercent(Math.abs(stats.allTimeProfitPercentage))}
    </span>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total value"
        value={
          hideValues
            ? maskValue(formatCurrency(stats.totalValue))
            : formatCurrency(stats.totalValue)
        }
        tone="positive"
        sublabel="Current market value"
        chart={<Sparkline data={sparkline} />}
        action={
          <button
            type="button"
            onClick={onToggleHideValues}
            className="text-muted-foreground transition hover:text-foreground"
            aria-label={hideValues ? "Show portfolio values" : "Hide portfolio values"}
            aria-pressed={hideValues}
          >
            {hideValues ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        }
      />
      <StatCard
        label="All-time profit"
        value={
          hideValues
            ? `${stats.allTimeProfit >= 0 ? "+" : "−"}${formatPercent(
                Math.abs(stats.allTimeProfitPercentage)
              )}`
            : formatSignedCurrency(stats.allTimeProfit)
        }
        tone={profitTone}
        sublabel={hideValues ? "All-time return" : profitSublabel}
      />
      <StatCard
        label="Cost basis"
        value={
          hideValues
            ? maskValue(formatCurrency(stats.costBasis))
            : formatCurrency(stats.costBasis)
        }
        sublabel="Total invested"
      />
      <StatCard
        label="Active positions"
        value={String(stats.activeTransactions)}
        sublabel={`${stats.totalInvestmentMethods} method${
          stats.totalInvestmentMethods === 1 ? "" : "s"
        }`}
      />
    </div>
  );
}
