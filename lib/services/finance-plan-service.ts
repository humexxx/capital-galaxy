import "server-only";

import { cache } from "react";

import { db } from "@/db";
import {
  financePlans,
  financePlanIncomes,
  financePlanExpenses,
  financePlanDebts,
  financePlanLineOverrides,
} from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

import type {
  DebtStrategy,
  FinanceMood,
  FinancePlan,
  FinancePlanDebt,
  FinancePlanExpense,
  FinancePlanIncome,
  FinancePlanLineOverride,
  FinancePlanWithLines,
  Projection,
  ProjectionMonth,
} from "@/types/finance";
import type {
  CreateFinancePlanInput,
  DeleteLineOverrideInput,
  LineOverrideInput,
  PlanDebtInput,
  PlanExpenseInput,
  PlanIncomeInput,
  UpdateFinancePlanInput,
  UpdatePlanDebtInput,
  UpdatePlanExpenseInput,
  UpdatePlanIncomeInput,
} from "@/schemas/finance";

import {
  type Period,
  isDateInPeriod,
  iteratePeriods,
  periodLengthDays,
} from "@/lib/finance/period";

import { getUserPortfolio, getPortfolioStats, getPortfolioAssets } from "./portfolio-service";
import { ensureOwnedRow } from "./ownership";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------- helpers ----------

function num(value: string | number): number {
  return typeof value === "number" ? value : parseFloat(value || "0");
}

// Year-month integer (e.g. 2026-03 → 24315). Lets us compare months without
// dealing with timezones or day-of-month — purely a calendar bucket.
function yearMonthKey(year: number, monthZeroIdx: number): number {
  return year * 12 + monthZeroIdx;
}

function yearMonthKeyFromDate(date: Date): number {
  return yearMonthKey(date.getUTCFullYear(), date.getUTCMonth());
}

