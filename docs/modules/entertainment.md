# Entertainment

> **Status:** In progress (travel shipped + dashboard card; sports UI shipped, favourites end-to-end on DB; LoL, F1, football, World Cup, padel and tennis wired to free live providers)
> **Last reviewed:** 2026-09-11

## Overview
Two sub-modules: Travel Planner (trips, items, photos, public sharing) and
Sports (live scores, standings and brackets for football, F1, NBA, tennis,
padel, NFL and League of Legends, plus a per-user favourites picker). Five
sports are wired to free live providers (Lolesports for LoL, Jolpica-F1 for F1,
football-data.org for football, Padel API for padel, TheSportsDB for tennis);
NBA and NFL still use mocks.

## Routes
- `/portal/entertainment/travel-planner` — list of trips (authenticated)
- `/portal/entertainment/travel-planner/new` — create trip
- `/portal/entertainment/travel-planner/[id]` — trip detail + editor
- `/trips/[token]` — **public** shared trip view (top-level, no auth); `loading.tsx` paints the shell before the trip resolves
- `/portal/entertainment/sports` — sports hub with tabs per sport + manage-favourites sheet

## Server actions — `/app/actions/`
- `travel.ts` — trip / item / photo / member / share CRUD, plus
  `addTripContributionAction` / `updateTripContributionAction` /
  `deleteTripContributionAction` for the payment log and
  `setTripItemStopsAction` for a cruise's ports. `createTripShareAction`
  takes a `memberId` to scope a link to one traveller
- `sports.ts` — `setSportFavoriteAction` toggles a sport favourite for the current user

## Services — `/lib/services/`
- `travel-service.ts` — trip / item / photo / member / share CRUD,
  `addTripContribution` / `updateTripContribution` / `deleteTripContribution`,
  `buildScope` (one traveller's own view of a shared link) and
  `getDashboardTravelSummary` (featured trip with state badge + counts for the
  dashboard card). `ensureMemberBelongsToTrip` guards anything that names a
  member: the foreign key proves the row exists, not which trip it is on
- `sports-service.ts` — favourites CRUD + `getDashboardSportsSummary` that materialises one highlight per favourited sport (LoL via `getLolData()`, F1 via `getF1Data()`, football via `getFootballData()`, World Cup via `getWorldCupData()` — featured knockout match + latest result, padel via `getPadelData()`, rest from mock fixtures)
- `lolesports-service.ts` — `getLolData()` fetches LEC/LCS/LCK/LPL from Lolesports' unofficial API (`esports-api.lolesports.com`), maps to `LolData` including playoff `BracketRound[]` (**one round per standings SECTION**, labelled with the section's own name — `buildLolBracket`; the old TBD-count heuristic remains only as fallback for unnamed sections, because TBD counting collapsed rounds into one column as ties resolved), picks the currently-active tournament (never the future split), maps regular-season stages (`regular_season`, `groups`, `group_stage`) into standings. A completed event missing `result` renders "—", never a fake 0–0. Cached 30 min via `unstable_cache`, falls back to `LOL_DATA` mock on any error
- `jolpica-f1-service.ts` — `getF1Data()` fetches current-season races, driver + constructor standings and results from Jolpica-F1 (`api.jolpi.ca/ergast/f1`, Ergast-compatible drop-in), maps to `F1Data` with derived race status and podium tallies, cached 30 min, falls back to `F1_DATA` mock on any error
- `espn-f1-standings-service.ts` — `getF1DashboardStandings(top)` reads ESPN's public `site.api.espn.com` racing standings (no key) for the dashboard card only, because Jolpica carries no driver photos or team liveries and the card wants both. Cached 5 min, returns `null` on any error so the card simply drops the tables. Two provider quirks it has to work around: the points figure is `championshipPts` for drivers but `points` for constructors (a variadic `stat()` takes the first name that resolves, or every constructor reads 0 pts), and ESPN's `abbreviation` on a constructor row is the *driver's* initials — Mercedes came through as "LP" — so `teamCode()` derives the code from the team name instead. ESPN publishes no constructor logo at all — every racing `teamlogos` path 404s — so `TEAM_LOGOS` maps ESPN's team name to a file under `public/f1/teams/`
- `football-data-service.ts` — `getFootballData()` fetches standings + matches for UCL, La Liga, EPL and Serie A from football-data.org, maps to `FootballLeagueData[]`, cached 5 min, falls back per-league to mocks. Requires `FOOTBALL_DATA_API_KEY`. Knockout competitions (UCL) fetch the full season in ONE matches call and derive both recent matches and the two-legged knockout bracket (`buildKnockoutBracket` pairs legs by team set → aggregate + winner; **aggregate/winner stay `null` until BOTH legs are `FINISHED`** — summing scheduled legs with `?? 0` used to fabricate an aggregate and bold a "winner" mid-tie); league-only competitions use a ±60d window (capped 40). Finished cup matches map `score.duration` to `aet`/`pen` statuses. Stage labels use real round names (Round of 16 / Quarter-finals / etc.) for knockout, "Matchday N" for league play. Also exports `getWorldCupData()` (cache tag `sports:worldcup`, mock fallback `WORLD_CUP_DATA`): ONE `/competitions/WC/matches` call derives group tables (`buildGroupStandings` computes W/D/L/GF/GA/Pts per group from finished GROUP_STAGE matches → `FootballLeagueData.groups`), the flat match list, AND the single-leg knockout bracket. Undecided knockout fixtures come back with **all team fields `null`** (`teamFromFd` returns `null` → TBD bracket slots; TBD-vs-TBD fixtures are excluded from the flat match list but kept in the bracket). `KNOCKOUT_ROUND_ORDER` covers LAST_32 and THIRD_PLACE for cup formats. Total cold-load cost is 9 calls (4 comps × 2 + 1 WC), within the free 10/min limit
- `padel-api-service.ts` — `getPadelData()` fetches men's + women's rankings and tournament list from Padel API (`padelapi.org/api`), maps to `PadelData`, cached 30 min, falls back to `PADEL_DATA` mock. Requires `PADEL_API_KEY`
- `thesportsdb-tennis-service.ts` — `getTennisData()` fetches the next + last event per tour for ATP (id 4464) and WTA (id 4517) from TheSportsDB free public API (no key), derives a `RacquetTournament` per tournament (groups events by extracted tournament-name prefix), keeps `TENNIS_DATA` mock rankings since TheSportsDB has none. Cached 30 min, falls back to `TENNIS_DATA` mock on any error

