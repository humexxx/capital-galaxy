"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safe } from "@/lib/actions/safe";
import {
  logImpersonatedMutation,
  requireEffectiveContext,
} from "@/lib/services/impersonation";
import {
  addDebt,
  addExpense,
  addIncome,
  clonePlan,
  createPlan,
  deleteDebt,
  deleteExpense,
  deleteIncome,
  deleteLineOverride,
  deletePlan,
  setMainPlan,
  setPlanColor,
  updateDebt,
  updateExpense,
  updateIncome,
  updatePlan,
  upsertLineOverride,
} from "@/lib/services/finance-plan-service";
import {
  createFinancePlanSchema,
  deleteLineOverrideSchema,
  lineOverrideSchema,
  planDebtSchema,
  planExpenseSchema,
  planColorSchema,
  planIncomeSchema,
  updateFinancePlanSchema,
  updatePlanDebtSchema,
  updatePlanExpenseSchema,
  updatePlanIncomeSchema,
  type CreateFinancePlanInput,
  type DeleteLineOverrideInput,
  type LineOverrideInput,
  type PlanColorInput,
  type PlanDebtInput,
  type PlanExpenseInput,
  type PlanIncomeInput,
  type UpdateFinancePlanInput,
  type UpdatePlanDebtInput,
  type UpdatePlanExpenseInput,
  type UpdatePlanIncomeInput,
} from "@/schemas/finance";

const PLAN_PATH = "/portal/plans";

function pathForPlan(planId: string): string {
  return `${PLAN_PATH}/${planId}`;
}

// ---------- plans ----------

export async function createPlanAction(input: CreateFinancePlanInput) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const parsed = createFinancePlanSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    const plan = await createPlan(ctx.effectiveUserId, parsed.data);
    await logImpersonatedMutation({
      action: "financePlan.create",
      entityTable: "finance_plans",
      entityId: plan.id,
      after: plan,
    });
    revalidatePath(PLAN_PATH);
    // The dashboard card follows the main plan, which both of these can change.
    revalidatePath("/portal");
    return { success: true as const, data: plan };
  });
}

export async function updatePlanAction(input: UpdateFinancePlanInput) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const parsed = updateFinancePlanSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    const plan = await updatePlan(ctx.effectiveUserId, parsed.data);
    await logImpersonatedMutation({
      action: "financePlan.update",
      entityTable: "finance_plans",
      entityId: plan.id,
      after: plan,
    });
    revalidatePath(PLAN_PATH);
    revalidatePath(pathForPlan(parsed.data.id));
    return { success: true as const, data: plan };
  });
}

export async function deletePlanAction(planId: string) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const parsed = z.string().uuid().safeParse(planId);
    if (!parsed.success) return { success: false as const, error: "Invalid id" };
    await deletePlan(ctx.effectiveUserId, parsed.data);
    await logImpersonatedMutation({
      action: "financePlan.delete",
      entityTable: "finance_plans",
      entityId: parsed.data,
    });
    revalidatePath(PLAN_PATH);
    // The dashboard card follows the main plan, which both of these can change.
    revalidatePath("/portal");
    return { success: true as const };
  });
}

export async function setMainPlanAction(planId: string) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const parsed = z.string().uuid().safeParse(planId);
    if (!parsed.success) return { success: false as const, error: "Invalid id" };
    await setMainPlan(ctx.effectiveUserId, parsed.data);
    await logImpersonatedMutation({
      action: "financePlan.setMain",
      entityTable: "finance_plans",
      entityId: parsed.data,
    });
    // Revalidate dashboard + plans list — both surfaces follow the main flag.
    revalidatePath(PLAN_PATH);
    revalidatePath("/portal");
    return { success: true as const };
  });
}

export async function setPlanColorAction(input: PlanColorInput) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const parsed = planColorSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: "Unsupported colour" };
    }
    await setPlanColor(ctx.effectiveUserId, parsed.data.id, parsed.data.color);
    await logImpersonatedMutation({
      action: "financePlan.setColour",
      entityTable: "finance_plans",
      entityId: parsed.data.id,
      after: { color: parsed.data.color },
    });
    revalidatePath(PLAN_PATH);
    revalidatePath(pathForPlan(parsed.data.id));
    return { success: true as const };
  });
}

