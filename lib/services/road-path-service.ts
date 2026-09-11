import "server-only";

import { db } from "@/db";
import { roadPaths, roadPathMilestones, roadPathProgress, boardTasks } from "@/db/schema";
import { eq, and, asc, desc, gte, lte } from "drizzle-orm";
import type {
  RoadPath,
  RoadPathWithDetails,
  RoadPathMilestone,
  RoadPathProgress,
  RoadPathStats,
} from "@/types";
import type {
  CreateRoadPathData,
  UpdateRoadPathData,
  CreateRoadPathMilestoneData,
  UpdateRoadPathMilestoneData,
  CreateRoadPathProgressData,
} from "@/schemas/road-path";

import { ensureOwnedRow } from "./ownership";

async function ensureRoadPathOwnership(roadPathId: string, userId: string): Promise<void> {
  await ensureOwnedRow({
    table: roadPaths,
    idColumn: roadPaths.id,
    id: roadPathId,
    userId,
    entity: "Road path",
  });
}

export async function getUserRoadPaths(userId: string): Promise<RoadPathWithDetails[]> {
  const paths = await db.query.roadPaths.findMany({
    where: eq(roadPaths.userId, userId),
    orderBy: [desc(roadPaths.createdAt)],
    with: {
      milestones: {
        orderBy: [asc(roadPathMilestones.order)],
      },
      progress: {
        orderBy: [desc(roadPathProgress.date)],
      },
      tasks: {
        orderBy: [desc(boardTasks.createdAt)],
        with: {
          column: true,
        },
      },
    },
  });

  return paths;
}

export async function getRoadPath(roadPathId: string, userId: string): Promise<RoadPathWithDetails | null> {
  const path = await db.query.roadPaths.findFirst({
    where: and(eq(roadPaths.id, roadPathId), eq(roadPaths.userId, userId)),
    with: {
      milestones: {
        orderBy: [asc(roadPathMilestones.order)],
      },
      progress: {
        orderBy: [desc(roadPathProgress.date)],
      },
      tasks: {
        orderBy: [desc(boardTasks.createdAt)],
        with: {
          column: true,
        },
      },
    },
  });

  return path || null;
}

export async function createRoadPath(
  userId: string,
  data: CreateRoadPathData
): Promise<RoadPath> {
  const [path] = await db
    .insert(roadPaths)
    .values({
      userId,
      title: data.title,
      description: data.description,
      targetValue: data.targetValue?.toString(),
      unit: data.unit,
      startDate: data.startDate,
      targetDate: data.targetDate,
      autoCreateTasks: data.autoCreateTasks ?? false,
      taskFrequency: data.taskFrequency,
    })
    .returning();

  return path;
}

export async function updateRoadPath(
  roadPathId: string,
  userId: string,
  data: Omit<UpdateRoadPathData, "id">
): Promise<RoadPath> {
  const { targetValue, currentValue, autoCreateTasks, ...rest } = data;

  const updateData: Partial<typeof roadPaths.$inferInsert> = {
    ...rest,
    updatedAt: new Date(),
  };

  if (targetValue !== undefined) {
    updateData.targetValue = targetValue?.toString() ?? null;
  }
  if (currentValue !== undefined) {
    updateData.currentValue = currentValue.toString();
  }
  if (autoCreateTasks !== undefined) {
    updateData.autoCreateTasks = autoCreateTasks;
  }

  const [path] = await db
    .update(roadPaths)
    .set(updateData)
    .where(and(eq(roadPaths.id, roadPathId), eq(roadPaths.userId, userId)))
    .returning();

  return path;
}

export async function deleteRoadPath(roadPathId: string, userId: string): Promise<void> {
  await db.delete(roadPaths).where(and(eq(roadPaths.id, roadPathId), eq(roadPaths.userId, userId)));
}

export async function getRoadPathMilestones(roadPathId: string, userId: string): Promise<RoadPathMilestone[]> {
  await ensureRoadPathOwnership(roadPathId, userId);

  const milestones = await db.query.roadPathMilestones.findMany({
    where: eq(roadPathMilestones.roadPathId, roadPathId),
    orderBy: [asc(roadPathMilestones.order)],
  });

  return milestones;
}

export async function createRoadPathMilestone(
  userId: string,
  /** `order` is resolved by the caller — see `createRoadPathMilestoneAction`. */
  data: CreateRoadPathMilestoneData & { order: number }
): Promise<RoadPathMilestone> {
  await ensureRoadPathOwnership(data.roadPathId, userId);

  const [milestone] = await db
    .insert(roadPathMilestones)
    .values({
      roadPathId: data.roadPathId,
      title: data.title,
      description: data.description,
      targetValue: data.targetValue?.toString(),
      order: data.order,
    })
    .returning();

  return milestone;
}

