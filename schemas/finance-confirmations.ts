import { z } from "zod";

export const confirmationSchema = z.object({
  planId: z.string().uuid(),
  // Deficits are carried as negative savings (see docs/modules/finance.md), so
  // a confirmation must be able to record one.
  confirmedSavings: z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Invalid amount"),
  confirmedInvestments: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount"),
  notes: z.string().max(1000).optional().nullable(),
  debtBalances: z.array(
    z.object({
      debtId: z.string().uuid(),
      confirmedBalance: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid balance"),
    }),
  ),
});

export type ConfirmationData = z.infer<typeof confirmationSchema>;
