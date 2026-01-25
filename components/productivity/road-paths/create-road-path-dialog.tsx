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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRoadPathAction } from "@/app/actions/road-path";
import { createRoadPathSchema, type CreateRoadPathInput } from "@/schemas/road-path";
import { toast } from "sonner";
import type { RoadPathFrequency } from "@/types";

type CreateRoadPathDialogProps = {
  onSuccess: () => void;
  children?: React.ReactNode;
};

export function CreateRoadPathDialog({ onSuccess, children }: CreateRoadPathDialogProps) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
  } = useForm<CreateRoadPathInput>({
    resolver: zodResolver(createRoadPathSchema),
    defaultValues: {
      createFirstTask: true,
    },
  });

  const autoCreateTasks = watch("autoCreateTasks");
  const taskFrequency = watch("taskFrequency");

  const onSubmit = async (data: CreateRoadPathInput) => {
    try {
      await createRoadPathAction(data);
      toast.success("Road path created");
      setOpen(false);
      reset();
      onSuccess();
    } catch (error) {
      toast.error("Failed to create road path");
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || <Button>Create Road Path</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Road Path</DialogTitle>
          <DialogDescription>
            Set up a long-term goal with measurable progress
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Learn Spanish"
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
              placeholder="Describe your goal..."
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="targetValue">Target Value</Label>
              <Input
                id="targetValue"
                type="number"
                placeholder="100"
                {...register("targetValue", { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                placeholder="hours, lessons, etc."
                {...register("unit")}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                {...register("startDate")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetDate">Target Date</Label>
              <Input
                id="targetDate"
                type="date"
                {...register("targetDate")}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="autoCreateTasks"
                checked={autoCreateTasks}
                onCheckedChange={(checked) => setValue("autoCreateTasks", checked as boolean)}
              />
              <Label htmlFor="autoCreateTasks" className="cursor-pointer">
                Automatically create tasks on schedule
              </Label>
            </div>

            {autoCreateTasks && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="frequency">Task Creation Frequency</Label>
                  <Select onValueChange={(value) => setValue("taskFrequency", value as RoadPathFrequency)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="every_other_day">Every Other Day</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Biweekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Tasks will be created automatically at the start of each day based on this frequency
                  </p>
                </div>

                {taskFrequency && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="createFirstTask"
                      defaultChecked={true}
                      onCheckedChange={(checked) => setValue("createFirstTask", checked as boolean)}
                    />
                    <Label htmlFor="createFirstTask" className="cursor-pointer">
                      Create first task immediately
                    </Label>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Road Path"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
