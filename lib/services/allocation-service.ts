import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  investmentMethods,
  priceAssets,
  transactionAllocations,
  transactions,
} from "@/db/schema";
import { methodAllocations } from "@/db/schema";
import {
  splitContribution,
  unitsFor,
  type Allocation, isCompleteAllocation } from "@/lib/finance/allocation";
import { closeOnOrBefore, fetchDailyCloses } from "./price-providers/massive";

export type MethodAllocationRow = {
  assetId: string;
  symbol: string;
  name: string;
  percent: number;
};

export async function getMethodAllocations(
  methodId: string
): Promise<MethodAllocationRow[]> {
  const rows = await db
    .select({
      assetId: methodAllocations.assetId,
      percent: methodAllocations.percent,
      symbol: priceAssets.symbol,
      name: priceAssets.name,
    })
    .from(methodAllocations)
    .innerJoin(priceAssets, eq(methodAllocations.assetId, priceAssets.id))
    .where(eq(methodAllocations.methodId, methodId));

  return rows.map((r) => ({ ...r, percent: parseFloat(r.percent) }));
}

/** Replace a method's policy wholesale — partial edits would leave gaps. */
export async function setMethodAllocations(
  methodId: string,
  allocations: Allocation[]
): Promise<void> {
  if (allocations.length > 0 && !isCompleteAllocation(allocations)) {
    throw new Error("Allocations must total 100%");
  }
  await db.transaction(async (tx) => {
    await tx.delete(methodAllocations).where(eq(methodAllocations.methodId, methodId));
    if (allocations.length > 0) {
      await tx.insert(methodAllocations).values(
        allocations.map((a) => ({
          methodId,
          assetId: a.assetId,
          percent: a.percent.toFixed(3),
        }))
      );
    }
  });
}

export type BackfillResult = {
  priced: number;
  skipped: number;
  errors: string[];
};

/**
 * Price every approved contribution that has no allocation rows yet.
 *
 * Runs against history, not live prices: each contribution is valued at its
 * own date, so the resulting position is what the money would really have
 * bought. Already-priced contributions are never touched — the whole point of
 * storing `priceAtPurchase` is that it stops being a question.
 *
 * Rejected transactions are excluded: no money moved, so nothing was bought.
 */
export async function backfillTransactionAllocations(
  ownerUserId: string
): Promise<BackfillResult> {
  const owned = await db
    .select({ id: investmentMethods.id })
    .from(investmentMethods)
    .where(eq(investmentMethods.ownerUserId, ownerUserId));

  if (owned.length === 0) return { priced: 0, skipped: 0, errors: [] };
  const methodIds = owned.map((m) => m.id);

  // One query for every owned method's policy, grouped in memory — a query
  // per method made this O(methods) round-trips on every backfill.
  const policyRows = await db
    .select({
      methodId: methodAllocations.methodId,
      assetId: methodAllocations.assetId,
      percent: methodAllocations.percent,
      symbol: priceAssets.symbol,
      name: priceAssets.name,
    })
    .from(methodAllocations)
    .innerJoin(priceAssets, eq(methodAllocations.assetId, priceAssets.id))
    .where(inArray(methodAllocations.methodId, methodIds));

  const policies = new Map<string, MethodAllocationRow[]>(
    methodIds.map((id) => [id, []])
  );
  for (const { methodId, ...row } of policyRows) {
    policies.get(methodId)?.push({ ...row, percent: parseFloat(row.percent) });
  }

  const pending = await db
    .select({
      id: transactions.id,
      methodId: transactions.investmentMethodId,
      date: transactions.date,
      type: transactions.type,
      total: transactions.total,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.investmentMethodId, methodIds),
        eq(transactions.status, "approved")
      )
    );

  const alreadyPriced = new Set(
    (
      await db
        .select({ transactionId: transactionAllocations.transactionId })
        .from(transactionAllocations)
    ).map((r) => r.transactionId)
  );

  const todo = pending.filter((t) => !alreadyPriced.has(t.id));
  if (todo.length === 0) {
    return { priced: 0, skipped: pending.length, errors: [] };
  }

  // One history request per asset covering the full span of contributions,
  // rather than one per contribution — that is what keeps a backfill of any
  // size inside the 5 req/min free tier.
  const assetIds = new Set<string>();
  for (const t of todo) {
    for (const a of policies.get(t.methodId!) ?? []) assetIds.add(a.assetId);
  }
  if (assetIds.size === 0) {
    return { priced: 0, skipped: todo.length, errors: ["no allocation configured"] };
  }

  const dates = todo.map((t) => new Date(t.date).toISOString().slice(0, 10)).sort();
  const from = shiftDays(dates[0], -7); // cushion for weekends before the first buy
  const to = dates[dates.length - 1];

  const assets = await db
    .select()
    .from(priceAssets)
    .where(inArray(priceAssets.id, [...assetIds]));

  const history = new Map<string, Awaited<ReturnType<typeof fetchDailyCloses>>["bars"]>();
  const errors: string[] = [];

  for (const asset of assets) {
    if (!asset.externalId) {
      errors.push(`${asset.symbol} has no provider id`);
      continue;
    }
    const { bars, error } = await fetchDailyCloses(asset.externalId, from, to);
    if (error) errors.push(`${asset.symbol}: ${error}`);
    history.set(asset.id, bars);
  }

  const rows: (typeof transactionAllocations.$inferInsert)[] = [];
  let skipped = 0;

  for (const t of todo) {
    const policy = policies.get(t.methodId!) ?? [];
    if (policy.length === 0) {
      skipped++;
      continue;
    }
    // splitContribution hands the last slice the remainder, so a policy that
    // does not reach 100% would silently overweight its last asset — forever,
    // since the allocation rows are immutable.
    if (!isCompleteAllocation(policy)) {
      skipped++;
      errors.push(`method ${t.methodId} allocation policy does not total 100%`);
      continue;
    }

    const day = new Date(t.date).toISOString().slice(0, 10);
    const amount = parseFloat(t.total);
    const direction = t.type === "withdrawal" ? "withdrawal" : "buy";

    for (const part of splitContribution(amount, policy)) {
      const bar = closeOnOrBefore(history.get(part.assetId) ?? [], day);
      if (!bar) {
        errors.push(`no price for asset on ${day}`);
        skipped++;
        continue;
      }
      rows.push({
        transactionId: t.id,
        assetId: part.assetId,
        amount: (direction === "withdrawal" ? -part.amount : part.amount).toFixed(2),
        priceAtPurchase: bar.close.toFixed(8),
        quantity: unitsFor(part.amount, bar.close, direction).toFixed(8),
        pricedOn: new Date(`${bar.day}T00:00:00.000Z`),
      });
    }
  }

  if (rows.length > 0) {
    await db.insert(transactionAllocations).values(rows).onConflictDoNothing();
  }

  return { priced: rows.length, skipped, errors };
}

