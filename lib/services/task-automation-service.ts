import "server-only";

import { db } from "@/db";
import { roadPaths, boardColumns, boardTasks } from "@/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import type { RoadPathFrequency, BoardTask } from "@/types";
import { getNextTaskOrder } from "./board-service";

export function shouldCreateTask(
  frequency: RoadPathFrequency,
  lastTaskCreatedAt: Date | null,
  startDate: Date
): boolean {
  const now = new Date();

  if (!lastTaskCreatedAt) {
    if (now >= startDate) {
      return true;
    }
    return false;
  }

  // Whole calendar days (UTC), not elapsed hours: the cron stamps the exact
  // run time, so a run a minute earlier than yesterday's — or a manual run
  // the evening before — measured 23h59m and skipped the whole day.
  const lastCreated = new Date(lastTaskCreatedAt);
  const dayOf = (d: Date) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
  const daysSinceLastTask = dayOf(now) - dayOf(lastCreated);

  switch (frequency) {
    case "daily":
      return daysSinceLastTask >= 1;
    case "every_other_day":
      return daysSinceLastTask >= 2;
    case "weekly":
      return daysSinceLastTask >= 7;
    case "biweekly":
      return daysSinceLastTask >= 14;
    case "monthly": {
      // A new calendar month, not "30 days": 31-day months chained would
      // otherwise drift the task later every month and skip some.
      const months =
        (now.getUTCFullYear() - lastCreated.getUTCFullYear()) * 12 +
        (now.getUTCMonth() - lastCreated.getUTCMonth());
      return months >= 1;
    }
    default:
      return false;
  }
}

export function getTaskTitle(roadPathTitle: string, frequency: RoadPathFrequency): string {
  const frequencyMap: Record<RoadPathFrequency, string> = {
    daily: "Daily",
    every_other_day: "Every Other Day",
    weekly: "Weekly",
    biweekly: "Biweekly",
    monthly: "Monthly",
  };

  return `${frequencyMap[frequency]}: ${roadPathTitle}`;
}

export async function createAutomatedTasksForRoadPath(userId: string, roadPathId: string): Promise<BoardTask | null> {
  const roadPath = await db.query.roadPaths.findFirst({
    where: and(eq(roadPaths.id, roadPathId), eq(roadPaths.userId, userId)),
  });

  if (!roadPath) {
    throw new Error("Road path not found");
  }

  if (!roadPath.autoCreateTasks || !roadPath.taskFrequency) {
    return null;
  }

  if (
    !shouldCreateTask(
      roadPath.taskFrequency as RoadPathFrequency,
      roadPath.lastTaskCreatedAt,
      roadPath.startDate
    )
  ) {
    return null;
  }

  const todoColumn = await db.query.boardColumns.findFirst({
    where: and(eq(boardColumns.userId, userId), eq(boardColumns.name, "Todo")),
  });

  if (!todoColumn) {
    throw new Error("Todo column not found. Please initialize board columns first.");
  }

  const order = await getNextTaskOrder(todoColumn.id, userId);
  const taskTitle = getTaskTitle(roadPath.title, roadPath.taskFrequency as RoadPathFrequency);
  const now = new Date();

  return await db.transaction(async (tx) => {
    const [task] = await tx
      .insert(boardTasks)
      .values({
        userId,
        columnId: todoColumn.id,
        roadPathId: roadPath.id,
        title: taskTitle,
        description: roadPath.description,
        order,
        dueDate: now,
      })
      .returning();

    await tx
      .update(roadPaths)
      .set({
        lastTaskCreatedAt: now,
        updatedAt: now,
      })
      .where(eq(roadPaths.id, roadPathId));

    return task;
  });
}

export async function createAutomatedTasksForAllRoadPaths(userId: string): Promise<BoardTask[]> {
  // 1. Fetch all candidate paths in one query.
  const activePaths = await db.query.roadPaths.findMany({
    where: and(
      eq(roadPaths.userId, userId),
      eq(roadPaths.autoCreateTasks, true),
      isNull(roadPaths.completedAt)
    ),
  });

  // Pre-filter in memory — no extra queries needed for the schedule check.
  const eligiblePaths = activePaths.filter(
    (path) =>
      !!path.taskFrequency &&
      shouldCreateTask(
        path.taskFrequency as RoadPathFrequency,
        path.lastTaskCreatedAt,
        path.startDate
      )
  );

  if (eligiblePaths.length === 0) return [];

  // 2. Fetch the Todo column ONCE for this user (was previously fetched per path).
  const todoColumn = await db.query.boardColumns.findFirst({
    where: and(eq(boardColumns.userId, userId), eq(boardColumns.name, "Todo")),
  });

  if (!todoColumn) {
    throw new Error("Todo column not found. Please initialize board columns first.");
  }

  // 3. Compute the base order ONCE (was previously one query per path) and
  //    increment in memory — same 0,1,2… sequence the loop produced.
  const baseOrder = await getNextTaskOrder(todoColumn.id, userId);
  const now = new Date();

  const taskRows = eligiblePaths.map((path, index) => ({
    userId,
    columnId: todoColumn.id,
    roadPathId: path.id,
    title: getTaskTitle(path.title, path.taskFrequency as RoadPathFrequency),
    description: path.description,
    order: baseOrder + index,
    dueDate: now,
  }));

  // 4. One bulk insert + one stamp update, atomic.
  return await db.transaction(async (tx) => {
    const createdTasks = await tx.insert(boardTasks).values(taskRows).returning();

    await tx
      .update(roadPaths)
      .set({ lastTaskCreatedAt: now, updatedAt: now })
      .where(
        inArray(
          roadPaths.id,
          eligiblePaths.map((path) => path.id)
        )
      );

    return createdTasks;
  });
}

export async function getNextTaskDueDate(frequency: RoadPathFrequency, lastDate?: Date): Promise<Date> {
  const baseDate = lastDate || new Date();
  const nextDate = new Date(baseDate);

  switch (frequency) {
    case "daily":
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case "every_other_day":
      nextDate.setDate(nextDate.getDate() + 2);
      break;
    case "weekly":
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case "biweekly":
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case "monthly":
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
  }

  return nextDate;
}
