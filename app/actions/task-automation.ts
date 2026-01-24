"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/services/auth-server";
import {
  createAutomatedTasksForRoadPath,
  createAutomatedTasksForAllRoadPaths,
} from "@/lib/services/task-automation-service";

export async function createAutomatedTaskAction(roadPathId: string) {
  const user = await requireAuth();

  const task = await createAutomatedTasksForRoadPath(user.id, roadPathId);

  revalidatePath("/portal/productivity");

  return {
    success: true,
    data: task,
    message: task ? "Task created successfully" : "No task needed at this time",
  };
}

export async function createAutomatedTasksForAllAction() {
  const user = await requireAuth();

  const tasks = await createAutomatedTasksForAllRoadPaths(user.id);

  revalidatePath("/portal/productivity");

  return {
    success: true,
    data: tasks,
    message: `${tasks.length} task(s) created`,
  };
}
