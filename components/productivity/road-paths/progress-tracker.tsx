"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import {
  createRoadPathProgressAction,
} from "@/app/actions/road-path";
import { createRoadPathProgressSchema, type CreateRoadPathProgressInput } from "@/schemas/road-path";
import { toast } from "sonner";
import type { RoadPathProgress } from "@/types";
import { format } from "date-fns";

type ProgressTrackerProps = {
  roadPathId: string;
  progress: RoadPathProgress[];
  unit: string;
  onRefresh: () => void;
};

export function ProgressTracker({ roadPathId, progress, unit, onRefresh }: ProgressTrackerProps) {
  const [showForm, setShowForm] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateRoadPathProgressInput>({
    resolver: zodResolver(createRoadPathProgressSchema),
    defaultValues: {
      roadPathId,
    },
  });

  const onSubmit = async (data: CreateRoadPathProgressInput) => {
    try {
      await createRoadPathProgressAction(data);
      toast.success("Progress recorded");
      reset();
      setShowForm(false);
      onRefresh();
    } catch (error) {
      toast.error("Failed to record progress");
      console.error(error);
    }
  };

  const sortedProgress = [...progress].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2 max-h-75 overflow-y-auto">
        {sortedProgress.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg border">
            <div>
              <p className="font-medium">{parseFloat(entry.value)} {unit}</p>
              <p className="text-xs text-muted-foreground">
                {entry.date && format(new Date(entry.date), "MMM d, yyyy")}
              </p>
            </div>
            {entry.notes && (
              <p className="text-sm text-muted-foreground">{entry.notes}</p>
            )}
          </div>
        ))}

        {sortedProgress.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No progress recorded yet
          </p>
        )}
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="currentValue">Value</Label>
            <Input
              id="currentValue"
              type="number"
              step="0.01"
              placeholder={`Current ${unit}`}
              {...register("value", { valueAsNumber: true })}
            />
            {errors.value && (
              <p className="text-sm text-destructive">{errors.value.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              placeholder="Any notes..."
              {...register("notes")}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isSubmitting}>
              Record
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Record Progress
        </Button>
      )}
    </div>
  );
}
