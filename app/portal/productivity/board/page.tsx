import { BoardView } from "@/components/productivity/board/board-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Task Board | Capital Galaxy",
  description: "Manage your tasks with a visual board",
};

export default function BoardPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8 p-8 max-w-screen-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Task Board</h1>
        <p className="text-muted-foreground">Manage your tasks with a visual board</p>
      </div>
      <BoardView />
    </div>
  );
}
