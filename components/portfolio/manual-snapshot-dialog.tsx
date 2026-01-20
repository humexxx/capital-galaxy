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
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { createManualSnapshotAction } from "@/app/actions/portfolio-snapshots";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import type { SnapshotSource } from "@/schemas/snapshot";

interface ManualSnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManualSnapshotDialog({ open, onOpenChange }: ManualSnapshotDialogProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [applyInterest, setApplyInterest] = useState(false);
  const [source, setSource] = useState<SnapshotSource>("manual");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    try {
      setIsLoading(true);

      const result = await createManualSnapshotAction({
        date,
        applyInterest,
        source,
      });

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
            Create a snapshot of your portfolio&apos;s current value with custom settings.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel>Snapshot Date</FieldLabel>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  autoFocus
                  disabled={(date) => {
                    if (isLoading) return true;
                    return date > new Date();
                  }}
                />
              </PopoverContent>
            </Popover>
            <FieldDescription>
              The date for this snapshot record
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="source">Snapshot Type</FieldLabel>
            <Select
              value={source}
              onValueChange={(value) => setSource(value as SnapshotSource)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="admin_enforce">Admin Enforce (Protected)</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              Admin Enforce snapshots won&apos;t be deleted when clearing manual snapshots
            </FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <div className="space-y-1">
              <FieldLabel htmlFor="apply-interest">Apply monthly interest</FieldLabel>
              <FieldDescription>
                Calculate and apply compound interest to all active investments before
                creating the snapshot
              </FieldDescription>
            </div>
            <Switch
              id="apply-interest"
              checked={applyInterest}
              onCheckedChange={setApplyInterest}
              disabled={isLoading}
            />
          </Field>
        </FieldGroup>

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
