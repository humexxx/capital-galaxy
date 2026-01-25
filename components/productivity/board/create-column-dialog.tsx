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
import { Plus } from "lucide-react";
import { createBoardColumnAction } from "@/app/actions/board";
import { createBoardColumnSchema, type CreateBoardColumnData } from "@/schemas/board";
import { toast } from "sonner";

type CreateColumnDialogProps = {
  onSuccess: () => void;
};

export function CreateColumnDialog({ onSuccess }: CreateColumnDialogProps) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateBoardColumnData>({
    resolver: zodResolver(createBoardColumnSchema),
  });

  const onSubmit = async (data: CreateBoardColumnData) => {
    try {
      await createBoardColumnAction(data);
      toast.success("Column created");
      setOpen(false);
      reset();
      onSuccess();
    } catch (error) {
      toast.error("Failed to create column");
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Add Column
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Column</DialogTitle>
          <DialogDescription>Add a new column to your board</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Title</Label>
            <Input
              id="name"
              placeholder="Column title"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Column"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