export async function updateRoadPathMilestone(
  milestoneId: string,
  userId: string,
  data: Omit<UpdateRoadPathMilestoneData, "id">
): Promise<RoadPathMilestone> {
  const milestone = await db.query.roadPathMilestones.findFirst({
    where: eq(roadPathMilestones.id, milestoneId),
    with: {
      roadPath: true,
    },
  });

  if (!milestone || milestone.roadPath.userId !== userId) {
    throw new Error("Milestone not found");
  }

  const { targetValue, ...rest } = data;

  const updateData: Partial<typeof roadPathMilestones.$inferInsert> = {
    ...rest,
    updatedAt: new Date(),
  };

  if (targetValue !== undefined) {
    updateData.targetValue = targetValue?.toString() ?? null;
  }

  const [updatedMilestone] = await db
    .update(roadPathMilestones)
    .set(updateData)
    .where(eq(roadPathMilestones.id, milestoneId))
    .returning();

  return updatedMilestone;
}

export async function deleteRoadPathMilestone(milestoneId: string, userId: string): Promise<void> {
  const milestone = await db.query.roadPathMilestones.findFirst({
    where: eq(roadPathMilestones.id, milestoneId),
    with: {
      roadPath: true,
    },
  });

  if (!milestone || milestone.roadPath.userId !== userId) {
    throw new Error("Milestone not found");
  }

  await db.delete(roadPathMilestones).where(eq(roadPathMilestones.id, milestoneId));
}

export async function getNextMilestoneOrder(roadPathId: string, userId: string): Promise<number> {
  await ensureRoadPathOwnership(roadPathId, userId);

  const milestones = await db.query.roadPathMilestones.findMany({
    where: eq(roadPathMilestones.roadPathId, roadPathId),
    orderBy: [desc(roadPathMilestones.order)],
    limit: 1,
  });

  return milestones.length > 0 ? milestones[0].order + 1 : 0;
}

export async function getRoadPathProgress(
  roadPathId: string,
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<RoadPathProgress[]> {
  await ensureRoadPathOwnership(roadPathId, userId);

  const conditions = [eq(roadPathProgress.roadPathId, roadPathId)];

  if (startDate) {
    conditions.push(gte(roadPathProgress.date, startDate));
  }
  if (endDate) {
    conditions.push(lte(roadPathProgress.date, endDate));
  }

  const progress = await db.query.roadPathProgress.findMany({
    where: and(...conditions),
    orderBy: [asc(roadPathProgress.date)],
  });

  return progress;
}

export async function createRoadPathProgress(
  userId: string,
  data: CreateRoadPathProgressData
): Promise<RoadPathProgress> {
  await ensureRoadPathOwnership(data.roadPathId, userId);

  return await db.transaction(async (tx) => {
    const [progress] = await tx
      .insert(roadPathProgress)
      .values({
        roadPathId: data.roadPathId,
        value: data.value.toString(),
        notes: data.notes,
        date: data.date ?? new Date(),
      })
      .returning();

    // currentValue is the NEWEST entry by date, not the last one typed: a
    // backdated entry used to overwrite a more recent figure.
    const latest = await tx.query.roadPathProgress.findFirst({
      where: eq(roadPathProgress.roadPathId, data.roadPathId),
      orderBy: [desc(roadPathProgress.date)],
    });
    await tx
      .update(roadPaths)
      .set({
        currentValue: latest?.value ?? data.value.toString(),
        updatedAt: new Date(),
      })
      .where(eq(roadPaths.id, data.roadPathId));

    return progress;
  });
}

export async function deleteRoadPathProgress(progressId: string, userId: string): Promise<void> {
  const progress = await db.query.roadPathProgress.findFirst({
    where: eq(roadPathProgress.id, progressId),
    with: {
      roadPath: true,
    },
  });

  if (!progress || progress.roadPath.userId !== userId) {
    throw new Error("Progress entry not found");
  }

  await db.delete(roadPathProgress).where(eq(roadPathProgress.id, progressId));

  const latestProgress = await db.query.roadPathProgress.findFirst({
    where: eq(roadPathProgress.roadPathId, progress.roadPathId),
    orderBy: [desc(roadPathProgress.date)],
  });

  // No entries left means no progress — the deleted figure must not linger.
  await db
    .update(roadPaths)
    .set({
      currentValue: latestProgress?.value ?? "0",
      updatedAt: new Date(),
    })
    .where(eq(roadPaths.id, progress.roadPathId));
}

export async function calculateRoadPathStats(roadPathId: string, userId: string): Promise<RoadPathStats> {
  const path = await getRoadPath(roadPathId, userId);

  if (!path) {
    throw new Error("Road path not found");
  }

  const targetValue = parseFloat(path.targetValue || "0");
  const currentValue = parseFloat(path.currentValue || "0");

  // Clamped so both the card and the detail agree, and a bar never exceeds
  // 100% or runs negative.
  const totalProgress =
    targetValue > 0 ? Math.max(0, Math.min(100, (currentValue / targetValue) * 100)) : 0;

  const completedMilestones = path.milestones.filter((m) => m.completedAt !== null).length;
  const totalMilestones = path.milestones.length;

  let daysRemaining: number | null = null;
  if (path.targetDate) {
    const now = new Date();
    const target = new Date(path.targetDate);
    daysRemaining = Math.max(
      0,
      Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );
  }

  const startDate = path.startDate ? new Date(path.startDate) : new Date();
  const now = new Date();
  const daysElapsed = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  const progressRate = currentValue / daysElapsed;

  return {
    totalProgress,
    completedMilestones,
    totalMilestones,
    daysRemaining,
    progressRate,
  };
}
