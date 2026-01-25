"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Target, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteRoadPathAction } from "@/app/actions/road-path";
import { toast } from "sonner";
import type { RoadPath } from "@/types";
import { format } from "date-fns";

type RoadPathCardProps = {
  roadPath: RoadPath;
  onClick: () => void;
  onRefresh: () => void;
};

export function RoadPathCard({ roadPath, onClick, onRefresh }: RoadPathCardProps) {
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      await deleteRoadPathAction(roadPath.id);
      toast.success("Road path deleted");
      onRefresh();
    } catch (error) {
      toast.error("Failed to delete road path");
      console.error(error);
    }
  };

  const frequencyLabels = {
    daily: "Daily",
    every_other_day: "Every Other Day",
    weekly: "Weekly",
    biweekly: "Biweekly",
    monthly: "Monthly",
  };

  return (
    <Card className="cursor-pointer hover:border-primary transition-colors" onClick={onClick}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{roadPath.title}</CardTitle>
            {roadPath.description && (
              <CardDescription className="mt-1 line-clamp-2">
                {roadPath.description}
              </CardDescription>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {roadPath.targetValue !== null && (
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span>Target: {roadPath.targetValue} {roadPath.unit}</span>
          </div>
        )}
        
        {roadPath.targetDate && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{format(new Date(roadPath.targetDate), "MMM d, yyyy")}</span>
          </div>
        )}

        {roadPath.frequency && (
          <Badge variant="secondary">
            {frequencyLabels[roadPath.frequency]}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