## Schemas — `/schemas/`
- `travel.ts` — `createTripSchema`, `updateTripSchema`, `tripItemSchema` +
  `tripItemSchemaChecked` / `updateTripItemSchema` (both carry the
  `endsAfterStart` refinement — a backwards range makes the calendar compute a
  negative span), `tripPhotoSchema`, `createTripShareSchema`,
  `tripContributionSchema` / `updateTripContributionSchema`,
  `setItemStopsSchema`, `setTripMembersSchema`
- `sports.ts` — `sportIdSchema`, `setSportFavoriteSchema`

## Types — `/types/`
- `travel.ts` — `Trip`, `TripItem`, `TripPhoto`, `TripShare`,
  `TripContribution`, `TripMemberView`, `TripItemStop`, `TripItemWithStops`,
  `TripWithRelations`, `PublicTripView` + `PublicTripScope`, plus
  `DashboardTravelSummary` / `DashboardTravelFeaturedTrip` /
  `DashboardTravelTripState`
- `sports.ts` — full domain shapes for matches, standings, brackets, F1/NBA/NFL/LoL specifics, plus `UserSportsPreference` and `DashboardSportHighlight`. `SportId` includes `worldcup`; `FootballLeagueId` includes `world-cup`; `FootballLeagueData.groups?: FootballGroupStandings[]` carries per-group cup tables

## Components
- `components/travel/` — trip list/detail, item editors, photo gallery, share panel
- `components/travel/trip-calendar.tsx` — the month view behind the List /
  Calendar tabs; bars laid over the day grid by `lib/travel/calendar.ts`
- `components/travel/trip-payments.tsx` — the payment log, per traveller
- `components/travel/category.tsx` — the one category table (icon, tint, dot,
  bar); both the itinerary and the public page read it
- `components/travel/marquee-text.tsx` — a label that walks left on hover, but
  only when it does not fit
- `components/travel/dashboard-travel-card.tsx` — server-component card mounted on `/portal`: featured trip (in-progress wins → next upcoming → most recent past) with cover photo, state badge, items count and estimated total
- `components/entertainment/sports/sports-hub.tsx` — client tab strip + per-sport view switcher; stars favourites and pins them first
- `components/entertainment/sports/manage-favorites-sheet.tsx` — sheet with per-sport switches, optimistic updates via `setSportFavoriteAction`
- `components/entertainment/sports/dashboard-sports-card.tsx` — server-component card mounted on `/portal` showing one highlight per favourited sport
- `components/entertainment/sports/dashboard-f1-card.tsx` — F1's own `/portal` card, half the row (`md:grid-cols-2`), gated on F1 being favourited: next race, the championship top 3, then the news rail
- `components/entertainment/sports/f1-standings-tabs.tsx` — client island inside that card, Drivers ⇄ Constructors over the same three rows. Drivers carry an ESPN headshot + country flag, constructors their team logo in the same circle, filled with `muted` rather than white so it reads as part of the card instead of a lit disc. A team with no logo published falls back to a livery-coloured disc with a 3-letter code, where `readableInk` picks black or white text off the disc's relative luminance so a yellow livery is not white-on-yellow
- `components/entertainment/sports/sports/world-cup-view.tsx` — 🏆 World Cup tab: Knockout (default) / Matches / per-group standings grid
- `components/entertainment/sports/shared/knockout-bracket.tsx` — responsive: below `sm` it renders a Google-style mobile bracket (scrollable round tab strip + each pair of ties connected to the next-round tie they feed; `orderPairs` matches feeders to next-round slots by team membership, falling back to positional order for TBD slots; third-place is skipped as a "next" round so SF winners connect to the final); `sm`+ keeps the 3-column sliding window
- `components/entertainment/sports/shared/` — score cards, standings table, knockout bracket, team badge, last-5 form chips, `sport-shell.tsx` (header + body wrapper; every sport view mounts its `Tabs` around the shell and renders the `TabsList` inside the shell's `tabs` slot so the chip strip sits in the header row next to the title, à la Google's sports panels). `leg-score-card.tsx` renders BOTH two-legged ties (UCL: per-leg L1/L2 columns + aggregate) AND single best-of series (LoL/NFL playoffs: one score column from `homeScore`/`awayScore`) — it falls back to the single column when `match.legs` is empty, so bracket scores never disappear
- `components/entertainment/sports/sports/` — one view per sport (football, f1, nba, tennis, padel, nfl, lol). Each view smart-defaults to its knockout tab when bracket data exists (LoL/NFL playoffs, UCL knockout). `score-card.tsx` shows the match date next to the status for finished games (not just upcoming), à la Google's sports panels

## DB tables — `db/schema.ts`
- `trips` — user-owned trips (date-based, no timezone)
- `trip_items` — activities, bookings, transport, food (optional scheduled dates)
- `trip_photos` — gallery (uploaded or external URLs)
- `trip_shares` — share tokens for read-only public access; `member_id` scopes
  a link to one traveller, `show_prices` / `show_members` gate what it exposes
- `trip_members` — who is going, with an optional fixed `share_percent`
- `trip_contributions` — money a traveller has actually handed over
- `trip_item_stops` — a cruise's day-by-day ports
- `trip_item_attendees` — who an item is FOR, when it is not the whole party
- `trip_item_payers` — who covers one item, when it is not the whole party
- `user_sports_preferences` — favourited sports per user; UNIQUE(user_id, sport_id) backs the toggle semantics

## Tests
- `lib/travel/*.test.ts` — Vitest, pure: `calendar` (week packing, lane caps,
  which items really span days), `pricing`, `split`, `item-fields`, `format`,
  `airports`, `video`
- `lib/services/travel-service.test.ts` — Vitest, mocks `@/db`; covers the CRUD,
  the query count for `getTripWithRelations` and the scoped-share guards
- `app/actions/travel.test.ts` — Vitest; covers zod rejection, auth failure and
  the audit metadata a share records
