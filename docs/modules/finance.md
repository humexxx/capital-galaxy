# Finance

> **Status:** Active
> **Last reviewed:** 2026-09-03

## Overview
Personal financial planning: users build *plans* (scenarios) with incomes,
expenses, and debts, then confirm monthly actuals so projections stay
calibrated. Health scoring and scenario comparison are part of this module.

## Routes
- `/portal/plans` — list of plans
- `/portal/plans/new` — create plan
- `/portal/plans/[id]` — plan detail + editor
- `/portal/plans/compare` — side-by-side scenario comparison

## Server actions — `/app/actions/`
- `finance-plans.ts` — CRUD + lifecycle for finance plans (create, update, delete, clone, set-as-main, `setPlanColorAction`) and projection calculations
- `finance-confirmations.ts` — save monthly confirmation snapshots and per-debt balance confirmations
- `dev-tools.ts` — `runDailySnapshotsAction` (admin-only): runs the daily finance + portfolio snapshot job on demand, surfaced via the dev drawer

## Services — `/lib/services/`
- `finance-plan-service.ts` — also exports `getFinanceMood` (request-cached; the
  main plan's outcome as a mascot pose), the pure `deriveFinanceMood`, and
  `setPlanColor` (colour-only update for the rail swatch)
- `finance-confirmation-service.ts` — confirmations + `autoConfirmSkippedPeriods` (cron baseline roll-forward)
- `finance-snapshot-service.ts`
- `interest-service.ts` — interest/ROI math (shared with [Portfolio](./portfolio.md))

## Schemas — `/schemas/`
- `finance.ts` — includes `planColorSchema` (colour-only update; restricted to a
  `var(--chart-N)` token or a 6-digit hex, since the value is written into a
  `style` attribute and an SVG `stroke`)
- `finance-snapshot.ts`
- `finance-confirmations.ts` — `confirmationSchema` / `ConfirmationData` (monthly actuals payload; shared by the action and `finance-confirmation-service`)

## Types — `/types/`
- `finance.ts` — includes `PlanSummary` (per-plan outcome shown on the rail) and
  `FinanceMood` (mascot pose)
- `snapshot.ts`

## Components
`components/finance/` — plan editors, projection charts, confirmation dialogs,
strategy comparisons, the plans workspace
([`plans-workspace.tsx`](../../components/finance/plans-workspace.tsx)), and the
[`FinancialHealthDonut`](../../components/finance/financial-health-donut.tsx).

`/portal/plans` renders the workspace for **any** number of plans (a lone plan
still gets its projection curve). Rail rows drive the chart:

- the checkbox adds or removes a series;
- pointing at a row emphasizes it and the ⋯ menu pins that emphasis (the pin
  lives there so it is reachable on touch) — `ComparePlansChart` takes a
  `focusedPlanId` and fades every other line back;
- the colour swatch opens [`plan-color-picker.tsx`](../../components/finance/plan-color-picker.tsx):
  the theme palette plus a native custom input, saved through
  `setPlanColorAction`.

The metric tabs are **Net worth / Total debt** (Savings was dropped from both
the index and `compare/`). The horizon `Select` above the chart picks how many
periods are plotted
(default 24, of which `PAST_MONTHS` = 3 sit before today). Periods up to today
draw solid and everything after draws dashed — each plan is two `Line`s sharing
the boundary row, mirroring the single-plan chart in the same file. Today's row
gets the shared `TodayPulseDot`, rendered on the past series only (the future
series shares that row and would stack a second marker). The window
comes from `computeProjectionWindow`, whose `pastMonths` argument overrides its
default ~25%-of-range past slice.

The old single-plan card list (`plans-list.tsx`) was removed when the workspace
took over that case; its `PlanSummary` type now lives in `/types/finance.ts`.

On `/portal/plans/[id]` the chart is interactive both ways: **hovering** a
point previews that period's cash-flow figures in the sidebar, and **clicking**
it commits — any other period opens
[`period-compare-dialog.tsx`](../../components/finance/period-compare-dialog.tsx)
(that period's balances against today's, with deltas coloured by polarity — debt
going up is not an improvement), while clicking **today's** point opens the
`ConfirmationDialog` instead, since the present is something you record rather
than forecast. `ProjectionChart` exposes this as `onSelectIndex`, resolved from
the same `activeTooltipIndex` as the hover handler so the whole column is
clickable rather than the 4px dot.

The finance mascot ([`context-avatar.tsx`](../../components/portal/context-avatar.tsx))
is mounted by [`app/portal/plans/layout.tsx`](../../app/portal/plans/layout.tsx)
and posed by `getFinanceMood`, so it reads as a status glyph
(`idle` / `steady` / `thriving` / `strained`) rather than decoration. It is
gated on the `showContextAvatar` preference — see [Settings](./settings.md).

## DB tables — `db/schema.ts`
- `finance_plans` — user's financial scenarios
- `finance_plan_incomes` — income line items
- `finance_plan_expenses` — expense line items
- `finance_plan_debts` — tracked debts within a plan
- `finance_plan_snapshots` — historical plan position snapshots
- `finance_plan_snapshot_debts` — per-debt balance breakdown for each snapshot
- `finance_plan_confirmations` — user-confirmed monthly actuals (`source`: `user` | `auto`)
- `finance_plan_debt_confirmations` — per-debt balance confirmations

## Notes
- Conventional Commits scope: `finance`
- Cron job `/api/cron/daily` may write snapshots into this module — keep in sync with [Portfolio](./portfolio.md).
- All actions wrap their handler in `safe()` from `@/lib/actions/safe` so service errors translate to `{ success: false, error: "Action failed" }` for the client.
- `getPlanWithLines`, `listUserPlans`, `getMainPlan`, `getPortfolioValueForUser` and `getPortfolioWeightedMonthlyRoi` are wrapped in `React.cache()` so the dashboard cards, the plans layout and every projection on a plans page share one DB hit per request.
- **The chart's today point IS the Today KPI.** `alignTodayPoint` in `plan-editor.tsx` copies `computeTodaySnapshot`'s net worth / debt / investments onto `points[pastCount]`; `buildChartSeries` alone puts the period CLOSE there, which disagreed with the KPI by a paycheque. Past snapshot points are dated at their period start (`periodStartFor`), so a Sep-4 snapshot in an Aug-5 period labels as "Aug", not a second "Sep".
- `saveConfirmation` checks that every `debtBalances[].debtId` belongs to the plan before writing; a foreign debt id would otherwise feed another plan's calibration.
- `ProjectionChart` and `ComparePlansChart` are lazy-loaded via `next/dynamic({ ssr: false })` to keep recharts out of the initial bundle; `PlanCalendar` and `ProjectionTable` load the same way since neither is on screen until the reader switches view. `ComparePlansChart` memoises its derived series.
- **Chart = real past + forecast future.** The projection chart plots periods that have **closed before** today's period from **real recorded snapshots** (`finance_plan_snapshots`, solid line) and today's period forward from the **projection** (dashed). The merge is the pure `buildChartSeries` in [`lib/finance/chart-series.ts`](../../lib/finance/chart-series.ts) (with `computeProjectionWindow`); both halves bucket by **accounting period** via `periodIndexForDate(anchorDay, …)` so a day-15 projection period and a snapshot dated day-30 of the same period share one x-slot, and the solid/dashed boundary sits on the period that truly contains today (not a raw calendar-month bucket). No snapshots yet → it falls back to the re-simulated projection window. `ProjectionChart` takes a flat `points: {date,netWorth}[]` + `pastCount` + `color` (the caller does the merge). `getRecentMonthlySnapshots` (the history feed) also dedups **per accounting period** (`anchorDay = confirmationDayOfMonth`), not per raw calendar month, so with a non-1 anchor the "latest per period" representative lines up 1:1 with `buildChartSeries`'s period bucketing (a calendar-month dedup could otherwise drop two snapshots into one period and leave the next empty).
- **The plan page projection is confirmation-calibrated.** `app/portal/plans/[id]/page.tsx` builds `baseline = buildCalibratedPlan(plan)` (now exported from `finance-snapshot-service.ts`) and projects **that**, so confirming real balances actually moves the forecast + KPIs (the dialog's "new baseline going forward" promise). The raw `plan` is still what the line/debt editors mutate; `baseline` also seeds the partial-period "today" net worth. The `compare/` page still uses the raw plan (calibration is per-page, to avoid changing scenario comparisons). The dashboard `DashboardFinanceCard` is **also** calibrated now (same `buildCalibratedPlan`) and locates today's period for its "now" KPIs.
- `app/portal/plans/loading.tsx`, `app/portal/plans/new/loading.tsx`, `app/portal/plans/compare/loading.tsx`, `app/portal/plans/[id]/loading.tsx`, `app/portal/plans/[id]/not-found.tsx`, and `app/portal/plans/error.tsx` give the routes a proper skeleton / 404 / error experience. The `[id]/loading.tsx` mirrors the PlanEditor silhouette (title/tabs header + the Overview hero: 3/4 main panel = default Graph view + the bottom view-switcher, beside the 1/4 gauge/cycle/strategy sidebar) so the swap to the real editor feels like content filling in rather than a layout shift.
- **Main plan**: each user has at most one plan with `is_main = TRUE` (enforced by a partial unique index in `finance_plans`). The Dashboard confirmation host and the `DashboardFinanceCard` both follow this flag — non-main plans never auto-prompt for monthly confirmation. `setMainPlanAction` flips the flag atomically; `createPlan` auto-sets the first plan as main; `deletePlan` promotes the next oldest plan when the main one is removed. The Plans list shows a Star next to the main plan's title with a "Set as main" item in each card's `…` menu, and the plan editor's Settings tab has a banner with the same toggle.
- **Period-anchored projections**: each entry in `projection.months` represents one accounting period anchored at `confirmationDayOfMonth` (e.g. day 15 → Jan 15–Feb 14, Feb 15–Mar 14, …). Day 31 clamps to month-end (Feb 28/29). `confirmationDayOfMonth === 0` (feature disabled) falls back to calendar months. Helpers live in [`lib/finance/period.ts`](../../lib/finance/period.ts) — `periodRangeFor`, `iteratePeriods`, `periodAnchorIso`, `periodLengthDays`, `isDateInPeriod`, `periodIndexForDate`, `monthsInPeriod`. The debt-interest two-halves split charges **one full monthly rate per period regardless of period length** (the `daysBefore/daysInPeriod` + `daysAfter/daysInPeriod` fractions always sum to 1); `periodLengthDays` only sets *how* that fixed total is split around the payment day. So a 28-day February period and a 31-day Jan-15→Feb-14 period accrue the **same** monthly interest, just apportioned differently before/after the payment.
- **Locating "today" in the projection**: every surface that needs the current row (KPI rail, projection chart window, `computeTodaySnapshot`, the dashboard finance card, snapshot calibration) resolves it with `periodIndexForDate(startMonth, confirmationDayOfMonth, today)`, **never** a raw `year*12+month` subtraction — the latter mis-counts by a whole period for the part of a month before a non-1 anchor day. `computeProjectionWindow` / `buildChartSeries` ([`lib/finance/chart-series.ts`](../../lib/finance/chart-series.ts)) take an optional `anchorDay` (default 1 = calendar months) and bucket both the snapshot past and the projected future by period. The KPI rail uses `projection.months[currentPeriodIdx]` (located via the same helper) rather than `months[0]`, so the "now" figures don't go stale when the plan started in the past or the last confirmation is old. `computeTodaySnapshot` walks the **whole** current period (its 1–2 calendar months) up to today, so a non-1 anchor settles the part of the period that already elapsed in the previous calendar month.
- **Deficits are carried, not clipped**: when expenses + debt service exceed income, the savings line goes **negative** (carried as overdraft cash) so net worth reflects the real shortfall. Savings interest only accrues on a positive balance. Previously the deficit was clipped to 0, which over-stated the projection for users who outspend their income.
- **Snapshots record the period OPENING, not the projected close.** Daily / manual / confirmation snapshots all store `computeStateAt(..., "open")` — the period's opening balances (previous period's close, or the calibrated initials for period 0), with a per-debt breakdown in `finance_plan_snapshot_debts`. This means a snapshot reflects where the user *actually* is per their **last confirmation**, held flat; projected debt paydown / interest only enters the historical record when the user **confirms** (or the cron auto-confirms a skipped period — see below). The pre-`open` behaviour stored the projected period *close*, which silently recorded forecast numbers as if they were real (debt "paid down" from day 1 of a period the user never confirmed) — that was the bug. The confirmation dialog pre-fills with the same `open` value (`getProjectedStateForMonth`), because that is exactly what gets stored as the new baseline. **Known limitation (follow-up):** the baseline still treats the confirmed value as the period opening and re-projects the whole period, so confirming far from the anchor day double-counts that period's already-elapsed flows. The fix is an `asOfDate` proration in `projectPlan` (skip the period's elapsed hits + prorate that period's interest), deferred because it changes engine math and threads through several call sites. For now, confirm on/near the anchor day for best accuracy.
- **Auto-confirm on skipped periods.** The daily cron (`createDailyFinanceSnapshots` → `createSnapshotForPlan`, system_cron path only) calls `autoConfirmSkippedPeriods` *before* snapshotting. For every accounting period that is fully **closed** (strictly before the current period) and has **no confirmation**, it writes a `source: "auto"` confirmation recording that period's projected opening (chaining the baseline forward one period at a time) plus its per-debt balances. The **current** period is never auto-confirmed — the user is still prompted. This bounds the "unconfirmed drift" problem: instead of the projection silently being treated as fact across many periods, the roll-forward is an explicit, flagged, re-promptable event. A manual confirmation over an auto row promotes it to `source: "user"` (`saveConfirmation` sets `source` on insert *and* in the `onConflictDoUpdate` set).
- The Calendar view (`components/finance/plan-calendar.tsx`, now one of the Overview switcher's three views — see below) ships with an **Anchored / Month** view toggle (default: Anchored). Anchored paginates by period and reads `Jan 15 – Feb 14, 2026`; Month shows the traditional calendar grid. In both views the anchor day's cell gets an amber border + soft background so the period boundary is always visible.
- Monthly confirmation prompt fires every day from the anchor day through the end of the period until the user submits one, then stays silent until the next period. The check is `today >= clamped-anchor-day`; the per-day localStorage dismiss key in `confirmation-prompt.tsx` suppresses re-shows within a single calendar day. Confirmation rows are bucketed by **period anchor date** (the column is still `financePlanConfirmations.confirmationMonth` for historical reasons but now stores e.g. `2026-01-15`, not `2026-01-01`).
- The plan editor registers two **dev-drawer** helpers (Finance section, dev-only): *Force confirmation dialog* opens the real `ConfirmationDialog` for the current plan regardless of date/dismiss (saving still writes a real confirmation + recalibrates); *Run daily snapshot now* calls `runDailySnapshotsAction` to run the finance + portfolio snapshot cron job on demand. Both registered via `useState(() => helper)` for a stable identity (an inline object would loop `useRegisterDevTool`).
- The **plans list** (`/portal/plans`) projects every plan server-side so each surfaces its outcome — projected **net worth** (emerald/rose) and **debt-free** date (`N mo` / `No debt` / `Beyond horizon`). With ≥2 plans it renders `PlansWorkspace` (`components/finance/plans-workspace.tsx`): a Polymarket-style hero with the giant `ComparePlansChart` on the left (3/4, with Net worth / Total debt / Savings metric tabs) and a narrow right-hand **rail of plans** (1/4, stacked below the chart on mobile) whose checkboxes double as the chart's per-series toggles and which each carry the set-main / clone / delete menu and link to the plan. A single plan still renders the `PlansList` card. The dedicated `/portal/plans/compare` route still uses the full `CompareView` (toggle chips + ending-state cards). Follows the [`data-density-ui`](../../.github/skills/data-density-ui/SKILL.md) card anatomy.
- The **plan detail** Overview (`components/finance/plan-editor.tsx`) is the same Polymarket layout: the **3/4 main panel is a Graph / Table / Calendar view switcher** (segmented `ViewSwitcher` centered at the **bottom** of the panel, Polymarket-style; works as tabs on every device, plus horizontal swipe on touch via `useSwitcherSwipe` — the swipe is ignored when it starts inside a sideways-scrolling region like the table. The active view fades in on switch via a keyed `animate-in fade-in-0`; no horizontal slide, so nothing clips the active card's border/shadow. **Equal heights on lg**: the view box is fixed at `lg:h-[640px]` — graph flexes to fill, table/calendar scroll internally — and the sidebar column is `lg:min-h-[640px]` with the figures card `lg:flex-1`, so the sidebar's bottom edge lines up with the main panel across all three views; keep the two 640 values in sync). Graph and Table share a forecast header (Today / Next month / End-of-window KPIs + horizon presets); the Calendar view is `PlanCalendar` (which brings its own Card). Beside it, a **narrow right sidebar (1/4**, stacked below on mobile) holds two cards — (1) a condensed figures card: the `FinancialHealthDonut` on top, then the four cycle figures (income, expenses, total debt, surplus) as compact `StatRow`s (tap a row for its breakdown — a bottom sheet on mobile, a centered dialog on desktop, switched via `useIsMobile()`; the income / expense / debt-minimum lists show each line's **hit date within the current anchor period** (anchor→anchor, e.g. day 5 ⇒ Apr 5 – May 4, spanning two calendar months via `periodRangeFor` + `monthsInPeriod` + `isDateInPeriod`) as a small muted sub-line, and are **sorted chronologically**); and (2) a **Debt payoff strategy** card — the avalanche/snowball/none `StrategyBadge` (full-width row) + an expandable **stacked** `StrategyPicker`, moved out of the chart card so the chart stays clean. The monthly breakdown is the switcher's **Table** view (no longer a separate full-width card), and the **Calendar** view replaces the old top-level Calendar tab. The page header is just title + a single **Overview** tab (Setup/Settings in the More dropdown), and the forecast KPIs double as the Graph/Table card header (no separate title row) — so the chart is visible on load without scrolling. `ProjectionPanel` owns the switcher (`view` + swipe `dir` state) and renders the active view + the sidebar; strategy open/close state + the change handler live in `PlanEditor`, which builds the `sidebar` and `calendar` nodes it passes in. `ProjectionChart`/`ComparePlansChart` accept a `heightClass` so the chart reads taller on desktop without breaking mobile. Both plans routes render at `max-w-7xl`: the shared client `PortalPageContainer` widens for any `/portal/plans` path, vs the default `max-w-5xl` reading-width content pages.
- **Module mascot**: `app/portal/plans/layout.tsx` appends the decorative miner mascot ([`ContextAvatar`](../../components/portal/context-avatar.tsx), `variant="finance"`) after the content of every plans page, gated by the `showContextAvatar` user preference — see [settings.md](./settings.md).
- **Chart hover → sidebar preview.** Hovering a point on the Overview projection chart previews THAT period in the sidebar figures card: the health donut + the four `StatRow` figures animate (count up/down, `useAnimatedNumber`, same easeOutQuint as the donut) to the hovered period's values, the card takes a muted backdrop + ring, and a floating chip names the period (e.g. "May 2026"); on mouse-leave (or hovering today's boundary point) everything reverts to the current period. Plumbing: `ProjectionChart` exposes `onHoverIndex` (recharts `onMouseMove.activeTooltipIndex`, deduped via ref) → `ProjectionPanel` maps the index to per-point `PeriodFigures` (flows from the projection month sharing the point's period — calibrated first, raw `pastProjection` fallback; debt prefers the point's own snapshot value) → `PlanEditor` holds the `hoverFigures` state its sidebar reads. Health/surplus are derived on the fly (pure functions of income/obligations), so nothing extra is stored in snapshots. Row breakdowns (tap/click) intentionally stay on the CURRENT period — historical line-items aren't recorded. The chart tooltip itself also shows Debt / Investments rows (only when > 0), carried on `ChartPoint` as tooltip-only extras, never plotted as lines.
