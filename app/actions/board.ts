"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/services/auth-server";
import {
  getUserBoardColumns,
  getBoardColumn,
  createBoardColumn,
  updateBoardColumn,
  deleteBoardColumn,
  initializeDefaultColumns,
  getBoardTask,
  getUserBoardTasks,
  createBoardTask,
  updateBoardTask,
  deleteBoardTask,
  reorderTask,
  getNextTaskOrder,
  getNextColumnOrder,
} from "@/lib/services/board-service";
import {
  createBoardColumnSchema,
  updateBoardColumnSchema,
  createBoardTaskSchema,
  updateBoardTaskSchema,
  reorderTasksSchema,
  type CreateBoardColumnData,
  type UpdateBoardColumnData,
  type CreateBoardTaskData,
  type UpdateBoardTaskData,
  type ReorderTasksData,
} from "@/schemas/board";

export async function getUserBoardColumnsAction() {
  const user = await requireAuth();

  const columns = await getUserBoardColumns(user.id);
  return { success: true, data: columns };
}

export async function getBoardColumnAction(columnId: string) {
  const user = await requireAuth();

  const column = await getBoardColumn(columnId, user.id);
  if (!column) {
    throw new Error("Column not found");
  }

  return { success: true, data: column };
}

export async function createBoardColumnAction(data: CreateBoardColumnData) {
  const user = await requireAuth();

  const validated = createBoardColumnSchema.parse(data);
  const column = await createBoardColumn(user.id, validated);

  revalidatePath("/portal/productivity");

  return { success: true, data: column };
}

export async function updateBoardColumnAction(data: UpdateBoardColumnData) {
  const user = await requireAuth();

  const validated = updateBoardColumnSchema.parse(data);
  const { id, ...updateData } = validated;

  const column = await updateBoardColumn(id, user.id, updateData);
  if (!column) {
    throw new Error("Column not found");
  }

  revalidatePath("/portal/productivity");

  return { success: true, data: column };
}

export async function deleteBoardColumnAction(columnId: string) {
  const user = await requireAuth();

  await deleteBoardColumn(columnId, user.id);

  revalidatePath("/portal/productivity");

  return { success: true };
}

export async function initializeDefaultColumnsAction() {
  const user = await requireAuth();

  const columns = await initializeDefaultColumns(user.id);

  revalidatePath("/portal/productivity");

  return { success: true, data: columns };
}

export async function getUserBoardTasksAction() {
  const user = await requireAuth();

  const tasks = await getUserBoardTasks(user.id);
  return { success: true, data: tasks };
}

export async function getBoardTaskAction(taskId: string) {
  const user = await requireAuth();

  const task = await getBoardTask(taskId, user.id);
  if (!task) {
    throw new Error("Task not found");
  }

  return { success: true, data: task };
}

export async function createBoardTaskAction(data: CreateBoardTaskData) {
  const user = await requireAuth();

  const validated = createBoardTaskSchema.parse(data);
  const task = await createBoardTask(user.id, validated);

  revalidatePath("/portal/productivity");

  return { success: true, data: task };
}

export async function updateBoardTaskAction(data: UpdateBoardTaskData) {
  const user = await requireAuth();

  const validated = updateBoardTaskSchema.parse(data);
  const { id, ...updateData } = validated;

  const task = await updateBoardTask(id, user.id, updateData);
  if (!task) {
    throw new Error("Task not found");
  }

  revalidatePath("/portal/productivity");

  return { success: true, data: task };
}

export async function deleteBoardTaskAction(taskId: string) {
  const user = await requireAuth();

  await deleteBoardTask(taskId, user.id);

  revalidatePath("/portal/productivity");

  return { success: true };
}

export async function reorderBoardTaskAction(data: ReorderTasksData) {
  const user = await requireAuth();

  const validated = reorderTasksSchema.parse(data);
  const task = await reorderTask(
    validated.taskId,
    user.id,
    validated.sourceColumnId,
    validated.destinationColumnId,
    validated.order
  );

  revalidatePath("/portal/productivity");

  return { success: true, data: task };
}

export async function getNextTaskOrderAction(columnId: string) {
  const user = await requireAuth();

  const order = await getNextTaskOrder(columnId, user.id);
  return { success: true, data: order };
}

export async function getNextColumnOrderAction() {
  const user = await requireAuth();

  const order = await getNextColumnOrder(user.id);
  return { success: true, data: order };
}
