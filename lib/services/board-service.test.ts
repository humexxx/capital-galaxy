import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// board-service.ts uses two distinct DB shapes:
//   * db.query.boardColumns.{findMany,findFirst} and db.query.boardTasks.{findMany,findFirst}
//   * Fluent chains: db.insert(...).values(...).returning(),
//                    db.update(...).set(...).where(...).returning(),
//                    db.delete(...).where(...)
// We expose all three terminal mocks (returningMock for insert/update with
// returning, whereTerminalMock for the no-returning update + delete, and the
// finder mocks) so each test can seed the shape it needs.

const columnsFindMany = vi.fn();
const columnsFindFirst = vi.fn();
const tasksFindMany = vi.fn();
const tasksFindFirst = vi.fn();

const returningMock = vi.fn();
const whereReturningChain = { returning: returningMock };
// Mocks accept rest args so tests can introspect `mock.calls[i][0]`. The
// `_args` prefix is the no-unused-vars convention.
/* eslint-disable @typescript-eslint/no-unused-vars */
const setMock = vi.fn((..._args: unknown[]) => ({
  where: vi.fn((..._inner: unknown[]) => whereReturningChain),
}));
const updateMock = vi.fn((..._args: unknown[]) => ({ set: setMock }));

const valuesMock = vi.fn((..._args: unknown[]) => ({ returning: returningMock }));
const insertMock = vi.fn((..._args: unknown[]) => ({ values: valuesMock }));

const deleteWhereMock = vi.fn();
const deleteMock = vi.fn((..._args: unknown[]) => ({ where: deleteWhereMock }));
/* eslint-enable @typescript-eslint/no-unused-vars */

vi.mock("@/db", () => ({
  db: {
    query: {
      boardColumns: {
        findMany: (...args: unknown[]) => columnsFindMany(...args),
        findFirst: (...args: unknown[]) => columnsFindFirst(...args),
      },
      boardTasks: {
        findMany: (...args: unknown[]) => tasksFindMany(...args),
        findFirst: (...args: unknown[]) => tasksFindFirst(...args),
      },
    },
    insert: (...args: unknown[]) => insertMock(...(args as [])),
    update: (...args: unknown[]) => updateMock(...(args as [])),
    delete: (...args: unknown[]) => deleteMock(...(args as [])),
  },
}));

import {
  createBoardColumn,
  createBoardTask,
  deleteBoardColumn,
  deleteBoardTask,
  getBoardColumn,
  getNextColumnOrder,
  getNextTaskOrder,
  getUserBoardColumns,
  initializeDefaultColumns,
  reorderTask,
  updateBoardColumn,
  updateBoardTask,
} from "./board-service";
import type {
  BoardColumn,
  BoardColumnWithTasks,
  BoardTask,
  BoardTaskWithColumn,
} from "@/types";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const COLUMN_ID = "00000000-0000-0000-0000-0000000000c1";
const COLUMN_ID_2 = "00000000-0000-0000-0000-0000000000c2";
const TASK_ID = "00000000-0000-0000-0000-0000000000a1";

