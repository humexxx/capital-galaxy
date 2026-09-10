import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";

import { refreshPrices } from "@/lib/services/price-service";
import { backfillAllOwners } from "@/lib/services/allocation-service";

/**
 * Daily price refresh for the assets backing investment methods.
 *
 * Daily is what Vercel's Hobby plan schedules, and it matches what the free
 * data tiers actually sell: Massive's Basic plans are end-of-day, so a run
 * asks for yesterday's close and there is nothing finer to fetch. The endpoint
 * is frequency-agnostic — going hourly is a one-line change in vercel.json
 * once both the Vercel plan and the data plan justify it.
 *
 * Runs 30 minutes after the main daily job rather than alongside it, so the
 * two don't contend for the same pooled connections.
 */

// Providers are rate-limited (Massive: 5 req/min on the free tier), so a run
// with many individually-quoted tickers is slow rather than heavy.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshPrices();

    // Then price any contribution approved since the last run. Doing it here
    // and not only on demand is what stops a new investor's money being
    // silently absent from the margin until somebody presses a button.
    const backfill = await backfillAllOwners();

    // Partial failures are reported, not thrown: one unpriced asset must not
    // discard the quotes that did land.
    return NextResponse.json({
      ok: true,
      ...result,
      backfill,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Price cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