- `components/travel/*.test.tsx` — Vitest + jsdom; the itinerary, the calendar,
  the payment log, the traveller bar and the marquee
- `e2e/trip-lifecycle.spec.ts` — Playwright, real Supabase user
- `e2e/trip-share-links.spec.ts` — Playwright; opens both kinds of share link in
  a browser with no session, which is the only place the server/client boundary
  is real
- `lib/services/sports-service.test.ts` — Vitest, mocks `@/db`; covers favourites CRUD + dashboard summary shape per sport
- `app/actions/sports.test.ts` — Vitest, mocks impersonation + service + `next/cache`; covers happy path, zod rejection, auth failure, impersonation routing
- `e2e/sports-favorites.spec.ts` — Playwright, real Supabase user; covers empty CTA → toggle → persistence → dashboard highlights → un-toggle round trip
- `e2e/auth.setup.ts` + `e2e/fixtures.ts` — shared auth + DB cleanup fixtures

## Notes
- **Logic audit (2026-09-11).** Travel: `TripCalendar` takes `showPrices` and the public calendar tab honours the link's setting; removing a traveller revokes their scoped share links (the FK would have widened them to the whole trip); `defaultShares` scales fixed shares up when they total under 100 with nobody flexible; a per-person item whose named payers are a subset of its attendees charges the payers for the other seats; the dashboard estimate uses `tripCost` with the party size; a hidden end date is not saved; stops renumber on save and "Add day" continues from the highest day; the public payload omits the owner's user id and shows item notes only on priced links. Sports: F1 picks a live race first and derives `live` from the race time; NBA live games carry scores and "recent" means finals; an ESPN tennis event that has not started is `upcoming`; F1 news dedupes a batch by article id and orders with a tiebreaker; date-only strings are read as calendar days; the dashboard card counts followed sports.
- **`setTripMembers` scopes every member update to the trip.** A member id
  borrowed from somebody else's trip used to be overwritten and re-parented.
- **Sports feeds carry an 8s abort signal** (`lib/services/upstream.ts`); a hung
  provider falls through to the mock fallback instead of holding the render.
  `listUserFavoriteSportIds` is request-cached — the dashboard asks three times.
- **The trip page has two views**, switched by `Tabs` next to *All trips*: the
  list answers *what is the plan*, the calendar answers *what does the month
  look like*. `TripCalendar` draws a whole month with arrows either side and a
  **Trip** button back to the trip's own month.
- **The bar grid carries no padding of its own.** It is `absolute inset-x-0`
  over the day grid with the same columns and the same gap; a `px-1` on it
  took 8px off the width and made every track **1.1px** narrower than the day
  it sits over, so a badge drifted further left the later in the week it fell.
  A test asserts the overlay has no padding class, because the symptom is a
  couple of pixels and reads as sloppiness rather than as a bug.
- **Every badge is inset the same at both ends** (`mx-0.5`). Insetting only
  where a run began left two badges on one day disagreeing about where that
  day starts. Weeks are separate rows, so nothing is continuous across the
  boundary anyway — the square corner is the cue that a run carries on.
- **Bars use shadcn's `Tooltip`, not the browser's `title`.** It opens at once
  rather than after a second, and it holds the three things worth knowing:
  what it is, what it costs, and when it runs.
- **A bar's label is one string — `title · price`, not two boxes.** Pinned to
  the right, the price ate the title on any bar a single day wide: a flight
  read *"$600 – $"* and never said where it went. As one label the wide bars
  show everything and the narrow ones reveal it on hover, via
  [`MarqueeText`](../../components/travel/marquee-text.tsx), which measures the
  overflow and leaves a label that already fits completely alone. It respects
  `prefers-reduced-motion`.
- **Sharing lives on the banner, not in a card down the page**, and the
  dialog asks who the link is for. The traveller in focus is where that picker
  starts, not a lock — choosing a different recipient used to mean closing the
  dialog, clicking a face behind it, and opening it again.
  `TripSharePanel` is the dialog's body; it renders no `Card` of its own.
- **A shared link carries the videos too.** `ActivityVideo` already routed
  YouTube through `youtube-nocookie.com` and said why in its own comment — a
  visitor holding a share token has agreed to nothing — but the public page
  never rendered it.
- **A shared link carries the stops.** `getPublicTripByToken` loads
  `trip_item_stops` alongside the items, so a cruise arrives as a journey
  rather than a booking. Still one round of queries — the stops join
  `trip_items` in a single call rather than one per item.
- **Category is the item form's first question**, full width and on its own
  line. It decides which fields appear below it, what the price may be quoted
  in, and what a good title looks like (`titlePlaceholder` — a hotel example
  under a form set to Food prompts for the wrong answer). Squeezed beside the
  title it also read as a control of a different weight.
- **Everything else in that form pairs up.** Price / *Up to* / *That price is*
  are one question asked three ways and share a row; *Link* and *Video* are two
  optional URLs and share another; *From* and *To* get their own sub-grid so a
  one-way flight cannot render "Departs | From" with "To" stranded on the next
  line. The two money inputs stay paired even on a phone — they are short
  enough. Category and title are the exception above and stay on their own
  lines.
- **Dates use `DateField`** (Popover + Calendar), not `<input type="date">`.
  The native control renders differently in every browser and shows no view of
  the month around the date, which is what somebody arranging a trip is
  looking at. Values stay `YYYY-MM-DD` strings throughout — the moment one
  becomes a `Date`, somebody west of Greenwich gets yesterday.
- **Photos attach to an item** (`trip_photos.item_id`, which had existed
  unused since the table did). A photo picked before the item exists waits in
  the form and is attached once the insert returns an id. The gallery holds
  only the trip's own photos; the rest travel with their item.
- **The shared page's view switcher sits on the banner**, opposite the total,
  dark and ringed for the same reason the pill is: the photograph underneath
  is unknown. `PublicTripViews` owns the page layout rather than a slot inside
  it, because that one piece of state spans the banner and the column below
  the grid — so the banner, the list and the aside arrive as slots.
- **The shared page offers the calendar too**, mounted `readOnly`: the month
  arrows stay, because reading a plan means looking at the days around it, but
  the bars stop being handles and `ItemForm` is a dynamic import that a
  visitor never fetches.
