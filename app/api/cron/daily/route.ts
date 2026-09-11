import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { db } from "@/db";
import { appState } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  applyMonthlyInterest,
  interestAppliedThisMonth,
  LAST_INTEREST_RUN_KEY,
  markInterestApplied,
} from "@/lib/services/interest-service";
import { createDailySnapshots } from "@/lib/services/snapshot-service";
import { createDailyFinanceSnapshots } from "@/lib/services/finance-snapshot-service";
import { createAutomatedTasksForAllRoadPaths } from "@/lib/services/task-automation-service";
import { refreshF1News } from "@/lib/services/rapidapi-f1-news-service";

async function updateAppState(key: string, value: string, error: string | null = null) {
  const existingState = await db.query.appState.findFirst({
    where: eq(appState.key, key),
  });

  if (existingState) {
    await db
      .update(appState)
      .set({
        value,
        error,
        updatedAt: new Date(),
      })
      .where(eq(appState.key, key));
  } else {
    await db.insert(appState).values({
      key,
      value,
      error,
    });
  }
}

/**
 * Once per calendar month, whatever day the job happens to run.
 *
 * The record in app_state is consulted on EVERY run, the 1st included: the
 * old "always apply on the 1st" shortcut meant a retry, a manual trigger or a
 * double fire on that day compounded a second month onto every position.
 * With no record yet, only the 1st counts as the first month's run.
 */
async function shouldRunMonthlyInterest(today: Date): Promise<boolean> {
  const lastInterestRun = await db.query.appState.findFirst({
    where: eq(appState.key, LAST_INTEREST_RUN_KEY),
  });

  if (!lastInterestRun?.value) {
    return today.getUTCDate() === 1;
  }

  return !interestAppliedThisMonth(lastInterestRun.value, today);
}

async function processMonthlyInterest(today: Date) {
  try {
    const shouldApply = await shouldRunMonthlyInterest(today);
    
    if (!shouldApply) {
      return { applied: false, result: null };
    }

    const result = await applyMonthlyInterest();
    await markInterestApplied(today);

    return { applied: true, result };
  } catch (error) {
    console.error("Failed to process monthly interest:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    // A separate key: stamping last_interest_run on failure made the next run
    // believe the month was done and skip it.
    await updateAppState("last_interest_error", today.toISOString(), errorMessage);
    throw error;
  }
}

async function processDailySnapshots(today: Date) {
  try {
    const result = await createDailySnapshots();
    await updateAppState("last_snapshot_run", today.toISOString());
    
    return result;
  } catch (error) {
    console.error("Failed to create daily snapshots:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateAppState("last_snapshot_run", today.toISOString(), errorMessage);
    throw error;
  }
}

async function processFinancePlanSnapshots(today: Date) {
  try {
    const result = await createDailyFinanceSnapshots(today);
    await updateAppState("last_finance_snapshots_run", today.toISOString());
    return result;
  } catch (error) {
    console.error("Failed to capture finance plan snapshots:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateAppState("last_finance_snapshots_run", today.toISOString(), errorMessage);
    throw error;
  }
}

async function processAutomatedTasks(today: Date) {
  try {
    const allUsers = await db.query.users.findMany();
    const taskCreationResults = [];
    
    for (const user of allUsers) {
      try {
        const tasks = await createAutomatedTasksForAllRoadPaths(user.id);
        if (tasks.length > 0) {
          taskCreationResults.push({
            userId: user.id,
            tasksCreated: tasks.length,
          });
        }
      } catch (error) {
        console.error(`Failed to create automated tasks for user ${user.id}:`, error);
        // Continue with other users even if one fails
      }
    }

    await updateAppState("last_task_automation_run", today.toISOString());
    
    return taskCreationResults;
  } catch (error) {
    console.error("Failed to process automated tasks:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateAppState("last_task_automation_run", today.toISOString(), errorMessage);
    throw error;
  }
}

/**
 * Pull the day's F1 news.
 *
 * This used to be a Cloud Function in the humex-champions Firebase project on
 * its own 08:00 UTC schedule. It lives here now so one app owns the RapidAPI
 * quota and the archive.
 */
async function processF1News(today: Date) {
  try {
    const result = await refreshF1News();
    await updateAppState("last_f1_news_run", today.toISOString());
    return result;
  } catch (error) {
    console.error("Failed to refresh F1 news:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateAppState("last_f1_news_run", today.toISOString(), errorMessage);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request.headers.get("authorization"))) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const today = new Date();
    const results: {
      interest?: { applied: boolean; result: unknown };
      snapshots?: unknown;
      financeSnapshots?: { date: Date; totalPlans: number; snapshotsCreated: number; errors: string[] };
      tasks?: Array<{ userId: string; tasksCreated: number }>;
      f1News?: { fetched: number; stored: number };
      errors: Array<{ operation: string; error: string }>;
    } = {
      errors: [],
    };

    // Process monthly interest (independent operation)
    try {
      results.interest = await processMonthlyInterest(today);
    } catch (error) {
      results.errors.push({
        operation: "monthly_interest",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Process portfolio daily snapshots (independent operation)
    try {
      results.snapshots = await processDailySnapshots(today);
    } catch (error) {
      results.errors.push({
        operation: "daily_snapshots",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Process finance plan daily snapshots (independent operation)
    try {
      results.financeSnapshots = await processFinancePlanSnapshots(today);
    } catch (error) {
      results.errors.push({
        operation: "finance_plan_snapshots",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Process automated tasks (independent operation)
    try {
      results.tasks = await processAutomatedTasks(today);
    } catch (error) {
      results.errors.push({
        operation: "automated_tasks",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Refresh F1 news (independent operation)
    try {
      results.f1News = await processF1News(today);
    } catch (error) {
      results.errors.push({
        operation: "f1_news",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return NextResponse.json({
      success: results.errors.length === 0,
      date: today.toISOString(),
      interestApplied: results.interest?.applied ?? false,
      interestResult: results.interest?.result,
      snapshotsCreated: (results.snapshots as { snapshotsCreated?: number })?.snapshotsCreated ?? 0,
      financePlanSnapshots: results.financeSnapshots
        ? {
            totalPlans: results.financeSnapshots.totalPlans,
            snapshotsCreated: results.financeSnapshots.snapshotsCreated,
            errors: results.financeSnapshots.errors,
          }
        : { totalPlans: 0, snapshotsCreated: 0, errors: [] },
      taskCreationResults: results.tasks ?? [],
      f1News: results.f1News ?? { fetched: 0, stored: 0 },
      errors: results.errors,
    });
  } catch (error) {
    console.error("Cron job error:", error);

    // Log error to app_state
    try {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await updateAppState("last_cron_error", new Date().toISOString(), errorMessage);
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    // The message is logged above and stored in app_state; the response
    // carries no driver or constraint text.
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
