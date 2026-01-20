"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  EyeOff,
  Plus,
  Download,
  MoreHorizontal,
  TrendingUp,
  Camera,
  Trash2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ManualSnapshotDialog } from "./manual-snapshot-dialog";
import { deleteManualSnapshotsAction } from "@/app/actions/portfolio-snapshots";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AdminOnly } from "@/components/admin-only";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PortfolioHeaderProps = {
  portfolioName: string;
  totalValue: number;
  dailyChange: number;
  dailyChangePercentage: number;
  onAddTransaction: () => void;
  showCharts: boolean;
  onToggleCharts: () => void;
  hideValues: boolean;
  onToggleHideValues: () => void;
  isAdmin: boolean;
};

export function PortfolioHeader({
  portfolioName,
  totalValue,
  dailyChange,
  dailyChangePercentage,
  onAddTransaction,
  showCharts,
  onToggleCharts,
  hideValues,
  onToggleHideValues,
  isAdmin,
}: PortfolioHeaderProps) {
  const isProfit = dailyChange >= 0;
  const [isSnapshotDialogOpen, setIsSnapshotDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDeleteSnapshots = async () => {
    try {
      setIsDeleting(true);
      await deleteManualSnapshotsAction();
      toast.success("Manual snapshots deleted successfully");
      router.refresh();
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error("Error deleting snapshots:", error);
      toast.error("Error deleting snapshots");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* Left Side: Title and Balance */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground/90">
              {portfolioName}
            </h1>
            <Badge
              variant="secondary"
              className="text-xs px-2 py-0.5 rounded-md"
            >
              Default
            </Badge>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-4xl font-bold tracking-tight">
                {hideValues
                  ? "****"
                  : `$${totalValue.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
              </span>
              <button
                onClick={onToggleHideValues}
                className="focus:outline-none"
              >
                {hideValues ? (
                  <EyeOff className="w-5 h-5 text-muted-foreground cursor-pointer hover:text-foreground" />
                ) : (
                  <Eye className="w-5 h-5 text-muted-foreground cursor-pointer hover:text-foreground" />
                )}
              </button>
            </div>
            <div
              className={`flex items-center gap-2 text-sm font-medium ${
                isProfit ? "text-green-500" : "text-red-500"
              }`}
            >
              <span>
                {hideValues
                  ? "****"
                  : `${isProfit ? "+" : "-"}$${Math.abs(
                      dailyChange
                    ).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
              </span>
              <div className="flex items-center">
                <TrendingUp
                  className={`w-3 h-3 mr-1 ${!isProfit && "rotate-180"}`}
                />
                {Math.abs(dailyChangePercentage).toFixed(2)}% (24h)
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Actions */}
        <div className="flex items-end gap-3 flex-col">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 mr-2">
              <span className="text-sm text-muted-foreground">Show charts</span>
              <Switch checked={showCharts} onCheckedChange={onToggleCharts} />
            </div>

            <Button onClick={onAddTransaction} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Transaction
            </Button>

            <Button variant="outline" className="gap-2 bg-background">
              <Download className="w-4 h-4" />
              Export
            </Button>

            <Button variant="outline" size="icon" className="bg-background">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3 bg-accent w-full p-2 rounded-md justify-end">
            <AdminOnly isAdmin={isAdmin}>
              <Button
                variant="outline"
                className="gap-2 bg-background"
                onClick={() => setIsSnapshotDialogOpen(true)}
              >
                <Camera className="w-4 h-4" />
                Manual Snapshot
              </Button>

              <Button
                variant="outline"
                className="gap-2 bg-background"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4" />
                Delete Snapshots
              </Button>
            </AdminOnly>
          </div>
        </div>
      </div>

      <ManualSnapshotDialog
        open={isSnapshotDialogOpen}
        onOpenChange={setIsSnapshotDialogOpen}
      />

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will delete all manually created snapshots.
              System-generated snapshots will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSnapshots}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
