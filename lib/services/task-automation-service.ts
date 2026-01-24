import { db } from "@/db";
import { roadPaths, boardColumns } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { RoadPathFrequency, BoardTask } from "@/types";
import { createBoardTask, getNextTaskOrder } from "./board-service";

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

  const lastCreated = new Date(lastTaskCreatedAt);
  const daysSinceLastTask = Math.floor((now.getTime() - lastCreated.getTime()) / (1000 * 60 * 60 * 24));

  switch (frequency) {
    case "daily":
      return daysSinceLastTask >= 1;
    case "every_other_day":
      return daysSinceLastTask >= 2;
    case "weekly":
      return daysSinceLastTask >= 7;
    case "biweekly":
      return daysSinceLastTask >= 14;
    case "monthly":
      return daysSinceLastTask >= 30;
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

  const task = await createBoardTask(userId, {
    columnId: todoColumn.id,
    roadPathId: roadPath.id,
    title: taskTitle,
    description: roadPath.description,
    order,
    dueDate: new Date(),
  });

  await db
    .update(roadPaths)
    .set({
      lastTaskCreatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(roadPaths.id, roadPathId));

  return task;
}

export async function createAutomatedTasksForAllRoadPaths(userId: string): Promise<BoardTask[]> {
  const activePaths = await db.query.roadPaths.findMany({
    where: and(
      eq(roadPaths.userId, userId),
      eq(roadPaths.autoCreateTasks, 1),
      isNull(roadPaths.completedAt)
    ),
  });

  const createdTasks = [];

  for (const path of activePaths) {
    try {
      const task = await createAutomatedTasksForRoadPath(userId, path.id);
      if (task) {
        createdTasks.push(task);
      }
    } catch (error) {
      console.error(`Failed to create task for road path ${path.id}:`, error);
    }
  }

  return createdTasks;
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
