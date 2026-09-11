import { NextResponse } from "next/server";

import { requireEffectiveContext } from "@/lib/services/impersonation";
import {
  getUserPortfolio,
  getPortfolioTransactions,
  getInvestorTransactions,
} from "@/lib/services/portfolio-service";
import { getAllocationsByTransaction } from "@/lib/services/allocation-service";
import { getLatestPrices, listPriceAssets } from "@/lib/services/price-service";

/**
 * CSV of the transaction history, as rich as the screen it mirrors.
 *
 * Built server-side rather than from client state so the rows come from an
 * auth-gated query — `requireEffectiveContext` also means an admin who is
 * impersonating exports the impersonated user's history, matching what they
 * see.
 *
 * For someone who runs methods, the file also carries their investors' rows
 * and what every contribution actually bought. Exporting only the cash while
 * the app derives positions from it would hand back a file that cannot answer
 * the questions the app answers.
 */

/**
 * RFC 4180 quoting. The leading-symbol guard is the important part: a cell
 * starting with = + - or @ is executed as a formula by Excel and Sheets, so a
 * crafted note could run on whoever opens the file. Prefixing a single quote
 * neutralises it without changing the visible text.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * One definition drives the header, every row and the totals line.
 *
 * They used to be three hand-written lists that had to be kept the same
 * length. They drifted — a column was dropped from two of them and the totals
 * row silently shifted one place right, putting each sum under the wrong
 * heading. Deriving all three from this makes that impossible.
 */
type Row = {
  investor: string;
  date: string;
  type: string;
  status: string;
  method: string;
  risk: string;
  amount: string | null;
  fee: string | null;
  total: string | null;
  contributed: string | null;
  owed: string | null;
  asset: string;
  units: string;
  priceAtPurchase: string;
  worthNow: string;
  profitLoss: string;
  notes: string | null;
  /** Approved rows are the only ones the totals line counts. */
  approved: boolean;
};

const COLUMNS: { header: string; get: (r: Row) => unknown; sum?: boolean }[] = [
  { header: "Investor", get: (r) => r.investor },
  { header: "Date", get: (r) => r.date },
  { header: "Type", get: (r) => r.type },
  { header: "Status", get: (r) => r.status },
  { header: "Method", get: (r) => r.method },
  { header: "Risk", get: (r) => r.risk },
  { header: "Amount", get: (r) => r.amount, sum: true },
  { header: "Fee", get: (r) => r.fee, sum: true },
  { header: "Total", get: (r) => r.total, sum: true },
  { header: "Contributed", get: (r) => r.contributed, sum: true },
  { header: "Owed now", get: (r) => r.owed, sum: true },
  { header: "Asset", get: (r) => r.asset },
  { header: "Units", get: (r) => r.units },
  { header: "Price at purchase", get: (r) => r.priceAtPurchase },
  { header: "Worth now", get: (r) => r.worthNow, sum: true },
  { header: "P/L", get: (r) => r.profitLoss, sum: true },
  { header: "Notes", get: (r) => r.notes },
];

export async function GET() {
  const ctx = await requireEffectiveContext();

  const [portfolio, investorTx, assets] = await Promise.all([
    getUserPortfolio(ctx.effectiveUserId),
    getInvestorTransactions(ctx.effectiveUserId),
    listPriceAssets(),
  ]);

  const own = portfolio ? await getPortfolioTransactions(portfolio.id) : [];
  if (own.length === 0 && investorTx.length === 0) {
    return NextResponse.json({ error: "Nothing to export yet" }, { status: 404 });
  }

  const [allocations, prices] = await Promise.all([
    getAllocationsByTransaction([
      ...own.map((t) => t.id),
      ...investorTx.map((t) => t.id),
    ]),
    getLatestPrices(assets.map((a) => a.id)),
  ]);
  const priceBySymbol = new Map(
    assets.map((a) => [a.symbol, prices.get(a.id) ?? null])
  );

  /** A contribution can be split across assets, so it can produce several rows. */
  const expand = (
    base: Omit<Row, "asset" | "units" | "priceAtPurchase" | "worthNow" | "profitLoss">,
    txId: string
  ): Row[] => {
    const parts = allocations.get(txId) ?? [];
    if (parts.length === 0) {
      return [{ ...base, asset: "", units: "", priceAtPurchase: "", worthNow: "", profitLoss: "" }];
    }
    return parts.map((p) => {
      const price = priceBySymbol.get(p.symbol) ?? null;
      const worth = price === null ? null : p.quantity * price;
      return {
        ...base,
        asset: p.symbol,
        units: p.quantity.toFixed(8),
        priceAtPurchase: p.priceAtPurchase.toFixed(8),
        worthNow: worth === null ? "" : worth.toFixed(2),
        profitLoss: worth === null ? "" : (worth - p.invested).toFixed(2),
        // Only the first split carries the cash figures, or a two-asset
        // contribution would double its own amount in the totals line.
        ...(parts.indexOf(p) === 0
          ? {}
          : { amount: null, fee: null, total: null, contributed: null, owed: null }),
      };
    });
  };

  const rows: Row[] = [
    ...own.flatMap((t) =>
      expand(
        {
          investor: "You",
          date: t.date.toISOString().slice(0, 10),
          type: t.type,
          status: t.status,
          method: t.investmentMethod.name,
          risk: t.investmentMethod.riskLevel,
          amount: t.amount,
          fee: t.fee,
          total: t.total,
          contributed: t.initialValue,
          owed: t.currentValue,
          notes: t.notes,
          approved: t.status === "approved",
        },
        t.id
      )
    ),
    ...investorTx.flatMap((t) =>
      expand(
        {
          investor: t.investorName,
          date: t.date.toISOString().slice(0, 10),
          type: t.type,
          status: t.status,
          method: t.methodName,
          risk: "",
          amount: null,
          fee: null,
          // Signed so the totals line nets withdrawals instead of adding them.
          total: t.type === "withdrawal" ? `-${t.total}` : t.total,
          contributed: t.initialValue,
          owed: t.currentValue,
          notes: null,
          approved: t.status === "approved",
        },
        t.id
      )
    ),
  ];

  const approved = rows.filter((r) => r.approved);
  const totals = COLUMNS.map((c, i) => {
    if (i === 0) return `TOTAL (${approved.length} approved of ${rows.length})`;
    if (!c.sum) return "";
    return approved
      .reduce((acc, r) => acc + (Number(c.get(r)) || 0), 0)
      .toFixed(2);
  });

  const body = [
    COLUMNS.map((c) => c.header).join(","),
    ...rows.map((r) => COLUMNS.map((c) => cell(c.get(r))).join(",")),
    "",
    totals.map(cell).join(","),
  ];

  // BOM so Excel opens UTF-8 correctly instead of mangling accented names.
  const csv = "﻿" + body.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="portfolio-transactions-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
