"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import {
  createRoadPathMilestoneAction,
  updateRoadPathMilestoneAction,
  deleteRoadPathMilestoneAction,
} from "@/app/actions/road-path";
import { createRoadPathMilestoneSchema, type CreateRoadPathMilestoneData } from "@/schemas/road-path";
import { toast } from "sonner";
import type { RoadPathMilestone } from "@/types";

type MilestoneListProps = {
  roadPathId: string;
  milestones: RoadPathMilestone[];
  onRefresh: () => void;
};

export function MilestoneList({ roadPathId, milestones, onRefresh }: MilestoneListProps) {
  const [showForm, setShowForm] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateRoadPathMilestoneData>({
    resolver: zodResolver(createRoadPathMilestoneSchema),
    defaultValues: {
      roadPathId,
    },
  });

  const onSubmit = async (data: CreateRoadPathMilestoneData) => {
    try {
      await createRoadPathMilestoneAction(data);
      toast.success("Milestone created");
      reset();
      setShowForm(false);
      onRefresh();
    } catch (error) {
      toast.error("Failed to create milestone");
      console.error(error);
    }
  };

  const handleToggle = async (milestone: RoadPathMilestone) => {
    try {
      await updateRoadPathMilestoneAction({
        id: milestone.id,
        completed: !milestone.completed,
      });
      onRefresh();
    } catch (error) {
      toast.error("Failed to update milestone");
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRoadPathMilestoneAction(id);
      toast.success("Milestone deleted");
      onRefresh();
    } catch (error) {
      toast.error("Failed to delete milestone");
      console.error(error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {milestones.map((milestone) => (
          <div key={milestone.id} className="flex items-center gap-2 p-2 rounded-lg border">
            <Checkbox
              checked={milestone.completed}
              onCheckedChange={() => handleToggle(milestone)}
            />
            <span className={milestone.completed ? "line-through text-muted-foreground flex-1" : "flex-1"}>
              {milestone.title}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleDelete(milestone.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {milestones.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No milestones yet
          </p>
        )}
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
          <Input
            placeholder="Milestone title"
            {...register("title")}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isSubmitting}>
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Milestone
        </Button>
      )}
    </div>
  );
}
