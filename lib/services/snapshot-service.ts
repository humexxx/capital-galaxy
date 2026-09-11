import "server-only";

import { db } from "@/db";
import { portfolios, portfolioSnapshots, transactions } from "@/db/schema";
import { eq, and, sql, lte, gt, desc, inArray } from "drizzle-orm";
import type { SnapshotSource } from "@/schemas/snapshot";

/**
 * Create daily snapshots for all portfolios.
 * Optimized as a batch: 3 queries total regardless of portfolio count.
 *   1. SUM(currentValue) per portfolio for approved buy transactions.
 *   2. Latest snapshot value per portfolio (to decide whether to write a zero row).
 *   3. Single bulk INSERT for all eligible portfolios.
 */
export async function createDailySnapshots(): Promise<{
  date: Date;
  snapshotsCreated: number;
  totalPortfolios: number;
  errors: string[];
}> {
  const today = new Date();

  // 1. Aggregate balances per portfolio in a single query.
  const balances = await db
    .select({
      portfolioId: transactions.portfolioId,
      totalValue: sql<string>`COALESCE(SUM(${transactions.currentValue}), 0)`,
      txCount: sql<number>`COUNT(*)::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.status, "approved"),
        eq(transactions.type, "buy"),
        lte(transactions.date, today)
      )
    )
    .groupBy(transactions.portfolioId);

  if (balances.length === 0) {
    const totalPortfolios = await db.$count(portfolios);
    return { date: today, snapshotsCreated: 0, totalPortfolios, errors: [] };
  }

  // 2. Latest snapshot per portfolio, for the zero-value branch logic.
  const portfolioIds = balances.map((b) => b.portfolioId);
  const latestSnapshots = await db
    .selectDistinctOn([portfolioSnapshots.portfolioId], {
      portfolioId: portfolioSnapshots.portfolioId,
      totalValue: portfolioSnapshots.totalValue,
      date: portfolioSnapshots.date,
      source: portfolioSnapshots.source,
    })
    .from(portfolioSnapshots)
    // `inArray` emits `IN ($1, $2, …)`. The previous raw
    // `= ANY(${portfolioIds})` made Drizzle serialise the array as a row
    // tuple — `ANY(($1, $2))` — which Postgres rejects (`ANY` needs an
    // array, not a record). It only worked while there was a single
    // portfolio; a second one broke every daily run.
    .where(inArray(portfolioSnapshots.portfolioId, portfolioIds))
    .orderBy(portfolioSnapshots.portfolioId, desc(portfolioSnapshots.date));

  const latestByPortfolio = new Map(
    latestSnapshots.map((s) => [s.portfolioId, parseFloat(s.totalValue)])
  );
  // Portfolios the cron already snapshotted today (UTC). A retried or doubled
  // run wrote two rows for one day, and the chart drew both.
  const todayKey = today.toISOString().slice(0, 10);
  const doneToday = new Set(
    latestSnapshots
      .filter(
        (s) => s.source === "system_cron" && s.date.toISOString().slice(0, 10) === todayKey
      )
      .map((s) => s.portfolioId)
  );

  // 3. Decide which rows to insert.
  const rowsToInsert = balances
    .filter((b) => {
      if (doneToday.has(b.portfolioId)) return false;
      const totalValue = parseFloat(b.totalValue);
      if (totalValue > 0) return true;
      // Only insert a zero-value snapshot if the previous one was non-zero
      // (signals a real transition to empty).
      const prev = latestByPortfolio.get(b.portfolioId);
      return prev !== undefined && prev > 0;
    })
    .map((b) => ({
      portfolioId: b.portfolioId,
      date: today,
      totalValue: parseFloat(b.totalValue).toFixed(2),
      source: "system_cron" as SnapshotSource,
    }));

  if (rowsToInsert.length > 0) {
    await db.insert(portfolioSnapshots).values(rowsToInsert);
  }

  return {
    date: today,
    snapshotsCreated: rowsToInsert.length,
    totalPortfolios: balances.length,
    errors: [],
  };
}

/**
 * Create snapshot when approving a transaction
 * Does NOT delete existing snapshots - allows multiple snapshots per day
 * Uses the transaction date for the snapshot
 */
export async function createApprovalSnapshot(portfolioId: string, transactionDate: Date): Promise<void> {
  await createSnapshotForPortfolio(portfolioId, "admin_approval", transactionDate);
}

/**
 * Create a manual snapshot for a portfolio
 * Used by users to take a manual snapshot
 */
export async function createManualSnapshot(
  portfolioId: string,
  date: Date = new Date(),
  source: SnapshotSource = "manual"
): Promise<{ created: boolean; totalValue: number }> {
  return await createSnapshotForPortfolio(portfolioId, source, date);
}

/**
 * Delete all manual snapshots for a portfolio
 */
export async function deleteManualSnapshots(portfolioId: string): Promise<void> {
  await db
    .delete(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.portfolioId, portfolioId),
        eq(portfolioSnapshots.source, "manual")
      )
    );
}

/**
 * Admin-only: create a manual snapshot for EVERY portfolio in the system at
 * the given date / source. Used by the admin "take a snapshot for everyone"
 * tool when end-of-month interest is applied. Returns totals so the caller
 * can confirm what happened.
 *
 * Batched: at most 5 queries regardless of portfolio count (portfolio
 * listing, grouped balances, future-tx check + latest-snapshot lookup for
 * zero-value portfolios only, one bulk insert). Replicates the exact
 * per-portfolio semantics of createSnapshotForPortfolio: portfolios with no
 * matching transactions are skipped; zero-value portfolios are skipped when
 * future transactions exist, created when the last snapshot was non-zero, and
 * (for manual / admin_enforce sources) created when no prior snapshot exists.
 */
export async function createManualSnapshotsForAllPortfolios(
  date: Date,
  source: SnapshotSource = "manual"
): Promise<{ snapshotsCreated: number; totalValue: number; portfoliosProcessed: number }> {
  const allPortfolios = await db.select({ id: portfolios.id }).from(portfolios);
  if (allPortfolios.length === 0) {
    throw new Error("No portfolios found");
  }

  // Grouped rows only exist for portfolios with >= 1 matching transaction,
  // which reproduces the old "count === 0 → skip" branch for free.
  const balances = await db
    .select({
      portfolioId: transactions.portfolioId,
      totalValue: sql<string>`COALESCE(SUM(${transactions.currentValue}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.status, "approved"),
        eq(transactions.type, "buy"),
        lte(transactions.date, date)
      )
    )
    .groupBy(transactions.portfolioId);

  const zeroValueIds = balances
    .filter((b) => parseFloat(b.totalValue) === 0)
    .map((b) => b.portfolioId);

  const portfoliosWithFutureTx = new Set<string>();
  const latestByPortfolio = new Map<string, number>();

  if (zeroValueIds.length > 0) {
    const futureTx = await db
      .select({ portfolioId: transactions.portfolioId })
      .from(transactions)
      .where(
        and(
          inArray(transactions.portfolioId, zeroValueIds),
          eq(transactions.status, "approved"),
          eq(transactions.type, "buy"),
          gt(transactions.date, date)
        )
      )
      .groupBy(transactions.portfolioId);
    for (const row of futureTx) {
      portfoliosWithFutureTx.add(row.portfolioId);
    }

    const latestSnapshots = await db
      .selectDistinctOn([portfolioSnapshots.portfolioId], {
        portfolioId: portfolioSnapshots.portfolioId,
        totalValue: portfolioSnapshots.totalValue,
      })
      .from(portfolioSnapshots)
      .where(inArray(portfolioSnapshots.portfolioId, zeroValueIds))
      .orderBy(portfolioSnapshots.portfolioId, desc(portfolioSnapshots.date));
    for (const snapshot of latestSnapshots) {
      latestByPortfolio.set(snapshot.portfolioId, parseFloat(snapshot.totalValue));
    }
  }

  let totalValue = 0;
  const rowsToInsert: (typeof portfolioSnapshots.$inferInsert)[] = [];

  for (const balance of balances) {
    const value = parseFloat(balance.totalValue);
    let shouldCreate = value > 0;

    if (value === 0) {
      if (portfoliosWithFutureTx.has(balance.portfolioId)) {
        continue;
      }

      const lastValue = latestByPortfolio.get(balance.portfolioId) ?? null;
      if (lastValue !== null && lastValue > 0) {
        shouldCreate = true;
      } else if ((source === "manual" || source === "admin_enforce") && lastValue !== 0) {
        shouldCreate = true;
      }
    }

    if (shouldCreate) {
      rowsToInsert.push({
        portfolioId: balance.portfolioId,
        date,
        totalValue: value.toFixed(2),
        source,
      });
      totalValue += value;
    }
  }

  if (rowsToInsert.length > 0) {
    await db.insert(portfolioSnapshots).values(rowsToInsert);
  }

  return {
    snapshotsCreated: rowsToInsert.length,
    totalValue,
    portfoliosProcessed: allPortfolios.length,
  };
}

/**
 * Admin-only: delete every "manual" snapshot across all portfolios. Used by
 * the admin reset-tool. Returns the count of portfolios processed.
 */
export async function deleteManualSnapshotsForAllPortfolios(): Promise<{
  portfoliosProcessed: number;
}> {
  const allPortfolios = await db.select({ id: portfolios.id }).from(portfolios);
  for (const portfolio of allPortfolios) {
    await deleteManualSnapshots(portfolio.id);
  }
  return { portfoliosProcessed: allPortfolios.length };
}

/**
 * Internal function to create a snapshot for a portfolio
 */
async function createSnapshotForPortfolio(
  portfolioId: string,
  source: SnapshotSource,
  date: Date = new Date()
): Promise<{ created: boolean; totalValue: number }> {
  // Count and sum currentValue of all approved buy transactions with date <= snapshot date
  const result = await db
    .select({
      totalValue: sql<string>`COALESCE(SUM(${transactions.currentValue}), 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.portfolioId, portfolioId),
        eq(transactions.status, "approved"),
        eq(transactions.type, "buy"),
        lte(transactions.date, date)
      )
    );

  const totalValue = parseFloat(result[0]?.totalValue || "0");
  const transactionCount = result[0]?.count || 0;

  // Skip if no transactions match the criteria (date filter)
  if (transactionCount === 0) {
    return { created: false, totalValue: 0 };
  }

  // If totalValue is 0, check if there are transactions after this date
  // Only create 0-value snapshot if this represents a real state (had value before or will have after)
  if (totalValue === 0) {
    const futureTransactions = await db
      .select({
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.portfolioId, portfolioId),
          eq(transactions.status, "approved"),
          eq(transactions.type, "buy"),
          gt(transactions.date, date)
        )
      );

    const hasFutureTransactions = (futureTransactions[0]?.count || 0) > 0;

    // Skip snapshot if value is 0 and there are future transactions
    // (means we're creating a snapshot before any transactions existed)
    if (hasFutureTransactions) {
      return { created: false, totalValue: 0 };
    }
  }

  let shouldCreate = totalValue > 0;

  if (totalValue === 0) {
    const lastSnapshot = await db.query.portfolioSnapshots.findFirst({
      where: eq(portfolioSnapshots.portfolioId, portfolioId),
      orderBy: (snapshots, { desc }) => [desc(snapshots.date)],
    });

    const lastValue = lastSnapshot ? parseFloat(lastSnapshot.totalValue) : null;

    if (lastValue !== null && lastValue > 0) {
      shouldCreate = true;
    } else if ((source === "manual" || source === "admin_enforce") && lastValue !== 0) {
      shouldCreate = true;
    }
  }

  if (shouldCreate) {
    await db.insert(portfolioSnapshots).values({
      portfolioId,
      date,
      totalValue: totalValue.toFixed(2),
      source,
    });

    return { created: true, totalValue };
  }

  return { created: false, totalValue };
}