function makeColumn(overrides: Partial<BoardColumn> = {}): BoardColumn {
  return {
    id: COLUMN_ID,
    userId: USER_ID,
    name: "Todo",
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as BoardColumn;
}

function makeTask(overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    id: TASK_ID,
    userId: USER_ID,
    columnId: COLUMN_ID,
    roadPathId: null,
    title: "Some task",
    description: null,
    priority: null,
    order: 0,
    dueDate: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as BoardTask;
}

beforeEach(() => {
  // Restore default chain behaviour so each test gets a clean fluent surface.
  setMock.mockImplementation(() => ({
    where: vi.fn(() => whereReturningChain),
  }));
  valuesMock.mockImplementation(() => ({ returning: returningMock }));
  insertMock.mockImplementation(() => ({ values: valuesMock }));
  updateMock.mockImplementation(() => ({ set: setMock }));
  deleteMock.mockImplementation(() => ({ where: deleteWhereMock }));
});

afterEach(() => {
  vi.clearAllMocks();
  returningMock.mockReset();
  deleteWhereMock.mockReset();
  columnsFindMany.mockReset();
  columnsFindFirst.mockReset();
  tasksFindMany.mockReset();
  tasksFindFirst.mockReset();
});

// ---------- getUserBoardColumns ----------

describe("getUserBoardColumns", () => {
  it("returns the rows from db.query.boardColumns.findMany", async () => {
    const rows: BoardColumnWithTasks[] = [
      { ...makeColumn(), tasks: [] } as unknown as BoardColumnWithTasks,
    ];
    columnsFindMany.mockResolvedValueOnce(rows);

    const result = await getUserBoardColumns(USER_ID);

    expect(result).toBe(rows);
    expect(columnsFindMany).toHaveBeenCalledOnce();
    const opts = columnsFindMany.mock.calls[0][0];
    // The query must request the relation so the page can render tasks.
    expect(opts).toBeTruthy();
    expect(opts.with).toBeTruthy();
    expect(opts.with.tasks).toBeTruthy();
  });

  it("returns an empty array when the user has no columns", async () => {
    columnsFindMany.mockResolvedValueOnce([]);
    await expect(getUserBoardColumns(USER_ID)).resolves.toEqual([]);
  });
});

// ---------- getBoardColumn ----------

describe("getBoardColumn", () => {
  it("returns the column when found", async () => {
    const col = { ...makeColumn(), tasks: [] } as unknown as BoardColumnWithTasks;
    columnsFindFirst.mockResolvedValueOnce(col);

    const result = await getBoardColumn(COLUMN_ID, USER_ID);

    expect(result).toBe(col);
    expect(columnsFindFirst).toHaveBeenCalledOnce();
  });

  it("returns null when not found (undefined → null)", async () => {
    columnsFindFirst.mockResolvedValueOnce(undefined);
    await expect(getBoardColumn(COLUMN_ID, USER_ID)).resolves.toBeNull();
  });
});

// ---------- createBoardColumn ----------

describe("createBoardColumn", () => {
  it("inserts with userId merged into the data and returns the new row", async () => {
    const created = makeColumn({ name: "Planning", order: 3 });
    returningMock.mockResolvedValueOnce([created]);

    const result = await createBoardColumn(USER_ID, { name: "Planning", order: 3 });

    expect(result).toBe(created);
    expect(insertMock).toHaveBeenCalledOnce();
    expect(valuesMock).toHaveBeenCalledWith({
      userId: USER_ID,
      name: "Planning",
      order: 3,
    });
  });
});

// ---------- updateBoardColumn ----------

describe("updateBoardColumn", () => {
  it("updates the column and returns the updated row", async () => {
    const updated = makeColumn({ name: "Renamed" });
    returningMock.mockResolvedValueOnce([updated]);

    const result = await updateBoardColumn(COLUMN_ID, USER_ID, { name: "Renamed" });

    expect(result).toBe(updated);
    expect(updateMock).toHaveBeenCalledOnce();
    const payload = setMock.mock.calls[0][0] as { name: string; updatedAt: Date };
    expect(payload.name).toBe("Renamed");
    // updatedAt should always be bumped so the UI can sort by recency.
    expect(payload.updatedAt).toBeInstanceOf(Date);
  });
});

// ---------- deleteBoardColumn ----------

describe("deleteBoardColumn", () => {
  it("issues a delete scoped by (id, userId)", async () => {
    deleteWhereMock.mockResolvedValueOnce(undefined);

    await deleteBoardColumn(COLUMN_ID, USER_ID);

    expect(deleteMock).toHaveBeenCalledOnce();
    expect(deleteWhereMock).toHaveBeenCalledOnce();
  });
});

// ---------- initializeDefaultColumns ----------

describe("initializeDefaultColumns", () => {
  it("returns existing columns untouched when the user already has some", async () => {
    const existing = [makeColumn({ name: "Backlog" })];
    columnsFindMany.mockResolvedValueOnce(existing);

    const result = await initializeDefaultColumns(USER_ID);

    expect(result).toBe(existing);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts the three default columns when the user has none", async () => {
    columnsFindMany.mockResolvedValueOnce([]);
    const seeded = [
      makeColumn({ name: "Todo", order: 0 }),
      makeColumn({ name: "Working", order: 1 }),
      makeColumn({ name: "Done", order: 2 }),
    ];
    returningMock.mockResolvedValueOnce(seeded);

    const result = await initializeDefaultColumns(USER_ID);

    expect(result).toBe(seeded);
    expect(insertMock).toHaveBeenCalledOnce();
    const inserted = valuesMock.mock.calls[0][0] as Array<{
      userId: string;
      name: string;
      order: number;
    }>;
    expect(Array.isArray(inserted)).toBe(true);
    expect(inserted).toHaveLength(3);
    expect(inserted.map((c) => c.name)).toEqual(["Todo", "Working", "Done"]);
    // Every default row must carry the userId so RLS / ownership filters work.
    for (const row of inserted) {
      expect(row.userId).toBe(USER_ID);
    }
  });
});

// ---------- createBoardTask ----------

describe("createBoardTask", () => {
  it("refuses a column the user does not own", async () => {
    columnsFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      createBoardTask(USER_ID, { columnId: COLUMN_ID, title: "Sneaky", order: 0 })
    ).rejects.toThrow("Column not found");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts with userId + data merged and returns the created row", async () => {
    columnsFindFirst.mockResolvedValueOnce({ id: COLUMN_ID });
    const created = makeTask({ title: "Write tests", order: 5 });
    returningMock.mockResolvedValueOnce([created]);

    const result = await createBoardTask(USER_ID, {
      columnId: COLUMN_ID,
      title: "Write tests",
      order: 5,
    });

    expect(result).toBe(created);
    expect(valuesMock).toHaveBeenCalledWith({
      userId: USER_ID,
      columnId: COLUMN_ID,
      title: "Write tests",
      order: 5,
    });
  });
});