/**
 * Price outstanding contributions for every method owner.
 *
 * The daily cron runs this after refreshing prices: a contribution approved
 * between runs would otherwise sit unpriced and silently missing from the
 * margin until somebody noticed and pressed a button.
 */
export async function backfillAllOwners(): Promise<BackfillResult> {
  const owners = await db
    .selectDistinct({ ownerUserId: investmentMethods.ownerUserId })
    .from(investmentMethods);

  const totals: BackfillResult = { priced: 0, skipped: 0, errors: [] };

  for (const { ownerUserId } of owners) {
    if (!ownerUserId) continue;
    const r = await backfillTransactionAllocations(ownerUserId);
    totals.priced += r.priced;
    totals.skipped += r.skipped;
    totals.errors.push(...r.errors);
  }

  return totals;
}

/** Positions derived from every priced contribution, grouped by method. */
export async function getDerivedHoldings(methodIds: string[]) {
  if (methodIds.length === 0) return [];

  return db
    .select({
      transactionId: transactionAllocations.transactionId,
      methodId: transactions.investmentMethodId,
      assetId: transactionAllocations.assetId,
      quantity: transactionAllocations.quantity,
      amount: transactionAllocations.amount,
      priceAtPurchase: transactionAllocations.priceAtPurchase,
      pricedOn: transactionAllocations.pricedOn,
      symbol: priceAssets.symbol,
      name: priceAssets.name,
    })
    .from(transactionAllocations)
    .innerJoin(transactions, eq(transactionAllocations.transactionId, transactions.id))
    .innerJoin(priceAssets, eq(transactionAllocations.assetId, priceAssets.id))
    .where(
      and(
        inArray(transactions.investmentMethodId, methodIds),
        // A buy drained by withdrawals flips to "closed" but its units were
        // real; dropping them left the withdrawal's negative units unmatched.
        inArray(transactions.status, ["approved", "closed"])
      )
    );
}

function shiftDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export type TransactionAllocation = {
  symbol: string;
  name: string;
  /** Units bought, signed. */
  quantity: number;
  /** Cash routed to this asset. */
  invested: number;
  /** The asset's close on the day the money landed — fixed forever. */
  priceAtPurchase: number;
};

/**
 * What each transaction bought, keyed by transaction id.
 *
 * Lets a transaction row show the position it created — units at the price of
 * that day — rather than only the cash that moved. Without it a contribution
 * is just an amount, and the whole point of the model is that the amount
 * became a specific number of units at a specific price.
 */
export async function getAllocationsByTransaction(
  transactionIds: string[]
): Promise<Map<string, TransactionAllocation[]>> {
  const out = new Map<string, TransactionAllocation[]>();
  if (transactionIds.length === 0) return out;

  const rows = await db
    .select({
      transactionId: transactionAllocations.transactionId,
      quantity: transactionAllocations.quantity,
      amount: transactionAllocations.amount,
      priceAtPurchase: transactionAllocations.priceAtPurchase,
      symbol: priceAssets.symbol,
      name: priceAssets.name,
    })
    .from(transactionAllocations)
    .innerJoin(priceAssets, eq(transactionAllocations.assetId, priceAssets.id))
    .where(inArray(transactionAllocations.transactionId, transactionIds));

  for (const r of rows) {
    const list = out.get(r.transactionId) ?? [];
    list.push({
      symbol: r.symbol,
      name: r.name,
      quantity: parseFloat(r.quantity),
      invested: parseFloat(r.amount),
      priceAtPurchase: parseFloat(r.priceAtPurchase),
    });
    out.set(r.transactionId, list);
  }
  return out;
}
