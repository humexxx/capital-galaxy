import { BoardView } from "@/components/productivity/board/board-view";
import { getUserBoardColumnsAction, initializeDefaultColumnsAction } from "@/app/actions/board";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Task Board | Capital Galaxy",
  description: "Manage your tasks with a visual board",
};

export default async function BoardPage() {
  const columnsResult = await getUserBoardColumnsAction();
  
  // Auto-initialize columns if none exist
  if (columnsResult.success && columnsResult.data.length === 0) {
    await initializeDefaultColumnsAction();
    // Reload columns after initialization
    const reloadedColumns = await getUserBoardColumnsAction();
    const columns = reloadedColumns.success ? reloadedColumns.data : [];
    
    return (
      <div className="flex w-full flex-1 flex-col gap-8 p-8 max-w-screen-2xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Task Board</h1>
          <p className="text-muted-foreground">Manage your tasks with a visual board</p>
        </div>
        <BoardView initialColumns={columns} />
      </div>
    );
  }

  const columns = columnsResult.success ? columnsResult.data : [];

  return (
    <div className="flex w-full flex-1 flex-col gap-8 p-8 max-w-screen-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Task Board</h1>
        <p className="text-muted-foreground">Manage your tasks with a visual board</p>
      </div>
      <BoardView initialColumns={columns} />
    </div>
  );
}
