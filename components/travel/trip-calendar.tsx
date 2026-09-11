"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Mono, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { moneyRange } from "@/lib/travel/format";
import { MarqueeText } from "./marquee-text";

import type { TripItemWithStops, TripWithRelations } from "@/types/travel";
import { moveTripItemAction } from "@/app/actions/travel";
/**
 * Loaded when an item is opened, never before.
 *
 * The shared page mounts this calendar read-only, and a visitor who cannot
 * edit anything has no reason to download the form that edits it.
 */
const ItemForm = dynamic(() =>
  import("./item-form").then((m) => ({ default: m.ItemForm }))
);
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { categoryMeta } from "./category";

import { readerCost, viewerItems, type ItineraryViewer } from "@/lib/travel/viewer";
import {
  addMonths,
  isoDay,
  daysBetween,
  layOutWeek,
  monthWeeks,
  parseDay,
  shiftDay,
  type CalendarItem,
} from "@/lib/travel/calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Native drag and drop, the way `components/finance/plan-calendar.tsx`
 * already does it in this repo: a private MIME type so a stray drag from
 * anywhere else is ignored, and the day the drag began so the item keeps its
 * grip — pick a cruise up on its fourth night and it lands on its fourth
 * night, not its first.
 */
const DND_MIME = "application/x-allstars-trip-item";
type DragPayload = { id: string; grabbedOn: string };

function dayLabel(day: string | null | undefined): string {
  return day ? format(parseDay(day), "EEE d MMM") : "—";
}

/**
 * Where the first bar sits, clear of the date, and how tall each lane is.
 *
 * A cell is then tall enough for its week's deepest stack plus a line for the
 * day's cost — without that last allowance the bars were drawn straight over
 * the figures. MIN_CELL keeps a quiet week from collapsing into a strip; a
 * month of thin bands does not read as a calendar.
 */
const LANE_TOP = 22;
const LANE_HEIGHT = 22;
/** Breathing room between two runs stacked on the same day. */
const LANE_GAP = 4;
const MIN_CELL = 64;

/** Static so Tailwind can see them; arbitrary values would not be generated. */
const COL_START = [
  "col-start-1", "col-start-2", "col-start-3", "col-start-4",
  "col-start-5", "col-start-6", "col-start-7",
];
const COL_SPAN = [
  "col-span-1", "col-span-2", "col-span-3", "col-span-4",
  "col-span-5", "col-span-6", "col-span-7",
];

/**
 * The trip laid out on the calendar it will actually happen on.
 *
 * The list view answers "what is the plan"; this one answers "what does the
 * month look like" — where the free days are, how long the cruise really runs,
 * whether two things collide.
 *
 * Runs are drawn as bars across the days they occupy rather than as a repeated
 * chip in each cell, because the length of the bar IS the information. A
 * return flight is deliberately two bars and not one: its second date is the
 * day it comes back, not a day it occupies.
 */
