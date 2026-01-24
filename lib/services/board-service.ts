import { db } from "@/db";
import { boardColumns, boardTasks } from "@/db/schema";
import { eq, and, asc, desc, gt, lt, sql } from "drizzle-orm";
import type { BoardColumn, BoardTask, BoardColumnWithTasks, BoardTaskWithColumn } from "@/types";
import type {
  CreateBoardColumnData,
  UpdateBoardColumnData,
  CreateBoardTaskData,
  UpdateBoardTaskData,
} from "@/schemas/board";

export async function getUserBoardColumns(userId: string): Promise<BoardColumnWithTasks[]> {
  const columns = await db.query.boardColumns.findMany({
    where: eq(boardColumns.userId, userId),
    orderBy: [asc(boardColumns.order)],
    with: {
      tasks: {
        orderBy: [asc(boardTasks.order)],
      },
    },
  });

  return columns;
}

export async function getBoardColumn(columnId: string, userId: string): Promise<BoardColumnWithTasks | null> {
  const column = await db.query.boardColumns.findFirst({
    where: and(eq(boardColumns.id, columnId), eq(boardColumns.userId, userId)),
    with: {
      tasks: {
        orderBy: [asc(boardTasks.order)],
      },
    },
  });

  return column || null;
}

export async function createBoardColumn(userId: string, data: CreateBoardColumnData): Promise<BoardColumn> {
  const [column] = await db
    .insert(boardColumns)
    .values({
      userId,
      ...data,
    })
    .returning();

  return column;
}

export async function updateBoardColumn(
  columnId: string,
  userId: string,
  data: Omit<UpdateBoardColumnData, "id">
): Promise<BoardColumn> {
  const [column] = await db
    .update(boardColumns)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(boardColumns.id, columnId), eq(boardColumns.userId, userId)))
    .returning();

  return column;
}

export async function deleteBoardColumn(columnId: string, userId: string): Promise<void> {
  await db
    .delete(boardColumns)
    .where(and(eq(boardColumns.id, columnId), eq(boardColumns.userId, userId)));
}

export async function initializeDefaultColumns(userId: string): Promise<BoardColumn[]> {
  const existingColumns = await db.query.boardColumns.findMany({
    where: eq(boardColumns.userId, userId),
  });

  if (existingColumns.length > 0) {
    return existingColumns;
  }

  const defaultColumns = [
    { name: "Todo", order: 0 },
    { name: "Working", order: 1 },
    { name: "Done", order: 2 },
  ];

  const columns = await db
    .insert(boardColumns)
    .values(
      defaultColumns.map((col) => ({
        userId,
        ...col,
      }))
    )
    .returning();

  return columns;
}

export async function getBoardTask(taskId: string, userId: string): Promise<BoardTaskWithColumn | null> {
  const task = await db.query.boardTasks.findFirst({
    where: and(eq(boardTasks.id, taskId), eq(boardTasks.userId, userId)),
    with: {
      column: true,
      roadPath: true,
    },
  });

  return task || null;
}

export async function getUserBoardTasks(userId: string): Promise<BoardTaskWithColumn[]> {
  const tasks = await db.query.boardTasks.findMany({
    where: eq(boardTasks.userId, userId),
    orderBy: [asc(boardTasks.order)],
    with: {
      column: true,
    },
  });

  return tasks;
}

export async function createBoardTask(
  userId: string,
  data: CreateBoardTaskData
): Promise<BoardTask> {
  const [task] = await db
    .insert(boardTasks)
    .values({
      userId,
      ...data,
    })
    .returning();

  return task;
}

export async function updateBoardTask(
  taskId: string,
  userId: string,
  data: Omit<UpdateBoardTaskData, "id">
): Promise<BoardTask> {
  const [task] = await db
    .update(boardTasks)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(boardTasks.id, taskId), eq(boardTasks.userId, userId)))
    .returning();

  return task;
}

export async function deleteBoardTask(taskId: string, userId: string): Promise<void> {
  await db.delete(boardTasks).where(and(eq(boardTasks.id, taskId), eq(boardTasks.userId, userId)));
}

export async function reorderTask(
  taskId: string,
  userId: string,
  sourceColumnId: string,
  destinationColumnId: string,
  newOrder: number
): Promise<BoardTaskWithColumn | null> {
  const task = await getBoardTask(taskId, userId);
  if (!task) {
    throw new Error("Task not found");
  }

  const oldOrder = task.order;
  const isSameColumn = sourceColumnId === destinationColumnId;

  if (isSameColumn) {
    if (newOrder > oldOrder) {
      await db
        .update(boardTasks)
        .set({ order: sql`"order" - 1`, updatedAt: new Date() })
        .where(
          and(
            eq(boardTasks.userId, userId),
            eq(boardTasks.columnId, sourceColumnId),
            gt(boardTasks.order, oldOrder),
            lt(boardTasks.order, newOrder + 1)
          )
        );
    } else if (newOrder < oldOrder) {
      await db
        .update(boardTasks)
        .set({ order: sql`"order" + 1`, updatedAt: new Date() })
        .where(
          and(
            eq(boardTasks.userId, userId),
            eq(boardTasks.columnId, sourceColumnId),
            lt(boardTasks.order, oldOrder),
            gt(boardTasks.order, newOrder - 1)
          )
        );
    }

    await db
      .update(boardTasks)
      .set({ order: newOrder, updatedAt: new Date() })
      .where(and(eq(boardTasks.id, taskId), eq(boardTasks.userId, userId)));
  } else {
    await db
      .update(boardTasks)
      .set({ order: sql`"order" - 1`, updatedAt: new Date() })
      .where(
        and(
          eq(boardTasks.userId, userId),
          eq(boardTasks.columnId, sourceColumnId),
          gt(boardTasks.order, oldOrder)
        )
      );

    await db
      .update(boardTasks)
      .set({ order: sql`"order" + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(boardTasks.userId, userId),
          eq(boardTasks.columnId, destinationColumnId),
          gt(boardTasks.order, newOrder - 1)
        )
      );

    await db
      .update(boardTasks)
      .set({
        columnId: destinationColumnId,
        order: newOrder,
        updatedAt: new Date(),
      })
      .where(and(eq(boardTasks.id, taskId), eq(boardTasks.userId, userId)));
  }

  const updatedTask = await getBoardTask(taskId, userId);
  return updatedTask;
}

export async function getNextTaskOrder(columnId: string, userId: string): Promise<number> {
  const tasks = await db.query.boardTasks.findMany({
    where: and(eq(boardTasks.columnId, columnId), eq(boardTasks.userId, userId)),
    orderBy: [desc(boardTasks.order)],
    limit: 1,
  });

  return tasks.length > 0 ? tasks[0].order + 1 : 0;
}

export async function getNextColumnOrder(userId: string): Promise<number> {
  const columns = await db.query.boardColumns.findMany({
    where: eq(boardColumns.userId, userId),
    orderBy: [desc(boardColumns.order)],
    limit: 1,
  });

  return columns.length > 0 ? columns[0].order + 1 : 0;
}