export async function clonePlanAction(planId: string, newName: string) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const idParsed = z.string().uuid().safeParse(planId);
    const nameParsed = z.string().min(1).max(120).safeParse(newName);
    if (!idParsed.success || !nameParsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    const plan = await clonePlan(ctx.effectiveUserId, idParsed.data, nameParsed.data);
    await logImpersonatedMutation({
      action: "financePlan.clone",
      entityTable: "finance_plans",
      entityId: plan.id,
      metadata: { sourcePlanId: idParsed.data },
    });
    revalidatePath(PLAN_PATH);
    return { success: true as const, data: plan };
  });
}

/** Clone + link: the new plan keeps a basedOnPlanId reference to the source,
 *  so its chart can overlay the base plan's projection as a ghost line. */
export async function createScenarioAction(planId: string, newName: string) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const idParsed = z.string().uuid().safeParse(planId);
    const nameParsed = z.string().min(1).max(120).safeParse(newName);
    if (!idParsed.success || !nameParsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    const plan = await clonePlan(ctx.effectiveUserId, idParsed.data, nameParsed.data, {
      asScenario: true,
    });
    await logImpersonatedMutation({
      action: "financePlan.createScenario",
      entityTable: "finance_plans",
      entityId: plan.id,
      metadata: { sourcePlanId: idParsed.data },
    });
    revalidatePath(PLAN_PATH);
    return { success: true as const, data: plan };
  });
}

// ---------- incomes ----------

export async function addPlanIncomeAction(planId: string, input: PlanIncomeInput) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const idParsed = z.string().uuid().safeParse(planId);
    const parsed = planIncomeSchema.safeParse(input);
    if (!idParsed.success || !parsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    const row = await addIncome(ctx.effectiveUserId, idParsed.data, parsed.data);
    await logImpersonatedMutation({
      action: "financePlanIncome.create",
      entityTable: "finance_plan_incomes",
      entityId: row.id,
    });
    revalidatePath(pathForPlan(idParsed.data));
    return { success: true as const, data: row };
  });
}

export async function updatePlanIncomeAction(planId: string, input: UpdatePlanIncomeInput) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const idParsed = z.string().uuid().safeParse(planId);
    const parsed = updatePlanIncomeSchema.safeParse(input);
    if (!idParsed.success || !parsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    const row = await updateIncome(ctx.effectiveUserId, idParsed.data, parsed.data);
    await logImpersonatedMutation({
      action: "financePlanIncome.update",
      entityTable: "finance_plan_incomes",
      entityId: row.id,
    });
    revalidatePath(pathForPlan(idParsed.data));
    return { success: true as const, data: row };
  });
}

export async function deletePlanIncomeAction(planId: string, incomeId: string) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const planIdParsed = z.string().uuid().safeParse(planId);
    const incomeIdParsed = z.string().uuid().safeParse(incomeId);
    if (!planIdParsed.success || !incomeIdParsed.success) {
      return { success: false as const, error: "Invalid id" };
    }
    await deleteIncome(ctx.effectiveUserId, planIdParsed.data, incomeIdParsed.data);
    await logImpersonatedMutation({
      action: "financePlanIncome.delete",
      entityTable: "finance_plan_incomes",
      entityId: incomeIdParsed.data,
    });
    revalidatePath(pathForPlan(planIdParsed.data));
    return { success: true as const };
  });
}

// ---------- expenses ----------

export async function addPlanExpenseAction(planId: string, input: PlanExpenseInput) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const idParsed = z.string().uuid().safeParse(planId);
    const parsed = planExpenseSchema.safeParse(input);
    if (!idParsed.success || !parsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    const row = await addExpense(ctx.effectiveUserId, idParsed.data, parsed.data);
    await logImpersonatedMutation({
      action: "financePlanExpense.create",
      entityTable: "finance_plan_expenses",
      entityId: row.id,
    });
    revalidatePath(pathForPlan(idParsed.data));
    return { success: true as const, data: row };
  });
}

export async function updatePlanExpenseAction(
  planId: string,
  input: UpdatePlanExpenseInput
) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const idParsed = z.string().uuid().safeParse(planId);
    const parsed = updatePlanExpenseSchema.safeParse(input);
    if (!idParsed.success || !parsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    const row = await updateExpense(ctx.effectiveUserId, idParsed.data, parsed.data);
    await logImpersonatedMutation({
      action: "financePlanExpense.update",
      entityTable: "finance_plan_expenses",
      entityId: row.id,
    });
    revalidatePath(pathForPlan(idParsed.data));
    return { success: true as const, data: row };
  });
}

