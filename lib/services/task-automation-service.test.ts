import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// task-automation-service uses three surfaces:
//   - `db.query.roadPaths.findFirst/findMany` and `db.query.boardColumns.findFirst`
//     for reads (relational query API).
//   - `db.transaction(tx => ...)` wrapping `tx.insert(boardTasks)` +
//     `tx.update(roadPaths)` for the task-create + stamp write pair.
// `getNextTaskOrder` is pulled from ./board-service, so we stub that module
// rather than re-mocking the full builder chain underneath.

const roadPathsFindFirst = vi.fn();
const roadPathsFindMany = vi.fn();
const boardColumnsFindFirst = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      roadPaths: {
        findFirst: (...args: unknown[]) => roadPathsFindFirst(...args),
        findMany: (...args: unknown[]) => roadPathsFindMany(...args),
      },
      boardColumns: {
        findFirst: (...args: unknown[]) => boardColumnsFindFirst(...args),
      },
    },
    insert: (...args: unknown[]) => insertMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        insert: (...args: unknown[]) => insertMock(...args),
        update: (...args: unknown[]) => updateMock(...args),
      }),
  },
}));

const getNextTaskOrderMock = vi.fn();

vi.mock("./board-service", () => ({
  getNextTaskOrder: (...args: unknown[]) => getNextTaskOrderMock(...args),
}));

import {
  createAutomatedTasksForAllRoadPaths,
  createAutomatedTasksForRoadPath,
  getNextTaskDueDate,
  getTaskTitle,
  shouldCreateTask,
} from "./task-automation-service";
import type { BoardTask, RoadPath, RoadPathFrequency } from "@/types";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const ROAD_PATH_ID = "00000000-0000-0000-0000-0000000000aa";
const COLUMN_ID = "00000000-0000-0000-0000-0000000000cc";

// "Now" used by every fake-timer test. Pinning a single instant keeps the
// arithmetic obvious: `n` days ago = NOW − n * MS_PER_DAY.
const NOW = new Date("2026-06-15T12:00:00.000Z");
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * MS_PER_DAY);
}

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
    autoCreateTasks: true,
    taskFrequency: "daily",
    lastTaskCreatedAt: null,
    completedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as unknown as RoadPath;
}

function buildTask(overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    id: "task-1",
    userId: USER_ID,
    columnId: COLUMN_ID,
    roadPathId: ROAD_PATH_ID,
    title: "Daily: Test Path",
    description: null,
    order: 0,
    dueDate: NOW,
    completedAt: null,
    priority: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as unknown as BoardTask;
}

function mockUpdateChain() {
  // tx.update(roadPaths).set(...).where(...) — resolves with no .returning()
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  updateMock.mockReturnValue(chain);
  return chain;
}

