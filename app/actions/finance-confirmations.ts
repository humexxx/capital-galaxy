"use server";

import { revalidatePath } from "next/cache";

import { safe, type ActionResult } from "@/lib/actions/safe";
import { requireEffectiveContext } from "@/lib/services/impersonation";
import { saveConfirmation } from "@/lib/services/finance-confirmation-service";
import { confirmationSchema, type ConfirmationData } from "@/schemas/finance-confirmations";

export async function saveConfirmationAction(
  input: ConfirmationData,
): Promise<ActionResult> {
  return safe("finance-confirmations", async () => {
    const ctx = await requireEffectiveContext();
    const parsed = confirmationSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input" };
    }
    await saveConfirmation(ctx.effectiveUserId, parsed.data);
    revalidatePath(`/portal/plans/${parsed.data.planId}`);
    // The dashboard hosts the prompt and the calibrated finance card; without
    // this it kept showing pre-confirmation numbers and "still due".
    revalidatePath("/portal");
    return { success: true };
  });
}