export async function deletePlanExpenseAction(planId: string, expenseId: string) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const planIdParsed = z.string().uuid().safeParse(planId);
    const expenseIdParsed = z.string().uuid().safeParse(expenseId);
    if (!planIdParsed.success || !expenseIdParsed.success) {
      return { success: false as const, error: "Invalid id" };
    }
    await deleteExpense(ctx.effectiveUserId, planIdParsed.data, expenseIdParsed.data);
    await logImpersonatedMutation({
      action: "financePlanExpense.delete",
      entityTable: "finance_plan_expenses",
      entityId: expenseIdParsed.data,
    });
    revalidatePath(pathForPlan(planIdParsed.data));
    return { success: true as const };
  });
}

// ---------- debts ----------

export async function addPlanDebtAction(planId: string, input: PlanDebtInput) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const idParsed = z.string().uuid().safeParse(planId);
    const parsed = planDebtSchema.safeParse(input);
    if (!idParsed.success || !parsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    // Sanity: a debt with interest > 0 and payment = 0 (and no percent rule)
    // would grow forever in the projection. Reject at the action layer.
    if (
      parsed.data.paymentType === "fixed" &&
      parseFloat(parsed.data.monthlyPayment) === 0 &&
      parseFloat(parsed.data.monthlyInterestRate) > 0
    ) {
      return {
        success: false as const,
        error: "Fixed-payment debt with interest needs a non-zero monthly payment.",
      };
    }
    const row = await addDebt(ctx.effectiveUserId, idParsed.data, parsed.data);
    await logImpersonatedMutation({
      action: "financePlanDebt.create",
      entityTable: "finance_plan_debts",
      entityId: row.id,
    });
    revalidatePath(pathForPlan(idParsed.data));
    return { success: true as const, data: row };
  });
}

export async function updatePlanDebtAction(planId: string, input: UpdatePlanDebtInput) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const idParsed = z.string().uuid().safeParse(planId);
    const parsed = updatePlanDebtSchema.safeParse(input);
    if (!idParsed.success || !parsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    if (
      parsed.data.paymentType === "fixed" &&
      parseFloat(parsed.data.monthlyPayment) === 0 &&
      parseFloat(parsed.data.monthlyInterestRate) > 0
    ) {
      return {
        success: false as const,
        error: "Fixed-payment debt with interest needs a non-zero monthly payment.",
      };
    }
    const row = await updateDebt(ctx.effectiveUserId, idParsed.data, parsed.data);
    await logImpersonatedMutation({
      action: "financePlanDebt.update",
      entityTable: "finance_plan_debts",
      entityId: row.id,
    });
    revalidatePath(pathForPlan(idParsed.data));
    return { success: true as const, data: row };
  });
}

export async function deletePlanDebtAction(planId: string, debtId: string) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const planIdParsed = z.string().uuid().safeParse(planId);
    const debtIdParsed = z.string().uuid().safeParse(debtId);
    if (!planIdParsed.success || !debtIdParsed.success) {
      return { success: false as const, error: "Invalid id" };
    }
    await deleteDebt(ctx.effectiveUserId, planIdParsed.data, debtIdParsed.data);
    await logImpersonatedMutation({
      action: "financePlanDebt.delete",
      entityTable: "finance_plan_debts",
      entityId: debtIdParsed.data,
    });
    revalidatePath(pathForPlan(planIdParsed.data));
    return { success: true as const };
  });
}

// ---------- per-month line overrides ----------

export async function upsertLineOverrideAction(
  planId: string,
  input: LineOverrideInput
) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const idParsed = z.string().uuid().safeParse(planId);
    const parsed = lineOverrideSchema.safeParse(input);
    if (!idParsed.success || !parsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    await upsertLineOverride(ctx.effectiveUserId, idParsed.data, parsed.data);
    await logImpersonatedMutation({
      action: "financePlanLineOverride.upsert",
      entityTable: "finance_plan_line_overrides",
      entityId: parsed.data.parentId,
    });
    revalidatePath(pathForPlan(idParsed.data));
    return { success: true as const };
  });
}

export async function deleteLineOverrideAction(
  planId: string,
  input: DeleteLineOverrideInput
) {
  return safe("finance-plans", async () => {
    const ctx = await requireEffectiveContext();
    const idParsed = z.string().uuid().safeParse(planId);
    const parsed = deleteLineOverrideSchema.safeParse(input);
    if (!idParsed.success || !parsed.success) {
      return { success: false as const, error: "Invalid input" };
    }
    await deleteLineOverride(ctx.effectiveUserId, idParsed.data, parsed.data);
    await logImpersonatedMutation({
      action: "financePlanLineOverride.delete",
      entityTable: "finance_plan_line_overrides",
      entityId: parsed.data.parentId,
    });
    revalidatePath(pathForPlan(idParsed.data));
    return { success: true as const };
  });
}
