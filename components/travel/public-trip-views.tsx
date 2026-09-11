"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, List as ListIcon } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TripWithRelations } from "@/types/travel";

import { TripCalendar } from "./trip-calendar";
import type { ItineraryViewer } from "@/lib/travel/viewer";

/**
 * The same two readings the planner offers, on a link that grants neither.
 *
 * It owns the page's layout rather than a slot inside it because the switcher
 * sits on the banner while the thing it switches sits below the grid — one
 * piece of state across two parts of the page, so the parts come in as slots.
 *
 * The list arrives already rendered from the server: it is the one a
 * recipient wants first and the one preview cards and crawlers see. The
 * calendar only mounts once it is asked for.
 */
export function PublicTripViews({
  banner,
  list,
  aside,
  trip,
  viewer,
  showPrices,
}: {
  banner: ReactNode;
  list: ReactNode;
  aside: ReactNode;
  trip: TripWithRelations;
  viewer: ItineraryViewer | null;
  showPrices: boolean;
}) {
  const [view, setView] = useState<"list" | "calendar">("list");

  return (
    <article className="flex flex-col gap-6">
      {/* The negative margin is here rather than on the banner itself: this is
          the positioning context for the view switcher below, and the two have
          to share an edge or the switcher floats 16px inside the photograph. */}
      <div className="relative -mx-4 sm:mx-0">
        {banner}
        {/* On the banner, opposite the total. Dark and ringed like the pill,
            for the same reason: the photograph underneath is unknown, and a
            light control over a beach is a control nobody can see. */}
        <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
          <Tabs value={view} onValueChange={(v) => setView(v as "list" | "calendar")}>
            <TabsList className="border-0 bg-black/70 text-white/70 ring-1 ring-white/15 backdrop-blur-sm">
              <TabsTrigger
                value="list"
              aria-label="List"
                className="gap-1.5 data-[state=active]:bg-white data-[state=active]:text-black"
              >
                <ListIcon className="size-3.5" />
                <span className="hidden sm:inline">List</span>
              </TabsTrigger>
              <TabsTrigger
                value="calendar"
              aria-label="Calendar"
                className="gap-1.5 data-[state=active]:bg-white data-[state=active]:text-black"
              >
                <CalendarDays className="size-3.5" />
                <span className="hidden sm:inline">Calendar</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[5fr_3fr]">
        <div className="flex min-w-0 flex-col gap-6">
          {view === "list" ? (
            list
          ) : (
            <TripCalendar
              trip={trip}
              partySize={1}
              viewer={viewer}
              readOnly
              showPrices={showPrices}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">{aside}</div>
      </div>
    </article>
  );
}