// Parses "YYYY-MM-DD" into a year-month key at UTC. Returns null for nullish
// inputs. We only care about year/month for the projection — the day is for
// the calendar view only.
function yearMonthKeyFromISO(value: string | null | undefined): number | null {
  if (!value) return null;
  const [y, m] = value.split("-").map((s) => parseInt(s, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return yearMonthKey(y, m - 1);
}

// Splits "YYYY-MM-DD" into its calendar parts (month is 0-indexed for parity
// with Date.prototype.getMonth). Used by the day-aware debt loop to decide
// whether a reschedule override's date lands inside the current projection
// month and on which day.
function parseISODateLocal(
  value: string
): { year: number; month: number; day: number } | null {
  const [y, m, d] = value.split("-").map((s) => parseInt(s, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  return { year: y, month: m - 1, day: d };
}

async function ensureOwnership(planId: string, userId: string): Promise<void> {
  await ensureOwnedRow({
    table: financePlans,
    idColumn: financePlans.id,
    id: planId,
    userId,
    entity: "Plan",
  });
}

// ---------- plan CRUD ----------

/**
 * Request-cached: the dashboard's finance card and the plans layout both list
 * the user's plans during one render, so the second call is free.
 */
export const listUserPlans = cache(async function listUserPlans(
  userId: string
): Promise<FinancePlan[]> {
  return db
    .select()
    .from(financePlans)
    .where(eq(financePlans.userId, userId))
    .orderBy(asc(financePlans.createdAt));
});

/**
 * Wrapped in React's `cache()` so calls from `generateMetadata` and the page
 * body within the same request hit the DB once. Args are part of the cache
 * key, so the per-user filter remains safe.
 */
export const getPlanWithLines = cache(async function getPlanWithLines(
  planId: string,
  userId: string
): Promise<FinancePlanWithLines | null> {
  const [plan] = await db
    .select()
    .from(financePlans)
    .where(and(eq(financePlans.id, planId), eq(financePlans.userId, userId)));
  if (!plan) return null;

  const [incomes, expenses, debts, overrides] = await Promise.all([
    db
      .select()
      .from(financePlanIncomes)
      .where(eq(financePlanIncomes.planId, planId))
      .orderBy(asc(financePlanIncomes.sortOrder), asc(financePlanIncomes.createdAt)),
    db
      .select()
      .from(financePlanExpenses)
      .where(eq(financePlanExpenses.planId, planId))
      .orderBy(asc(financePlanExpenses.sortOrder), asc(financePlanExpenses.createdAt)),
    db
      .select()
      .from(financePlanDebts)
      .where(eq(financePlanDebts.planId, planId))
      .orderBy(asc(financePlanDebts.sortOrder), asc(financePlanDebts.createdAt)),
    db
      .select()
      .from(financePlanLineOverrides)
      .where(eq(financePlanLineOverrides.planId, planId)),
  ]);

  return { ...plan, incomes, expenses, debts, overrides };
});

export async function createPlan(
  userId: string,
  data: CreateFinancePlanInput
): Promise<FinancePlan> {
  return db.transaction(async (tx) => {
    // Auto-set as main when the user has no plans yet. Keeps the
    // confirmation host / dashboard finance card pointed at something
    // useful from the very first plan onwards.
    const [existing] = await tx
      .select({ id: financePlans.id })
      .from(financePlans)
      .where(eq(financePlans.userId, userId))
      .limit(1);
    const shouldBeMain = !existing;

    const [plan] = await tx
      .insert(financePlans)
      .values({
        userId,
        name: data.name,
        description: data.description ?? null,
        startMonth: data.startMonth,
        monthsAhead: data.monthsAhead,
        initialSavings: data.initialSavings,
        monthlySavingsRate: data.monthlySavingsRate,
        includePortfolio: data.includePortfolio,
        surplusToDebtsPercent: data.surplusToDebtsPercent,
        debtStrategy: data.debtStrategy,
        autoInvestPercent: data.autoInvestPercent,
        autoInvestMethodId: data.autoInvestMethodId ?? null,
        initialInvestments: data.initialInvestments,
        confirmationDayOfMonth: data.confirmationDayOfMonth,
        color: data.color,
        isMain: shouldBeMain,
      })
      .returning();
    return plan;
  });
}

export async function updatePlan(
  userId: string,
  data: UpdateFinancePlanInput
): Promise<FinancePlan> {
  await ensureOwnership(data.id, userId);
  if (data.basedOnPlanId != null) {
    if (data.basedOnPlanId === data.id) {
      throw new Error("A plan cannot be based on itself");
    }
    // The base plan must exist and belong to the same user.
    await ensureOwnership(data.basedOnPlanId, userId);
  }
  const [plan] = await db
    .update(financePlans)
    .set({
      name: data.name,
      description: data.description ?? null,
      startMonth: data.startMonth,
      monthsAhead: data.monthsAhead,
      initialSavings: data.initialSavings,
      monthlySavingsRate: data.monthlySavingsRate,
      includePortfolio: data.includePortfolio,
      surplusToDebtsPercent: data.surplusToDebtsPercent,
      debtStrategy: data.debtStrategy,
      autoInvestPercent: data.autoInvestPercent,
      autoInvestMethodId: data.autoInvestMethodId ?? null,
      initialInvestments: data.initialInvestments,
      confirmationDayOfMonth: data.confirmationDayOfMonth,
      color: data.color,
      // undefined leaves the link untouched; null explicitly detaches.
      basedOnPlanId: data.basedOnPlanId,
      updatedAt: new Date(),
    })
    .where(eq(financePlans.id, data.id))
    .returning();
  return plan;
}

export async function deletePlan(userId: string, planId: string): Promise<void> {
  await ensureOwnership(planId, userId);
  await db.transaction(async (tx) => {
    // Was this the main plan? If so, after deletion we need to promote
    // another plan to keep the user with a main (so the confirmation host
    // and dashboard finance card still have a target).
    const [target] = await tx
      .select({ isMain: financePlans.isMain })
      .from(financePlans)
      .where(eq(financePlans.id, planId));

    await tx.delete(financePlans).where(eq(financePlans.id, planId));

    if (target?.isMain) {
      const [nextOldest] = await tx
        .select({ id: financePlans.id })
        .from(financePlans)
        .where(eq(financePlans.userId, userId))
        .orderBy(asc(financePlans.createdAt))
        .limit(1);
      if (nextOldest) {
        await tx
          .update(financePlans)
          .set({ isMain: true })
          .where(eq(financePlans.id, nextOldest.id));
      }
    }
  });
}

/**
 * Atomically marks `planId` as the user's main plan and clears the flag on
 * every other plan they own. Enforced at the DB level by the partial unique
 * index, but the transaction makes the swap race-free.
 */
export async function setMainPlan(
  userId: string,
  planId: string
): Promise<void> {
  await ensureOwnership(planId, userId);
  await db.transaction(async (tx) => {
    // Clear the flag on every other plan first so the partial unique index
    // doesn't fire when we try to set the new one.
    await tx
      .update(financePlans)
      .set({ isMain: false })
      .where(
        and(eq(financePlans.userId, userId), eq(financePlans.isMain, true))
      );
    await tx
      .update(financePlans)
      .set({ isMain: true })
      .where(eq(financePlans.id, planId));
  });
}

/** Repaints a single plan without touching any other field. */
export async function setPlanColor(
  userId: string,
  planId: string,
  color: string
): Promise<void> {
  await ensureOwnership(planId, userId);
  await db
    .update(financePlans)
    .set({ color, updatedAt: new Date() })
    .where(eq(financePlans.id, planId));
}

/**
 * Returns the user's main plan, or null if none has been marked.
 *
 * Request-cached: the dashboard's finance card and its confirmation host both
 * resolve the main plan in the same render.
 */
export const getMainPlan = cache(async function getMainPlan(
  userId: string
): Promise<FinancePlan | null> {
  const [plan] = await db
    .select()
    .from(financePlans)
    .where(and(eq(financePlans.userId, userId), eq(financePlans.isMain, true)))
    .limit(1);
  return plan ?? null;
});

export async function clonePlan(
  userId: string,
  sourcePlanId: string,
  newName: string,
  options: { asScenario?: boolean } = {}
): Promise<FinancePlan> {
  const source = await getPlanWithLines(sourcePlanId, userId);
  if (!source) throw new Error("Plan not found");

  const [plan] = await db
    .insert(financePlans)
    .values({
      userId,
      name: newName,
      description: source.description,
      startMonth: source.startMonth,
      monthsAhead: source.monthsAhead,
      initialSavings: source.initialSavings,
      monthlySavingsRate: source.monthlySavingsRate,
      includePortfolio: source.includePortfolio,
      surplusToDebtsPercent: source.surplusToDebtsPercent,
      debtStrategy: source.debtStrategy,
      autoInvestPercent: source.autoInvestPercent,
      autoInvestMethodId: source.autoInvestMethodId,
      initialInvestments: source.initialInvestments,
      // Keep the accounting-period anchor: without it the clone falls back to
      // day 1 and its periods drift out of alignment with the source plan.
      confirmationDayOfMonth: source.confirmationDayOfMonth,
      color: source.color,
      basedOnPlanId: options.asScenario ? source.id : null,
    })
    .returning();

  if (source.incomes.length > 0) {
    await db.insert(financePlanIncomes).values(
      source.incomes.map((i) => ({
        planId: plan.id,
        name: i.name,
        monthlyAmount: i.monthlyAmount,
        kind: i.kind,
        dayOfMonth: i.dayOfMonth,
        date: i.date,
        startDate: i.startDate,
        endDate: i.endDate,
        recurrenceType: i.recurrenceType,
        weekOfMonth: i.weekOfMonth,
        dayOfWeek: i.dayOfWeek,
        intervalMonths: i.intervalMonths,
        recurrenceStart: i.recurrenceStart,
        sortOrder: i.sortOrder,
      }))
    );
  }
  if (source.expenses.length > 0) {
    await db.insert(financePlanExpenses).values(
      source.expenses.map((e) => ({
        planId: plan.id,
        name: e.name,
        monthlyAmount: e.monthlyAmount,
        kind: e.kind,
        dayOfMonth: e.dayOfMonth,
        date: e.date,
        recurrenceType: e.recurrenceType,
        weekOfMonth: e.weekOfMonth,
        dayOfWeek: e.dayOfWeek,
        intervalMonths: e.intervalMonths,
        recurrenceStart: e.recurrenceStart,
        sortOrder: e.sortOrder,
      }))
    );
  }
  if (source.debts.length > 0) {
    await db.insert(financePlanDebts).values(
      source.debts.map((d) => ({
        planId: plan.id,
        name: d.name,
        initialBalance: d.initialBalance,
        monthlyInterestRate: d.monthlyInterestRate,
        monthlyPayment: d.monthlyPayment,
        paymentType: d.paymentType,
        minPaymentPercent: d.minPaymentPercent,
        minPaymentFloor: d.minPaymentFloor,
        dayOfMonth: d.dayOfMonth,
        recurrenceType: d.recurrenceType,
        weekOfMonth: d.weekOfMonth,
        dayOfWeek: d.dayOfWeek,
        intervalMonths: d.intervalMonths,
        recurrenceStart: d.recurrenceStart,
        sortOrder: d.sortOrder,
      }))
    );
  }

  return plan;
}

// ---------- income / expense / debt CRUD ----------

export async function addIncome(
  userId: string,
  planId: string,
  data: PlanIncomeInput
): Promise<FinancePlanIncome> {
  await ensureOwnership(planId, userId);
  const [row] = await db
    .insert(financePlanIncomes)
    .values({
      planId,
      name: data.name,
      monthlyAmount: data.monthlyAmount,
      kind: data.kind,
      dayOfMonth: data.dayOfMonth ?? null,
      date: data.kind === "one_time" ? data.date ?? null : null,
      startDate: data.kind === "recurring" ? data.startDate ?? null : null,
      endDate: data.kind === "recurring" ? data.endDate ?? null : null,
      recurrenceType: data.recurrenceType,
      weekOfMonth: data.weekOfMonth ?? null,
      dayOfWeek: data.dayOfWeek ?? null,
      intervalMonths: data.intervalMonths ?? null,
      recurrenceStart: data.recurrenceStart ?? null,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();
  return row;
}

export async function updateIncome(
  userId: string,
  planId: string,
  data: UpdatePlanIncomeInput
): Promise<FinancePlanIncome> {
  await ensureOwnership(planId, userId);
  const [row] = await db
    .update(financePlanIncomes)
    .set({
      name: data.name,
      monthlyAmount: data.monthlyAmount,
      kind: data.kind,
      dayOfMonth: data.dayOfMonth ?? null,
      date: data.kind === "one_time" ? data.date ?? null : null,
      startDate: data.kind === "recurring" ? data.startDate ?? null : null,
      endDate: data.kind === "recurring" ? data.endDate ?? null : null,
      recurrenceType: data.recurrenceType,
      weekOfMonth: data.weekOfMonth ?? null,
      dayOfWeek: data.dayOfWeek ?? null,
      intervalMonths: data.intervalMonths ?? null,
      recurrenceStart: data.recurrenceStart ?? null,
      sortOrder: data.sortOrder,
    })
    .where(and(eq(financePlanIncomes.id, data.id), eq(financePlanIncomes.planId, planId)))
    .returning();
  return row;
}

export async function deleteIncome(
  userId: string,
  planId: string,
  incomeId: string
): Promise<void> {
  await ensureOwnership(planId, userId);
  // Cascade: kill any per-month overrides pointing at this income. The DB
  // can't enforce it because parentId is a polymorphic FK.
  await db
    .delete(financePlanLineOverrides)
    .where(
      and(
        eq(financePlanLineOverrides.planId, planId),
        eq(financePlanLineOverrides.parentSide, "income"),
        eq(financePlanLineOverrides.parentId, incomeId)
      )
    );
  await db
    .delete(financePlanIncomes)
    .where(and(eq(financePlanIncomes.id, incomeId), eq(financePlanIncomes.planId, planId)));
}

export async function addExpense(
  userId: string,
  planId: string,
  data: PlanExpenseInput
): Promise<FinancePlanExpense> {
  await ensureOwnership(planId, userId);
  const [row] = await db
    .insert(financePlanExpenses)
    .values({
      planId,
      name: data.name,
      monthlyAmount: data.monthlyAmount,
      kind: data.kind,
      dayOfMonth: data.dayOfMonth ?? null,
      date: data.kind === "one_time" ? data.date ?? null : null,
      recurrenceType: data.recurrenceType,
      weekOfMonth: data.weekOfMonth ?? null,
      dayOfWeek: data.dayOfWeek ?? null,
      intervalMonths: data.intervalMonths ?? null,
      recurrenceStart: data.recurrenceStart ?? null,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();
  return row;
}

export async function updateExpense(
  userId: string,
  planId: string,
  data: UpdatePlanExpenseInput
): Promise<FinancePlanExpense> {
  await ensureOwnership(planId, userId);
  const [row] = await db
    .update(financePlanExpenses)
    .set({
      name: data.name,
      monthlyAmount: data.monthlyAmount,
      kind: data.kind,
      dayOfMonth: data.dayOfMonth ?? null,
      date: data.kind === "one_time" ? data.date ?? null : null,
      recurrenceType: data.recurrenceType,
      weekOfMonth: data.weekOfMonth ?? null,
      dayOfWeek: data.dayOfWeek ?? null,
      intervalMonths: data.intervalMonths ?? null,
      recurrenceStart: data.recurrenceStart ?? null,
      sortOrder: data.sortOrder,
    })
    .where(and(eq(financePlanExpenses.id, data.id), eq(financePlanExpenses.planId, planId)))
    .returning();
  return row;
}

export async function deleteExpense(
  userId: string,
  planId: string,
  expenseId: string
): Promise<void> {
  await ensureOwnership(planId, userId);
  await db
    .delete(financePlanLineOverrides)
    .where(
      and(
        eq(financePlanLineOverrides.planId, planId),
        eq(financePlanLineOverrides.parentSide, "expense"),
        eq(financePlanLineOverrides.parentId, expenseId)
      )
    );
  await db
    .delete(financePlanExpenses)
    .where(and(eq(financePlanExpenses.id, expenseId), eq(financePlanExpenses.planId, planId)));
}

export async function addDebt(
  userId: string,
  planId: string,
  data: PlanDebtInput
): Promise<FinancePlanDebt> {
  await ensureOwnership(planId, userId);
  const [row] = await db
    .insert(financePlanDebts)
    .values({
      planId,
      name: data.name,
      initialBalance: data.initialBalance,
      monthlyInterestRate: data.monthlyInterestRate,
      monthlyPayment: data.monthlyPayment,
      paymentType: data.paymentType,
      minPaymentPercent: data.minPaymentPercent,
      minPaymentFloor: data.minPaymentFloor,
      dayOfMonth: data.dayOfMonth ?? null,
      recurrenceType: data.recurrenceType,
      weekOfMonth: data.weekOfMonth ?? null,
      dayOfWeek: data.dayOfWeek ?? null,
      intervalMonths: data.intervalMonths ?? null,
      recurrenceStart: data.recurrenceStart ?? null,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();
  return row;
}

export async function updateDebt(
  userId: string,
  planId: string,
  data: UpdatePlanDebtInput
): Promise<FinancePlanDebt> {
  await ensureOwnership(planId, userId);
  const [row] = await db
    .update(financePlanDebts)
    .set({
      name: data.name,
      initialBalance: data.initialBalance,
      monthlyInterestRate: data.monthlyInterestRate,
      monthlyPayment: data.monthlyPayment,
      paymentType: data.paymentType,
      minPaymentPercent: data.minPaymentPercent,
      minPaymentFloor: data.minPaymentFloor,
      dayOfMonth: data.dayOfMonth ?? null,
      recurrenceType: data.recurrenceType,
      weekOfMonth: data.weekOfMonth ?? null,
      dayOfWeek: data.dayOfWeek ?? null,
      intervalMonths: data.intervalMonths ?? null,
      recurrenceStart: data.recurrenceStart ?? null,
      sortOrder: data.sortOrder,
    })
    .where(and(eq(financePlanDebts.id, data.id), eq(financePlanDebts.planId, planId)))
    .returning();
  return row;
}

export async function deleteDebt(
  userId: string,
  planId: string,
  debtId: string
): Promise<void> {
  await ensureOwnership(planId, userId);
  await db
    .delete(financePlanLineOverrides)
    .where(
      and(
        eq(financePlanLineOverrides.planId, planId),
        eq(financePlanLineOverrides.parentSide, "debt"),
        eq(financePlanLineOverrides.parentId, debtId)
      )
    );
  await db
    .delete(financePlanDebts)
    .where(and(eq(financePlanDebts.id, debtId), eq(financePlanDebts.planId, planId)));
}

// ---------- per-month line overrides ----------

/**
 * Upserts a single override for (parentSide, parentId, monthYear). The unique
 * index on those three columns makes this an idempotent replace: writing a
 * second override for the same recurring entry in the same month replaces
 * whatever was there before.
 */
export async function upsertLineOverride(
  userId: string,
  planId: string,
  data: LineOverrideInput
): Promise<void> {
  await ensureOwnership(planId, userId);
  await db
    .insert(financePlanLineOverrides)
    .values({
      planId,
      parentSide: data.parentSide,
      parentId: data.parentId,
      monthYear: data.monthYear,
      action: data.action,
      date: data.action === "reschedule" ? data.date ?? null : null,
      monthlyAmount:
        data.action === "amount" ? data.monthlyAmount ?? null : null,
    })
    .onConflictDoUpdate({
      target: [
        financePlanLineOverrides.parentSide,
        financePlanLineOverrides.parentId,
        financePlanLineOverrides.monthYear,
      ],
      set: {
        action: data.action,
        date: data.action === "reschedule" ? data.date ?? null : null,
        monthlyAmount:
          data.action === "amount" ? data.monthlyAmount ?? null : null,
      },
    });
}

export async function deleteLineOverride(
  userId: string,
  planId: string,
  data: DeleteLineOverrideInput
): Promise<void> {
  await ensureOwnership(planId, userId);
  await db
    .delete(financePlanLineOverrides)
    .where(
      and(
        eq(financePlanLineOverrides.planId, planId),
        eq(financePlanLineOverrides.parentSide, data.parentSide),
        eq(financePlanLineOverrides.parentId, data.parentId),
        eq(financePlanLineOverrides.monthYear, data.monthYear)
      )
    );
}

// ---------- projection algorithm ----------

type DebtRuntimeState = {
  id: string;
  name: string;
  balance: number;
  rate: number;
  // For 'fixed' debts this is the constant monthly payment. For 'percent_of_balance'
  // debts it is recomputed each month as max(balance * pct, floor).
  scheduledPaymentFixed: number;
  paymentType: import("@/types/finance").DebtPaymentType;
  minPercent: number;
  minFloor: number;
  // Recurrence model — see RecurrenceType. monthly_day / monthly_weekday hit
  // every month; every_n_months hits on the every-N cycle anchored at
  // anchorKey (interest still accrues every month, payments don't).
  recurrenceType: "monthly_day" | "monthly_weekday" | "every_n_months";
  intervalMonths: number | null;
  anchorKey: number | null;
  // Day-of-month fields drive WHEN inside a month the payment lands, which
  // the day-aware interest split uses to charge less interest when the
  // payment hits early.
  dayOfMonth: number | null;
  weekOfMonth: number | null;
  dayOfWeek: number | null;
};

// Day-of-month (1..lastDay) the debt payment lands on in (year, monthIdx).
// Mirrors the calendar's resolver so the projection charges interest against
// the same date the user sees on their calendar.
function nthWeekdayOfMonth(
  year: number,
  monthIdx: number,
  weekOfMonth: number,
  dayOfWeek: number
): number {
  const firstDow = new Date(year, monthIdx, 1).getDay();
  const firstOccurrence = 1 + ((dayOfWeek - firstDow + 7) % 7);
  let target = firstOccurrence + (weekOfMonth - 1) * 7;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  if (target > lastDay) target -= 7;
  return target;
}

function debtPaymentDayInMonth(
  d: DebtRuntimeState,
  year: number,
  monthIdx: number
): number {
  if (
    d.recurrenceType === "monthly_weekday" &&
    d.weekOfMonth != null &&
    d.dayOfWeek != null
  ) {
    return nthWeekdayOfMonth(year, monthIdx, d.weekOfMonth, d.dayOfWeek);
  }
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return Math.min(d.dayOfMonth ?? 1, lastDay);
}

// Shape that any recurring row (income / expense / debt) exposes for day
// resolution. Income/expense rows pass these from the DB columns; debts use
// the dedicated `debtPaymentDayInMonth` because they're already a richer
// runtime state.
type RecurringDayShape = {
  recurrenceType: "monthly_day" | "monthly_weekday" | "every_n_months";
  dayOfMonth: number | null;
  weekOfMonth: number | null;
  dayOfWeek: number | null;
};

// Day-of-month (1..lastDay) the recurring entry hits in (year, monthIdx).
// Same logic as the calendar's resolver so the projection / table / calendar
// all agree on placement for the same row + month.
function recurringHitDayInMonth(
  shape: RecurringDayShape,
  year: number,
  monthIdx: number
): number {
  if (
    shape.recurrenceType === "monthly_weekday" &&
    shape.weekOfMonth != null &&
    shape.dayOfWeek != null
  ) {
    return nthWeekdayOfMonth(year, monthIdx, shape.weekOfMonth, shape.dayOfWeek);
  }
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return Math.min(shape.dayOfMonth ?? 1, lastDay);
}

// True if the date (year, monthIdx, day) lands on/after startISO and on/before
// endISO. Either bound can be null (unbounded). Compared in UTC because the
// projection walks months in UTC. Replaces the old month-level active check so
// an income starting 2026-06-15 with dayOfMonth=1 does NOT contribute to June.
function dateWithinWindow(
  year: number,
  monthIdx: number,
  day: number,
  startISO: string | null,
  endISO: string | null
): boolean {
  const hitMs = Date.UTC(year, monthIdx, day);
  if (startISO) {
    const s = parseISODateLocal(startISO);
    if (s && Date.UTC(s.year, s.month, s.day) > hitMs) return false;
  }
  if (endISO) {
    const e = parseISODateLocal(endISO);
    if (e && Date.UTC(e.year, e.month, e.day) < hitMs) return false;
  }
  return true;
}

// Calendar months that overlap the given period (1 or 2 entries: a period
// either lives entirely in one month or straddles a single month boundary).
function monthsTouchedByPeriod(
  period: Period
): { year: number; monthIdx: number; monthKey: number }[] {
  const startY = period.start.getUTCFullYear();
  const startM = period.start.getUTCMonth();
  const endY = period.end.getUTCFullYear();
  const endM = period.end.getUTCMonth();
  const first = {
    year: startY,
    monthIdx: startM,
    monthKey: yearMonthKey(startY, startM),
  };
  if (startY === endY && startM === endM) {
    return [first];
  }
  return [
    first,
    {
      year: endY,
      monthIdx: endM,
      monthKey: yearMonthKey(endY, endM),
    },
  ];
}

// 1-indexed day within the period (1 = period.start, daysInPeriod = period.end).
function dayInPeriodFor(date: Date, period: Period): number {
  return (
    Math.round((date.getTime() - period.start.getTime()) / MS_PER_DAY) + 1
  );
}

// True if a recurring entry contributes to this month. monthly_day and
// monthly_weekday differ only in WHICH day inside the month — both contribute
// every month at the projection level. every_n_months contributes only on
// hit months in the cycle anchored at anchorKey.
function isRecurringHitMonth(
  monthKey: number,
  recurrenceType: "monthly_day" | "monthly_weekday" | "every_n_months",
  intervalMonths: number | null,
  anchorKey: number | null
): boolean {
  if (recurrenceType !== "every_n_months") return true;
  if (!intervalMonths || intervalMonths < 1 || anchorKey === null) return true;
  if (monthKey < anchorKey) return false;
  return (monthKey - anchorKey) % intervalMonths === 0;
}

function scheduledPaymentFor(d: DebtRuntimeState, balanceWithInterest: number): number {
  if (d.paymentType === "percent_of_balance") {
    const computed = balanceWithInterest * d.minPercent;
    return Math.max(computed, d.minFloor);
  }
  return d.scheduledPaymentFixed;
}

// Single epsilon used everywhere — debts below this are considered paid off.
// Same threshold as the active-filter so ordering and monthsToDebtFree agree.
const DEBT_PAID_EPS = 0.01;

function orderDebtsByStrategy(
  debts: DebtRuntimeState[],
  strategy: DebtStrategy
): DebtRuntimeState[] {
  const active = debts.filter((d) => d.balance > DEBT_PAID_EPS);
  // Tertiary tie-break by stable `id` so multiple debts with identical rate &
  // balance always order deterministically across runs.
  if (strategy === "avalanche") {
    return active.sort(
      (a, b) => b.rate - a.rate || b.balance - a.balance || a.id.localeCompare(b.id)
    );
  }
  if (strategy === "snowball") {
    return active.sort(
      (a, b) => a.balance - b.balance || b.rate - a.rate || a.id.localeCompare(b.id)
    );
  }
  return active;
}

type ProjectOptions = {
  portfolioValue?: number;
  /** Monthly growth rate (decimal) compounded onto portfolioValue each period.
   *  Callers derive it from the value-weighted ROI of the user's holdings via
   *  getPortfolioWeightedMonthlyRoi. 0 (default) holds the portfolio flat —
   *  the pre-growth behaviour. */
  portfolioMonthlyGrowthRate?: number;
  /** Monthly ROI (decimal) for the auto-invest account. Looked up from the plan's
   *  autoInvestMethodId by the calling page. Ignored if plan.autoInvestPercent = 0. */
  autoInvestRate?: number;
  /** Per-month overrides for recurring entries. Optional so old callers that
   *  don't have access to overrides still work (they project as if no
   *  overrides were set, which is correct for those caller surfaces). */
  overrides?: FinancePlanLineOverride[];
};

/**
 * Walks the plan month by month and returns a series with savings, debts,
 * investments, cash flow and net worth at the end of each period.
 *
 * Each month, in order:
 *   1. Interest accrues on each debt balance.
 *   2. The scheduled payment for each debt is applied (capped at balance).
 *      For 'percent_of_balance' debts (credit cards) the payment is recomputed
 *      from the current balance, so it shrinks as the debt shrinks → curved line.
 *   3. Cash flow = income − expenses − total scheduled payments.
 *   4. If cash flow > 0 and surplusToDebtsPercent > 0, route a slice to EXTRA
 *      debt principal using the chosen strategy.
 *   5. From what's left, optionally route autoInvestPercent into the investments
 *      bucket. The remainder goes to savings.
 *   6. Savings + investments accrue their monthly compound interest.
 *
 * portfolioValue (the user's live portfolio) is added to net worth. It never
 * earns the savings or investment rate; instead it compounds monthly at
 * portfolioMonthlyGrowthRate (the blended ROI of the user's holdings), or is
 * held flat when the rate is 0.
 */
export function projectPlan(
  plan: FinancePlan,
  incomes: FinancePlanIncome[],
  expenses: FinancePlanExpense[],
  debts: FinancePlanDebt[],
  options: ProjectOptions = {}
): Projection {
  const portfolioValue = Math.max(0, options.portfolioValue ?? 0);
  const portfolioGrowthRate = Math.max(0, options.portfolioMonthlyGrowthRate ?? 0);
  // Guard against negative ROI configurations — investments never shrink.
  const autoInvestRate = Math.max(0, options.autoInvestRate ?? 0);

  // Index overrides by side+parentId+monthKey so each iteration is O(1) lookup.
  // Overrides are an opt-in arg so older callers that don't pass them still
  // work (treated as no overrides → unchanged behaviour).
  const overrides = options.overrides ?? [];
  const overrideIndex = new Map<string, FinancePlanLineOverride>();
  for (const o of overrides) {
    const mKey = yearMonthKeyFromISO(o.monthYear);
    if (mKey === null) continue;
    overrideIndex.set(`${o.parentSide}:${o.parentId}:${mKey}`, o);
  }
  const lookupOverride = (
    side: "income" | "expense" | "debt",
    parentId: string,
    monthKey: number
  ): FinancePlanLineOverride | undefined =>
    overrideIndex.get(`${side}:${parentId}:${monthKey}`);

  // Anchor used by every_n_months when an entry doesn't set its own
  // recurrenceStart — fall back to the plan's startMonth.
  const planStartKey = yearMonthKeyFromDate(plan.startMonth);
  const anchorFor = (
    type: "monthly_day" | "monthly_weekday" | "every_n_months",
    recurrenceStart: string | null
  ): number | null =>
    type === "every_n_months"
      ? yearMonthKeyFromISO(recurrenceStart) ?? planStartKey
      : null;

  // Convert "YYYY-MM-DD" to a UTC Date so one-time entries can be checked for
  // period inclusion directly (no calendar-month bucketing).
  const isoToUtcDate = (iso: string | null | undefined): Date | null => {
    if (!iso) return null;
    const parts = parseISODateLocal(iso);
    return parts
      ? new Date(Date.UTC(parts.year, parts.month, parts.day))
      : null;
  };

  // Pre-compute per-line metadata so the inner loop is O(lines) per period
  // with no string parsing or branching surprises.
  const incomeRows = incomes.map((i) => ({
    id: i.id,
    amount: Math.max(0, num(i.monthlyAmount)),
    kind: i.kind,
    // Day-precise window — replaces the old month-level startKey/endKey so a
    // mid-month start (or end) excludes the month when the actual hit day
    // falls outside [startDate, endDate]. See `dateWithinWindow`.
    startISO: i.startDate,
    endISO: i.endDate,
    oneTimeDate: i.kind === "one_time" ? isoToUtcDate(i.date) : null,
    recurrenceType: i.recurrenceType,
    intervalMonths: i.intervalMonths,
    anchorKey: anchorFor(i.recurrenceType, i.recurrenceStart),
    // Calendar fields needed by `recurringHitDayInMonth` to resolve the day
    // the recurring entry lands on inside any given month.
    dayOfMonth: i.dayOfMonth,
    weekOfMonth: i.weekOfMonth,
    dayOfWeek: i.dayOfWeek,
  }));
  const expenseRows = expenses.map((e) => ({
    id: e.id,
    amount: Math.max(0, num(e.monthlyAmount)),
    kind: e.kind,
    oneTimeDate: e.kind === "one_time" ? isoToUtcDate(e.date) : null,
    recurrenceType: e.recurrenceType,
    intervalMonths: e.intervalMonths,
    anchorKey: anchorFor(e.recurrenceType, e.recurrenceStart),
    // Calendar fields needed by `recurringHitDayInMonth` for both recurring
    // and override-via-reschedule paths.
    dayOfMonth: e.dayOfMonth,
    weekOfMonth: e.weekOfMonth,
    dayOfWeek: e.dayOfWeek,
  }));

  const savingsRate = Math.max(0, num(plan.monthlySavingsRate));
  const surplusPercent = Math.max(0, Math.min(1, num(plan.surplusToDebtsPercent)));
  const autoInvestPercent = Math.max(0, Math.min(1, num(plan.autoInvestPercent)));
  // Validate the strategy enum so a stale value doesn't fall through to default.
  const rawStrategy = plan.debtStrategy as string;
  const strategy: DebtStrategy =
    rawStrategy === "avalanche" || rawStrategy === "snowball" || rawStrategy === "none"
      ? rawStrategy
      : "avalanche";

  let savings = num(plan.initialSavings);
  let investments = num(plan.initialInvestments);
  let portfolio = portfolioValue;
  const debtStates: DebtRuntimeState[] = debts.map((d) => ({
    id: d.id,
    name: d.name,
    balance: num(d.initialBalance),
    rate: num(d.monthlyInterestRate),
    scheduledPaymentFixed: num(d.monthlyPayment),
    paymentType: d.paymentType as import("@/types/finance").DebtPaymentType,
    minPercent: num(d.minPaymentPercent),
    minFloor: num(d.minPaymentFloor),
    recurrenceType: d.recurrenceType,
    intervalMonths: d.intervalMonths,
    anchorKey: anchorFor(d.recurrenceType, d.recurrenceStart),
    dayOfMonth: d.dayOfMonth,
    weekOfMonth: d.weekOfMonth,
    dayOfWeek: d.dayOfWeek,
  }));

  const months: ProjectionMonth[] = [];
  let monthsToDebtFree: number | null = null;
  // A debt list whose balances are all zero is no debt: without this a plan
  // with a paid-off card reported "debt-free in 1 mo" forever.
  const hadDebt = debts.some((d) => num(d.initialBalance) > DEBT_PAID_EPS);
  let totalInterestPaidAcrossAllDebts = 0;
  let totalInvestmentsInterestAcrossMonths = 0;

  const monthly = new Map<string, { interest: number; scheduled: number; extra: number }>();

  // Period iteration: each entry in `months` represents one accounting period
  // anchored at `plan.confirmationDayOfMonth`. A period runs from day N of
  // month X (clamped to month-end) through the day before the next anchor.
  // confirmationDayOfMonth=0 (feature disabled) collapses to day=1, which is
  // identical to calendar-month behaviour (start of month → end of month).
  const anchorDay =
    plan.confirmationDayOfMonth > 0 ? plan.confirmationDayOfMonth : 1;
  const periods = iteratePeriods(plan.startMonth, anchorDay, plan.monthsAhead);

  for (let m = 0; m < periods.length; m++) {
    monthly.clear();
    for (const d of debtStates) monthly.set(d.id, { interest: 0, scheduled: 0, extra: 0 });

    let scheduledTotal = 0;
    let interestTotal = 0;

    const period = periods[m];
    const daysInPeriod = periodLengthDays(period);
    // A period overlaps at most two calendar months. Recurrence and override
    // lookups still key off the calendar month the hit-date falls in, so a
    // monthly entry contributes once per period even when the period straddles
    // a month boundary.
    const candidateMonths = monthsTouchedByPeriod(period);

    let monthIncome = 0;
    for (const row of incomeRows) {
      if (row.kind === "one_time") {
        if (row.oneTimeDate && isDateInPeriod(row.oneTimeDate, period)) {
          monthIncome += row.amount;
        }
        continue;
      }
      for (const cm of candidateMonths) {
        if (
          !isRecurringHitMonth(
            cm.monthKey,
            row.recurrenceType,
            row.intervalMonths,
            row.anchorKey
          )
        ) {
          continue;
        }
        const hitDay = recurringHitDayInMonth(row, cm.year, cm.monthIdx);
        const hitDate = new Date(Date.UTC(cm.year, cm.monthIdx, hitDay));
        if (!isDateInPeriod(hitDate, period)) continue;
        // Day-precise window — see `dateWithinWindow` for the rationale.
        if (
          !dateWithinWindow(
            cm.year,
            cm.monthIdx,
            hitDay,
            row.startISO,
            row.endISO
          )
        ) {
          continue;
        }
        const ov = lookupOverride("income", row.id, cm.monthKey);
        if (ov?.action === "skip") continue;
        const amount =
          ov?.action === "amount" && ov.monthlyAmount !== null
            ? Math.max(0, num(ov.monthlyAmount))
            : row.amount;
        monthIncome += amount;
      }
    }

    let monthExpenses = 0;
    for (const row of expenseRows) {
      if (row.kind === "one_time") {
        if (row.oneTimeDate && isDateInPeriod(row.oneTimeDate, period)) {
          monthExpenses += row.amount;
        }
        continue;
      }
      for (const cm of candidateMonths) {
        if (
          !isRecurringHitMonth(
            cm.monthKey,
            row.recurrenceType,
            row.intervalMonths,
            row.anchorKey
          )
        ) {
          continue;
        }
        const hitDay = recurringHitDayInMonth(row, cm.year, cm.monthIdx);
        const hitDate = new Date(Date.UTC(cm.year, cm.monthIdx, hitDay));
        if (!isDateInPeriod(hitDate, period)) continue;
        const ov = lookupOverride("expense", row.id, cm.monthKey);
        if (ov?.action === "skip") continue;
        const amount =
          ov?.action === "amount" && ov.monthlyAmount !== null
            ? Math.max(0, num(ov.monthlyAmount))
            : row.amount;
        monthExpenses += amount;
      }
    }

    // Step 1 + 2: day-aware interest + scheduled payment. We charge interest
    // on the pre-payment balance for the days from period start up to (but
    // not including) the payment, apply the payment, then charge interest on
    // the post-payment balance for the remaining days. When no payment falls
    // inside the period (every_n_months gaps, skip overrides), the whole
    // period accrues interest with no scheduled outflow.
    for (const d of debtStates) {
      if (d.balance <= 0) continue;

      // Find the calendar month inside the period whose anchor hits this
      // debt's recurrence — and whose payment-date falls inside the period.
      let paymentDate: Date | null = null;
      let paymentMonthKey: number | null = null;
      for (const cm of candidateMonths) {
        if (
          !isRecurringHitMonth(
            cm.monthKey,
            d.recurrenceType,
            d.intervalMonths,
            d.anchorKey
          )
        ) {
          continue;
        }
        const day = debtPaymentDayInMonth(d, cm.year, cm.monthIdx);
        const date = new Date(Date.UTC(cm.year, cm.monthIdx, day));
        if (!isDateInPeriod(date, period)) continue;
        paymentDate = date;
        paymentMonthKey = cm.monthKey;
        break;
      }

      const ov =
        paymentMonthKey !== null
          ? lookupOverride("debt", d.id, paymentMonthKey)
          : undefined;

      // No payment this period → straight interest on the whole period, no
      // scheduled outflow.
      if (!paymentDate || ov?.action === "skip") {
        const interest = d.balance * d.rate;
        d.balance += interest;
        interestTotal += interest;
        const entry = monthly.get(d.id)!;
        entry.interest = interest;
        entry.scheduled = 0;
        continue;
      }

      // Reschedule overrides win when their explicit date falls inside the
      // same period.
      if (ov?.action === "reschedule" && ov.date) {
        const od = parseISODateLocal(ov.date);
        if (od) {
          const reschedDate = new Date(Date.UTC(od.year, od.month, od.day));
          if (isDateInPeriod(reschedDate, period)) {
            paymentDate = reschedDate;
          }
        }
      }

      // Two-halves interest: (dayInPeriod - 1) days at the pre-payment
      // balance, then payment, then the remaining (daysInPeriod - daysBefore)
      // days at the post-payment balance. Reduces to "full period before
      // payment" when payment lands on the last day, and "no pre-payment
      // interest" when payment lands on the first day.
      const dayInPeriod = dayInPeriodFor(paymentDate, period);
      const daysBefore = Math.max(0, dayInPeriod - 1);
      const interestBefore =
        d.balance * d.rate * (daysBefore / daysInPeriod);
      d.balance += interestBefore;

      const scheduled =
        ov?.action === "amount" && ov.monthlyAmount !== null
          ? Math.max(0, num(ov.monthlyAmount))
          : scheduledPaymentFor(d, d.balance);
      const payment = Math.min(scheduled, d.balance);
      d.balance -= payment;

      const daysAfter = daysInPeriod - daysBefore;
      const interestAfter =
        d.balance * d.rate * (daysAfter / daysInPeriod);
      d.balance += interestAfter;

      const totalInterest = interestBefore + interestAfter;
      interestTotal += totalInterest;
      scheduledTotal += payment;
      const entry = monthly.get(d.id)!;
      entry.interest = totalInterest;
      entry.scheduled = payment;
    }

    const cashFlow = monthIncome - monthExpenses - scheduledTotal;

    // Step 4: surplus → extra debt principal.
    let extraTotal = 0;
    if (cashFlow > 0 && surplusPercent > 0 && strategy !== "none") {
      let extraBudget = cashFlow * surplusPercent;
      for (const d of orderDebtsByStrategy(debtStates, strategy)) {
        if (extraBudget <= 0) break;
        if (d.balance <= 0) continue;
        const extra = Math.min(extraBudget, d.balance);
        d.balance -= extra;
        extraBudget -= extra;
        extraTotal += extra;
        monthly.get(d.id)!.extra = extra;
      }
    }

    totalInterestPaidAcrossAllDebts += interestTotal;
    const totalDebtPayments = scheduledTotal + extraTotal;
    const cashAfterDebts = cashFlow - extraTotal;

    // Step 5: remainder splits between auto-invest and savings.
    let investmentsContribution = 0;
    let savingsContribution = cashAfterDebts;
    if (cashAfterDebts > 0 && autoInvestPercent > 0) {
      investmentsContribution = cashAfterDebts * autoInvestPercent;
      savingsContribution = cashAfterDebts - investmentsContribution;
    }

    // Step 6: compound interest on both buckets. Savings may go NEGATIVE — a
    // sustained deficit (expenses + debt service > income) is carried forward as
    // negative cash so net worth reflects the real shortfall instead of silently
    // clipping it to zero (which over-stated the projection). Interest only
    // accrues on a positive balance: an overdraft doesn't earn the savings rate.
    const savingsBeforeInterest = savings + savingsContribution;
    const savingsInterest = Math.max(0, savingsBeforeInterest) * savingsRate;
    // Round to cents each month to avoid floating-point drift over 120 iterations.
    savings = Math.round((savingsBeforeInterest + savingsInterest) * 100) / 100;

    const investmentsBeforeInterest = Math.max(0, investments + investmentsContribution);
    const investmentsInterest = investmentsBeforeInterest * autoInvestRate;
    investments =
      Math.round((investmentsBeforeInterest + investmentsInterest) * 100) / 100;
    totalInvestmentsInterestAcrossMonths += investmentsInterest;

    // The live portfolio compounds at its blended holdings ROI, on the same
    // period-end cadence as savings/investments. Rate 0 → held flat.
    portfolio = Math.round(portfolio * (1 + portfolioGrowthRate) * 100) / 100;

    const totalDebt = debtStates.reduce((s, d) => s + d.balance, 0);
    const netWorth = savings + investments + portfolio - totalDebt;

    if (monthsToDebtFree === null && totalDebt <= DEBT_PAID_EPS && hadDebt) {
      monthsToDebtFree = m + 1;
    }

    months.push({
      monthOffset: m,
      date: period.start,
      income: monthIncome,
      expenses: monthExpenses,
      scheduledDebtPayments: scheduledTotal,
      extraDebtPayments: extraTotal,
      debtPayments: totalDebtPayments,
      totalInterestAccrued: interestTotal,
      cashFlow,
      savings,
      savingsInterest,
      investments,
      investmentsContribution,
      investmentsInterest,
      totalDebt,
      portfolioValue: portfolio,
      netWorth,
      debts: debtStates.map((d) => {
        const m = monthly.get(d.id)!;
        return {
          debtId: d.id,
          name: d.name,
          balance: d.balance,
          scheduledPayment: m.scheduled,
          extraPayment: m.extra,
          interestAccrued: m.interest,
        };
      }),
    });
  }

  const endingDebt = debtStates.reduce((s, d) => s + d.balance, 0);
  return {
    plan,
    months,
    endingSavings: savings,
    endingInvestments: investments,
    endingDebt,
    endingNetWorth: savings + investments + portfolio - endingDebt,
    monthsToDebtFree,
    totalInterestPaid: totalInterestPaidAcrossAllDebts,
    totalInvestmentsInterest: totalInvestmentsInterestAcrossMonths,
  };
}

/**
 * Runs the projection three times — once per strategy — to surface which one
 * pays off debt faster and saves the most interest. surplusToDebtsPercent is
 * forced to a usable value (the plan's, or 60% if the plan currently has 0)
 * so the comparison is meaningful even when the user has not enabled it yet.
 */
export function compareDebtStrategies(
  plan: FinancePlan,
  incomes: FinancePlanIncome[],
  expenses: FinancePlanExpense[],
  debts: FinancePlanDebt[],
  options: ProjectOptions = {}
): import("@/types/finance").StrategyComparison {
  const surplusForCompare =
    num(plan.surplusToDebtsPercent) > 0 ? plan.surplusToDebtsPercent : "0.6";

  const runWith = (strategy: DebtStrategy) =>
    projectPlan(
      { ...plan, debtStrategy: strategy, surplusToDebtsPercent: surplusForCompare },
      incomes,
      expenses,
      debts,
      options
    );

  const av = runWith("avalanche");
  const sn = runWith("snowball");
  const no = runWith("none");

  const summarize = (p: Projection) => ({
    totalInterestPaid: p.totalInterestPaid,
    monthsToDebtFree: p.monthsToDebtFree,
    endingNetWorth: p.endingNetWorth,
  });

  const a = summarize(av);
  const s = summarize(sn);
  const n = summarize(no);

  // Recommended = lower total interest paid (math-optimal). Avalanche almost
  // always wins; we still surface snowball numbers for the user to choose.
  const recommended: DebtStrategy =
    a.totalInterestPaid <= s.totalInterestPaid ? "avalanche" : "snowball";

  const winner = recommended === "avalanche" ? a : s;
  const worst = a.totalInterestPaid >= s.totalInterestPaid ? a : s;

  return {
    avalanche: a,
    snowball: s,
    none: n,
    recommended,
    interestSaved: Math.max(0, worst.totalInterestPaid - winner.totalInterestPaid),
    monthsSaved: Math.max(
      0,
      (worst.monthsToDebtFree ?? plan.monthsAhead) -
        (winner.monthsToDebtFree ?? plan.monthsAhead)
    ),
  };
}

/** Request-cached: every projection on a plans page asks for this. */
export const getPortfolioValueForUser = cache(async function getPortfolioValueForUser(
  userId: string
): Promise<number> {
  const portfolio = await getUserPortfolio(userId);
  if (!portfolio) return 0;
  const stats = await getPortfolioStats(portfolio.id);
  return stats.totalValue;
});

/**
 * Value-weighted average monthly ROI (as a decimal) of the user's current
 * portfolio holdings. Weights each investment method's monthly ROI by the
 * holding value. Returns 0 when the user has no portfolio or no holdings,
 * which makes projections hold the portfolio flat (the safe fallback).
 */
export const getPortfolioWeightedMonthlyRoi = cache(async function getPortfolioWeightedMonthlyRoi(
  userId: string
): Promise<number> {
  const portfolio = await getUserPortfolio(userId);
  if (!portfolio) return 0;
  const assets = await getPortfolioAssets(portfolio.id);
  let weightedRoi = 0;
  let totalWeight = 0;
  for (const asset of assets) {
    if (asset.holdingAmount <= 0) continue;
    // monthly_roi is stored as a percentage (e.g. "0.7000" = 0.70%).
    weightedRoi += asset.holdingAmount * (num(asset.investmentMethod.monthlyRoi) / 100);
    totalWeight += asset.holdingAmount;
  }
  return totalWeight > 0 ? weightedRoi / totalWeight : 0;
});

/**
 * Resolves the monthly ROI (as a decimal) of the plan's auto-invest method, or
 * 0 if none is linked. Used to compound the investments bucket during projection.
 */
export async function getAutoInvestRate(plan: FinancePlan): Promise<number> {
  if (!plan.autoInvestMethodId) return 0;
  const { investmentMethods } = await import("@/db/schema");
  const [row] = await db
    .select({ monthlyRoi: investmentMethods.monthlyRoi })
    .from(investmentMethods)
    .where(eq(investmentMethods.id, plan.autoInvestMethodId));
  if (!row) return 0;
  // monthly_roi is stored as a percentage (e.g. "0.7000" = 0.70%). Convert to a
  // decimal multiplier the projection algorithm can apply directly.
  return num(row.monthlyRoi) / 100;
}

export async function projectPlanWithPortfolio(
  plan: FinancePlanWithLines,
  userId: string
): Promise<Projection> {
  const [portfolioValue, portfolioMonthlyGrowthRate, autoInvestRate] = await Promise.all([
    plan.includePortfolio ? getPortfolioValueForUser(userId) : Promise.resolve(0),
    plan.includePortfolio ? getPortfolioWeightedMonthlyRoi(userId) : Promise.resolve(0),
    getAutoInvestRate(plan),
  ]);
  return projectPlan(plan, plan.incomes, plan.expenses, plan.debts, {
    portfolioValue,
    portfolioMonthlyGrowthRate,
    autoInvestRate,
    overrides: plan.overrides,
  });
}

/**
 * Reads a projection as one of four moods, used to pose the finance mascot.
 *
 * | mood       | when                                                    |
 * | ---------- | ------------------------------------------------------- |
 * | `strained` | the plan ends underwater (negative net worth)            |
 * | `steady`   | solvent, but debt outlives the horizon or growth is flat |
 * | `thriving` | debt cleared **and** net worth grew over the horizon     |
 *
 * Exported for tests; prefer `getFinanceMood` from app code.
 */
export function deriveFinanceMood(projection: Projection): FinanceMood {
  const first = projection.months[0];
  const last = projection.months.at(-1);
  if (!last) return "idle";

  if (projection.endingNetWorth < 0) return "strained";

  const debtCleared =
    projection.monthsToDebtFree !== null || projection.endingDebt <= 0.01;
  const grew = first ? last.netWorth > first.netWorth : last.netWorth > 0;

  return debtCleared && grew ? "thriving" : "steady";
}

/**
 * Mood of the user's main plan. Wrapped in React's `cache()` so the plans
 * layout and any page rendering in the same request share one computation;
 * `getPlanWithLines` is itself cached, so this adds no extra DB round-trip when
 * the page already loaded that plan.
 */
export const getFinanceMood = cache(async function getFinanceMood(
  userId: string
): Promise<FinanceMood> {
  const plan = await getMainPlan(userId);
  if (!plan) return "idle";

  const full = await getPlanWithLines(plan.id, userId);
  if (!full) return "idle";

  return deriveFinanceMood(await projectPlanWithPortfolio(full, userId));
});

export async function listInvestmentMethods(
  options: { includeDisabled?: boolean } = {}
): Promise<Array<{ id: string; name: string; monthlyRoi: string; enabled: boolean }>> {
  const { investmentMethods } = await import("@/db/schema");
  const rows = await db
    .select({
      id: investmentMethods.id,
      name: investmentMethods.name,
      monthlyRoi: investmentMethods.monthlyRoi,
      enabled: investmentMethods.enabled,
    })
    .from(investmentMethods)
    .orderBy(asc(investmentMethods.name));
  return options.includeDisabled ? rows : rows.filter((r) => r.enabled);
}
