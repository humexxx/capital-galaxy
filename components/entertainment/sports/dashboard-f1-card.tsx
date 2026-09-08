import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Heading, Mono, Text } from "@/components/ui/typography";
import { getF1DashboardStandings } from "@/lib/services/espn-f1-standings-service";
import { getF1News } from "@/lib/services/rapidapi-f1-news-service";
import {
  getF1DashboardHighlight,
  listUserFavoriteSportIds,
} from "@/lib/services/sports-service";
import { F1StandingsTabs } from "@/components/entertainment/sports/f1-standings-tabs";
import type { F1NewsImage } from "@/db/schema";

const F1_PATH = "/portal/entertainment/sports?sport=f1";
/** A slider, so more than fits is fine — but not so many nobody reaches the end. */
const SHOWN = 8;

/** The widest image the provider sent — its list runs small crops to full bleed. */
function thumbnail(images: F1NewsImage[]): F1NewsImage | null {
  if (images.length === 0) return null;
  return images.reduce((best, i) => ((i.width ?? 0) > (best.width ?? 0) ? i : best));
}

/**
 * Formula 1 on the dashboard: the next race and the wire, in one card.
 *
 * It owns F1 outright — the general sports card excludes it — because the
 * same race printed in two cards side by side is the same race twice. Sized
 * to a grid column rather than the full row: it is one sport among several,
 * not a banner.
 *
 * Gated on the favourite, like everything else on this dashboard. A motorsport
 * feed on the desk of somebody who does not follow it is noise.
 */
export async function DashboardF1Card({ userId }: { userId: string }) {
  const favorites = await listUserFavoriteSportIds(userId);
  if (!favorites.includes("f1")) return null;

  const [highlight, news, standings] = await Promise.all([
    getF1DashboardHighlight(),
    getF1News(SHOWN),
    getF1DashboardStandings(3),
  ]);
  if (!highlight && news.length === 0) return null;

  return (
    // Half the row: one sport among several, beside whatever comes next.
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Heading level="h5" as="h2" className="flex items-center gap-2">
              <span aria-hidden>🏎️</span>
              Formula 1
            </Heading>
            {highlight && (
              <Text variant="muted" className="mt-1 truncate">
                {highlight.context}
              </Text>
            )}
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href={F1_PATH}>
              Open <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        {highlight && (
          <Link
            href={F1_PATH}
            className="flex items-start justify-between gap-2 rounded-lg border bg-card p-2.5 transition-colors hover:border-primary/60"
          >
            <span className="min-w-0 text-xs font-semibold leading-snug">
              {highlight.headline}
            </span>
            {highlight.tone === "live" && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-2xs font-medium text-success">
                <Circle className="h-2 w-2 animate-pulse fill-current" /> Live
              </span>
            )}
          </Link>
        )}

        {standings && (
          <F1StandingsTabs
            drivers={standings.drivers}
            constructors={standings.constructors}
          />
        )}

        {news.length > 0 && (
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              Latest news
            </span>
            {/* Scroll-snap rather than a carousel library: the card is narrow,
                a swipe is the gesture people already use here, and it adds no
                dependency. The rail is the same one the travel gallery uses. */}
            <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
              {news.map((item) => {
                const image = thumbnail(item.images);
                return (
                  <Link
                    key={item.id}
                    href={`/news/f1/${item.id}`}
                    className="group flex w-44 shrink-0 snap-start flex-col gap-2 rounded-lg border bg-card p-2 transition-colors hover:border-primary/60"
                  >
                    {image?.url && (
                      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md bg-muted">
                        <Image
                          src={image.url}
                          alt={image.alt ?? ""}
                          fill
                          sizes="176px"
                          className="object-cover"
                          // The provider's CDN is whatever ESPN is using that
                          // week; an allowlist would break the day it changes.
                          unoptimized
                        />
                      </div>
                    )}
                    <span className="line-clamp-3 text-xs font-medium leading-snug">
                      {item.headline}
                    </span>
                    <Mono className="mt-auto text-2xs text-muted-foreground">
                      {item.firstSeenAt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </Mono>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
