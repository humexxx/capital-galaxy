import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/services/impersonation", () => ({
  requireEffectiveContext: vi.fn(),
  logImpersonatedMutation: vi.fn(),
}));

vi.mock("@/lib/services/finance-confirmation-service", () => ({
  saveConfirmation: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { requireEffectiveContext } from "@/lib/services/impersonation";
import { saveConfirmation } from "@/lib/services/finance-confirmation-service";

import { saveConfirmationAction } from "./finance-confirmations";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const DEBT_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.mocked(requireEffectiveContext).mockResolvedValue({
    realUser: { id: USER_ID } as never,
    realRole: "user",
    impersonatedUser: null,
    effectiveUserId: USER_ID,
    isImpersonating: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("saveConfirmationAction", () => {
  const validInput = {
    planId: PLAN_ID,
    confirmedSavings: "1500.00",
    confirmedInvestments: "250.50",
    notes: "April actuals reconciled",
    debtBalances: [
      { debtId: DEBT_ID, confirmedBalance: "8000.25" },
    ],
  };

  it("saves the confirmation and revalidates the plan path on happy path", async () => {
    vi.mocked(saveConfirmation).mockResolvedValueOnce(undefined as never);

    const result = await saveConfirmationAction(validInput);

    expect(result).toEqual({ success: true });
    expect(saveConfirmation).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        planId: PLAN_ID,
        confirmedSavings: "1500.00",
        confirmedInvestments: "250.50",
        notes: "April actuals reconciled",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/portal/plans/${PLAN_ID}`);
    // The dashboard hosts the prompt and the calibrated card.
    expect(revalidatePath).toHaveBeenCalledWith("/portal");
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("accepts null notes and an empty debtBalances array", async () => {
    vi.mocked(saveConfirmation).mockResolvedValueOnce(undefined as never);

    const result = await saveConfirmationAction({
      planId: PLAN_ID,
      confirmedSavings: "0",
      confirmedInvestments: "0",
      notes: null,
      debtBalances: [],
    });

    expect(result).toEqual({ success: true });
    expect(saveConfirmation).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ planId: PLAN_ID, notes: null }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/portal/plans/${PLAN_ID}`);
  });

  it("rejects when planId is not a UUID", async () => {
    const result = await saveConfirmationAction({
      ...validInput,
      planId: "not-a-uuid",
    });

    expect(result).toEqual({ success: false, error: "Invalid input" });
    expect(saveConfirmation).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects when confirmedSavings has more than 2 decimal places", async () => {
    const result = await saveConfirmationAction({
      ...validInput,
      confirmedSavings: "100.123",
    });

    expect(result).toEqual({ success: false, error: "Invalid input" });
    expect(saveConfirmation).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects when confirmedInvestments is negative / malformed", async () => {
    const result = await saveConfirmationAction({
      ...validInput,
      confirmedInvestments: "-50",
    });

    expect(result).toEqual({ success: false, error: "Invalid input" });
    expect(saveConfirmation).not.toHaveBeenCalled();
  });

  it("rejects when a debt balance has an invalid debtId", async () => {
    const result = await saveConfirmationAction({
      ...validInput,
      debtBalances: [
        { debtId: "bad-uuid", confirmedBalance: "100.00" },
      ],
    });

    expect(result).toEqual({ success: false, error: "Invalid input" });
    expect(saveConfirmation).not.toHaveBeenCalled();
  });

  it("rejects when a debt balance has a malformed amount", async () => {
    const result = await saveConfirmationAction({
      ...validInput,
      debtBalances: [
        { debtId: DEBT_ID, confirmedBalance: "abc" },
      ],
    });

    expect(result).toEqual({ success: false, error: "Invalid input" });
    expect(saveConfirmation).not.toHaveBeenCalled();
  });

  it("rejects when notes exceed 1000 characters", async () => {
    const result = await saveConfirmationAction({
      ...validInput,
      notes: "x".repeat(1001),
    });

    expect(result).toEqual({ success: false, error: "Invalid input" });
    expect(saveConfirmation).not.toHaveBeenCalled();
  });

  it("uses the impersonated effectiveUserId, not the admin's real id", async () => {
    const IMPERSONATED = "33333333-3333-4333-8333-333333333333";
    vi.mocked(requireEffectiveContext).mockResolvedValueOnce({
      realUser: { id: USER_ID } as never,
      realRole: "admin",
      impersonatedUser: {
        id: IMPERSONATED,
        email: "x@y.com",
        fullName: "X",
      },
      effectiveUserId: IMPERSONATED,
      isImpersonating: true,
    });
    vi.mocked(saveConfirmation).mockResolvedValueOnce(undefined as never);

    await saveConfirmationAction(validInput);

    expect(saveConfirmation).toHaveBeenCalledWith(
      IMPERSONATED,
      expect.objectContaining({ planId: PLAN_ID }),
    );
  });

  it("swallows service-layer failures into the error envelope", async () => {
    vi.mocked(saveConfirmation).mockRejectedValueOnce(new Error("pg boom"));

    const result = await saveConfirmationAction(validInput);

    expect(result).toEqual({ success: false, error: "Action failed" });
    // revalidate is only called after the service succeeds.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unauthenticated requests as a swallowed error", async () => {
    vi.mocked(requireEffectiveContext).mockRejectedValueOnce(
      new Error("Unauthorized"),
    );

    const result = await saveConfirmationAction(validInput);

    expect(result).toEqual({ success: false, error: "Action failed" });
    expect(saveConfirmation).not.toHaveBeenCalled();
  });
});