- **A day's heading carries the run it begins** (`dayGroupLabel` +
  `runsUntil`): "Sunday, Jan 17 – Sun, Jan 24" rather than a date the reader
  has to open the item to complete. `spansDays` decides which items count, so
  a return flight never stretches a heading. Both views use it.
- **The shared page's sign-in lives on the bar**, in
  [`app/trips/[token]/layout.tsx`](../../app/trips/[token]/layout.tsx) — that
  layout exists so the invitation can be token-specific: sign-up prefills the
  address the link was labelled with and returns the reader to the trip. It
  was a card above the itinerary, which is a lot of furniture in front of the
  thing somebody was sent to look at.
- **`Still to go` is a range** on the shared page, like everything else that
  is still an estimate. Only what has been paid is one figure: that money
  either moved or it did not.
- **The public page is the planner, minus every control.** Same banner, same
  day groups, same money in the same column — the owner describes a link by
  what they are looking at, and a recipient seeing a different layout has to
  be told how to map one onto the other. There is no add, edit, menu or drag
  anywhere in it: a share link grants a view.
- **A share link's origin comes from `getBaseUrl`**, which prefers
  `NEXT_PUBLIC_BASE_URL`, then Vercel's `VERCEL_PROJECT_PRODUCTION_URL`.
  `VERCEL_URL` is the *deployment's* hostname — new on every push, and on this
  project it 302s to `vercel.com/sso-api`, so a link built from it lands the
  recipient on a login page. The production alias is **not** protected and
  serves `/trips/<token>` to anybody; Deployment Protection covers the
  per-deployment hosts only, which is what they are for. Nothing needs
  disabling — the app just has to write the right host into the link.
  [`lib/env.test.ts`](../../lib/env.test.ts) pins the order.
- **Each active link can show its QR** (`qrcode.react`). A phone cannot be
  handed a URL, and the code is how a link crosses to a device that is not
  this one. The code is drawn on white whatever the theme — a dark surface
  inverts the quiet zone and most scanners give up.
- **A calendar bar is a control: tap it to edit, drag its glyph to move it.**
  Only the glyph is draggable — a bar that is both clickable and draggable
  needs one of them to have its own handle, or every attempt to open an item
  becomes a half-started drag. It follows
  [`plan-calendar.tsx`](../../components/finance/plan-calendar.tsx): native
  HTML5 drag with a private MIME type, and a payload carrying the day the drag
  began so a stay keeps its grip — grabbed on its second night, it lands on
  its second night and keeps its length. The drop day is read from the week's
  geometry rather than per-cell handlers, because the bars sit on top of the
  cells and would otherwise swallow the drop. The glyph is `hidden sm:block`,
  so there is no dragging on a phone — HTML5 drag has no touch story, and the
  list view is the editing surface there.
- **`moveTripItemAction` sends only the dates.** The calendar renders from a
  snapshot; echoing every field back would overwrite a title or a price edited
  elsewhere since that snapshot with whatever the browser still believed.
- **`ItemForm` lives in its own module.** Both views open it, and reaching
  into the itinerary for it would drag the whole list along.
- **A price range is written with `~`, not a dash** (`moneyRange`). Money set
  as "$600 – $800" reads as a subtraction or a negative figure at a glance,
  and the itinerary is full of both real arithmetic and real date ranges using
  dashes. Date ranges keep the dash.
- **A calendar bar carries its label at every size.** It used to go solid
  below `sm` on the grounds that a bar with no room for a label had only its
  colour to say anything; the label shows there now, so the soft wash is right
  everywhere — a name on a solid amber or sky ground is a name nobody can
  read. The label needs `flex-1`: with only `min-w-0` the box measures 0,
  `MarqueeText` reads that as overflow, gives the text `w-max`, and the box
  stays 0 wide forever.
- **A calendar run is a badge, not a hairline.** Soft wash + full-strength
  label + a ring, because the two things that would give it more weight both
  cost legibility: a solid fill needs white text, and amber (3.19:1), sky
  (4.02) and teal (3.66) do not clear AA against white; deepening the wash
  costs the label instead — 15% leaves it at 3.3:1, 25% drops it to 2.9. So
  the edge does the work. Below `sm` the bar is a few pixels tall with no room
  for a label, so it goes **solid**: there, the colour is the whole signal.
- **Runs are bars, not repeated chips.** `layOutWeek` clips each run to the
  week and stacks overlaps into lanes; the bars ride over the day grid on a
  matching seven-column track, because the length of the bar IS the
  information. `spansDays` decides who gets a run at all: a hotel booked the
  15th to the 17th occupies three days, a return flight occupies the day out
  and the day back and **nothing in between** — drawn as one run it painted a
  plane across the whole holiday.
- **`moneyRange` lives in `lib/travel/format.ts`, not beside a component.** It
  was exported from `traveller-bar.tsx`, a client module, and the public trip
  page is a server component: the first shared link allowed to show prices
  crashed with *Attempted to call moneyRange() from the server*. Unit tests
  cannot see that — jsdom has no such boundary — which is why
  [`e2e/trip-share-links.spec.ts`](../../e2e/trip-share-links.spec.ts) opens
  both kinds of link in a browser with no session.
- **Both grid columns carry `min-w-0`.** An `fr` track still takes an automatic
  minimum from its content, so the gallery's photo rail widened its own column
  and crushed the itinerary to one word per line. The rail scrolls; the column
  has to be allowed to be narrower than it.
- **The banner is `min-h-72` below `sm`.** At 21/9 a 390px phone gives 167px,
  and the traveller pill, the buttons and the title all landed on top of each
  other. Its three overlays are now one `justify-between` column.
- **`components/travel/category.tsx` and `lib/travel/viewer.ts`** hold what the
  list and the calendar share. They used to live in `trip-itinerary.tsx`, which
  meant a view that only draws squares imported the whole server-action layer.
- **Travel forms use `Field` / `FieldLabel`**, not `div` + `Label`. The gap is
  overridden (`gap-1.5`, `gap-2`) to keep the density these forms were tuned
  to; `Field`'s own `gap-3` would double the label-to-control distance. What
  the primitive buys is the `role="group"` and the invalid-state wiring, which
  a bare div does not have.
