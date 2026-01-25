import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { applyMonthlyInterest } from "@/lib/services/interest-service";
import { createDailySnapshots } from "@/lib/services/snapshot-service";
import { createAutomatedTasksForAllRoadPaths } from "@/lib/services/task-automation-service";

const CRON_SECRET = process.env.CRON_SECRET;

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

async function shouldRunMonthlyInterest(today: Date): Promise<boolean> {
  const isFirstDayOfMonth = today.getUTCDate() === 1;
  
  if (isFirstDayOfMonth) {
    return true;
  }

  const lastInterestRun = await db.query.appState.findFirst({
    where: eq(appState.key, "last_interest_run"),
  });

  if (!lastInterestRun?.value) {
    return false; // First run ever, don't apply interest yet
  }

  const lastRunDate = new Date(lastInterestRun.value);
  const lastRunMonth = lastRunDate.getUTCMonth();
  const lastRunYear = lastRunDate.getUTCFullYear();
  const currentMonth = today.getUTCMonth();
  const currentYear = today.getUTCFullYear();

  // If we're in a new month and haven't run interest for this month
  return currentYear > lastRunYear || 
    (currentYear === lastRunYear && currentMonth > lastRunMonth);
}

async function processMonthlyInterest(today: Date) {
  try {
    const shouldApply = await shouldRunMonthlyInterest(today);
    
    if (!shouldApply) {
      return { applied: false, result: null };
    }

    const result = await applyMonthlyInterest();
    await updateAppState("last_interest_run", today.toISOString());
    
    return { applied: true, result };
  } catch (error) {
    console.error("Failed to process monthly interest:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateAppState("last_interest_run", today.toISOString(), errorMessage);
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
    const results: {
      interest?: { applied: boolean; result: unknown };
      snapshots?: unknown;
      tasks?: Array<{ userId: string; tasksCreated: number }>;
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

    // Process daily snapshots (independent operation)
    try {
      results.snapshots = await processDailySnapshots(today);
    } catch (error) {
      results.errors.push({
        operation: "daily_snapshots",
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

    return NextResponse.json({
      success: results.errors.length === 0,
      date: today.toISOString(),
      interestApplied: results.interest?.applied ?? false,
      interestResult: results.interest?.result,
      snapshotsCreated: (results.snapshots as { created?: number })?.created ?? 0,
      taskCreationResults: results.tasks ?? [],
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

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
