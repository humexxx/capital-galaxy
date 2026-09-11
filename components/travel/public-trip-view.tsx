import Image from "next/image";
import { format } from "date-fns";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Heading, Mono, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import type { PublicTripView } from "@/types/travel";

import {
  dayGroupLabel,
  formatDateRange,
  formatTripMoney,
  moneyRange,
  runsUntil,
} from "@/lib/travel/format";
import { itemCost, tripCost, unitSuffix } from "@/lib/travel/pricing";
// One category table, not a second copy that drifts: this page once labelled
// flights and cruises "Other" because they were missing from its own list.
import { CategoryIcon, categoryMeta } from "@/components/travel/category";
import { PublicTripViews } from "@/components/travel/public-trip-views";
import { ItemItinerary } from "@/components/travel/item-itinerary";
import { ActivityVideo } from "@/components/travel/activity-video";

const NO_DATE_KEY = "__no_date__";

/**
 * The trip as its recipient sees it: the planner's own layout, with nothing
 * to press.
 *
 * It reads like the planner on purpose — same banner, same day groups, same
 * money in the same column — because the owner describes the link by what
 * they are looking at, and a recipient who sees something else has to be told
 * how to map one onto the other. What it does not have is a single control:
 * no add, no edit, no menu, no drag. A share link grants a view.
 */
