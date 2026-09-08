"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { SPORTS } from "@/lib/data/sports/registry";
import { SAMPLE_DATA_SPORTS, type SportPayload } from "@/lib/sports/payload";
import type { SportId } from "@/types/sports";

import { F1View } from "./sports/f1-view";
import { FootballView } from "./sports/football-view";
import { LolView } from "./sports/lol-view";
import { NbaView } from "./sports/nba-view";
import { NflView } from "./sports/nfl-view";
import { PadelView } from "./sports/padel-view";
import { TennisView } from "./sports/tennis-view";
import { WorldCupView } from "./sports/world-cup-view";

type SportsHubProps = {
  activeSport: SportId;
  /** Favourites surface as starred tabs and get pinned to the front of the strip. */
  favoriteSportIds?: SportId[];
  /** Exactly the sport being shown — the page fetches one, not all eight. */
  payload: SportPayload;
};

export function SportsHub({
  activeSport,
  favoriteSportIds = [],
  payload,
}: SportsHubProps) {
  const router = useRouter();
  const [isSwitching, startSwitching] = useTransition();
  const favSet = useMemo(() => new Set(favoriteSportIds), [favoriteSportIds]);

  // Render favourites first so the user lands on their most-watched sports.
  const orderedSports = useMemo(
    () =>
      [...SPORTS].sort((a, b) => {
        const aFav = favSet.has(a.id) ? 0 : 1;
        const bFav = favSet.has(b.id) ? 0 : 1;
        return aFav - bFav;
      }),
    [favSet]
  );

  return (
    <div className="space-y-6">
      <SportSelector
        active={activeSport}
        onChange={(sport) =>
          startSwitching(() => router.push(`?sport=${sport}`, { scroll: false }))
        }
        favSet={favSet}
        sports={orderedSports}
        busy={isSwitching}
      />
      {SAMPLE_DATA_SPORTS.has(activeSport) && <SampleDataNotice />}
      <div className={cn(isSwitching && "opacity-50 transition-opacity")}>
        <SportContent payload={payload} />
      </div>
    </div>
  );
}

/**
 * Says out loud that a sport is a fixture.
 *
 * NBA and NFL have no free provider with current data, so they render a
 * hand-written season. Nothing on the page admitted it, which made a stale
 * scoreboard look like a broken live one.
 */
function SampleDataNotice() {
  return (
    <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
      Sample data — no live provider is wired up for this sport yet, so these
      fixtures and standings are made up.
    </div>
  );
}

function SportSelector({
  active,
  onChange,
  favSet,
  sports,
  busy = false,
}: {
  active: SportId;
  onChange: (sport: SportId) => void;
  favSet: Set<SportId>;
  sports: typeof SPORTS;
  /** A sport is being fetched — the strip stays usable, the tab says so. */
  busy?: boolean;
}) {
  return (
    <div className="relative -mx-2 flex gap-2 overflow-x-auto px-2 pb-1">
      {sports.map((sport) => {
        const isActive = sport.id === active;
        const isFav = favSet.has(sport.id);
        return (
          <button
            key={sport.id}
            type="button"
            onClick={() => onChange(sport.id)}
            aria-current={isActive ? "page" : undefined}
            title={sport.label}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "border-foreground/15 bg-foreground/5 text-foreground shadow-xs"
                : "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {isActive && busy ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            ) : (
              <span aria-hidden className="text-base leading-none">
                {sport.emoji}
              </span>
            )}
            <span>{sport.shortLabel}</span>
            {isFav && (
              <Star
                aria-hidden
                className="h-3 w-3 fill-warning text-warning"
                strokeWidth={2}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function SportContent({ payload }: { payload: SportPayload }) {
  switch (payload.sport) {
    case "football":
      return <FootballView leagues={payload.leagues} />;
    case "worldcup":
      return <WorldCupView data={payload.data} />;
    case "f1":
      return <F1View data={payload.data} news={payload.news} />;
    case "nba":
      return <NbaView data={payload.data} />;
    case "tennis":
      return <TennisView data={payload.data} />;
    case "padel":
      return <PadelView data={payload.data} />;
    case "nfl":
      return <NflView data={payload.data} />;
    case "lol":
      return <LolView data={payload.data} />;
  }
}
