import { Check, Minus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FormResult } from "@/types/sports";

type Last5FormProps = {
  /** Most-recent first; trailing entries may be "-" for unplayed. */
  results: FormResult[];
  className?: string;
};

const COLOR_MAP: Record<FormResult, string> = {
  W: "bg-success/90 text-white",
  L: "bg-destructive/90 text-white",
  D: "bg-warning/90 text-white",
  "-": "bg-muted text-muted-foreground",
};

const ICON_MAP: Record<FormResult, typeof Check> = {
  W: Check,
  L: X,
  D: Minus,
  "-": Minus,
};

export function Last5Form({ results, className }: Last5FormProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {results.map((result, index) => {
        const Icon = ICON_MAP[result];
        const isLast = index === results.length - 1;
        return (
          <span
            key={index}
            aria-label={resultLabel(result)}
            className={cn(
              "grid h-5 w-5 place-items-center rounded-full text-2xs font-bold ring-1 ring-foreground/5",
              COLOR_MAP[result],
              isLast && "ring-2 ring-foreground/20",
            )}
          >
            <Icon className="h-3 w-3" strokeWidth={3} />
          </span>
        );
      })}
    </div>
  );
}

function resultLabel(result: FormResult): string {
  switch (result) {
    case "W":
      return "Win";
    case "L":
      return "Loss";
    case "D":
      return "Draw";
    case "-":
    default:
      return "Not played";
  }
}
