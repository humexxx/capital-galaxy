import { z } from "zod";

export const snapshotSourceEnum = z.enum([
  "system_cron",
  "admin_approval",
  "manual",
  "admin_enforce",
]);

export type SnapshotSource = z.infer<typeof snapshotSourceEnum>;

export const manualSnapshotFormSchema = z.object({
  date: z.date({
    message: "Date is required",
  }),
  applyInterest: z.boolean().default(false),
  source: snapshotSourceEnum.default("manual"),
});

export type ManualSnapshotFormData = z.infer<typeof manualSnapshotFormSchema>;