function mockInsertChain(rows: BoardTask[]) {
  // tx.insert(boardTasks).values(...).returning() -> rows
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  insertMock.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------- shouldCreateTask ----------

describe("shouldCreateTask", () => {
  describe("with no prior task", () => {
    it("fires when startDate has been reached", () => {
      // startDate is one day before NOW → eligible
      expect(
        shouldCreateTask("daily", null, daysAgo(1))
      ).toBe(true);
    });

    it("fires when startDate equals now exactly", () => {
      expect(shouldCreateTask("weekly", null, NOW)).toBe(true);
    });

    it("skips when startDate is in the future", () => {
      // startDate 1 day in the future
      const future = new Date(NOW.getTime() + MS_PER_DAY);
      expect(shouldCreateTask("daily", null, future)).toBe(false);
    });
  });

  describe("daily", () => {
    it("skips when the last task was created earlier the same day", () => {
      // 23h ago → Math.floor(23h / day) = 0
      // Calendar days, not elapsed hours: a run 23h after yesterday's must
      // still fire (see the next test); one 8h after today's must not.
      const lastCreated = new Date(NOW.getTime() - 8 * 60 * 60 * 1000);
      expect(shouldCreateTask("daily", lastCreated, daysAgo(30))).toBe(false);
      const yesterdayLate = new Date(NOW.getTime() - 23 * 60 * 60 * 1000);
      expect(shouldCreateTask("daily", yesterdayLate, daysAgo(30))).toBe(true);
    });

    it("fires at the 1-day boundary", () => {
      expect(shouldCreateTask("daily", daysAgo(1), daysAgo(30))).toBe(true);
    });

    it("fires when the last task was much older", () => {
      expect(shouldCreateTask("daily", daysAgo(5), daysAgo(30))).toBe(true);
    });
  });

  describe("every_other_day", () => {
    it("skips at 1 day", () => {
      expect(
        shouldCreateTask("every_other_day", daysAgo(1), daysAgo(30))
      ).toBe(false);
    });

    it("fires at the 2-day boundary", () => {
      expect(
        shouldCreateTask("every_other_day", daysAgo(2), daysAgo(30))
      ).toBe(true);
    });
  });

  describe("weekly", () => {
    it("skips at 6 days", () => {
      expect(shouldCreateTask("weekly", daysAgo(6), daysAgo(60))).toBe(false);
    });

    it("fires at the 7-day boundary", () => {
      expect(shouldCreateTask("weekly", daysAgo(7), daysAgo(60))).toBe(true);
    });
  });

  describe("biweekly", () => {
    it("skips at 13 days", () => {
      expect(
        shouldCreateTask("biweekly", daysAgo(13), daysAgo(60))
      ).toBe(false);
    });

    it("fires at the 14-day boundary", () => {
      expect(
        shouldCreateTask("biweekly", daysAgo(14), daysAgo(60))
      ).toBe(true);
    });
  });

  describe("monthly", () => {
    it("skips within the same calendar month", () => {
      // NOW is Jun 15; ten days ago is still June.
      expect(
        shouldCreateTask("monthly", daysAgo(10), daysAgo(120))
      ).toBe(false);
    });

    it("fires once the calendar month changes, even before 30 days", () => {
      // 29 days ago is May 17 — a new month has started since.
      expect(
        shouldCreateTask("monthly", daysAgo(29), daysAgo(120))
      ).toBe(true);
    });
  });

  it("returns false for an unknown frequency value", () => {
    // The default branch guards against bad data flowing in from the DB.
    expect(
      shouldCreateTask(
        "yearly" as unknown as RoadPathFrequency,
        daysAgo(400),
        daysAgo(500)
      )
    ).toBe(false);
  });
});

// ---------- getTaskTitle ----------

describe("getTaskTitle", () => {
  it("prefixes the road-path title with a human-readable frequency", () => {
    expect(getTaskTitle("Read 30 mins", "daily")).toBe("Daily: Read 30 mins");
    expect(getTaskTitle("Read", "every_other_day")).toBe(
      "Every Other Day: Read"
    );
    expect(getTaskTitle("Read", "weekly")).toBe("Weekly: Read");
    expect(getTaskTitle("Read", "biweekly")).toBe("Biweekly: Read");
    expect(getTaskTitle("Read", "monthly")).toBe("Monthly: Read");
  });
});

// ---------- getNextTaskDueDate ----------

describe("getNextTaskDueDate", () => {
  it("adds 1 day for daily", async () => {
    const next = await getNextTaskDueDate(
      "daily",
      new Date("2026-06-15T00:00:00Z")
    );
    expect(next.toISOString()).toBe("2026-06-16T00:00:00.000Z");
  });

  it("adds 2 days for every_other_day", async () => {
    const next = await getNextTaskDueDate(
      "every_other_day",
      new Date("2026-06-15T00:00:00Z")
    );
    expect(next.toISOString()).toBe("2026-06-17T00:00:00.000Z");
  });

  it("adds 7 days for weekly", async () => {
    const next = await getNextTaskDueDate(
      "weekly",
      new Date("2026-06-15T00:00:00Z")
    );
    expect(next.toISOString()).toBe("2026-06-22T00:00:00.000Z");
  });

  it("adds 14 days for biweekly", async () => {
    const next = await getNextTaskDueDate(
      "biweekly",
      new Date("2026-06-15T00:00:00Z")
    );
    expect(next.toISOString()).toBe("2026-06-29T00:00:00.000Z");
  });

  it("adds a calendar month for monthly", async () => {
    // setMonth handles month rollover for us — 2026-06-15 → 2026-07-15.
    const next = await getNextTaskDueDate(
      "monthly",
      new Date("2026-06-15T00:00:00Z")
    );
    expect(next.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("defaults to NOW when no lastDate is provided", async () => {
    const next = await getNextTaskDueDate("daily");
    expect(next.toISOString()).toBe("2026-06-16T12:00:00.000Z");
  });

  it("does not mutate the input date", async () => {
    const base = new Date("2026-06-15T00:00:00Z");
    await getNextTaskDueDate("monthly", base);
    expect(base.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });
});

// ---------- createAutomatedTasksForRoadPath ----------

describe("createAutomatedTasksForRoadPath", () => {
  it("throws when the road path is not found", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      createAutomatedTasksForRoadPath(USER_ID, ROAD_PATH_ID)
    ).rejects.toThrow("Road path not found");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns null (no-op) when autoCreateTasks is false", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPath({ autoCreateTasks: false })
    );

    const result = await createAutomatedTasksForRoadPath(USER_ID, ROAD_PATH_ID);
    expect(result).toBeNull();
    expect(boardColumnsFindFirst).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns null when taskFrequency is missing", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPath({ taskFrequency: null })
    );

    const result = await createAutomatedTasksForRoadPath(USER_ID, ROAD_PATH_ID);
    expect(result).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns null when the schedule says it is too soon", async () => {
    // Daily path created < 1 day ago → not yet due.
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPath({
        taskFrequency: "daily",
        lastTaskCreatedAt: new Date(NOW.getTime() - 60 * 60 * 1000), // 1h ago
      })
    );

    const result = await createAutomatedTasksForRoadPath(USER_ID, ROAD_PATH_ID);
    expect(result).toBeNull();
    expect(boardColumnsFindFirst).not.toHaveBeenCalled();
  });

  it("throws when the Todo column is missing for the user", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(buildPath());
    boardColumnsFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      createAutomatedTasksForRoadPath(USER_ID, ROAD_PATH_ID)
    ).rejects.toThrow(
      "Todo column not found. Please initialize board columns first."
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("creates a task in the Todo column and stamps lastTaskCreatedAt", async () => {
    roadPathsFindFirst.mockResolvedValueOnce(
      buildPath({
        title: "Read",
        description: "30 minutes a day",
        taskFrequency: "daily",
        lastTaskCreatedAt: daysAgo(2),
      })
    );
    boardColumnsFindFirst.mockResolvedValueOnce({
      id: COLUMN_ID,
      userId: USER_ID,
      name: "Todo",
    });
    getNextTaskOrderMock.mockResolvedValueOnce(3);
    const created = buildTask({ title: "Daily: Read", order: 3 });
    const insertChain = mockInsertChain([created]);
    const updateChain = mockUpdateChain();

    const result = await createAutomatedTasksForRoadPath(USER_ID, ROAD_PATH_ID);

    expect(result).toEqual(created);

    // Task creation payload
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertChain.values.mock.calls[0][0];
    expect(payload).toMatchObject({
      userId: USER_ID,
      columnId: COLUMN_ID,
      roadPathId: ROAD_PATH_ID,
      title: "Daily: Read",
      description: "30 minutes a day",
      order: 3,
    });
    expect(payload.dueDate).toBeInstanceOf(Date);
    expect((payload.dueDate as Date).toISOString()).toBe(NOW.toISOString());

    // Stamp update
    expect(updateMock).toHaveBeenCalledTimes(1);
    const setPayload = updateChain.set.mock.calls[0][0];
    expect(setPayload.lastTaskCreatedAt).toBeInstanceOf(Date);
    expect((setPayload.lastTaskCreatedAt as Date).toISOString()).toBe(
      NOW.toISOString()
    );
    expect(setPayload.updatedAt).toBeInstanceOf(Date);
  });
});

// ---------- createAutomatedTasksForAllRoadPaths ----------

describe("createAutomatedTasksForAllRoadPaths", () => {
  it("returns [] when the user has no auto-create paths", async () => {
    roadPathsFindMany.mockResolvedValueOnce([]);

    const result = await createAutomatedTasksForAllRoadPaths(USER_ID);
    expect(result).toEqual([]);
    // No paths => no need to even look up the Todo column.
    expect(boardColumnsFindFirst).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns [] when no candidate paths are due yet", async () => {
    roadPathsFindMany.mockResolvedValueOnce([
      buildPath({
        id: "p1",
        taskFrequency: "weekly",
        // Created 1 day ago → not yet due (weekly threshold = 7 days)
        lastTaskCreatedAt: daysAgo(1),
      }),
    ]);

    const result = await createAutomatedTasksForAllRoadPaths(USER_ID);
    expect(result).toEqual([]);
    expect(boardColumnsFindFirst).not.toHaveBeenCalled();
  });

  it("skips paths without a frequency configured", async () => {
    roadPathsFindMany.mockResolvedValueOnce([
      buildPath({ id: "p-no-freq", taskFrequency: null }),
    ]);

    const result = await createAutomatedTasksForAllRoadPaths(USER_ID);
    expect(result).toEqual([]);
    expect(boardColumnsFindFirst).not.toHaveBeenCalled();
  });

  it("throws when the Todo column is missing (with eligible paths)", async () => {
    roadPathsFindMany.mockResolvedValueOnce([
      buildPath({ taskFrequency: "daily", lastTaskCreatedAt: daysAgo(2) }),
    ]);
    boardColumnsFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      createAutomatedTasksForAllRoadPaths(USER_ID)
    ).rejects.toThrow(
      "Todo column not found. Please initialize board columns first."
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("batch-creates one task per eligible path and stamps them in one update", async () => {
    const pathA = buildPath({
      id: "p-a",
      title: "Read",
      taskFrequency: "daily",
      lastTaskCreatedAt: daysAgo(2),
    });
    const pathB = buildPath({
      id: "p-b",
      title: "Run",
      taskFrequency: "weekly",
      lastTaskCreatedAt: daysAgo(8),
    });
    // pathC is NOT eligible — weekly fired 1 day ago.
    const pathC = buildPath({
      id: "p-c",
      title: "Stretch",
      taskFrequency: "weekly",
      lastTaskCreatedAt: daysAgo(1),
    });

    roadPathsFindMany.mockResolvedValueOnce([pathA, pathB, pathC]);
    boardColumnsFindFirst.mockResolvedValueOnce({
      id: COLUMN_ID,
      userId: USER_ID,
      name: "Todo",
    });
    getNextTaskOrderMock.mockResolvedValueOnce(0);
    const taskA = buildTask({ id: "t-a", title: "Daily: Read", order: 0 });
    const taskB = buildTask({ id: "t-b", title: "Weekly: Run", order: 1 });
    const insertChain = mockInsertChain([taskA, taskB]);
    mockUpdateChain();

    const result = await createAutomatedTasksForAllRoadPaths(USER_ID);

    expect(result).toEqual([taskA, taskB]);

    // Single bulk insert with in-memory incremented orders (perf contract).
    expect(insertMock).toHaveBeenCalledTimes(1);
    const rows = insertChain.values.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      userId: USER_ID,
      columnId: COLUMN_ID,
      roadPathId: "p-a",
      title: "Daily: Read",
      order: 0,
    });
    expect(rows[1]).toMatchObject({
      roadPathId: "p-b",
      title: "Weekly: Run",
      order: 1,
    });

    // Base order computed once, single stamp update, single column lookup.
    expect(getNextTaskOrderMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(boardColumnsFindFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects atomically when the bulk insert fails (no partial stamps)", async () => {
    const pathA = buildPath({
      id: "p-a",
      title: "Read",
      taskFrequency: "daily",
      lastTaskCreatedAt: daysAgo(2),
    });
    roadPathsFindMany.mockResolvedValueOnce([pathA]);
    boardColumnsFindFirst.mockResolvedValueOnce({
      id: COLUMN_ID,
      userId: USER_ID,
      name: "Todo",
    });
    getNextTaskOrderMock.mockResolvedValueOnce(0);
    insertMock.mockReturnValueOnce({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    mockUpdateChain();

    await expect(createAutomatedTasksForAllRoadPaths(USER_ID)).rejects.toThrow(
      "DB error"
    );
    expect(updateMock).not.toHaveBeenCalled();
  });
});
