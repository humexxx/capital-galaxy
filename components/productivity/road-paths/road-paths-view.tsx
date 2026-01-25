"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import { RoadPathCard } from "./road-path-card";
import { CreateRoadPathDialog } from "./create-road-path-dialog";
import { RoadPathDetail } from "./road-path-detail";
import { getUserRoadPathsAction } from "@/app/actions/road-path";
import type { RoadPath } from "@/types";
import { toast } from "sonner";

export function RoadPathsView() {
  const [roadPaths, setRoadPaths] = useState<RoadPath[]>([]);
  const [selectedPath, setSelectedPath] = useState<RoadPath | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    try {
      const result = await getUserRoadPathsAction();
      if (result.success) {
        setRoadPaths(result.data);
      }
    } catch (error) {
      toast.error("Failed to load road paths");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedPath) {
    return (
      <RoadPathDetail
        roadPath={selectedPath}
        onBack={() => setSelectedPath(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Track your long-term goals and create automated tasks
        </p>
        <CreateRoadPathDialog onSuccess={loadData}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Road Path
          </Button>
        </CreateRoadPathDialog>
      </div>

      {roadPaths.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">No road paths yet. Create your first one!</p>
          <CreateRoadPathDialog onSuccess={loadData}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Road Path
            </Button>
          </CreateRoadPathDialog>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roadPaths.map((path) => (
            <RoadPathCard
              key={path.id}
              roadPath={path}
              onClick={() => setSelectedPath(path)}
              onRefresh={loadData}
            />
          ))}
        </div>
      )}
    </div>
  );
}
