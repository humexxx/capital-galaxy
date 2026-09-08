import type { ReactNode } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Eyebrow, Mono, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

type StatCardTone = "positive" | "negative" | "neutral";

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  sublabel?: ReactNode;
  tone?: StatCardTone;
  /** Shown beside the figure and NEVER masked. A share is not a balance: it
   *  says how things stand without revealing how much money is involved,
   *  which is the whole point of masked mode. */
  percent?: string;
  action?: ReactNode;
  /** Optional bare trend line under the figure — a sparkline, no axes and no
   *  labels. It gives the number a direction without spending a whole chart
   *  on it. Keep it decorative: anything the reader must be able to read
   *  precisely belongs in `sublabel`. */
  chart?: ReactNode;
  className?: string;
};

/**
 * Masks a figure without changing how much room it takes.
 *
 * The old mask was a fixed `****`, which is both narrower than the number it
 * replaced and a different glyph width, so toggling privacy made every card
 * resize and the page jump. Bullets in a tabular-nums span occupy one digit
 * slot each, so a masked value is exactly as wide as the real one.
 */
export function maskValue(value: string): string {
  return "•".repeat(Math.max(3, value.replace(/[^\d]/g, "").length));
}

export function statToneClass(tone?: StatCardTone): string {
  if (tone === "positive") return "text-success";
  if (tone === "negative") return "text-destructive";
  return "";
}

export function StatCard({
  label,
  value,
  sublabel,
  tone,
  percent,
  action,
  chart,
  className,
}: StatCardProps) {
  return (
    <Card size="sm" className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <Eyebrow as="div">{label}</Eyebrow>
        {action}
      </CardHeader>
      <CardContent className="space-y-1">
        {/* One row, never wrapping. Letting the share drop to its own line
            gave cards different heights and knocked every sublabel out of
            alignment across the grid — and which cards wrapped depended on how
            long that card's number happened to be. */}
        <div className="flex items-baseline gap-x-2 whitespace-nowrap">
          <Mono
            className={cn(
              "text-xl font-semibold tabular-nums sm:text-2xl",
              statToneClass(tone)
            )}
          >
            {value}
          </Mono>
          {percent && (
            <Mono
              className={cn("text-xs tabular-nums opacity-70", statToneClass(tone))}
            >
              {percent}
            </Mono>
          )}
        </div>
        {sublabel && (
          <Text variant="small" as="div">
            {sublabel}
          </Text>
        )}
        {chart && (
          <div aria-hidden="true" className="pt-1">
            {chart}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