export function PublicTripViewRenderer({ view }: { view: PublicTripView }) {
  const { trip, items, photos, share, scope } = view;

  /**
   * Whether this link may show money at all.
   *
   * The column has always existed and defaulted to false; the renderer simply
   * never read it, so every "share my trip" link published the costs anyway.
   */
  const showPrices = share.showPrices;

  /** What each item costs whoever holds this link. */
  const scopedLines = scope ? new Map(scope.lines.map((l) => [l.itemId, l])) : null;
  const lineCost = (item: (typeof items)[number]) => {
    if (scopedLines) return scopedLines.get(item.id) ?? { low: 0, high: 0 };
    // Units applied, so a nightly rate is not reported as one night and a
    // per-person fare not as one traveller.
    const c = itemCost(item, 1);
    return { low: c.low, high: c.high };
  };

  const estimate = scope
    ? { low: scope.owedLow, high: scope.owedHigh }
    : (() => {
        const t = tripCost(items, 1);
        return { low: t.low, high: t.high };
      })();

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.scheduledOn ?? NO_DATE_KEY;
    const arr = groups.get(key);
    if (arr) arr.push(item);
    else groups.set(key, [item]);
  }
  const groupKeys = [...groups.keys()].filter((k) => k !== NO_DATE_KEY).sort();
  if (groups.has(NO_DATE_KEY)) groupKeys.push(NO_DATE_KEY);

  // A range, like everything else that is still an estimate. Only what has
  // been paid is one figure — that money either moved or it did not.
  // Against the low estimate: it is the figure that can actually be settled,
  // and measuring against the high one leaves a fully-paid share reading as
  // short.
  const pct =
    scope && scope.owedLow > 0
      ? Math.min(100, (scope.paid / scope.owedLow) * 100)
      : 0;
  /**
   * What the calendar needs, shaped the way the planner shapes it.
   *
   * The public view has no members and no shares to hand it, and it must not
   * — so it gets a trip with those emptied and the scope's own per-item
   * figures as the viewer.
   */
  // Everything the banner and calendar read, minus the owner's auth id — this
  // lands in the RSC payload of a page anybody with the link can open.
  const { userId: _ownerId, ...tripPublic } = trip;
  void _ownerId;
  const asTrip = {
    ...tripPublic,
    items,
    photos,
    members: [],
    shares: [],
    contributions: [],
  } as unknown as import("@/types/travel").TripWithRelations;

  const publicViewer = scope
    ? {
        // The service has already narrowed `items` to this traveller's, and
        // the trip's member ids stay on the server.
        memberId: null,
        name: scope.memberName,
        isYou: false,
        lines: new Map(scope.lines.map((l) => [l.itemId, { low: l.low, high: l.high }])),
      }
    : null;

  const left = scope
    ? {
        low: Math.max(0, scope.owedLow - scope.paid),
        high: Math.max(0, scope.owedHigh - scope.paid),
      }
    : { low: 0, high: 0 };

  // Full bleed on a phone, like the planner's — the page gutters were cropping
  // the cover for no gain. The negative margin lives on the wrapper in
  // `PublicTripViews`, which is also the view switcher's positioning context.
  const banner = (
      <header className="overflow-hidden border-y sm:rounded-xl sm:border">
        <div
          // Same floor as the planner's banner: at 21/9 a 390px phone leaves
          // 167px and the pill lands on top of the title.
          className="relative min-h-72 w-full bg-muted sm:aspect-[21/9] sm:min-h-0"
          style={trip.coverPhotoUrl ? undefined : { backgroundColor: trip.color }}
        >
          {trip.coverPhotoUrl && (
            <Image
              src={trip.coverPhotoUrl}
              alt={`${trip.title} cover photo`}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover"
              // Covers may be external URLs — see `tripPhotoSourceEnum`.
              unoptimized
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-between gap-4 p-4 text-white sm:p-6">
            <div className="flex items-start justify-between gap-2">
              {showPrices ? (
                // Solid, not translucent: the photograph underneath is unknown
                // and a light-wash cover leaves white text on white.
                <div className="flex min-w-56 flex-col justify-center rounded-xl bg-black/70 px-3 py-2 ring-1 ring-white/15 backdrop-blur-sm">
                  <Mono className="truncate text-lg font-semibold leading-tight tabular-nums text-white">
                    {moneyRange(estimate.low, estimate.high, trip.currency)}
                  </Mono>
                  <Text className="truncate text-2xs leading-tight text-white/70">
                    {scope ? `${scope.memberName} pays` : "trip total"}
                  </Text>
                </div>
              ) : (
                <span />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Heading level="h1" className="text-2xl text-white sm:text-4xl">
                {trip.title}
              </Heading>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/90">
                {trip.destination && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" /> {trip.destination}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" />
                  <Mono>{formatDateRange(trip.startDate, trip.endDate)}</Mono>
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>
  );

  const list = (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Itinerary
                {items.length > 0 && (
                  <Badge variant="secondary" className="text-2xs font-normal">
                    {items.length}
                  </Badge>
                )}
                {scope && showPrices && (
                  <Badge variant="outline" className="text-2xs font-normal">
                    {scope.memberName}&apos;s share
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {groupKeys.length === 0 && (
                <Text variant="muted">Nothing planned yet.</Text>
              )}

              {groupKeys.map((key) => {
                const groupItems = groups.get(key)!;
                const total = groupItems.reduce(
                  (acc, it) => {
                    if (!it.price) return acc;
                    const c = lineCost(it);
                    return { low: acc.low + c.low, high: acc.high + c.high };
                  },
                  { low: 0, high: 0 }
                );
                const label =
                  key === NO_DATE_KEY
                    ? "Unscheduled"
                    : dayGroupLabel(key, runsUntil(groupItems));
                return (
                  <section key={key} className="flex flex-col gap-2">
                    <div className="flex items-end justify-between gap-2 border-b pb-1">
                      <Heading level="h6" as="h3">
                        {label}
                      </Heading>
                      {showPrices && total.high > 0 && (
                        <Mono className="shrink-0 text-xs text-muted-foreground">
                          {moneyRange(total.low, total.high, trip.currency)}
                        </Mono>
                      )}
                    </div>
                    <ul className="-mx-2 divide-y">
                      {groupItems.map((item) => {
                        const meta = categoryMeta(item.category);
                        const cost = lineCost(item);
                        return (
                          <li key={item.id} className="flex items-start gap-3 px-2 py-3">
                            <CategoryIcon category={item.category} />
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <Text weight="medium" className="truncate">
                                  {item.title}
                                </Text>
                                {showPrices && item.price && (
                                  <span className="shrink-0 text-right">
                                    <Mono className="block whitespace-nowrap text-xs font-medium">
                                      {moneyRange(cost.low, cost.high, trip.currency)}
                                    </Mono>
                                    {!scope && item.priceUnit !== "total" && (
                                      <Mono className="block whitespace-nowrap text-2xs text-muted-foreground">
                                        {unitSuffix(item.priceUnit)}
                                      </Mono>
                                    )}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                <span>{meta.label}</span>
                                {(item.fromCode || item.toCode) && (
                                  <Mono className="text-2xs font-medium">
                                    {item.fromCode ?? "?"}
                                    <span className="mx-1">
                                      {item.roundTrip ? "⇄" : "→"}
                                    </span>
                                    {item.toCode ?? "?"}
                                  </Mono>
                                )}
                                {item.endsOn &&
                                  item.scheduledOn &&
                                  item.endsOn !== item.scheduledOn && (
                                    <span>
                                      {item.roundTrip ? "back " : "through "}
                                      {format(
                                        new Date(`${item.endsOn}T00:00:00`),
                                        "d MMM"
                                      )}
                                    </span>
                                  )}
                                {item.link && (
                                  <a
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                  >
                                    <ExternalLink className="size-3" /> Link
                                  </a>
                                )}
                              </div>
                              {showPrices && item.notes && (
                                <Text variant="small">{item.notes}</Text>
                              )}
                              {item.stops.length > 0 && (
                                <ItemItinerary stops={item.stops} />
                              )}
                              {item.photos.length > 0 && (
                                <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 pt-1">
                                  {item.photos.map((photo) => (
                                    <div
                                      key={photo.id}
                                      className="relative aspect-square w-20 shrink-0 snap-start overflow-hidden rounded-md border bg-muted"
                                    >
                                      <Image
                                        src={photo.url}
                                        alt={photo.caption ?? ""}
                                        fill
                                        sizes="80px"
                                        className="object-cover"
                                        unoptimized
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* The same embed the planner shows. It routes
                                  YouTube through youtube-nocookie, which is
                                  the whole reason that choice exists: a
                                  visitor holding a share token has agreed to
                                  nothing. */}
                              {item.videoUrl && (
                                <div className="pt-2">
                                  <ActivityVideo
                                    url={item.videoUrl}
                                    title={item.title}
                                  />
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </CardContent>
          </Card>
  );

  const aside = (
        <>
          {showPrices && scope && (
            <Card>
              <CardHeader>
                <CardTitle>Your share</CardTitle>
              </CardHeader>
              {/* The same shape the planner's Payments card uses: the figure
                  paid, what it is against, and a bar — a number on its own
                  does not say whether it is nearly there or barely started. */}
              <CardContent className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Mono className="text-2xl font-semibold tabular-nums">
                    {formatTripMoney(scope.paid, trip.currency)}
                  </Mono>
                  <Mono className="shrink-0 text-xs text-muted-foreground">
                    of {moneyRange(scope.owedLow, scope.owedHigh, trip.currency)}
                  </Mono>
                </div>
                <Progress value={pct} className="h-1.5" />
                <Text className="text-2xs text-muted-foreground">
                  {left.low > 0 ? (
                    <>
                      {formatTripMoney(left.low, trip.currency)} still to go
                      {left.high > left.low && (
                        <> — up to {formatTripMoney(left.high, trip.currency)} if every
                          estimate lands high</>
                      )}
                    </>
                  ) : (
                    "Covered against the low estimate."
                  )}
                </Text>
              </CardContent>
            </Card>
          )}

          {photos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Gallery</CardTitle>
              </CardHeader>
              <CardContent>
                {/* One scrolling row, like the planner's: a grid grew a line
                    for every three photos and pushed the page down. */}
                <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      className={cn(
                        "relative aspect-square w-28 shrink-0 snap-start",
                        "overflow-hidden rounded-md border bg-muted"
                      )}
                    >
                      <Image
                        src={photo.url}
                        alt={photo.caption ?? "Trip photo"}
                        fill
                        sizes="112px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
    </>
  );

  return (
    <PublicTripViews
      banner={banner}
      list={list}
      aside={aside}
      trip={asTrip}
      viewer={publicViewer}
      showPrices={showPrices}
    />
  );
}
