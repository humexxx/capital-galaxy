"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GripVertical, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteBoardTaskAction } from "@/app/actions/board";
import { toast } from "sonner";
import type { BoardTask } from "@/types";

type BoardTaskCardProps = {
  task: BoardTask;
  isDragging?: boolean;
  onRefresh?: () => void;
};

export function BoardTaskCard({ task, isDragging, onRefresh }: BoardTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  const handleDelete = async () => {
    try {
      await deleteBoardTaskAction(task.id);
      toast.success("Task deleted");
      onRefresh?.();
    } catch (error) {
      toast.error("Failed to delete task");
      console.error(error);
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-50" : ""}
    >
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1">
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing mt-0.5"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="flex-1">
              <h4 className="font-medium text-sm leading-tight">{task.title}</h4>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                Delete Task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      {task.description && (
        <CardContent className="p-3 pt-0">
          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        </CardContent>
      )}
      {task.priority && (
        <CardContent className="p-3 pt-0">
          <Badge variant="outline" className="text-xs">
            {task.priority}
          </Badge>
        </CardContent>
      )}
    </Card>
  );
}
