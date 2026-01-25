"use client";

import { useEffect, useState } from "react";
import {
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
import { CreateTaskDialog } from "./create-task-dialog";
import { RefreshCw } from "lucide-react";
import {
  getUserBoardTasksAction,
  reorderBoardTaskAction,
  initializeDefaultColumnsAction,
} from "@/app/actions/board";
import type { BoardColumn as BoardColumnType, BoardTask } from "@/types";
import { toast } from "sonner";

type BoardViewProps = {
  initialColumns: BoardColumnType[];
};

export function BoardView({ initialColumns }: BoardViewProps) {
  const [columns, setColumns] = useState<BoardColumnType[]>(initialColumns);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const loadData = async () => {
    try {
      const tasksResult = await getUserBoardTasksAction();

      if (tasksResult.success) {
        setTasks(tasksResult.data);
      }
    } catch (error) {
      toast.error("Failed to load tasks");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitializeColumns = async () => {
    setIsInitializing(true);
    try {
      const result = await initializeDefaultColumnsAction();
      if (result.success) {
        setColumns(result.data);
        toast.success("Default columns created");
      }
    } catch (error) {
      toast.error("Failed to initialize columns");
      console.error(error);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    // Auto-initialize default columns if none exist
    if (initialColumns.length === 0) {
      handleInitializeColumns();
    } else {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const destinationColumnId = over.id as string;
    if (task.columnId === destinationColumnId) return;

    // Optimistic update
    const updatedTasks = tasks.map((t) =>
      t.id === taskId ? { ...t, columnId: destinationColumnId } : t
    );
    setTasks(updatedTasks);

    try {
      await reorderBoardTaskAction({
        taskId,
        sourceColumnId: task.columnId,
        destinationColumnId,
        order: 0, // Will be recalculated by the service
      });
      toast.success("Task moved");
    } catch (error) {
      // Revert on error
      setTasks(tasks);
      toast.error("Failed to move task");
      console.error(error);
    }
  };

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Setting up your board...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <CreateTaskDialog columns={columns} onSuccess={loadData} />
          <CreateColumnDialog onSuccess={loadData} />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          <SortableContext
            items={columns.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            {columns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                tasks={tasks.filter((t) => t.columnId === column.id)}
                onRefresh={loadData}
                isLoadingTasks={isLoading}
              />
            ))}
          </SortableContext>
        </div>

        <DragOverlay>
          {activeTask && <BoardTaskCard task={activeTask} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
