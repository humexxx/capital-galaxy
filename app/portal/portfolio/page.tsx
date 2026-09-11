import { db } from "@/db";
import { investmentMethods } from "@/db/schema";
import type { Metadata } from "next";
import {
  getUserPortfolio,
  getPortfolioStats,
  getPortfolioTransactions,
  getMethodInvestors,
  getInvestorTransactions,
} from "@/lib/services/portfolio-service";
import { getPortfolioPerformanceData } from "@/lib/services/chart-service";
import { getManagedOverview } from "@/lib/services/margin-service";
import { getAllocationsByTransaction } from "@/lib/services/allocation-service";
import { getLatestPrices } from "@/lib/services/price-service";
import { listPriceAssets } from "@/lib/services/price-service";
import { getAllUsers } from "@/lib/services/user-service";
import { requireEffectiveContext } from "@/lib/services/impersonation";
import type { PortfolioTransaction } from "@/types/portfolio";
import PortfolioClientPage from "@/components/portal/portfolio-client";
import { PortalPageContainer } from "@/components/portal/page-container";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "View and manage your investment portfolio",
};

export default async function PortfolioPage() {
  const ctx = await requireEffectiveContext();
  const isAdmin = ctx.realRole === "admin";

  // When impersonating, show the impersonated user's portfolio. Otherwise show the real user's.
  const userId = ctx.effectiveUserId;

  const usersPromise = isAdmin ? getAllUsers() : Promise.resolve([]);
  // Only meaningful for someone who runs methods; everyone else gets [] and
  // never sees the tab.
  const investorsPromise = getMethodInvestors(userId);
  // Everything the Managed tab needs in one call. It used to be three
  // independent loaders that each re-queried the same methods, allocations and
  // quotes — eleven round trips against a pooler where a connection costs
  // ~850ms and a query ~86ms, which is what made this page take seconds.
  const managedOverviewPromise = getManagedOverview(userId);
  const investorTxPromise = getInvestorTransactions(userId);
  const priceAssetsPromise = listPriceAssets();
  const [
    portfolio,
    methods,
    users,
    methodInvestors,
    managedOverview,
    priceAssets,
    investorTransactions,
  ] = await Promise.all([
    getUserPortfolio(userId),
    // ALL methods, enabled or not: the Methods tab renders
    // InvestmentMethodsView, which filters to enabled itself and exposes a dev
    // toggle for the disabled ones. Consumers that only want the live set
    // (the transaction form) filter below.
    db.select().from(investmentMethods),
    usersPromise,
    investorsPromise,
    managedOverviewPromise,
    priceAssetsPromise,
    investorTxPromise,
  ]);

  let stats = null;
  let transactions: PortfolioTransaction[] = [];
  let chartData: { date: string; value: number }[] = [];

  if (portfolio) {
    [stats, transactions, chartData] = await Promise.all([
      getPortfolioStats(portfolio.id),
      getPortfolioTransactions(portfolio.id),
      getPortfolioPerformanceData(portfolio.id, "All"),
    ]);

    // Fallback: build chart from approved transactions if no snapshots exist.
    if (chartData.length === 0) {
      const approvedTransactions = transactions.filter((t) => t.status === "approved");
      if (approvedTransactions.length > 0) {
        let runningTotal = 0;
        chartData = approvedTransactions.map((t) => {
          runningTotal += t.type === "buy" ? parseFloat(t.total) : -parseFloat(t.total);
          return { date: new Date(t.date).toISOString(), value: runningTotal };
        });
      }
    }
  }

  // Both tables render the same shape, so the allocation lookup is one query
  // covering every transaction on the page — the owner's and their investors'.
  const allTxIds = [
    ...transactions.map((t) => t.id),
    ...investorTransactions.map((t) => t.id),
  ];
  const [allocationsByTx, latestPrices] = await Promise.all([
    getAllocationsByTransaction(allTxIds),
    getLatestPrices(priceAssets.map((a) => a.id)),
  ]);
  const priceBySymbol = new Map(
    priceAssets.map((a) => [a.symbol, latestPrices.get(a.id) ?? null])
  );
  const withPrices = (txId: string) =>
    (allocationsByTx.get(txId) ?? []).map((a) => ({
      symbol: a.symbol,
      quantity: a.quantity,
      invested: a.invested,
      priceAtPurchase: a.priceAtPurchase,
      price: priceBySymbol.get(a.symbol) ?? null,
    }));

  const data = {
    portfolio,
    stats,
    transactions,
    chartData,
    methods,
    isAdmin,
    users,
    methodInvestors,
    margin: methodInvestors.length > 0 ? managedOverview.overview : null,
    methodAllocations: managedOverview.allocations,
    marginHistory: managedOverview.history,
    marginHistoryInput: managedOverview.historyInput,
    investorBreakdown: managedOverview.investors,
    transactionRows: transactions.map((t) => ({
      id: t.id,
      date: new Date(t.date).toISOString(),
      methodName: t.investmentMethod.name,
      type: t.type,
      status: t.status,
      total: t.total,
      initialValue: t.initialValue,
      currentValue: t.currentValue,
      allocations: withPrices(t.id),
    })),
    investorTransactions: investorTransactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      methodName: t.methodName,
      investorId: t.investorId,
      investorName: t.investorName,
      type: t.type,
      status: t.status,
      total: t.total,
      initialValue: t.initialValue,
      currentValue: t.currentValue,
      allocations: withPrices(t.id),
    })),
    priceAssets: priceAssets.map((a) => ({
      id: a.id,
      symbol: a.symbol,
      name: a.name,
      source: a.source,
    })),
    currentUserId: userId,
  };

  return (
    <PortalPageContainer>
      <PortfolioClientPage data={data} />
    </PortalPageContainer>
  );
}