// ---------- updateBoardTask ----------

describe("updateBoardTask", () => {
  it("updates fields and bumps updatedAt", async () => {
    const updated = makeTask({ title: "Refined title" });
    returningMock.mockResolvedValueOnce([updated]);

    const result = await updateBoardTask(TASK_ID, USER_ID, { title: "Refined title" });

    expect(result).toBe(updated);
    const payload = setMock.mock.calls[0][0] as { title: string; updatedAt: Date };
    expect(payload.title).toBe("Refined title");
    expect(payload.updatedAt).toBeInstanceOf(Date);
  });
});

// ---------- deleteBoardTask ----------

describe("deleteBoardTask", () => {
  it("deletes scoped by (id, userId) and closes the order gap below it", async () => {
    deleteWhereMock.mockReturnValueOnce({
      returning: () => Promise.resolve([{ columnId: COLUMN_ID, order: 1 }]),
    });

    await deleteBoardTask(TASK_ID, USER_ID);

    expect(deleteMock).toHaveBeenCalledOnce();
    expect(deleteWhereMock).toHaveBeenCalledOnce();
    // Tasks after the deleted one shift down so `order` stays contiguous.
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it("does nothing more when the task did not exist", async () => {
    deleteWhereMock.mockReturnValueOnce({ returning: () => Promise.resolve([]) });

    await deleteBoardTask(TASK_ID, USER_ID);

    expect(updateMock).not.toHaveBeenCalled();
  });
});

// ---------- reorderTask ----------

describe("reorderTask", () => {
  it("throws when the task is not found", async () => {
    // The initial getBoardTask() lookup returns undefined → null.
    tasksFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      reorderTask(TASK_ID, USER_ID, COLUMN_ID, COLUMN_ID, 2)
    ).rejects.toThrow("Task not found");
    // No update chains should have run.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("same-column move forward: shifts intermediate tasks down by one, then sets the new order", async () => {
    const original = makeTask({ order: 1, columnId: COLUMN_ID }) as BoardTaskWithColumn;
    const finalState = makeTask({ order: 3, columnId: COLUMN_ID }) as BoardTaskWithColumn;
    // First findFirst → resolve original; second findFirst (post-update) → resolve finalState.
    tasksFindFirst
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(finalState);

    const result = await reorderTask(TASK_ID, USER_ID, COLUMN_ID, COLUMN_ID, 3);

    expect(result).toBe(finalState);
    // Two updates: 1) shift others, 2) set the moved task's new order.
    expect(updateMock).toHaveBeenCalledTimes(2);
    const setPayloads = setMock.mock.calls.map(
      (c) => c[0] as { order?: number; updatedAt?: Date; columnId?: string }
    );
    // Second call must set the explicit new order.
    expect(setPayloads[1].order).toBe(3);
    expect(setPayloads[1].updatedAt).toBeInstanceOf(Date);
  });

  it("same-column move backward: shifts intermediate tasks up by one, then sets the new order", async () => {
    const original = makeTask({ order: 4, columnId: COLUMN_ID }) as BoardTaskWithColumn;
    const finalState = makeTask({ order: 1, columnId: COLUMN_ID }) as BoardTaskWithColumn;
    tasksFindFirst
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(finalState);

    const result = await reorderTask(TASK_ID, USER_ID, COLUMN_ID, COLUMN_ID, 1);

    expect(result).toBe(finalState);
    expect(updateMock).toHaveBeenCalledTimes(2);
    const setPayloads = setMock.mock.calls.map(
      (c) => c[0] as { order?: number; updatedAt?: Date; columnId?: string }
    );
    expect(setPayloads[1].order).toBe(1);
  });

  it("same-column no-op (newOrder === oldOrder) still issues the final set but no shift", async () => {
    const original = makeTask({ order: 2, columnId: COLUMN_ID }) as BoardTaskWithColumn;
    tasksFindFirst
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(original);

    await reorderTask(TASK_ID, USER_ID, COLUMN_ID, COLUMN_ID, 2);

    // Only the final set runs because neither shift branch fires.
    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = setMock.mock.calls[0][0] as { order: number };
    expect(payload.order).toBe(2);
  });

  it("cross-column move: shifts source above-old-order down, destination at-and-after up, then moves the task", async () => {
    const original = makeTask({
      order: 2,
      columnId: COLUMN_ID,
    }) as BoardTaskWithColumn;
    const finalState = makeTask({
      order: 0,
      columnId: COLUMN_ID_2,
    }) as BoardTaskWithColumn;
    tasksFindFirst
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(finalState);
    // The destination column has to be the user's own.
    columnsFindFirst.mockResolvedValueOnce({ id: COLUMN_ID_2 });

    const result = await reorderTask(
      TASK_ID,
      USER_ID,
      COLUMN_ID,
      COLUMN_ID_2,
      0
    );

    expect(result).toBe(finalState);
    // Three updates: source shift, destination shift, move task.
    expect(updateMock).toHaveBeenCalledTimes(3);
    const setPayloads = setMock.mock.calls.map(
      (c) => c[0] as { order?: number; updatedAt?: Date; columnId?: string }
    );
    // Final update should set both columnId AND order to the destination values.
    expect(setPayloads[2].columnId).toBe(COLUMN_ID_2);
    expect(setPayloads[2].order).toBe(0);
    expect(setPayloads[2].updatedAt).toBeInstanceOf(Date);
  });
});

// ---------- getNextTaskOrder ----------

describe("getNextTaskOrder", () => {
  it("returns 0 when the column has no tasks", async () => {
    tasksFindMany.mockResolvedValueOnce([]);
    await expect(getNextTaskOrder(COLUMN_ID, USER_ID)).resolves.toBe(0);
  });

  it("returns max(order) + 1 when there is at least one task", async () => {
    tasksFindMany.mockResolvedValueOnce([makeTask({ order: 7 })]);
    await expect(getNextTaskOrder(COLUMN_ID, USER_ID)).resolves.toBe(8);
  });
});

// ---------- getNextColumnOrder ----------

describe("getNextColumnOrder", () => {
  it("returns 0 when the user has no columns", async () => {
    columnsFindMany.mockResolvedValueOnce([]);
    await expect(getNextColumnOrder(USER_ID)).resolves.toBe(0);
  });

  it("returns max(order) + 1 when there is at least one column", async () => {
    columnsFindMany.mockResolvedValueOnce([makeColumn({ order: 4 })]);
    await expect(getNextColumnOrder(USER_ID)).resolves.toBe(5);
  });
});
