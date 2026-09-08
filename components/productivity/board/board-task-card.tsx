"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Heading, Mono, Text } from "@/components/ui/typography";
import { GripVertical, MoreHorizontal, Calendar } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { TaskDialog } from "./task-dialog";
import type { BoardColumn, BoardTask, TaskPriority } from "@/types";
import type { CreateBoardTaskData } from "@/schemas/board";
import { cn } from "@/lib/utils";

type BoardTaskCardProps = {
  task: BoardTask;
  isOverlay?: boolean;
  /** Every column, so the edit form can move the task. */
  columns?: BoardColumn[];
  onDelete?: (taskId: string) => Promise<void>;
  onUpdate?: (taskId: string, data: CreateBoardTaskData) => Promise<void>;
};

const PRIORITY_STYLES: Record<TaskPriority, { bar: string; label: string; tone: string }> = {
  low: { bar: "bg-success", label: "Low", tone: "text-success" },
  medium: { bar: "bg-warning", label: "Medium", tone: "text-warning" },
  high: { bar: "bg-destructive", label: "High", tone: "text-destructive" },
};

export function BoardTaskCard({
  task,
  isOverlay,
  columns = [],
  onDelete,
  onUpdate,
}: BoardTaskCardProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: isOverlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityStyle = task.priority ? PRIORITY_STYLES[task.priority] : null;
  const isOptimistic = task.id.startsWith("temp-");

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex cursor-grab flex-col gap-1.5 rounded-lg border bg-card p-3 shadow-sm transition-shadow active:cursor-grabbing",
        isDragging && "opacity-40",
        isOverlay && "cursor-grabbing shadow-lg ring-1 ring-primary/30",
        isOptimistic && "opacity-70",
        !isOverlay && "hover:shadow-md"
      )}
    >
      {priorityStyle ? (
        <span
          className={cn("absolute left-0 top-2 bottom-2 w-1 rounded-r-full", priorityStyle.bar)}
          aria-hidden="true"
        />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-1 items-start gap-1.5">
          <GripVertical
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/40 opacity-60 transition sm:opacity-0 sm:group-hover:opacity-100"
            aria-hidden="true"
          />
          <Heading level="h6" as="h4">{task.title}</Heading>
        </div>
        {onDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onPointerDown={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 text-muted-foreground/60 opacity-60 transition hover:text-foreground sm:size-6 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
                <span className="sr-only">Task options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onUpdate ? (
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  Edit task
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={() => onDelete(task.id)}
                className="text-destructive"
              >
                Delete task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {task.description ? (
        <Text variant="small" className="line-clamp-2">{task.description}</Text>
      ) : null}

      {priorityStyle || task.dueDate ? (
        <div className="mt-1 flex items-center gap-3 text-2xs">
          {priorityStyle ? (
            <span className={cn("inline-flex items-center gap-1 font-medium", priorityStyle.tone)}>
              <span className={cn("size-1.5 rounded-full", priorityStyle.bar)} />
              {priorityStyle.label}
            </span>
          ) : null}
          {task.dueDate ? (
            <Mono className="inline-flex items-center gap-1 text-muted-foreground">
              <Calendar className="size-3" />
              {format(new Date(task.dueDate), "MMM d")}
            </Mono>
          ) : null}
        </div>
      ) : null}

      {onUpdate ? (
        <TaskDialog
          columns={columns}
          task={task}
          open={editing}
          onOpenChange={setEditing}
          onSubmit={(data) => onUpdate(task.id, data)}
        />
      ) : null}
    </div>
  );
}
