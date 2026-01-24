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
      autoCreateTasks: data.autoCreateTasks ? 1 : 0,
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
  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: new Date(),
  };

  if (data.targetValue !== undefined) {
    updateData.targetValue = data.targetValue?.toString();
  }
  if (data.currentValue !== undefined) {
    updateData.currentValue = data.currentValue.toString();
  }
  if (data.autoCreateTasks !== undefined) {
    updateData.autoCreateTasks = data.autoCreateTasks ? 1 : 0;
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
  const path = await db.query.roadPaths.findFirst({
    where: and(eq(roadPaths.id, roadPathId), eq(roadPaths.userId, userId)),
  });

  if (!path) {
    throw new Error("Road path not found");
  }

  const milestones = await db.query.roadPathMilestones.findMany({
    where: eq(roadPathMilestones.roadPathId, roadPathId),
    orderBy: [asc(roadPathMilestones.order)],
  });

  return milestones;
}

export async function createRoadPathMilestone(
  userId: string,
  data: CreateRoadPathMilestoneData
): Promise<RoadPathMilestone> {
  const path = await db.query.roadPaths.findFirst({
    where: and(eq(roadPaths.id, data.roadPathId), eq(roadPaths.userId, userId)),
  });

  if (!path) {
    throw new Error("Road path not found");
  }

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

  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: new Date(),
  };

  if (data.targetValue !== undefined) {
    updateData.targetValue = data.targetValue?.toString();
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
  const path = await db.query.roadPaths.findFirst({
    where: and(eq(roadPaths.id, roadPathId), eq(roadPaths.userId, userId)),
  });

  if (!path) {
    throw new Error("Road path not found");
  }

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
  const path = await db.query.roadPaths.findFirst({
    where: and(eq(roadPaths.id, roadPathId), eq(roadPaths.userId, userId)),
  });

  if (!path) {
    throw new Error("Road path not found");
  }

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
  const path = await db.query.roadPaths.findFirst({
    where: and(eq(roadPaths.id, data.roadPathId), eq(roadPaths.userId, userId)),
  });

  if (!path) {
    throw new Error("Road path not found");
  }

  const [progress] = await db
    .insert(roadPathProgress)
    .values({
      roadPathId: data.roadPathId,
      value: data.value.toString(),
      notes: data.notes,
      date: data.date,
    })
    .returning();

  await db
    .update(roadPaths)
    .set({
      currentValue: data.value.toString(),
      updatedAt: new Date(),
    })
    .where(eq(roadPaths.id, data.roadPathId));

  return progress;
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

  if (latestProgress) {
    await db
      .update(roadPaths)
      .set({
        currentValue: latestProgress.value,
        updatedAt: new Date(),
      })
      .where(eq(roadPaths.id, progress.roadPathId));
  }
}

export async function calculateRoadPathStats(roadPathId: string, userId: string): Promise<RoadPathStats> {
  const path = await getRoadPath(roadPathId, userId);

  if (!path) {
    throw new Error("Road path not found");
  }

  const targetValue = parseFloat(path.targetValue || "0");
  const currentValue = parseFloat(path.currentValue || "0");

  const totalProgress = targetValue > 0 ? (currentValue / targetValue) * 100 : 0;

  const completedMilestones = path.milestones.filter((m) => m.completedAt !== null).length;
  const totalMilestones = path.milestones.length;

  let daysRemaining: number | null = null;
  if (path.targetDate) {
    const now = new Date();
    const target = new Date(path.targetDate);
    daysRemaining = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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
