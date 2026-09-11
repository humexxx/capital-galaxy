import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/services/auth-server", () => ({
  requireAdminCached: vi.fn(),
}));

vi.mock("@/lib/services/interest-service", () => ({
  applyMonthlyInterest: vi.fn(),
  markInterestApplied: vi.fn(),
}));

vi.mock("@/lib/services/snapshot-service", () => ({
  createManualSnapshotsForAllPortfolios: vi.fn(),
  deleteManualSnapshotsForAllPortfolios: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { requireAdminCached } from "@/lib/services/auth-server";
import { applyMonthlyInterest } from "@/lib/services/interest-service";
import {
  createManualSnapshotsForAllPortfolios,
  deleteManualSnapshotsForAllPortfolios,
} from "@/lib/services/snapshot-service";

import {
  createManualSnapshotAction,
  deleteManualSnapshotsAction,
} from "./portfolio-snapshots";

// zod v4 enforces v4 UUIDs (version digit 4, variant digit 8-b).
const ADMIN_ID = "00000000-0000-4000-8000-0000000000aa";

beforeEach(() => {
  vi.mocked(requireAdminCached).mockResolvedValue({
    id: ADMIN_ID,
  } as unknown as Awaited<ReturnType<typeof requireAdminCached>>);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createManualSnapshotAction", () => {
  it("creates manual snapshots without applying interest (happy path)", async () => {
    vi.mocked(createManualSnapshotsForAllPortfolios).mockResolvedValueOnce({
      snapshotsCreated: 3,
      totalValue: 12345.67,
      portfoliosProcessed: 5,
    });

    const date = new Date("2026-01-15T00:00:00Z");
    const result = await createManualSnapshotAction({
      date,
      applyInterest: false,
      source: "manual",
    });

    expect(result).toEqual({
      success: true,
      totalValue: 12345.67,
      snapshotsCreated: 3,
    });
    expect(requireAdminCached).toHaveBeenCalledTimes(1);
    expect(applyMonthlyInterest).not.toHaveBeenCalled();
    expect(createManualSnapshotsForAllPortfolios).toHaveBeenCalledWith(
      date,
      "manual",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/portal/portfolio");
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("applies monthly interest first when applyInterest=true", async () => {
    vi.mocked(applyMonthlyInterest).mockResolvedValueOnce({
      portfoliosProcessed: 2,
      totalInterestApplied: 50,
    } as unknown as Awaited<ReturnType<typeof applyMonthlyInterest>>);
    vi.mocked(createManualSnapshotsForAllPortfolios).mockResolvedValueOnce({
      snapshotsCreated: 2,
      totalValue: 500,
      portfoliosProcessed: 2,
    });

    const date = new Date("2026-02-01T00:00:00Z");
    const result = await createManualSnapshotAction({
      date,
      applyInterest: true,
      source: "admin_enforce",
    });

    expect(result).toEqual({
      success: true,
      totalValue: 500,
      snapshotsCreated: 2,
    });
    expect(applyMonthlyInterest).toHaveBeenCalledWith(date);
    expect(createManualSnapshotsForAllPortfolios).toHaveBeenCalledWith(
      date,
      "admin_enforce",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/portal/portfolio");
  });

  it("propagates the admin-required rejection and skips all work", async () => {
    vi.mocked(requireAdminCached).mockRejectedValueOnce(
      new Error("Forbidden: Admin access required"),
    );

    await expect(
      createManualSnapshotAction({
        date: new Date("2026-01-15T00:00:00Z"),
        applyInterest: false,
        source: "manual",
      }),
    ).rejects.toThrow("Forbidden: Admin access required");

    expect(applyMonthlyInterest).not.toHaveBeenCalled();
    expect(createManualSnapshotsForAllPortfolios).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("throws when date is missing (zod .parse() rejects invalid input)", async () => {
    await expect(
      createManualSnapshotAction({
        // missing date — .parse() will throw
        applyInterest: false,
        source: "manual",
      } as never),
    ).rejects.toThrow();

    expect(applyMonthlyInterest).not.toHaveBeenCalled();
    expect(createManualSnapshotsForAllPortfolios).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("throws when source is not in the snapshot source enum", async () => {
    await expect(
      createManualSnapshotAction({
        date: new Date("2026-01-15T00:00:00Z"),
        applyInterest: false,
        source: "totally-bogus-source",
      } as never),
    ).rejects.toThrow();

    expect(createManualSnapshotsForAllPortfolios).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not revalidate when the snapshot service throws", async () => {
    vi.mocked(createManualSnapshotsForAllPortfolios).mockRejectedValueOnce(
      new Error("pg boom"),
    );

    await expect(
      createManualSnapshotAction({
        date: new Date("2026-01-15T00:00:00Z"),
        applyInterest: false,
        source: "manual",
      }),
    ).rejects.toThrow("pg boom");

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("deleteManualSnapshotsAction", () => {
  it("deletes manual snapshots and revalidates the portfolio page", async () => {
    vi.mocked(deleteManualSnapshotsForAllPortfolios).mockResolvedValueOnce({
      portfoliosProcessed: 4,
    } as unknown as Awaited<ReturnType<typeof deleteManualSnapshotsForAllPortfolios>>);

    const result = await deleteManualSnapshotsAction();

    expect(result).toEqual({ success: true, portfoliosProcessed: 4 });
    expect(requireAdminCached).toHaveBeenCalledTimes(1);
    expect(deleteManualSnapshotsForAllPortfolios).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/portal/portfolio");
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("propagates the admin-required rejection without deleting", async () => {
    vi.mocked(requireAdminCached).mockRejectedValueOnce(
      new Error("Forbidden: Admin access required"),
    );

    await expect(deleteManualSnapshotsAction()).rejects.toThrow(
      "Forbidden: Admin access required",
    );

    expect(deleteManualSnapshotsForAllPortfolios).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not revalidate when the service throws", async () => {
    vi.mocked(deleteManualSnapshotsForAllPortfolios).mockRejectedValueOnce(
      new Error("pg boom"),
    );

    await expect(deleteManualSnapshotsAction()).rejects.toThrow("pg boom");

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