- **Both lists are clickable rows.** An itinerary row cannot be a `<button>` —
  it holds a link, a disclosure and sometimes a video, and nesting those in a
  button is invalid — so the container listens and steps aside for anything
  that handles its own clicks, and for a click that ends a text selection.
  The title is a real button so the keyboard has a way in. Delete moved into
  the form the row opens.
- **Nothing is reserved at the right of an itinerary row.** The
   row *is* the control, so every price, subtotal and video runs to the
  card's edge on every screen, and the day header needs no spacer to stay in
  step with them.
- **One dialog logs a payment and corrects one.** They ask for the same four
  things, so separate forms only made them look like different work and had to
  be kept in step by hand. `payerId` is the contract for "the payer is already
  decided" — its presence is why the form does not ask when the card is
  filtered to one traveller. Who paid is fixed once a payment exists: moving it
  rewrites two balances at once and only one is on screen.
- **A payment is a record, not a row of controls.** Tapping it opens a dialog;
  the delete button used to hold space at the right of every row, which is what
  pushed each amount off the card's edge.
- **Icon buttons are `size-9 sm:size-7`** — 36px on touch, 28px on a pointer.
  Several were 20–24px, and the gallery's delete was both the smallest and the
  only destructive one visible without hovering.
- **`space-y-*` stays.** The shadcn skill prefers `gap-*`, but
  [`docs/SPACING.md`](../SPACING.md) mandates `space-y-4`/`space-y-6` for
  stacked blocks, and a blanket swap would silently do nothing wherever the
  parent is not flex or grid.
- **`trip_contributions` records money that actually moved.** What somebody
  owes is a range (the trip is mostly quotes); what they paid is exact. The
  Payments card follows the same selected traveller the itinerary does, and
  progress is measured against the **low** estimate — the high one would leave
  a fully-settled trip reading as short.
- **A share link can be scoped to one traveller** (`trip_shares.member_id`,
  `ON DELETE SET NULL`). The split is computed server-side in `buildScope` and
  only that traveller's figures cross the boundary: every member is needed to
  work out the split, but sending the member list to the page and filtering
  there would put the other travellers in the payload of a link created to hide
  them. A scoped link defaults `showPrices` to true — hiding the money would
  remove the only thing the scoping was for.
- **`ensureMemberBelongsToTrip` is not redundant with the foreign key.** The FK
  proves the member row exists; it says nothing about *which* trip it is on.
  Both the scoped share and the contribution go through it.
- **The public renderer now reads `showPrices`.** It never did — the column has
  always defaulted to false and the page published the costs regardless.
- **Category icons are tinted, and the tint lives on `CATEGORIES` in
  [`category.tsx`](../../components/travel/category.tsx)** — one list feeding
  the picker, the itinerary rows and the calendar through `CategoryIcon`, so
  they can never disagree about what a cruise looks like. Each hue is a theme
  token (`--trip-*` in [`globals.css`](../../app/globals.css)), so the dark step
  is chosen for the dark surface rather than bolted on with a `dark:` override,
  and a hue can be retuned in one place.
  These are **not** `--chart-1..5`: that palette has five slots, must never be
  cycled, and there are eight categories. Colour is the second channel — the
  icon's shape carries the meaning, so a reader who cannot separate two hues
  still reads a plane and a bed. `other` stays neutral because it is the
  absence of a category, not one more kind of thing.
  The hues were measured, not eyeballed: worst pair ΔEok 0.137 (light) /
  0.123 (dark), every icon ≥3:1 against its own surface in both themes.
  Activity is lime rather than emerald because emerald measured 0.056 against
  teal, and lime-**700** rather than 600 because 600 clears contrast at only
  3.06:1.
- **`That price is` offers only the units its category can honestly use**
  (`ItemFieldSpec.priceUnits`). `per_night` multiplies by the nights between
  the two dates, so it belongs where the end day marks a stay — lodging,
  cruise, other. A flight's end day is its *return*, so offering it there would
  turn one fare into nine nights of fares. The list is also the display order,
  and `priceUnits[0]` must equal `defaultPriceUnit` — a test asserts it, since
  a default the dropdown does not offer renders as a blank control.
- **A stored unit always stays selectable** even after its category narrows
  (`priceUnitOptions(category, current)`). Dropping it would blank the control
  while the database kept the value, and the price would stop explaining
  itself. Changing category snaps the unit only when the new category cannot
  use the old one at all.
- **Every money figure in Travel is a range**, because most of a plan is
  estimates. `itemCost`, `tripCost` and `splitTrip` all carry `low` and `high`
  together — `splitTrip` returns `owedLow`/`owedHigh`, never a single `owed`.
  The one field was the bug: each reader downstream presented it as the answer,
  and a $600–$800 flight showed up as a settled $600.
- **An item may name its own payers** (`trip_item_payers`, edited from the
  *Who pays for this* row in the item form). An empty list is the common case
  and means "however the trip divides" — naming nobody is not the same as
  naming everybody, because the trip's own `sharePercent` still applies. Named
  payers split the item equally between themselves, except for a `per_person`
  price, which is already one person's cost and so is charged to each payer in
  full. `setItemPayers` replaces the whole set and rejects a member who is not
  on the trip.
- **The day subtotal is the sum of the rows above it**, and it is derived from
  the same figures those rows print. When a traveller is selected the rows
  switch to that person's share so the arithmetic still checks out on screen;
  the full booking price stays underneath, because that is what the hotel's own
  site will quote.
- **Who is on an item and who pays for it are two lists, not one.**
  `trip_item_attendees` answers the first, `trip_item_payers` the second, and
  both mean "everybody" when empty. **Naming no payer means the attendees
  pay** — otherwise the form's own default (a named attendee, payers left on
  *Everyone*) billed the other travellers for something the itinerary had just
  told them they were not on. A `per_person` price likewise multiplies by the
  attendees, not the whole party. Filtering on payers was wrong in both
  directions: the festival all four travellers are going to vanished off the
  two who are not paying for it, and a flight one person takes stayed on
  everybody else's day. The form asks both questions side by side (*Who's
  coming* / *Who pays for this*).
