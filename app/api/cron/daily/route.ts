import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { applyMonthlyInterest } from "@/lib/services/interest-service";
import { createDailySnapshots } from "@/lib/services/snapshot-service";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const today = new Date();
    const isFirstDayOfMonth = today.getUTCDate() === 1;

    let interestResult: { processed: number; closed: number } | null = null;
    let shouldApplyInterest = false;

    // Check if we need to apply interest
    if (isFirstDayOfMonth) {
      shouldApplyInterest = true;
    } else {
      // Check if last interest run was missed
      const lastInterestRun = await db.query.appState.findFirst({
        where: eq(appState.key, "last_interest_run"),
      });

      if (lastInterestRun?.value) {
        const lastRunDate = new Date(lastInterestRun.value);
        const lastRunMonth = lastRunDate.getUTCMonth();
        const lastRunYear = lastRunDate.getUTCFullYear();
        const currentMonth = today.getUTCMonth();
        const currentYear = today.getUTCFullYear();

        // If we're in a new month and haven't run interest for this month
        if (
          currentYear > lastRunYear ||
          (currentYear === lastRunYear && currentMonth > lastRunMonth)
        ) {
          shouldApplyInterest = true;
        }
      } else {
        // First run ever, don't apply interest yet
        shouldApplyInterest = false;
      }
    }

    // Execute in transaction
    await db.transaction(async (tx) => {
      // Apply monthly interest if needed
      if (shouldApplyInterest) {
        interestResult = await applyMonthlyInterest();

        // Update app state
        const existingState = await tx.query.appState.findFirst({
          where: eq(appState.key, "last_interest_run"),
        });

        if (existingState) {
          await tx
            .update(appState)
            .set({
              value: today.toISOString(),
              error: null,
              updatedAt: new Date(),
            })
            .where(eq(appState.key, "last_interest_run"));
        } else {
          await tx.insert(appState).values({
            key: "last_interest_run",
            value: today.toISOString(),
            error: null,
          });
        }
      }

      // Always create daily snapshots
      const snapshotResult = await createDailySnapshots();

      // Update last snapshot run
      const existingSnapshotState = await tx.query.appState.findFirst({
        where: eq(appState.key, "last_snapshot_run"),
      });

      if (existingSnapshotState) {
        await tx
          .update(appState)
          .set({
            value: today.toISOString(),
            error: null,
            updatedAt: new Date(),
          })
          .where(eq(appState.key, "last_snapshot_run"));
      } else {
        await tx.insert(appState).values({
          key: "last_snapshot_run",
          value: today.toISOString(),
          error: null,
        });
      }

      return { interestResult, snapshotResult };
    });

    return NextResponse.json({
      success: true,
      date: today.toISOString(),
      isFirstDayOfMonth,
      interestApplied: shouldApplyInterest,
      interestResult,
    });
  } catch (error) {
    console.error("Cron job error:", error);

    // Log error to app_state
    try {
      const existingState = await db.query.appState.findFirst({
        where: eq(appState.key, "last_cron_error"),
      });

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (existingState) {
        await db
          .update(appState)
          .set({
            error: errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(appState.key, "last_cron_error"));
      } else {
        await db.insert(appState).values({
          key: "last_cron_error",
          error: errorMessage,
        });
      }
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
