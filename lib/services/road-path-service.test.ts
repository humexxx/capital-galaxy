import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// road-path-service mixes three access shapes:
//   - `db.query.<table>.findMany / findFirst` (relational query API)
//   - `db.select().from().where()` (ownership checks via `ensureOwnedRow`)
//   - `db.insert / update / delete` (builder API, terminated by `.returning()`
//     or `.where()`).
// We mock all of them at the `@/db` boundary so the service can be exercised
// without a real Postgres connection.

const roadPathsFindMany = vi.fn();
const roadPathsFindFirst = vi.fn();
const roadPathMilestonesFindMany = vi.fn();
const roadPathMilestonesFindFirst = vi.fn();
const roadPathProgressFindMany = vi.fn();
const roadPathProgressFindFirst = vi.fn();

const selectMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    query: {
      roadPaths: {
        findMany: (...args: unknown[]) => roadPathsFindMany(...args),
        findFirst: (...args: unknown[]) => roadPathsFindFirst(...args),
      },
      roadPathMilestones: {
        findMany: (...args: unknown[]) => roadPathMilestonesFindMany(...args),
        findFirst: (...args: unknown[]) => roadPathMilestonesFindFirst(...args),
      },
      roadPathProgress: {
        findMany: (...args: unknown[]) => roadPathProgressFindMany(...args),
        findFirst: (...args: unknown[]) => roadPathProgressFindFirst(...args),
      },
    },
    insert: (...args: unknown[]) => insertMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
    transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        insert: (...args: unknown[]) => insertMock(...args),
        update: (...args: unknown[]) => updateMock(...args),
        delete: (...args: unknown[]) => deleteMock(...args),
        query: {
          roadPathProgress: {
            findFirst: (...args: unknown[]) => roadPathProgressFindFirst(...args),
          },
        },
      }),
  },
}));

import {
  calculateRoadPathStats,
  createRoadPath,
  createRoadPathMilestone,
  createRoadPathProgress,
  deleteRoadPath,
  deleteRoadPathMilestone,
  deleteRoadPathProgress,
  getNextMilestoneOrder,
  getRoadPath,
  getRoadPathMilestones,
  getRoadPathProgress,
  getUserRoadPaths,
  updateRoadPath,
  updateRoadPathMilestone,
} from "./road-path-service";
import type {
  RoadPath,
  RoadPathMilestone,
  RoadPathProgress,
  RoadPathWithDetails,
} from "@/types";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000000002";
const ROAD_PATH_ID = "00000000-0000-0000-0000-0000000000aa";
const MILESTONE_ID = "00000000-0000-0000-0000-0000000000bb";
const PROGRESS_ID = "00000000-0000-0000-0000-0000000000cc";

// ---------- chain builders ----------

function mockOwnershipSelect(rows: unknown[]) {
  // ensureOwnedRow: db.select().from(roadPaths).where(eq(id)) -> rows
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  selectMock.mockReturnValueOnce(chain);
  return chain;
}

function mockInsertReturning<T>(row: T) {
  // db.insert(table).values(...).returning() -> [row]
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([row]),
  };
  insertMock.mockReturnValue(chain);
  return chain;
}

function mockUpdateReturning<T>(row: T) {
  // db.update(table).set(...).where(...).returning() -> [row]
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([row]),
  };
  updateMock.mockReturnValue(chain);
  return chain;
}

function mockUpdateNoReturning() {
  // db.update(table).set(...).where(...) (resolves with no .returning())
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  updateMock.mockReturnValue(chain);
  return chain;
}

function mockDeleteWhere() {
  // db.delete(table).where(...)
  const chain = {
    where: vi.fn().mockResolvedValue(undefined),
  };
  deleteMock.mockReturnValue(chain);
  return chain;
}

// ---------- fixture factories ----------