- **Picking a traveller narrows the plan, not just its prices.** `viewerItems`
  ([`lib/travel/viewer.ts`](../../lib/travel/viewer.ts)) filters on
  `attendeeIds` via `itemConcerns` in
  [`lib/travel/split.ts`](../../lib/travel/split.ts) — never on payers.
  Re-costing alone left Ana's flight from Mexico sitting on Jafet's day worth
  $0, a row that says nothing except that it is not his. A scoped share link is
  narrowed **server-side** in `getPublicTrip` instead, so the trip's member ids
  never reach the browser; the split still runs over every item, so the totals
  are unaffected.
- **A public link never carries `payerIds` / `attendeeIds`.** They are raw
  `trip_members` UUIDs and the page is unauthenticated; `getPublicTripByToken`
  narrows and splits with them and then drops them, which is why the payload
  type is `PublicTripItem` rather than `TripItemWithStops`.
- **Item writes run in a transaction.** One save touches `trip_items`,
  `trip_item_payers` and `trip_item_attendees`; without one, a rejected
  traveller left the item written and its member lists half-replaced.
- **A flight offers neither a video nor a photo** (`video` and `photos` in
  [`lib/travel/item-fields.ts`](../../lib/travel/item-fields.ts)). The row is
  two airport codes and a fare — the pickers were inviting a picture of
  nothing. Photos already attached still render, so an item re-categorised to
  Flight does not strand them out of reach.
- **The calendar draws every run on a day.** There used to be a four-lane cap
  with a "+N" chip on the overflow; a day with six things on it now shows six
  and the week's row grows to fit. `capLanes` went with it.
- **The cover runs edge to edge on a phone** (`-mx-4 sm:mx-0`, square with
  top/bottom borders below `sm`). The page container's 16px gutters were
  cropping a photograph for no gain. On the public view the negative margin
  sits on the `relative` wrapper in `PublicTripViews`, not the header — that
  wrapper is the view switcher's positioning context, and the two have to share
  an edge or the switcher floats inside the image.
- **A card's context badge drops under its heading below `sm`** — whose share
  on the itinerary and the calendar, whose payments on Payments. Inline, a name
  like "Alejandra's share" pushed the row against Add item with nowhere to go.
- **The traveller chips carry a real tooltip**, not a native `title`. Two
  initials cannot separate Jason from Jafet or Ana from Alejandra, and `title`
  never appears on a phone — which is exactly where the chips are smallest.
  The name is also the button's `aria-label`, so the accessible name is the
  person rather than "JF".
- **The selected traveller lives in `TripDetail`**, not in `TravellerBar`.
  Picking a face re-costs the whole itinerary, so the banner cannot own it.
- **The trip detail page does not render `description`.** The field is still
  stored and still editable (as *Notes* in the trip form), and the public share
  view still shows it — a visitor arriving on a shared link has no other
  context. On the detail page the owner already knows what the trip is, so the
  card was only taking room from the itinerary.
- **Disclosures use shadcn's `Collapsible`**, not a hand-rolled button with
  state. The itinerary accordion started as the latter and was replaced: the
  primitive brings the aria wiring and keyboard behaviour a disclosure needs,
  and this project uses shadcn components rather than one-off equivalents.
- **The traveller chip sits on a photograph**, so its surface is a solid dark
  pill rather than a translucent one. A light-wash cover — a beach, a snowfield
  — leaves white text on white through any amount of transparency, and a scrim
  that only sometimes works is worse than one that always does.
- **The chip is a fixed size.** "you pay" and "Bruno Fabián pays" are different
  lengths, and letting the box track the caption made the banner twitch on
  every click.
- **A price has a unit** (`trip_items.price_unit`: `total` / `per_night` /
  `per_person`). Without it every figure was summed as a total, so a hotel at
  "$100–200" silently meant one night and a cruise at "$1,900 per person"
  silently meant the whole party — both wrong, and both in the direction that
  makes a trip look cheaper than it is.
- **Nights, not days.** The 15th to the 17th is two nights; counting three
  overstates every stay. A missing or backwards range falls back to one night,
  because an undated stay still costs something.
- **The arithmetic is shown, not hidden.** A row reading $400 when you typed
  $200 looks like a bug until the `$100–200 / night × 2` under it explains it.
- `partySize` is 1 until trip members have a UI; the moment they do, every
  per-person figure scales from the real count with no further change.
- Defaults come from the category (`itemFields().defaultPriceUnit`): a hotel is
  nightly, a fare is per person. Changing category adopts the new default only
  while **creating** — rewriting a saved choice behind the user's back is worse
  than making them set it once.
- **Airport fields autocomplete against ~7,900 IATA airports**, searched
  **server-side** (`searchAirportsAction`). The dataset is 115 KB gzipped —
  too much to ship for one form field — and a DB table would add an ~86 ms
  round trip per keystroke for data that changes once a year and nobody edits.
  It lives in `lib/travel/data/airports.ts`, generated by
  `scripts/build-airports.mjs` from https://github.com/mwgg/Airports (MIT).
- **Whatever is typed is the value.** Suggestions only fill it in faster; a
  small airfield or a bus terminal must still save. That is also why the column
  is free text and there is no FK to an airports table.
- Flags are computed from the ISO-3166 alpha-2 code via regional indicator
  symbols, not bundled as 250 emoji.
- **Trip ITEMS carry an optional video** (`trip_items.video_url`) — **YouTube
  or Instagram** —
  a walkthrough of the hotel, a tour of the ship. It briefly lived on `trips`,
  which was the wrong level: a trip is a container, and it is the individual
  activity that has a video worth watching. Moved in `0037` before any row
  used it. Stored as the
  URL the user pasted, never a pre-built embed URL: the video id is derived at
  render time by `lib/travel/youtube.ts`, so a link saved in any of YouTube's
  shapes (`watch?v=`, `youtu.be`, `/shorts/`, `/embed/`, `/live/`) keeps
  working. Validated as a YouTube link specifically — any-URL validation would
  save happily and then render nothing.
- **The embed uses `youtube-nocookie.com`** and renders nothing at all for a
  missing or unrecognised link. The trip page is also served publicly through a
  share token, where the visitor has agreed to nothing.
