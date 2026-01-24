import { z } from "zod";

export const roadPathFrequencyEnum = z.enum(["daily", "every_other_day", "weekly", "biweekly", "monthly"]);

export const createRoadPathSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(2000, "Description too long").nullable().optional(),
  targetValue: z.number().positive().nullable().optional(),
  unit: z.string().max(50, "Unit too long").nullable().optional(),
  startDate: z.date(),
  targetDate: z.date().nullable().optional(),
  autoCreateTasks: z.boolean().optional(),
  taskFrequency: roadPathFrequencyEnum.nullable().optional(),
}).refine(
  (data) => {
    if (data.autoCreateTasks && !data.taskFrequency) {
      return false;
    }
    return true;
  },
  {
    message: "Task frequency is required when auto-create tasks is enabled",
    path: ["taskFrequency"],
  }
);

export type CreateRoadPathData = z.infer<typeof createRoadPathSchema>;

export const updateRoadPathSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1, "Title is required").max(200, "Title too long").optional(),
  description: z.string().max(2000, "Description too long").nullable().optional(),
  targetValue: z.number().positive().nullable().optional(),
  currentValue: z.number().min(0).optional(),
  unit: z.string().max(50, "Unit too long").nullable().optional(),
  targetDate: z.date().nullable().optional(),
  autoCreateTasks: z.boolean().optional(),
  taskFrequency: roadPathFrequencyEnum.nullable().optional(),
  completedAt: z.date().nullable().optional(),
});

export type UpdateRoadPathData = z.infer<typeof updateRoadPathSchema>;

export const createRoadPathMilestoneSchema = z.object({
  roadPathId: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(2000, "Description too long").nullable().optional(),
  targetValue: z.number().positive().nullable().optional(),
  order: z.number().min(0),
});

export type CreateRoadPathMilestoneData = z.infer<typeof createRoadPathMilestoneSchema>;

export const updateRoadPathMilestoneSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1, "Title is required").max(200, "Title too long").optional(),
  description: z.string().max(2000, "Description too long").nullable().optional(),
  targetValue: z.number().positive().nullable().optional(),
  order: z.number().min(0).optional(),
  completed: z.boolean().optional(),
  completedAt: z.date().nullable().optional(),
});

export type UpdateRoadPathMilestoneData = z.infer<typeof updateRoadPathMilestoneSchema>;

export const createRoadPathProgressSchema = z.object({
  roadPathId: z.string().uuid(),
  value: z.number().min(0),
  notes: z.string().max(500, "Notes too long").nullable().optional(),
  date: z.date().optional(),
});

export type CreateRoadPathProgressData = z.infer<typeof createRoadPathProgressSchema>;
