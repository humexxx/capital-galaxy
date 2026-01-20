"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createManualSnapshotAction } from "@/app/actions/portfolio-snapshots";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface ManualSnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManualSnapshotDialog({ open, onOpenChange }: ManualSnapshotDialogProps) {
  const [applyInterest, setApplyInterest] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    try {
      setIsLoading(true);

      const result = await createManualSnapshotAction(applyInterest);

      toast.success(
        `Snapshot created successfully. Total value: $${result.totalValue.toFixed(2)}`
      );

      onOpenChange(false);
      router.refresh();
    } catch (error) {
      console.error("Error creating snapshot:", error);
      toast.error("Error creating snapshot");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Manual Snapshot</DialogTitle>
          <DialogDescription>
            Create a snapshot of your portfolio&apos;s current value. Optionally, you can apply
            monthly interest before taking the snapshot.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between space-x-2 py-4">
          <div className="space-y-1">
            <Label htmlFor="apply-interest">Apply monthly interest</Label>
            <p className="text-sm text-muted-foreground">
              Calculate and apply compound interest to all active investments before
              creating the snapshot.
            </p>
          </div>
          <Switch
            id="apply-interest"
            checked={applyInterest}
            onCheckedChange={setApplyInterest}
            disabled={isLoading}
          />
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Creating..." : "Create Snapshot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