- Conventional Commits scopes: `travel`, `sports`, `entertainment`
- `/app/trips/[token]` is **public** — verify no PII leaks through the shared route. The share token model in `trip_shares` is the only authz check.
- **Travel formatting helpers live in [`lib/travel/format.ts`](../../lib/travel/format.ts)** (`parseTripDate`, `formatDateRange`, `tripDays`, `tripDurationLabel`, `formatTripMoney`) — a server-safe module with no `"use client"`. They were previously duplicated per component and exported from the client `trip-detail.tsx`; importing that from the server-rendered `public-trip-view.tsx` turned them into client references and **500'd every public share link**. Never re-export shared helpers from a client module.
- `getPublicTripByToken` is wrapped in `React.cache()` (like `getTripWithRelations`) so `generateMetadata` + page body share one DB hit. The share panel treats **expired** links as inactive (same as revoked — the public resolver rejects both).
- Itinerary/gallery/calendar hover-revealed controls are always visible below `sm` (no hover on touch) and reveal on keyboard focus.
- All trip cover photos and gallery thumbnails render through `next/image` (remote hosts whitelisted in [`next.config.ts`](../../next.config.ts)). The blob-URL preview inside `photo-picker.tsx` stays as a CSS background because the optimizer can't process blob URLs.
- `getTripWithRelations` is wrapped in `React.cache()` so `generateMetadata` and the page body share one DB hit per request.
- `app/portal/entertainment/loading.tsx`, `app/portal/entertainment/travel-planner/[id]/not-found.tsx`, and `app/portal/entertainment/error.tsx` give the module its skeleton / 404 / error boundaries.
- **Sports data — mixed sources (as of 2026-06-04):**
  - **Live**: LoL (Lolesports), F1 (Jolpica-F1), football (football-data.org — UCL/La Liga/EPL/Serie A), World Cup (football-data.org — its own `worldcup` sport tab, NOT in the football league selector), padel (Padel API — men + women rankings + tournaments), tennis (TheSportsDB — ATP/WTA active tournament only, mock rankings retained since TheSportsDB has none). All share the same shape: live fetch → map into the existing typed data shape → fall back to the mock fixture on any error → cached **5 min** via `unstable_cache` (was 30 min; shortened so scores are near-current whenever the user lands — rate budgets checked per provider) → fetched by [`lib/sports/load.ts`](../../lib/sports/load.ts) for **the active sport only** and passed to `SportsHub` as one `SportPayload`.
  - **Mock only**: NBA (BALLDONTLIE free tier blocks `/standings`, only teams/games — needs $9.99/mo ALL-STAR plan or computed standings from 1230 games of game data which costs 13 paginated calls at 5 req/min = 2.5 min cold start, not viable for SSR), NFL (no decent free provider with current-season data).
  - **Rejected providers**: API-SPORTS (free tier hard-locked to seasons 2022–2024, useless for current data; paid plan ~$100/mo); Riot Games official API (no esports/tournament data, only personal player stats).
  - **Env vars**: `FOOTBALL_DATA_API_KEY` and `PADEL_API_KEY` (both optional — service falls back to mock when unset). Lolesports, Jolpica and TheSportsDB need no key.
- **Vitest setup** in [`vitest.setup.ts`](../../vitest.setup.ts) stubs `next/cache` (so `unstable_cache` becomes a passthrough) and rejects `global.fetch` by default (so live-API services exercise their mock-fallback path). Tests that need real responses can re-stub `fetch` per-file.
- The new sport selector pins favourites to the front of the strip and stars them; non-favourites stay visible so the hub still works with zero favourites picked.
- **Match display order** is centralized in [`lib/sports/match-order.ts`](../../lib/sports/match-order.ts) (`orderMatchesForDisplay`: live → upcoming nearest-first → results most-recent-first). Football and LoL both use it; the previous plain-descending sort put fixtures 60 days away at the top and made the dashboard's `find(scheduled)` pick the furthest-away match as "Upcoming".
- **The active sport is a `?sport=` search param.** It was component state,
  which meant no deep link, no Back between sports, a refresh landing you back
  on football — and, because the page could not know which sport it was about,
  a `Promise.all` over **all six providers on every load** to render one view.
  football-data.org allows ten requests a minute on the free tier and this page
  spent two of them per visit before anything was chosen.
  [`lib/sports/payload.ts`](../../lib/sports/payload.ts) is the client-safe half
  (the `SportPayload` union, `isSportId`, `SAMPLE_DATA_SPORTS`);
  [`lib/sports/load.ts`](../../lib/sports/load.ts) is `server-only` and does the
  fetching.
- **The NBA is live** via balldontlie
  ([`lib/services/balldontlie-nba-service.ts`](../../lib/services/balldontlie-nba-service.ts)),
  `BALLDONTLIE_API_KEY`. Two things shape it: the free tier allows **five
  requests a minute shared by every visitor**, so a cold cache spends exactly
  one — a single wide window, trimmed to the last six results and next six
  fixtures in memory rather than by a second request; and `/standings` is not
  on the free tier, so `standings` comes back empty and the view drops the tab
  instead of showing an invented table beside real scores. Out of season that
  window is what surfaces June's finals next to October's opener, and the
  heading names the season the **results** belong to, not the fixtures'.
- **Only the NFL is sample data now**, via `SAMPLE_DATA_SPORTS`. It has no free
  provider with current data, so it renders a hand-written season — and a
  hand-written season with nothing admitting it reads as a broken live view.
- **Tennis has a draw.** `RacquetTournament.bracket` had been in the type since
  the start with nothing rendering it. `KnockoutBracket` now takes an optional
  `renderMatch`, so the same round/lane/mobile machinery draws a tennis tie
  through `DrawMatchCard` — seeds, flags and set-by-set scores, the won set
  highlighted — instead of football's L1/L2-plus-aggregate card. **A set is a
  `leg`**: the type already carried per-leg scores and a set is exactly that
  under another name, so nothing new was needed to hold one.
