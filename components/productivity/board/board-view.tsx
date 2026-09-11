"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { BoardColumn } from "./board-column";
import { BoardTaskCard } from "./board-task-card";
import { CreateColumnDialog } from "./create-column-dialog";
import { TaskDialog } from "./task-dialog";
import { Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import {
  createBoardColumnAction,
  createBoardTaskAction,
  deleteBoardColumnAction,
  deleteBoardTaskAction,
  reorderBoardTaskAction,
  updateBoardColumnAction,
  updateBoardTaskAction,
} from "@/app/actions/board";
import type { BoardColumn as BoardColumnType, BoardTask } from "@/types";
import type { CreateBoardColumnData, CreateBoardTaskData } from "@/schemas/board";
import { toast } from "sonner";

type BoardViewProps = {
  initialColumns: BoardColumnType[];
  initialTasks: BoardTask[];
};

function buildOptimisticTask(data: CreateBoardTaskData, tempId: string, order: number): BoardTask {
  return {
    id: tempId,
    userId: "",
    columnId: data.columnId,
    roadPathId: data.roadPathId ?? null,
    title: data.title,
    description: data.description ?? null,
    priority: data.priority ?? null,
    order,
    dueDate: data.dueDate ?? null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildOptimisticColumn(data: CreateBoardColumnData, tempId: string): BoardColumnType {
  return {
    id: tempId,
    userId: "",
    name: data.name,
    order: data.order,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function BoardView({ initialColumns, initialTasks }: BoardViewProps): React.ReactElement {
  const [columns, setColumns] = useState<BoardColumnType[]>(initialColumns);
  const [tasks, setTasks] = useState<BoardTask[]>(initialTasks);
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [pendingMutations, setPendingMutations] = useState<number>(0);
  const isSyncing = pendingMutations > 0;
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const { setOpen: setSidebarOpen, open: isSidebarOpen } = useSidebar();
  // Remember the sidebar state so we can restore it when the user collapses the board.
  const sidebarStateBeforeExpand = useRef<boolean>(isSidebarOpen);

  useEffect(() => {
    if (isExpanded) {
      sidebarStateBeforeExpand.current = isSidebarOpen;
      setSidebarOpen(false);
    } else {
      setSidebarOpen(sidebarStateBeforeExpand.current);
    }
    // We intentionally only react to the expand toggle; sidebar state changes from
    // elsewhere should not loop back through this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);
  // Serialize reorder mutations: rapid drags get queued and applied in order
  // so the server never sees them out of sequence.
  const reorderQueue = useRef<Promise<void>>(Promise.resolve());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const taskIndex = useMemo(() => {
    const byId = new Map<string, BoardTask>();
    const byColumnId: Record<string, BoardTask[]> = {};
    for (const task of tasks) {
      byId.set(task.id, task);
      if (!byColumnId[task.columnId]) {
        byColumnId[task.columnId] = [];
      }
      byColumnId[task.columnId].push(task);
    }
    // The server hands these back ordered; an optimistic move does not, and a
    // column that renders in insertion order shows the drop landing in the
    // wrong place until the next load.
    for (const list of Object.values(byColumnId)) {
      list.sort((a, b) => a.order - b.order);
    }
    return { byId, byColumnId };
  }, [tasks]);

  const handleDragStart = (event: DragStartEvent): void => {
    const task = taskIndex.byId.get(event.active.id as string);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const task = taskIndex.byId.get(taskId);
    if (!task) return;

    // A drop lands either on a column's empty space or on another task. Only
    // the first was handled, so reordering inside a column was impossible and
    // every move across columns went to position 0 regardless of where it was
    // released — the service has always taken an index, nothing ever sent one.
    const overId = over.id as string;
    const overTask = taskIndex.byId.get(overId);
    const destinationColumnId = overTask ? overTask.columnId : overId;
    if (!columns.some((c) => c.id === destinationColumnId)) return;

    const sourceColumnId = task.columnId;
    const sameColumn = sourceColumnId === destinationColumnId;
    // The index is taken against the destination column AS IT STANDS, with the
    // dragged card still in it — that is the convention `reorderTask` uses.
    // Measuring against the list with the card removed made every downward
    // move land one slot short, and made the shortest one (onto the next card)
    // compare equal to where it already was and get dropped by the guard.
    const column = taskIndex.byColumnId[destinationColumnId] ?? [];
    const at = overTask ? column.findIndex((t) => t.id === overTask.id) : -1;
    // Released on the column itself rather than on a card: the end of the list.
    const end = sameColumn ? Math.max(0, column.length - 1) : column.length;
    const newOrder = at === -1 ? end : at;

    if (sameColumn && task.order === newOrder) return;

    const previousTasks = tasks;

    // Optimistic UI update — server call is enqueued below. BOTH columns are
    // renumbered: the service closes the gap the card leaves behind, and a
    // client that only renumbered the destination drifted out of step with it
    // until the next load.
    setTasks((prev) => {
      const moved = { ...task, columnId: destinationColumnId };
      const target = sameColumn ? column.filter((t) => t.id !== taskId) : [...column];
      target.splice(newOrder, 0, moved);
      const orders = new Map(target.map((t, i) => [t.id, i]));
      if (!sameColumn) {
        (taskIndex.byColumnId[sourceColumnId] ?? [])
          .filter((t) => t.id !== taskId)
          .forEach((t, i) => orders.set(t.id, i));
      }
      return prev.map((t) => {
        const order = orders.get(t.id);
        if (order === undefined) return t;
        return t.id === taskId ? { ...moved, order } : { ...t, order };
      });
    });

    setPendingMutations((n) => n + 1);
    reorderQueue.current = reorderQueue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const result = await reorderBoardTaskAction({
            taskId,
            sourceColumnId,
            destinationColumnId,
            order: newOrder,
          });
          if (!result.success) {
            setTasks(previousTasks);
            toast.error(result.error || "Failed to move task");
          }
        } catch {
          setTasks(previousTasks);
          toast.error("Failed to move task");
        } finally {
          setPendingMutations((n) => n - 1);
        }
      });
  };

  const handleCreateTask = async (data: CreateBoardTaskData): Promise<void> => {
    const tempId = `temp-${crypto.randomUUID()}`;
    const columnTasks = taskIndex.byColumnId[data.columnId] ?? [];
    const nextOrder = columnTasks.length > 0 ? Math.max(...columnTasks.map((t) => t.order)) + 1 : 0;
    const optimistic = buildOptimisticTask(data, tempId, nextOrder);

    setTasks((prev) => [...prev, optimistic]);

    try {
      setPendingMutations((n) => n + 1);
      const result = await createBoardTaskAction(data);
      if (result.success) {
        setTasks((prev) => prev.map((t) => (t.id === tempId ? result.data : t)));
      } else {
        // The action reports failure in its return value, so throw and let the
        // one catch below roll back and report. Doing it here as well stacked
        // two toasts, the second of which discarded the server's message.
        throw new Error(result.error || "Failed to create task");
      }
    } catch (error) {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      toast.error(error instanceof Error ? error.message : "Failed to create task");
      throw error;
    } finally {
      setPendingMutations((n) => n - 1);
    }
  };

  const handleCreateColumn = async (data: CreateBoardColumnData): Promise<void> => {
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic = buildOptimisticColumn(data, tempId);

    setColumns((prev) => [...prev, optimistic]);

    try {
      setPendingMutations((n) => n + 1);
      const result = await createBoardColumnAction(data);
      if (result.success) {
        setColumns((prev) => prev.map((c) => (c.id === tempId ? result.data : c)));
      } else {
        throw new Error(result.error || "Failed to create column");
      }
    } catch (error) {
      setColumns((prev) => prev.filter((c) => c.id !== tempId));
      toast.error(error instanceof Error ? error.message : "Failed to create column");
      throw error;
    } finally {
      setPendingMutations((n) => n - 1);
    }
  };

  const handleUpdateTask = async (
    taskId: string,
    data: CreateBoardTaskData
  ): Promise<void> => {
    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              columnId: data.columnId,
              title: data.title,
              description: data.description ?? null,
              priority: data.priority ?? null,
              dueDate: data.dueDate ?? null,
            }
          : t
      )
    );

    try {
      setPendingMutations((n) => n + 1);
      const current = previous.find((t) => t.id === taskId);
      // A column change is a move, not a field edit: `updateBoardTask` would
      // write the new columnId with the old `order`, leaving a hole in the
      // source column and a duplicate order in the destination. Reorder to
      // the end of the destination first, then save the other fields.
      if (current && current.columnId !== data.columnId) {
        const destinationCount = previous.filter(
          (t) => t.columnId === data.columnId
        ).length;
        const moved = await reorderBoardTaskAction({
          taskId,
          sourceColumnId: current.columnId,
          destinationColumnId: data.columnId,
          order: destinationCount,
        });
        if (!moved.success) {
          setTasks(previous);
          toast.error(moved.error || "Failed to move task");
          throw new Error(moved.error || "Failed to move task");
        }
      }
      const result = await updateBoardTaskAction({ id: taskId, ...data });
      if (!result.success) {
        setTasks(previous);
        toast.error(result.error || "Failed to update task");
        throw new Error(result.error || "Failed to update task");
      }
    } catch (error) {
      setTasks(previous);
      throw error;
    } finally {
      setPendingMutations((n) => n - 1);
    }
  };

  const handleRenameColumn = async (columnId: string, name: string): Promise<void> => {
    const previous = columns;
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, name } : c)));

    try {
      setPendingMutations((n) => n + 1);
      const result = await updateBoardColumnAction({ id: columnId, name });
      if (!result.success) {
        setColumns(previous);
        toast.error(result.error || "Failed to rename column");
        throw new Error(result.error || "Failed to rename column");
      }
    } catch (error) {
      setColumns(previous);
      throw error;
    } finally {
      setPendingMutations((n) => n - 1);
    }
  };

  const handleDeleteTask = async (taskId: string): Promise<void> => {
    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    try {
      setPendingMutations((n) => n + 1);
      await deleteBoardTaskAction(taskId);
    } catch {
      setTasks(previous);
      toast.error("Failed to delete task");
    } finally {
      setPendingMutations((n) => n - 1);
    }
  };

  const handleDeleteColumn = async (columnId: string): Promise<void> => {
    const previous = columns;
    const previousTasks = tasks;
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
    // board_tasks.column_id cascades, so the tasks are gone too. Leaving them
    // in state kept them counted and rendered by nothing.
    setTasks((prev) => prev.filter((t) => t.columnId !== columnId));

    try {
      setPendingMutations((n) => n + 1);
      await deleteBoardColumnAction(columnId);
    } catch {
      setColumns(previous);
      setTasks(previousTasks);
      toast.error("Failed to delete column");
    } finally {
      setPendingMutations((n) => n - 1);
    }
  };

  const nextColumnOrder = columns.length > 0 ? Math.max(...columns.map((c) => c.order)) + 1 : 0;
  const isDraggingTask = activeTask !== null;

  return (
    <div
      // The viewport-escape trick: width:100vw + negative margin centers a wider
      // element than its parent's max-width allows. Combined with closing the
      // sidebar, the board really fills the screen.
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4",
        isExpanded && "w-screen -ml-[calc(50vw-50%)]"
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-start justify-between gap-3",
          isExpanded && "px-4 sm:px-6 lg:px-8"
        )}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Heading level="h1">Task Board</Heading>
            {isSyncing ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <RefreshCw className="size-3 animate-spin" />
                Syncing
              </span>
            ) : null}
          </div>
          <Text variant="muted">Manage your tasks with a visual board</Text>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded((v) => !v)}
            aria-label={isExpanded ? "Collapse board" : "Expand board"}
            title={isExpanded ? "Collapse board" : "Expand board"}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          {columns.length > 0 ? (
            <TaskDialog columns={columns} onSubmit={handleCreateTask} />
          ) : null}
          <CreateColumnDialog onCreate={handleCreateColumn} nextOrder={nextColumnOrder} />
        </div>
      </header>

      {columns.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed">
          <Text variant="muted">No columns yet. Create your first column to start.</Text>
        </div>
      ) : (
        <DndContext
          // Without a fixed id dnd-kit numbers `aria-describedby` from a
          // module counter, and the server and the client land on different
          // numbers — a hydration mismatch on every load of this page.
          id="task-board"
          // Default rect-intersection resolves a drop to whichever droppable
          // overlaps most — and a column's rect contains every card in it, so
          // the column always won and a drop never named a card. Closest-corner
          // picks the nearest thing instead, which is how a card becomes a
          // drop target at all.
          collisionDetection={closestCorners}
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div
            className={cn(
              // `relative` is load-bearing: it makes the rail the containing
              // block for its absolutely-positioned descendants. Without it the
              // per-column `sr-only` labels resolve against SidebarInset (the
              // nearest positioned ancestor), escape this scroller's clip and
              // stretch the document to the rail's full scroll width — the whole
              // page scrolls sideways on phones. `min-w-0` does not fix it.
              "relative -mx-1 flex min-h-0 flex-1 gap-3 overflow-x-auto px-1 pb-2",
              isExpanded && "px-4 sm:px-6 lg:px-8"
            )}
          >
            <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
              {columns.map((column) => (
                <BoardColumn
                  key={column.id}
                  column={column}
                  columns={columns}
                  tasks={taskIndex.byColumnId[column.id] ?? []}
                  onCreateTask={handleCreateTask}
                  onRenameColumn={handleRenameColumn}
                  onDeleteColumn={handleDeleteColumn}
                  onDeleteTask={handleDeleteTask}
                  onUpdateTask={handleUpdateTask}
                  isDimmed={isDraggingTask && activeTask?.columnId !== column.id}
                />
              ))}
            </SortableContext>
          </div>

          <DragOverlay>
            {activeTask ? <BoardTaskCard task={activeTask} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
