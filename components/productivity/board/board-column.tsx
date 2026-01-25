"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { BoardTaskCard } from "./board-task-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreHorizontal, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteBoardColumnAction } from "@/app/actions/board";
import { toast } from "sonner";
import type { BoardColumn as BoardColumnType, BoardTask } from "@/types";
import { CreateTaskDialog } from "./create-task-dialog";

type BoardColumnProps = {
  column: BoardColumnType;
  tasks: BoardTask[];
  onRefresh: () => void;
  isLoadingTasks?: boolean;
};

export function BoardColumn({ column, tasks, onRefresh, isLoadingTasks = false }: BoardColumnProps) {
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  const handleDelete = async () => {
    if (tasks.length > 0) {
      toast.error("Cannot delete column with tasks");
      return;
    }

    try {
      await deleteBoardColumnAction(column.id);
      toast.success("Column deleted");
      onRefresh();
    } catch (error) {
      toast.error("Failed to delete column");
      console.error(error);
    }
  };

  return (
    <Card className="w-80 shrink-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{column.name}</CardTitle>
            <Badge variant="secondary">{tasks.length}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <CreateTaskDialog columns={[column]} onSuccess={onRefresh} defaultColumnId={column.id}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Plus className="h-4 w-4" />
              </Button>
            </CreateTaskDialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  Delete Column
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={setNodeRef}
          className="flex flex-col gap-2 min-h-50"
        >
          {isLoadingTasks ? (
            <>
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </>
          ) : (
            <>
              <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {tasks.map((task) => (
                  <BoardTaskCard key={task.id} task={task} onRefresh={onRefresh} />
                ))}
              </SortableContext>
              {tasks.length === 0 && (
                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                  Drop tasks here
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
