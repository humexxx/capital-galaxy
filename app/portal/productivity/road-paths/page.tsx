import { RoadPathsView } from "@/components/productivity/road-paths/road-paths-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Road Paths | Capital Galaxy",
  description: "Track your long-term goals and progress",
};

export default function RoadPathsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8 p-8 max-w-screen-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Road Paths</h1>
        <p className="text-muted-foreground">Track your long-term goals and progress</p>
      </div>
      <RoadPathsView />
    </div>
  );
}