export function TripCalendar({
  trip,
  partySize = 1,
  viewer = null,
  readOnly = false,
  showPrices = true,
}: {
  trip: TripWithRelations;
  partySize?: number;
  viewer?: ItineraryViewer | null;
  /** A share link created without prices must not print them on the bars. */
  showPrices?: boolean;
  /**
   * A shared link shows the month; it does not rearrange it. The month arrows
   * stay — reading the plan means looking at the days around it — but the
   * bars stop being handles and the editor never loads.
   */
  readOnly?: boolean;
}) {
  const tripMonth = trip.startDate.slice(0, 7);
  const [month, setMonth] = useState(tripMonth);

  /** Only what the selected traveller is part of; the whole plan otherwise. */
  const mine = useMemo(() => viewerItems(trip.items, viewer), [trip.items, viewer]);

  const items: CalendarItem[] = useMemo(
    () =>
      mine
        .filter((i) => i.scheduledOn)
        .map((i) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          scheduledOn: i.scheduledOn,
          endsOn: i.endsOn,
        })),
    [mine]
  );

  const weeks = useMemo(() => monthWeeks(month), [month]);

  /**
   * Packing every week is pure work over memoised inputs, so it happens when
   * the month or the items change and not on every parent render — picking a
   * traveller used to re-sort and re-pack all six weeks.
   */
  const laidOut = useMemo(
    () =>
      weeks.map((week) => {
        // Every run is drawn. A day with six things on it shows six — the
        // week's row grows to fit rather than trading the tail for a "+3"
        // that has to be opened somewhere else to be read.
        const segments = layOutWeek(week, items);
        const lanes = segments.reduce((n, seg) => Math.max(n, seg.lane + 1), 0);
        return { week, segments, lanes };
      }),
    [weeks, items]
  );
  const byId = useMemo(() => new Map(trip.items.map((i) => [i.id, i])), [trip.items]);

  /**
   * What each item costs, on the item rather than on the day.
   *
   * The figure used to sit in the day cell, which meant a day with two
   * bookings showed one number belonging to neither. On the bar it is
   * unambiguous, and the day keeps the room the number was taking.
   */
  const costByItem = useMemo(() => {
    const map = new Map<string, string>();
    if (!showPrices) return map;
    for (const item of trip.items) {
      if (item.price === null) continue;
      const c = readerCost(item, partySize, viewer);
      if (c.high > 0) map.set(item.id, moneyRange(c.low, c.high, trip.currency));
    }
    return map;
  }, [trip.items, partySize, viewer, trip.currency, showPrices]);

  // Snapshotted once, not read during render: this component is rendered on
  // the server too, and a server in UTC against a reader six hours behind
  // would ring a different cell in each pass and hydrate mismatched.
  const [today] = useState(() => isoDay(new Date()));
  const [editing, setEditing] = useState<TripItemWithStops | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [isMoving, startMove] = useTransition();
  const router = useRouter();

  const handleDrop = (payload: DragPayload, targetDay: string) => {
    const item = byId.get(payload.id);
    if (!item?.scheduledOn) return;
    const delta = daysBetween(payload.grabbedOn, targetDay);
    if (delta === 0) return;
    startMove(async () => {
      const res = await moveTripItemAction(trip.id, {
        id: item.id,
        scheduledOn: shiftDay(item.scheduledOn!, delta),
        endsOn: item.endsOn ? shiftDay(item.endsOn, delta) : null,
      });
      if (res.success) {
        toast.success(`Moved to ${dayLabel(shiftDay(item.scheduledOn!, delta))}`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  /**
   * The day under the pointer, from the week's own width.
   *
   * Read from geometry rather than from a per-cell handler because the bars
   * sit on top of the cells: a drop over an existing bar would otherwise
   * never reach the day beneath it.
   */
  const dayUnder = (el: HTMLElement, clientX: number, week: string[]) => {
    const rect = el.getBoundingClientRect();
    const index = Math.floor(((clientX - rect.left) / rect.width) * 7);
    return week[Math.min(6, Math.max(0, index))];
  };
  const tripEnd = trip.endDate ?? trip.startDate;
  const inTrip = (day: string) => day >= trip.startDate && day <= tripEnd;

  return (
    <Card>
      <CardHeader>
        {/* Same as the itinerary's: the badge sits under the month on a
            phone, where the month arrows already own the other end of the
            row. */}
        <CardTitle className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
          <span>{format(parseDay(`${month}-01`), "MMMM yyyy")}</span>
          {viewer && (
            <Badge variant="outline" className="text-2xs font-normal">
              {viewer.isYou ? "your share" : `${viewer.name}'s share`}
            </Badge>
          )}
        </CardTitle>
        <CardAction>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-9 sm:size-8"
              aria-label="Previous month"
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-9 sm:size-8"
              aria-label="Next month"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            {/* Wandering off into empty months is the whole point of the
                arrows; this is the way back without counting clicks. */}
            <Button
              size="sm"
              variant="outline"
              className="ml-1"
              disabled={month === tripMonth}
              onClick={() => setMonth(tripMonth)}
            >
              <MapPin className="mr-1 size-3.5" />
              Trip
            </Button>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-1">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <Text key={d} className="truncate text-center text-2xs text-muted-foreground">
              <span className="sm:hidden">{d[0]}</span>
              <span className="hidden sm:inline">{d}</span>
            </Text>
          ))}
        </div>

        {laidOut.map(({ week, segments, lanes }) => {
          const cellHeight = Math.max(
            MIN_CELL,
            LANE_TOP + lanes * LANE_HEIGHT + 6
          );
          return (
            <div
              key={week[0]}
              className="relative"
              onDragOver={(e) => {
                if (readOnly || !e.dataTransfer.types.includes(DND_MIME)) return;
                // Without preventDefault the drop never fires at all.
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverDay(dayUnder(e.currentTarget, e.clientX, week));
              }}
              onDragLeave={() => setOverDay(null)}
              onDrop={(e) => {
                const raw = e.dataTransfer.getData(DND_MIME);
                if (!raw) return;
                e.preventDefault();
                setOverDay(null);
                try {
                  handleDrop(JSON.parse(raw) as DragPayload, dayUnder(e.currentTarget, e.clientX, week));
                } catch {
                  // A payload we cannot read is a drag from somewhere else.
                }
              }}
            >
              <div className="grid grid-cols-7 gap-1">
                {week.map((day) => {
                  const thisMonth = day.slice(0, 7) === month;
                  return (
                    <div
                      key={day}
                      // A computed layout, not a spacing choice — see the
                      // constants above.
                      style={{ minHeight: cellHeight }}
                      className={cn(
                        "flex flex-col rounded-md border p-1",
                        inTrip(day) ? "bg-card" : "bg-muted/30",
                        day === today && "ring-2 ring-primary/40",
                        day === overDay && "bg-primary/10 ring-2 ring-primary"
                      )}
                    >
                      <Mono
                        className={cn(
                          "text-2xs tabular-nums",
                          !thisMonth && "text-muted-foreground/50",
                          thisMonth && inTrip(day) && "font-medium",
                          thisMonth && !inTrip(day) && "text-muted-foreground"
                        )}
                      >
                        {Number(day.slice(-2))}
                      </Mono>
                    </div>
                  );
                })}
              </div>

              {/* The bars ride over the day grid on a matching seven-column
                  track, which is the only way a run can cross a cell boundary
                  and read as one thing. */}
              {/* Exactly the day grid's geometry — same columns, same gap, and
                  no padding of its own. A `px-1` here took 8px off the width,
                  which made every track 1.1px narrower than the day it sits
                  over, so each badge drifted further left the later in the
                  week it fell. */}
              <div
                className="pointer-events-none absolute inset-x-0 grid grid-cols-7 gap-x-1"
                style={{ top: LANE_TOP, rowGap: LANE_GAP }}
              >
                {segments.map((seg) => {
                  const meta = categoryMeta(seg.item.category);
                  const full = byId.get(seg.item.id);
                  const price = costByItem.get(seg.item.id);
                  // One booking, one price. Both halves of a there-and-back
                  // open a run, so printing it on each made a single
                  // $600–$800 fare read as $1,200–$1,600 on the month.
                  const showsPrice = price && seg.leg !== "back";
                  const label = showsPrice
                    ? `${seg.item.title} · ${price}`
                    : seg.leg === "back"
                      ? `${seg.item.title} · back`
                      : seg.item.title;
                  return (
                    <Tooltip key={`${seg.item.id}-${seg.start}-${seg.lane}`}>
                      <TooltipTrigger asChild>
                        <div
                          data-slot="calendar-bar"
                          // Focusable, or the dates and the price are
                          // pointer-only — and the focus-visible marquee rule
                          // in globals.css could never match.
                          tabIndex={0}
                          role={readOnly ? undefined : "button"}
                          aria-label={
                            readOnly ? seg.item.title : `Edit ${seg.item.title}`
                          }
                          onClick={
                            readOnly
                              ? undefined
                              : () => {
                                  const full = byId.get(seg.item.id);
                                  if (full) setEditing(full);
                                }
                          }
                          onKeyDown={
                            readOnly
                              ? undefined
                              : (e) => {
                                  if (e.key !== "Enter" && e.key !== " ") return;
                                  e.preventDefault();
                                  const full = byId.get(seg.item.id);
                                  if (full) setEditing(full);
                                }
                          }
                          style={{
                            gridRow: seg.lane + 1,
                            height: LANE_HEIGHT - LANE_GAP,
                          }}
                          className={cn(
                            "group/bar pointer-events-auto flex min-w-0 items-center gap-1 overflow-hidden px-1",
                            readOnly ? "outline-none" : "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isMoving && "opacity-60",
                            meta.bar,
                            COL_START[seg.start],
                            COL_SPAN[seg.span - 1],
                            // Always inset by the same hair at both ends, so a
                            // badge never sits hard against a cell's border and
                            // two of them never disagree about where a day
                            // begins. Weeks are separate rows, so there is no
                            // continuity to preserve across the boundary — the
                            // square corner is the cue that a run carries on.
                            "mx-0.5",
                            seg.opensRun ? "rounded-l-sm" : "rounded-l-none",
                            seg.closesRun ? "rounded-r-sm" : "rounded-r-none"
                          )}
                        >
                          {/* Only the icon drags — the rest of the bar is the
                              click target. Same disambiguation the finance
                              calendar uses: grab the glyph, tap anywhere else
                              to edit. */}
                          <span
                            draggable={!readOnly}
                            aria-label="Drag to move"
                            onClick={(e) => e.stopPropagation()}
                            onDragStart={(e) => {
                              const payload: DragPayload = {
                                id: seg.item.id,
                                grabbedOn: dayUnder(
                                  e.currentTarget.closest("div.relative") as HTMLElement,
                                  e.clientX,
                                  week
                                ),
                              };
                              e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
                              e.dataTransfer.effectAllowed = "move";
                              e.stopPropagation();
                            }}
                            className={cn(
                              // Hidden on a phone: 14px of a 46px bar is a
                              // third of the room the name needs, and the
                              // colour already says which category it is.
                              "hidden shrink-0 sm:block",
                              !readOnly && "cursor-grab active:cursor-grabbing"
                            )}
                          >
                            <meta.Icon className="size-3" />
                          </span>
                          {seg.opensRun && (
                            // Title and price are one label, not two boxes
                            // competing for a bar that can be a single day
                            // wide. Pinned to the right, the price ate the
                            // title whole — a flight read "$600 ~ $" and never
                            // said where it went.
                            //
                            // Shown at every size: a one-day bar on a phone
                            // fits about five characters, which still beats a
                            // coloured stripe with nothing on it.
                            //
                            // `flex-1`, or the box shrinks to nothing — with
                            // only `min-w-0` it measures 0, MarqueeText reads
                            // that as overflow, gives the text `w-max`, and
                            // the box it lives in stays 0 wide forever.
                            <MarqueeText className="min-w-0 flex-1 text-2xs font-medium leading-none">
                              {label}
                            </MarqueeText>
                          )}
                        </div>
                      </TooltipTrigger>
                      {/* The design system's tooltip, not the browser's
                          `title`: it appears at once instead of after a
                          second, and it can hold more than one line. */}
                      <TooltipContent side="top" className="max-w-64">
                        <span className="block font-medium">{seg.item.title}</span>
                        {price && <span className="block tabular-nums">{price}</span>}
                        <span className="block opacity-80">
                          {seg.leg !== "only"
                            ? `Out ${dayLabel(full?.scheduledOn)}, back ${dayLabel(full?.endsOn)}`
                            : full?.endsOn && full.endsOn !== full.scheduledOn
                              ? `${dayLabel(full.scheduledOn)} – ${dayLabel(full.endsOn)}`
                              : dayLabel(full?.scheduledOn)}
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}

              </div>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] sm:max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.title}</DialogTitle>
            <DialogDescription>
              Change the details, the dates or the price.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ItemForm
              tripId={trip.id}
              item={editing}
              defaultDate={editing.scheduledOn}
              currency={trip.currency}
              travellers={trip.members.map((m) => ({ id: m.id, name: m.name }))}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
