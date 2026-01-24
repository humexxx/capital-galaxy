import { z } from "zod";

export const createBoardColumnSchema = z.object({
  name: z.string().min(1, "Column name is required").max(50, "Column name too long"),
  order: z.number().min(0),
});

export type CreateBoardColumnData = z.infer<typeof createBoardColumnSchema>;

export const updateBoardColumnSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1, "Column name is required").max(50, "Column name too long").optional(),
  order: z.number().min(0).optional(),
});

export type UpdateBoardColumnData = z.infer<typeof updateBoardColumnSchema>;

export const createBoardTaskSchema = z.object({
  columnId: z.uuid(),
  roadPathId: z.uuid().nullable().optional(),
  title: z.string().min(1, "Task title is required").max(200, "Task title too long"),
  description: z.string().max(2000, "Description too long").nullable().optional(),
  priority: z.string().nullable().optional(),
  order: z.number().min(0),
  dueDate: z.date().nullable().optional(),
});

export type CreateBoardTaskData = z.infer<typeof createBoardTaskSchema>;

export const updateBoardTaskSchema = z.object({
  id: z.uuid(),
  columnId: z.uuid().optional(),
  title: z.string().min(1, "Task title is required").max(200, "Task title too long").optional(),
  description: z.string().max(2000, "Description too long").nullable().optional(),
  priority: z.string().nullable().optional(),
  order: z.number().min(0).optional(),
  dueDate: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
});

export type UpdateBoardTaskData = z.infer<typeof updateBoardTaskSchema>;

export const reorderTasksSchema = z.object({
  taskId: z.uuid(),
  sourceColumnId: z.uuid(),
  destinationColumnId: z.uuid(),
  order: z.number().min(0),
});

export type ReorderTasksData = z.infer<typeof reorderTasksSchema>;
