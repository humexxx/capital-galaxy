"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/services/auth-server";
import {
  getUserRoadPaths,
  getRoadPath,
  createRoadPath,
  updateRoadPath,
  deleteRoadPath,
  getRoadPathMilestones,
  createRoadPathMilestone,
  updateRoadPathMilestone,
  deleteRoadPathMilestone,
  getNextMilestoneOrder,
  getRoadPathProgress,
  createRoadPathProgress,
  deleteRoadPathProgress,
  calculateRoadPathStats,
} from "@/lib/services/road-path-service";
import {
  createRoadPathSchema,
  updateRoadPathSchema,
  createRoadPathMilestoneSchema,
  updateRoadPathMilestoneSchema,
  createRoadPathProgressSchema,
  type CreateRoadPathData,
  type UpdateRoadPathData,
  type CreateRoadPathMilestoneData,
  type UpdateRoadPathMilestoneData,
  type CreateRoadPathProgressData,
} from "@/schemas/road-path";

export async function getUserRoadPathsAction() {
  const user = await requireAuth();

  const paths = await getUserRoadPaths(user.id);
  return { success: true, data: paths };
}

export async function getRoadPathAction(roadPathId: string) {
  const user = await requireAuth();

  const path = await getRoadPath(roadPathId, user.id);
  if (!path) {
    throw new Error("Road path not found");
  }

  return { success: true, data: path };
}

export async function createRoadPathAction(data: CreateRoadPathData) {
  const user = await requireAuth();

  const validated = createRoadPathSchema.parse(data);
  const path = await createRoadPath(user.id, validated);

  revalidatePath("/portal/productivity");

  return { success: true, data: path };
}

export async function updateRoadPathAction(data: UpdateRoadPathData) {
  const user = await requireAuth();

  const validated = updateRoadPathSchema.parse(data);
  const { id, ...updateData } = validated;

  const path = await updateRoadPath(id, user.id, updateData);
  if (!path) {
    throw new Error("Road path not found");
  }

  revalidatePath("/portal/productivity");

  return { success: true, data: path };
}

export async function deleteRoadPathAction(roadPathId: string) {
  const user = await requireAuth();

  await deleteRoadPath(roadPathId, user.id);

  revalidatePath("/portal/productivity");

  return { success: true };
}

export async function getRoadPathMilestonesAction(roadPathId: string) {
  const user = await requireAuth();

  const milestones = await getRoadPathMilestones(roadPathId, user.id);
  return { success: true, data: milestones };
}

export async function createRoadPathMilestoneAction(data: CreateRoadPathMilestoneData) {
  const user = await requireAuth();

  const validated = createRoadPathMilestoneSchema.parse(data);
  const milestone = await createRoadPathMilestone(user.id, validated);

  revalidatePath("/portal/productivity");

  return { success: true, data: milestone };
}

export async function updateRoadPathMilestoneAction(data: UpdateRoadPathMilestoneData) {
  const user = await requireAuth();

  const validated = updateRoadPathMilestoneSchema.parse(data);
  const { id, ...updateData } = validated;

  const milestone = await updateRoadPathMilestone(id, user.id, updateData);
  if (!milestone) {
    throw new Error("Milestone not found");
  }

  revalidatePath("/portal/productivity");

  return { success: true, data: milestone };
}

export async function deleteRoadPathMilestoneAction(milestoneId: string) {
  const user = await requireAuth();

  await deleteRoadPathMilestone(milestoneId, user.id);

  revalidatePath("/portal/productivity");

  return { success: true };
}

export async function getNextMilestoneOrderAction(roadPathId: string) {
  const user = await requireAuth();

  const order = await getNextMilestoneOrder(roadPathId, user.id);
  return { success: true, data: order };
}

export async function getRoadPathProgressAction(
  roadPathId: string,
  startDate?: Date,
  endDate?: Date
) {
  const user = await requireAuth();

  const progress = await getRoadPathProgress(roadPathId, user.id, startDate, endDate);
  return { success: true, data: progress };
}

export async function createRoadPathProgressAction(data: CreateRoadPathProgressData) {
  const user = await requireAuth();

  const validated = createRoadPathProgressSchema.parse(data);
  const progress = await createRoadPathProgress(user.id, validated);

  revalidatePath("/portal/productivity");

  return { success: true, data: progress };
}

export async function deleteRoadPathProgressAction(progressId: string) {
  const user = await requireAuth();

  await deleteRoadPathProgress(progressId, user.id);

  revalidatePath("/portal/productivity");

  return { success: true };
}

export async function calculateRoadPathStatsAction(roadPathId: string) {
  const user = await requireAuth();

  const stats = await calculateRoadPathStats(roadPathId, user.id);
  return { success: true, data: stats };
}