- **The tennis draw is live, from ESPN's public scoreboard**
  ([`lib/services/espn-tennis-service.ts`](../../lib/services/espn-tennis-service.ts)) —
  the same endpoint espn.com reads, no key and no signup. It is what supplies
  the bracket: TheSportsDB's free tier returns a calendar and, in practice, a
  single event with no score, so a draw had to come from somewhere else. Two
  providers, one view.
  - **Qualifying is dropped and only followed rounds are kept.** ESPN returns
    Qualifying 1st/2nd/Final alongside the main draw, and qualifying is not the
    tournament.
  - **A live tournament replaces its own calendar entry** rather than sitting
    beside it, or the same US Open appears twice.
  - **Players travel as `drawPlayers`, a list not a Map**, so they cross the
    server/client boundary as plain data; the view builds the lookup.
  - Rankings are still a fixture — nobody free serves them.
- **Team logos are vendored, not hotlinked** (`public/f1/teams/`, 36 KB).
  They come from F1's own media CDN, which is versioned by season and moves:
  the 2026 paths already 404 while the 2025 ones serve. Copying them buys a
  badge that cannot break mid-season. Audi and Cadillac joined the grid for
  2026 with no mark published yet, which is why the livery fallback stays —
  and a test asserts every mapped file actually exists on disk, since a
  renamed asset would fail silently as a blank badge.
  - **They are not the files F1 serves.** Each ships pre-plated on an opaque
    white rounded square (only the corners are transparent), which on the dark
    card renders as a column of bright discs. The plate is flood-filled away
    from the border inwards — so white *inside* a mark survives, Mercedes' star
    and Haas' box — and the result trimmed to its bounding box, so a wide mark
    like Red Bull's fills the badge instead of floating in it. Every mark then
    reads on both surfaces unplated, including the three that looked at risk
    (Aston Martin is silver, not black; Williams and Racing Bulls are bright
    blue). A test asserts no asset is still 96x96, which is what every raw
    download is — the one way this regresses is somebody dropping a fresh file
    in.
- **The dashboard reads standings from a different provider than the F1 view**
  — ESPN for the card, Jolpica for the page. Not an oversight: ESPN ships the
  headshots and livery colours the card is built around, Jolpica ships the
  fuller table the page needs. The two were checked against each other and
  agree on points.
- **F1 news is stored, not fetched on demand** — `f1_news` (migration `0048`),
  read by [`lib/services/rapidapi-f1-news-service.ts`](../../lib/services/rapidapi-f1-news-service.ts).
  RapidAPI's feed is a rolling window of the last 25 articles, so anything
  older is gone the moment it falls off; keeping each one is what makes an
  archive possible. `article_id` is the provider's own `dataSourceIdentifier`
  and carries a unique index, so a refresh upserts and re-running the cron
  never duplicates. The page reads the table and never the provider.
  - **The refresh rides the existing daily cron** (`/api/cron/daily`), not a
    schedule of its own.
  - **It came from the humex-champions Firebase project**, which had been
    collecting the same feed on an 08:00 UTC Cloud Function since August 2025.
    188 articles were migrated across. Worth knowing: that project's per-article
    writes had silently stopped in September 2025 while its cache document kept
    updating daily, so the migration had to read both.
  - `RAPIDAPI_KEY` unset just means no refresh — the stored archive still reads.
  - **F1 owns one dashboard card**, `DashboardF1Card`: the next race and the
    wire together, gated on the favourite. `getDashboardSportsSummary` takes an
    `exclude` list so the general sports card leaves F1 out — the same race
    printed in two cards side by side is the same race twice. That card also
    **steps aside entirely** when F1 is somebody's only favourite, rather than
    asking for favourites they have already picked.
  - It is **two thirds of the row, not the whole of it** — one sport among
    several — and the news is a scroll-snap rail rather than a carousel
    library: the card is narrow, a swipe is the gesture already used here, and
    it adds no dependency.
  - **`/news/f1/[id]` is a public page**, like a shared trip: no auth, its own
    layout, and OG tags so the link unfurls. Every headline in the app points
    there rather than straight at the source, because that page is the one
    worth sending somebody and it carries the rest of the wire underneath.
  - **The page never reproduces the article.** RapidAPI sends a headline, a
    short description and a link; the story belongs to whoever wrote it, so the
    page shows the summary and points at the original.
- **A `ScoreCard` prints its `stageLabel`** and does not pretend to be a link.
  It carried the label without showing it, so a Finals game and a Tuesday in
  November looked identical, and a hover chevron promised a screen that does
  not exist.
- **`TeamBadge` picks its ink from the background's luminance.** Club colours
  are whatever the league uses and some are nearly white — the Spurs' silver
  rendered white-on-white.
- **A bracket with nobody in it is not rendered as a bracket.** Providers hand
  back the shape of a playoff before the draw is made — LoL returned eight
  TBD-vs-TBD slots — so `isBracketDrawn`
  ([`lib/sports/bracket.ts`](../../lib/sports/bracket.ts)) gates both the
  bracket's empty state and whether the LoL view is allowed to *open* on the
  Playoffs tab.
- **Padel and tennis no longer share 🎾.** Two tabs with the same glyph were
  told apart only by reading them; padel is 🏓 (a paddle). Padel's provider also
  reports no week-on-week movement, so the rankings table drops the *Move*
  column entirely rather than printing "— 0" down every row.
- **Sports table/style primitives**: [`shared/table-primitives.tsx`](../../components/entertainment/sports/shared/table-primitives.tsx) (`SportsTh` standard uppercase header cell + `TableCellNum` numeric cell — replaces ~50 copy-pasted `text-xs uppercase tracking-wide text-muted-foreground` chains and 3 duplicate `TableCellNum`s) and [`shared/status-pill.tsx`](../../components/entertainment/sports/shared/status-pill.tsx) (`StatusPill` completed/upcoming/live — was duplicated in f1-view + racquet-view). New sport views should use these instead of hand-rolling.
- **Sport views key their `<Tabs>` by the active league/region** (football, lol): an uncontrolled Tabs keeps its old value when the active trigger unmounts, so switching to a league without that tab stranded the view on a blank body. `KnockoutBracket` opens focused on the current round (first with an undecided tie; fully decided → final) and re-focuses when `rounds` changes.
- `manage-favorites-sheet` tracks in-flight toggles as a `Set<SportId>` (a single pending slot let one toggle's completion clear another's spinner).
