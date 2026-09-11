import Link from "next/link";
import { ArrowRight, Circle, Star, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import {
  getDashboardSportsSummary,
  listUserFavoriteSportIds,
} from "@/lib/services/sports-service";
import { cn } from "@/lib/utils";
import type { DashboardSportHighlight } from "@/types/sports";

const SPORTS_PATH = "/portal/entertainment/sports";

type DashboardSportsCardProps = {
  userId: string;
};

export async function DashboardSportsCard({ userId }: DashboardSportsCardProps) {
  // F1 has a card of its own on this dashboard, with its news under the same
  // highlight. Listing it here too would print the same race twice.
  const [favorites, highlights] = await Promise.all([
    listUserFavoriteSportIds(userId),
    getDashboardSportsSummary(userId, ["f1"]),
  ]);

  // Following only F1 is not the same as following nothing: the card that
  // owns F1 is already on screen, so this one steps aside rather than asking
  // for favourites somebody has already picked.
  if (highlights.length === 0 && favorites.length > 0) return null;

  if (highlights.length === 0) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <Heading level="h5" as="h2" className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Sports
          </Heading>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Text variant="muted">
            Pick a few favorite sports to see live results, standings and the
            next big match right here on your dashboard.
          </Text>
          <Button asChild>
            <Link href={SPORTS_PATH}>
              <Star className="mr-1 h-4 w-4" /> Pick favorites
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Heading level="h5" as="h2" className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Sports
            </Heading>
            <Text variant="muted" className="mt-1">
              Following {favorites.length}{" "}
              {favorites.length === 1 ? "sport" : "sports"} · live highlights
              and table leaders
            </Text>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={SPORTS_PATH}>
              Open hub <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "grid gap-3",
            highlights.length === 1 && "grid-cols-1",
            highlights.length === 2 && "sm:grid-cols-2",
            highlights.length >= 3 && "sm:grid-cols-2 lg:grid-cols-3"
          )}
        >
          {highlights.map((h) => (
            // Now that the hub keeps its sport in the URL, a highlight can
            // point straight at the one it is about instead of dropping the
            // reader on whatever the hub opens with.
            <Link
              key={h.sportId}
              href={`${SPORTS_PATH}?sport=${h.sportId}`}
              className="rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HighlightCard highlight={h} />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HighlightCard({ highlight }: { highlight: DashboardSportHighlight }) {
  return (
    <div className="flex h-full flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-primary/60">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-md bg-muted text-base"
          >
            {highlight.emoji}
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {highlight.label}
          </span>
        </div>
        <ToneBadge tone={highlight.tone} />
      </div>
      <div className="min-h-10">
        <div className="text-sm font-semibold leading-snug">{highlight.headline}</div>
        <Text variant="small" as="div" className="mt-0.5">
          {highlight.context}
        </Text>
      </div>
      {highlight.secondary && (
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2 text-xs">
          <span className="text-muted-foreground">{highlight.secondary.label}</span>
          <span className="font-mono font-medium tabular-nums">{highlight.secondary.value}</span>
        </div>
      )}
    </div>
  );
}

function ToneBadge({ tone }: { tone?: DashboardSportHighlight["tone"] }) {
  if (!tone) return null;
  if (tone === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-2xs font-medium text-success">
        <Circle className="h-2 w-2 animate-pulse fill-current" /> Live
      </span>
    );
  }
  if (tone === "upcoming") {
    return (
      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-2xs font-medium text-sky-600 dark:text-sky-400">
        Upcoming
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
      Result
    </span>
  );
}