function buildPath(overrides: Partial<RoadPath> = {}): RoadPath {
  return {
    id: ROAD_PATH_ID,
    userId: USER_ID,
    title: "Test Path",
    description: null,
    targetValue: "100",
    currentValue: "0",
    unit: "km",
    startDate: new Date("2026-01-01T00:00:00Z"),
    targetDate: new Date("2026-12-31T00:00:00Z"),
    autoCreateTasks: false,
    taskFrequency: null,
    completedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as unknown as RoadPath;
}

function buildPathWithDetails(
  overrides: Partial<RoadPathWithDetails> = {}
): RoadPathWithDetails {
  return {
    ...buildPath(),
    milestones: [],
    progress: [],
    tasks: [],
    ...overrides,
  } as unknown as RoadPathWithDetails;
}

function buildMilestone(
  overrides: Partial<RoadPathMilestone> = {}
): RoadPathMilestone {
  return {
    id: MILESTONE_ID,
    roadPathId: ROAD_PATH_ID,
    title: "Milestone",
    description: null,
    targetValue: "50",
    order: 0,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as RoadPathMilestone;
}

function buildProgress(
  overrides: Partial<RoadPathProgress> = {}
): RoadPathProgress {
  return {
    id: PROGRESS_ID,
    roadPathId: ROAD_PATH_ID,
    value: "10",
    notes: null,
    date: new Date("2026-02-01T00:00:00Z"),
    createdAt: new Date(),
    ...overrides,
  } as unknown as RoadPathProgress;
}

// ---------- shared lifecycle ----------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------- getUserRoadPaths ----------

describe("getUserRoadPaths", () => {
  it("returns paths fetched with relations for the given user", async () => {
    const rows = [buildPathWithDetails(), buildPathWithDetails({ id: "p-2" })];
    roadPathsFindMany.mockResolvedValueOnce(rows);

    const result = await getUserRoadPaths(USER_ID);

    expect(result).toEqual(rows);
    expect(roadPathsFindMany).toHaveBeenCalledTimes(1);
    const opts = roadPathsFindMany.mock.calls[0][0];
    // Sanity-check that relations were requested.
    expect(opts.with).toBeTruthy();
    expect(opts.with.milestones).toBeTruthy();
    expect(opts.with.progress).toBeTruthy();
    expect(opts.with.tasks).toBeTruthy();
  });

  it("returns [] when the user has no paths", async () => {
    roadPathsFindMany.mockResolvedValueOnce([]);
    await expect(getUserRoadPaths(USER_ID)).resolves.toEqual([]);
  });
});

// ---------- getRoadPath ----------

describe("getRoadPath", () => {
  it("returns the path when found", async () => {
    const path = buildPathWithDetails();
    roadPathsFindFirst.mockResolvedValueOnce(path);

    const result = await getRoadPath(ROAD_PATH_ID, USER_ID);

    expect(result).toEqual(path);
    expect(roadPathsFindFirst).toHaveBeenCalledTimes(1);
  });

  it("returns null when no path matches", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(undefined);
    await expect(getRoadPath(ROAD_PATH_ID, USER_ID)).resolves.toBeNull();
  });
});

// ---------- createRoadPath ----------

describe("createRoadPath", () => {
  it("inserts a new path and returns it", async () => {
    const created = buildPath();
    const chain = mockInsertReturning(created);

    const result = await createRoadPath(USER_ID, {
      title: "Run 100km",
      description: "yearly goal",
      targetValue: 100,
      unit: "km",
      startDate: new Date("2026-01-01T00:00:00Z"),
      targetDate: new Date("2026-12-31T00:00:00Z"),
      autoCreateTasks: false,
      taskFrequency: null,
    });

    expect(result).toEqual(created);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const values = chain.values.mock.calls[0][0];
    expect(values.userId).toBe(USER_ID);
    expect(values.title).toBe("Run 100km");
    // numeric column -> string
    expect(values.targetValue).toBe("100");
    expect(values.autoCreateTasks).toBe(false);
  });

  it("defaults autoCreateTasks to false when omitted", async () => {
    const created = buildPath();
    const chain = mockInsertReturning(created);

    await createRoadPath(USER_ID, {
      title: "Read more",
      startDate: new Date("2026-01-01"),
    } as unknown as Parameters<typeof createRoadPath>[1]);

    expect(chain.values.mock.calls[0][0].autoCreateTasks).toBe(false);
  });

  it("passes undefined targetValue through as undefined (not '0')", async () => {
    const created = buildPath();
    const chain = mockInsertReturning(created);

    await createRoadPath(USER_ID, {
      title: "Habit",
      startDate: new Date("2026-01-01"),
    } as unknown as Parameters<typeof createRoadPath>[1]);

    expect(chain.values.mock.calls[0][0].targetValue).toBeUndefined();
  });
});

// ---------- updateRoadPath ----------

describe("updateRoadPath", () => {
  it("stringifies numeric targetValue and currentValue", async () => {
    const updated = buildPath({ currentValue: "42" });
    const chain = mockUpdateReturning(updated);

    const result = await updateRoadPath(ROAD_PATH_ID, USER_ID, {
      title: "Renamed",
      targetValue: 200,
      currentValue: 42,
    } as unknown as Parameters<typeof updateRoadPath>[2]);

    expect(result).toEqual(updated);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const setPayload = chain.set.mock.calls[0][0];
    expect(setPayload.title).toBe("Renamed");
    expect(setPayload.targetValue).toBe("200");
    expect(setPayload.currentValue).toBe("42");
    expect(setPayload.updatedAt).toBeInstanceOf(Date);
  });

  it("explicit null targetValue is preserved as null", async () => {
    const updated = buildPath({ targetValue: null });
    const chain = mockUpdateReturning(updated);

    await updateRoadPath(ROAD_PATH_ID, USER_ID, {
      targetValue: null,
    } as unknown as Parameters<typeof updateRoadPath>[2]);

    expect(chain.set.mock.calls[0][0].targetValue).toBeNull();
  });

  it("does not write currentValue / autoCreateTasks if not provided", async () => {
    const updated = buildPath();
    const chain = mockUpdateReturning(updated);

    await updateRoadPath(ROAD_PATH_ID, USER_ID, {
      title: "Just a rename",
    } as unknown as Parameters<typeof updateRoadPath>[2]);

    const payload = chain.set.mock.calls[0][0];
    expect(payload.currentValue).toBeUndefined();
    expect(payload.autoCreateTasks).toBeUndefined();
  });
});

// ---------- deleteRoadPath ----------

describe("deleteRoadPath", () => {
  it("issues a delete scoped by id + userId", async () => {
    const chain = mockDeleteWhere();
    await deleteRoadPath(ROAD_PATH_ID, USER_ID);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });
});

// ---------- getRoadPathMilestones ----------

describe("getRoadPathMilestones", () => {
  it("returns milestones ordered by `order` ascending", async () => {
    mockOwnershipSelect([buildPath()]);
    const milestones = [
      buildMilestone({ id: "m1", order: 0 }),
      buildMilestone({ id: "m2", order: 1 }),
    ];
    roadPathMilestonesFindMany.mockResolvedValueOnce(milestones);

    const result = await getRoadPathMilestones(ROAD_PATH_ID, USER_ID);
    expect(result).toEqual(milestones);
  });

  it("throws when the parent path is not owned by the user", async () => {
    mockOwnershipSelect([buildPath()]); // owned by USER_ID

    await expect(
      getRoadPathMilestones(ROAD_PATH_ID, OTHER_USER_ID)
    ).rejects.toThrow("Road path not found");
    expect(roadPathMilestonesFindMany).not.toHaveBeenCalled();
  });
});

// ---------- createRoadPathMilestone ----------

describe("createRoadPathMilestone", () => {
  it("inserts a milestone after verifying ownership", async () => {
    mockOwnershipSelect([buildPath()]);
    const created = buildMilestone();
    const chain = mockInsertReturning(created);

    const result = await createRoadPathMilestone(USER_ID, {
      roadPathId: ROAD_PATH_ID,
      title: "Milestone 1",
      description: "first",
      targetValue: 25,
      order: 0,
    });

    expect(result).toEqual(created);
    const values = chain.values.mock.calls[0][0];
    expect(values.roadPathId).toBe(ROAD_PATH_ID);
    expect(values.title).toBe("Milestone 1");
    expect(values.targetValue).toBe("25");
    expect(values.order).toBe(0);
  });

  it("throws when parent path does not exist for the user", async () => {
    mockOwnershipSelect([]);

    await expect(
      createRoadPathMilestone(USER_ID, {
        roadPathId: ROAD_PATH_ID,
        title: "Nope",
        order: 0,
      })
    ).rejects.toThrow("Road path not found");
    expect(insertMock).not.toHaveBeenCalled();
  });
});

// ---------- updateRoadPathMilestone ----------

describe("updateRoadPathMilestone", () => {
  it("updates a milestone owned (via roadPath) by the user", async () => {
    roadPathMilestonesFindFirst.mockResolvedValueOnce({
      ...buildMilestone(),
      roadPath: buildPath(),
    });
    const updated = buildMilestone({ title: "Renamed" });
    const chain = mockUpdateReturning(updated);

    const result = await updateRoadPathMilestone(MILESTONE_ID, USER_ID, {
      title: "Renamed",
      targetValue: 75,
    } as unknown as Parameters<typeof updateRoadPathMilestone>[2]);

    expect(result).toEqual(updated);
    const setPayload = chain.set.mock.calls[0][0];
    expect(setPayload.title).toBe("Renamed");
    expect(setPayload.targetValue).toBe("75");
    expect(setPayload.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects when the milestone belongs to another user", async () => {
    roadPathMilestonesFindFirst.mockResolvedValueOnce({
      ...buildMilestone(),
      roadPath: buildPath({ userId: OTHER_USER_ID }),
    });

    await expect(
      updateRoadPathMilestone(MILESTONE_ID, USER_ID, {
        title: "x",
      } as unknown as Parameters<typeof updateRoadPathMilestone>[2])
    ).rejects.toThrow("Milestone not found");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects when the milestone is missing entirely", async () => {
    roadPathMilestonesFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      updateRoadPathMilestone(MILESTONE_ID, USER_ID, {
        title: "x",
      } as unknown as Parameters<typeof updateRoadPathMilestone>[2])
    ).rejects.toThrow("Milestone not found");
  });

  it("explicit null targetValue is preserved as null", async () => {
    roadPathMilestonesFindFirst.mockResolvedValueOnce({
      ...buildMilestone(),
      roadPath: buildPath(),
    });
    const chain = mockUpdateReturning(buildMilestone({ targetValue: null }));

    await updateRoadPathMilestone(MILESTONE_ID, USER_ID, {
      targetValue: null,
    } as unknown as Parameters<typeof updateRoadPathMilestone>[2]);

    expect(chain.set.mock.calls[0][0].targetValue).toBeNull();
  });
});

// ---------- deleteRoadPathMilestone ----------

describe("deleteRoadPathMilestone", () => {
  it("deletes a milestone the user owns", async () => {
    roadPathMilestonesFindFirst.mockResolvedValueOnce({
      ...buildMilestone(),
      roadPath: buildPath(),
    });
    const chain = mockDeleteWhere();

    await deleteRoadPathMilestone(MILESTONE_ID, USER_ID);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });

  it("rejects when the milestone belongs to another user", async () => {
    roadPathMilestonesFindFirst.mockResolvedValueOnce({
      ...buildMilestone(),
      roadPath: buildPath({ userId: OTHER_USER_ID }),
    });

    await expect(
      deleteRoadPathMilestone(MILESTONE_ID, USER_ID)
    ).rejects.toThrow("Milestone not found");
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

// ---------- getNextMilestoneOrder ----------

describe("getNextMilestoneOrder", () => {
  it("returns 0 when no milestones exist yet", async () => {
    mockOwnershipSelect([buildPath()]);
    roadPathMilestonesFindMany.mockResolvedValueOnce([]);

    const next = await getNextMilestoneOrder(ROAD_PATH_ID, USER_ID);
    expect(next).toBe(0);
  });

  it("returns max(order) + 1 when milestones exist", async () => {
    mockOwnershipSelect([buildPath()]);
    // The service queries with order desc + limit 1, so the first row is the max.
    roadPathMilestonesFindMany.mockResolvedValueOnce([
      buildMilestone({ order: 4 }),
    ]);

    const next = await getNextMilestoneOrder(ROAD_PATH_ID, USER_ID);
    expect(next).toBe(5);
  });

  it("throws when the parent path is missing", async () => {
    mockOwnershipSelect([]);

    await expect(
      getNextMilestoneOrder(ROAD_PATH_ID, USER_ID)
    ).rejects.toThrow("Road path not found");
  });
});

// ---------- getRoadPathProgress ----------

describe("getRoadPathProgress", () => {
  it("returns all progress entries when no date range provided", async () => {
    mockOwnershipSelect([buildPath()]);
    const rows = [
      buildProgress({ id: "p1" }),
      buildProgress({ id: "p2", date: new Date("2026-03-01") }),
    ];
    roadPathProgressFindMany.mockResolvedValueOnce(rows);

    const result = await getRoadPathProgress(ROAD_PATH_ID, USER_ID);
    expect(result).toEqual(rows);
    expect(roadPathProgressFindMany).toHaveBeenCalledTimes(1);
    // Without range we still pass a `where` (the eq(roadPathId) condition) —
    // assert it is truthy without inspecting the Drizzle predicate internals.
    const opts = roadPathProgressFindMany.mock.calls[0][0];
    expect(opts.where).toBeTruthy();
  });

  it("includes both startDate and endDate conditions when provided", async () => {
    mockOwnershipSelect([buildPath()]);
    roadPathProgressFindMany.mockResolvedValueOnce([]);

    await getRoadPathProgress(
      ROAD_PATH_ID,
      USER_ID,
      new Date("2026-01-01"),
      new Date("2026-12-31")
    );

    const opts = roadPathProgressFindMany.mock.calls[0][0];
    expect(opts.where).toBeTruthy();
  });

  it("accepts startDate only", async () => {
    mockOwnershipSelect([buildPath()]);
    roadPathProgressFindMany.mockResolvedValueOnce([]);

    await getRoadPathProgress(ROAD_PATH_ID, USER_ID, new Date("2026-06-01"));
    expect(roadPathProgressFindMany).toHaveBeenCalledTimes(1);
  });

  it("throws when the parent path is missing", async () => {
    mockOwnershipSelect([]);

    await expect(
      getRoadPathProgress(ROAD_PATH_ID, USER_ID)
    ).rejects.toThrow("Road path not found");
    expect(roadPathProgressFindMany).not.toHaveBeenCalled();
  });
});

// ---------- createRoadPathProgress ----------

describe("createRoadPathProgress", () => {
  it("inserts a progress row AND updates parent currentValue", async () => {
    mockOwnershipSelect([buildPath()]);
    const created = buildProgress({ value: "42" });
    const insertChain = mockInsertReturning(created);
    const updateChain = mockUpdateNoReturning();

    const result = await createRoadPathProgress(USER_ID, {
      roadPathId: ROAD_PATH_ID,
      value: 42,
      notes: "ran 42km",
      date: new Date("2026-04-15T00:00:00Z"),
    });

    expect(result).toEqual(created);

    // Insert side
    const insertValues = insertChain.values.mock.calls[0][0];
    expect(insertValues.roadPathId).toBe(ROAD_PATH_ID);
    expect(insertValues.value).toBe("42");
    expect(insertValues.notes).toBe("ran 42km");
    expect(insertValues.date).toEqual(new Date("2026-04-15T00:00:00Z"));

    // Update parent currentValue
    expect(updateMock).toHaveBeenCalledTimes(1);
    const setPayload = updateChain.set.mock.calls[0][0];
    expect(setPayload.currentValue).toBe("42");
    expect(setPayload.updatedAt).toBeInstanceOf(Date);
  });

  it("defaults missing `date` to now", async () => {
    mockOwnershipSelect([buildPath()]);
    const insertChain = mockInsertReturning(buildProgress());
    mockUpdateNoReturning();

    await createRoadPathProgress(USER_ID, {
      roadPathId: ROAD_PATH_ID,
      value: 10,
    } as unknown as Parameters<typeof createRoadPathProgress>[1]);

    const insertValues = insertChain.values.mock.calls[0][0];
    expect(insertValues.date).toBeInstanceOf(Date);
  });

  it("throws when the parent path is missing", async () => {
    mockOwnershipSelect([]);

    await expect(
      createRoadPathProgress(USER_ID, {
        roadPathId: ROAD_PATH_ID,
        value: 10,
      } as unknown as Parameters<typeof createRoadPathProgress>[1])
    ).rejects.toThrow("Road path not found");
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

// ---------- deleteRoadPathProgress ----------

describe("deleteRoadPathProgress", () => {
  it("rejects when the progress entry belongs to another user", async () => {
    roadPathProgressFindFirst.mockResolvedValueOnce({
      ...buildProgress(),
      roadPath: buildPath({ userId: OTHER_USER_ID }),
    });

    await expect(
      deleteRoadPathProgress(PROGRESS_ID, USER_ID)
    ).rejects.toThrow("Progress entry not found");
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("rejects when the progress entry is missing", async () => {
    roadPathProgressFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      deleteRoadPathProgress(PROGRESS_ID, USER_ID)
    ).rejects.toThrow("Progress entry not found");
  });

  it("deletes the row and rewinds parent currentValue to the latest remaining", async () => {
    roadPathProgressFindFirst
      // ownership lookup
      .mockResolvedValueOnce({
        ...buildProgress(),
        roadPath: buildPath(),
      })
      // latest-remaining lookup
      .mockResolvedValueOnce(buildProgress({ id: "latest", value: "33" }));

    const deleteChain = mockDeleteWhere();
    const updateChain = mockUpdateNoReturning();

    await deleteRoadPathProgress(PROGRESS_ID, USER_ID);

    expect(deleteChain.where).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateChain.set.mock.calls[0][0].currentValue).toBe("33");
  });

  it("resets the parent to 0 when no progress entries remain", async () => {
    roadPathProgressFindFirst
      .mockResolvedValueOnce({
        ...buildProgress(),
        roadPath: buildPath(),
      })
      .mockResolvedValueOnce(undefined);

    mockDeleteWhere();
    const updateChain = mockUpdateNoReturning();

    await deleteRoadPathProgress(PROGRESS_ID, USER_ID);

    expect(deleteMock).toHaveBeenCalledTimes(1);
    // The deleted figure must not linger as currentValue.
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateChain.set.mock.calls[0][0]).toMatchObject({ currentValue: "0" });
  });
});

// ---------- calculateRoadPathStats ----------

describe("calculateRoadPathStats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });

  it("computes totalProgress as currentValue / targetValue * 100", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPathWithDetails({
        targetValue: "100",
        currentValue: "25",
        milestones: [],
      })
    );

    const stats = await calculateRoadPathStats(ROAD_PATH_ID, USER_ID);
    expect(stats.totalProgress).toBeCloseTo(25, 5);
  });

  it("returns 0% (not NaN) when targetValue is 0", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPathWithDetails({
        targetValue: "0",
        currentValue: "10",
      })
    );

    const stats = await calculateRoadPathStats(ROAD_PATH_ID, USER_ID);
    expect(stats.totalProgress).toBe(0);
    expect(Number.isNaN(stats.totalProgress)).toBe(false);
  });

  it("returns 0% when targetValue is null", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPathWithDetails({
        targetValue: null,
        currentValue: "10",
      })
    );

    const stats = await calculateRoadPathStats(ROAD_PATH_ID, USER_ID);
    expect(stats.totalProgress).toBe(0);
  });

  it("counts completed and total milestones", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPathWithDetails({
        milestones: [
          buildMilestone({ id: "a", completedAt: new Date() }),
          buildMilestone({ id: "b", completedAt: null }),
          buildMilestone({ id: "c", completedAt: new Date() }),
        ],
      })
    );

    const stats = await calculateRoadPathStats(ROAD_PATH_ID, USER_ID);
    expect(stats.completedMilestones).toBe(2);
    expect(stats.totalMilestones).toBe(3);
  });

  it("returns daysRemaining = null when targetDate is null", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPathWithDetails({ targetDate: null })
    );

    const stats = await calculateRoadPathStats(ROAD_PATH_ID, USER_ID);
    expect(stats.daysRemaining).toBeNull();
  });

  it("computes daysRemaining as ceil((targetDate - now) / day)", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPathWithDetails({
        targetDate: new Date("2026-06-25T12:00:00Z"), // exactly 10 days away
      })
    );

    const stats = await calculateRoadPathStats(ROAD_PATH_ID, USER_ID);
    expect(stats.daysRemaining).toBe(10);
  });

  it("computes progressRate = currentValue / daysElapsed (>= 1 day)", async () => {
    // startDate 5 days before clock; currentValue 50 → 10/day.
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPathWithDetails({
        startDate: new Date("2026-06-10T12:00:00Z"),
        currentValue: "50",
        targetValue: "100",
      })
    );

    const stats = await calculateRoadPathStats(ROAD_PATH_ID, USER_ID);
    expect(stats.progressRate).toBeCloseTo(10, 5);
  });

  it("clamps daysElapsed to a minimum of 1 to avoid divide-by-zero", async () => {
    // startDate = now → daysElapsed would be 0 without the Math.max(1, …) clamp.
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPathWithDetails({
        startDate: new Date("2026-06-15T12:00:00Z"),
        currentValue: "5",
        targetValue: "100",
      })
    );

    const stats = await calculateRoadPathStats(ROAD_PATH_ID, USER_ID);
    expect(stats.progressRate).toBe(5);
    expect(Number.isFinite(stats.progressRate)).toBe(true);
  });

  it("throws when the path is missing", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      calculateRoadPathStats(ROAD_PATH_ID, USER_ID)
    ).rejects.toThrow("Road path not found");
  });
});
