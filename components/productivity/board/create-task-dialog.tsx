"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { createBoardTaskAction } from "@/app/actions/board";
import { createBoardTaskSchema, type CreateBoardTaskData } from "@/schemas/board";
import { toast } from "sonner";
import type { BoardColumn } from "@/types";

type CreateTaskDialogProps = {
  columns: BoardColumn[];
  onSuccess: () => void;
  defaultColumnId?: string;
  children?: React.ReactNode;
};

export function CreateTaskDialog({
  columns,
  onSuccess,
  defaultColumnId,
  children,
}: CreateTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    reset,
  } = useForm<CreateBoardTaskData>({
    resolver: zodResolver(createBoardTaskSchema),
    defaultValues: {
      columnId: defaultColumnId || columns[0]?.id,
    },
  });

  const onSubmit = async (data: CreateBoardTaskData) => {
    try {
      await createBoardTaskAction(data);
      toast.success("Task created");
      setOpen(false);
      reset();
      onSuccess();
    } catch (error) {
      toast.error("Failed to create task");
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>Add a new task to your board</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Task title"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Task description (optional)"
              {...register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="columnId">Column</Label>
            <Select
              onValueChange={(value) => setValue("columnId", value)}
              defaultValue={defaultColumnId || columns[0]?.id}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {columns.map((column) => (
                  <SelectItem key={column.id} value={column.id}>
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.columnId && (
              <p className="text-sm text-destructive">{errors.columnId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select onValueChange={(value) => setValue("priority", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select priority (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
