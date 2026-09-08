import { cn } from "@/lib/utils";

/** Uppercase status pill for event cards (races, tournaments). */
export function StatusPill({
  status,
}: {
  status: "completed" | "upcoming" | "live";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-2xs font-medium uppercase tracking-wide",
        status === "completed" && "bg-muted text-muted-foreground",
        status === "upcoming" && "bg-sky-500/15 text-sky-600 dark:text-sky-400",
        status === "live" &&
          "bg-success/15 text-success",
      )}
    >
      {status}
    </span>
  );
}
