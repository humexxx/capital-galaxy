# Portfolio

> **Status:** Active (page redesigned to mirror plan-editor layout)
> **Last reviewed:** 2026-09-11

## Overview
Tracks the user's real portfolio: transactions (buys/withdrawals), historical
snapshots, and the catalog of investment methods (vehicles) with risk/ROI
metadata. Interest math is shared with [Finance](./finance.md).

## Routes
- `/portal/portfolio` — main portfolio view
- `/portal/investment-methods` — investment method catalog

## Server actions — `/app/actions/`
- `transactions.ts` — `createTransactionAction` (replaces the legacy `/api/transactions` route)
- `portfolio-snapshots.ts` — create manual snapshots of portfolio value
- `admin-transactions.ts` — admin-only approve/reject of transactions (see [Admin](./admin.md))
- `allocations.ts` — `setAllocationsAction`, `repriceContributionsAction`, `createPriceAssetAction`, `setManualPriceAction`, `updateMethodAction`; gated on **owning the method**, not merely on being an admin

## Services — `/lib/services/`
- `portfolio-service.ts` — portfolio state and composition
- `transaction-service.ts` — transaction CRUD and filtering
- `snapshot-service.ts` — snapshot persistence/queries
- `interest-service.ts` — ROI math (shared with [Finance](./finance.md))
- `chart-service.ts` — chart data shaping (shared utility)
- `price-service.ts` — quote storage + provider dispatch (`refreshPrices`, `getLatestPrices`, `listPriceAssets`)
- `price-providers/` — one module per source: `massive.ts`, `coingecko.ts`, shared `types.ts`
- `margin-service.ts` — `getMarginOverview(ownerUserId)`; positions are derived, never stored
- `allocation-service.ts` — policy CRUD, `backfillTransactionAllocations`, `backfillAllOwners`, `getDerivedHoldings`

## Schemas — `/schemas/`
- `transaction.ts`
- `snapshot.ts`
- `allocations.ts` — allocation policy, price-asset creation, manual quotes

## Types — `/types/`
- `portfolio.ts`
- `snapshot.ts`

## Components
- `components/portal/portfolio-client.tsx` — page shell: plan-style header (Heading h3 + muted Text), 4-card KPI grid (Total value with eye toggle, All-time profit, Cost basis, Active positions), Overview / Transactions / Methods / Managed tabs. Registers `Show charts`, `Hide values`, and admin `Manual snapshot` / `Clear manual snapshots` into the global dev drawer via `useRegisterDevTool` from `components/dev-tools/`.
- `components/portfolio/investment-methods-view.tsx` — `/portal/investment-methods` view: plan-style header, 4-card KPI grid (Methods, Authors, Avg monthly ROI, Best monthly ROI), inline Risk-profile breakdown bar, grouped-by-author method cards with risk-tinted badges. Registers a `Show disabled methods` toggle in the dev drawer that hot-reveals methods normally filtered out.
- `components/portfolio/` — supporting pieces: transactions table, performance chart (lazy-loaded), add-transaction dialog, manual-snapshot dialog, asset/allocation views. *Removed in the redesign:* `portfolio-header.tsx`, `stats-cards.tsx` (their concerns moved into `portfolio-client.tsx` and the dev drawer).

## DB tables — `db/schema.ts`
- `portfolios` — user's portfolio account
- `transactions` — buy/withdrawal transactions with approval workflow
- `portfolio_snapshots` — historical portfolio value
- `investment_methods` — investment vehicles with risk/ROI metadata; `owner_user_id` indexed, `updated_at` set by `updateMethodAction`
- `price_assets` — catalogue of quotable assets (`symbol`, `external_id`, `source`)
- `price_quotes` — append-only price history, one row per fetch; `(asset_id, fetched_at desc)` index serves the `DISTINCT ON` latest-price read
- `method_allocations` — the policy: what share of incoming money goes to which asset
- `transaction_allocations` — what each contribution actually bought, at that day's price (immutable)
- `app_state` — global key-value (cron state, etc.) — also touched by other modules

## Notes
- **Logic audit (2026-09-11).** Monthly interest is idempotent per calendar month: the cron consults `last_interest_run` on every day (the 1st included), a failure writes `last_interest_error` instead, and the admin's manual "apply interest" marks the run too (`markInterestApplied`). Approve/reject only move a `pending` row (re-approval used to reset accrued value). `PortfolioStats.totalWithdrawn` and `getPortfolioAssets` add approved withdrawals back into profit. `getDerivedHoldings` keeps `closed` buys' units; `backfillTransactionAllocations` and `setMethodAllocations` require a policy that totals 100%. The performance chart no longer fabricates a $0 origin. Daily snapshots skip a portfolio already snapshotted today; `COUNT(*)` is cast to int. The investor summary joins on `investorId`; the admin filter ignores a non-UUID user id; the CSV signs withdrawals.
- **Owner-only panels load on demand.** `MarginChart` and `InvestorBreakdown`
  are `next/dynamic` in `portfolio-client.tsx`, so an investor's bundle does not
  carry the owner dashboard. `getUserPortfolio` / `getPortfolioStats` /
  `getPortfolioAssets` are request-cached — every plan projection asks for them.
- **Methods have an owner.** `investment_methods.owner_user_id` (nullable, FK
  SET NULL) is the admin who runs the method; other users invest through them.
  NULL keeps the old global-catalogue behaviour, and is now also the only case
  with no display credit — the `author` column is gone.
- **`getMethodInvestors(ownerUserId)`** aggregates who holds money in an admin's
  methods, mirroring `getPortfolioAssets` maths exactly so the owner sees the
  same figure the investor sees. Surfaced as an **Investors** tab that only
  appears for users who own methods.
- **Third-party capital never touches net worth.** It is a read-only aggregate,
  computed on the fly, deliberately outside the KPI grid — folding it in would
  inflate the owner's patrimony with money that isn't theirs. Same reason the
  planned chart toggle keeps it on its own series (see the design memo).
- **Investment Methods lives inside Portfolio** (Methods tab), not its own
  route. `/portal/investment-methods` is a permanent redirect — the landing
  page links there from two places — and the sidebar entry is gone. The page
  fetches ALL methods (enabled + disabled) because `InvestmentMethodsView`
  filters to enabled itself and has a dev toggle for the rest; the transaction
  form gets the enabled subset. The tabs render **even without a portfolio**,
  so the catalogue stays browsable before you own anything.
- **Owners and investors see different Overviews, and exactly one chart each.**
  An investor's portfolio value IS their position, so they keep
  `PortfolioKpiGrid` and `PerformanceChart`. An owner's "portfolio value" is
  the sum of what they OWE, so showing it as a headline made a badly underwater
  book read as growth — they get `OwnerKpiGrid` (Contributed / Allocations
  today / Owed / Margin) and `MarginChart`.
- **`MarginChart` plots allocations and liability on one axis.** The gap
  between the two lines IS the margin; splitting them across two charts would
  make the reader compute it. Filtering by investor or method re-derives the
  series in the browser from the raw contributions — no round trip — which is
  why `getManagedOverview` ships `historyInput` alongside the computed series.
- **The Managed tab holds the detail**: per-method allocation policy and the
  per-person breakdown. No chart there — there is one chart in the module.
- **Removed with this**: `ManagedCapitalCard` (its split view was the second
  chart), the All-capital/Only-mine scope toggle (it drove a KPI grid and a
  performance chart that owners no longer see), and the two queries feeding
  them.
- **Margin history discounts BACKWARDS from stored `currentValue`**, it does
  not recompute forwards from `initialValue`. The real data compounds 14
  periods across ~11.5 calendar months, so a forward formula disagrees with
  what the interest cron actually applied. Discounting guarantees the series
  lands exactly on the headline — verified: the last point reproduces
  deployed 2,637 / owed 7,278 / margin −4,641 to the dollar.
- **Historical month-end prices are persisted** (`backfillHistoricalQuotes`)
  rather than fetched per render. One provider call covers a whole date range;
  rendering the chart then costs zero API calls, which matters against a 5
  req/min ceiling.
- **A month with no quote carries the last known price forward.** Valuing it at
  zero would draw a cliff that never happened.
- **`InvestorBreakdown` is not a pro-rata slice.** Each investor's positions
  come from their own contributions priced on their own dates, so it is what
  their money actually bought. Its `profitLoss` is the OWNER's number: the
  investor's return is fixed and never varies.
- **Three tabs: Overview, Transactions, Methods.** Managed was folded away once
  its parts had better homes — the headline figures and the chart are the
  Overview for an owner, capital per method is on the method cards, and the
  allocation is in the method editor. What was left was a duplicate. The
  per-person breakdown moved under the chart it explains; the **Reprice
  contributions** action moved to the dev drawer, since the daily cron does it
  and on-demand only matters right after changing an allocation.
  `MarginView` and `MethodInvestorsView` were deleted with it.
- **Transactions lists two tables sharing ONE component.** The owner's own
  history and what other people did in the methods they run
  (`getInvestorTransactions`, which keeps pending and rejected rows so the
  owner sees what is waiting on them). `TransactionsTable` takes a normalised
  `TransactionRow[]` plus `showInvestor` — they were two components with
  different columns, which made the same fact look like two different things
  depending on whose row it was. They stay two *tables* though: mixing
  somebody else's movements into a personal log makes the running totals of
  both meaningless. The owner's own rows are excluded from the second table
  because they already appear in the first.
- **Transactions default to approved only, and the Status column is hidden.**
  A column reading "approved" on every line is a column of noise. Pending and
  rejected rows matter, but they are the exception you go looking for, not the
  default reading of a history — a count of what is hidden sits above the
  table so nothing disappears silently. **Detailed view** (top right) brings
  back both the other statuses and the column.
- **Every transaction row shows the position it created** — units at that
  day's price (`Bought`), what they are worth now, and the P/L. A contribution
  is otherwise just an amount, and the whole point of the model is that the
  amount became specific units at a specific price. `Owed` sits beside it and
  is deliberately unrelated: the investor's return is fixed whatever the P/L
  does.
- **The table renders no border of its own.** It always sits inside a `Card`,
  and its old `rounded-lg border` drew a second box around the first.
- **`hideValues` must reach every amount, including inside charts.**
  `ManagedCapitalCard` was missing the prop, so its three headline figures,
  the split chart's axis and its tooltip stayed readable while the KPI grid
  masked — and since the owner's performance chart renders INSIDE that card,
  it read as the chart leaking. Locked by
  `components/portfolio/managed-capital.test.tsx`, which asserts no `$` survives
  in masked mode. Percentages deliberately stay visible: a share is not a
  balance.
- **CSV export**: `GET /api/portfolio/export`, gated by
  `requireEffectiveContext` so an impersonating admin exports what they see.
  Cells starting with `=`, `+`, `-` or `@` are prefixed with a quote — Excel
  and Sheets execute those as formulas.
- **The export carries what the app derives, not just the cash.** For someone
  who runs methods it includes their investors' rows and, per contribution,
  the asset, units, price on the day, worth now and P/L. Exporting only
  amounts while the app derives positions from them hands back a file that
  cannot answer the questions the screen answers.
- **Header, rows and totals all derive from one `COLUMNS` array.** They were
  three hand-written lists of matching length, and they drifted: dropping the
  Author column from two of them left the totals row one cell long, so every
  sum landed under the wrong heading. Deriving all three makes that
  unrepresentable.
- **A contribution split across assets emits one row per asset**, and only the
  first carries the cash figures — otherwise a 50/50 split would count its own
  amount twice in the totals.
- **A method has a public half and a private half, and the editor says so.**
  Clients see the name, risk and above all the **fixed monthly return** — that
  is the entire product from their side. Where the pooled money actually goes
  is internal: it drives the margin and they never see it.
  `MethodEditorDialog` fences the allocation off in its own labelled block
  rather than mixing both into one flat form, because an undifferentiated form
  is how a private figure ends up on a screen it should not be on.
- **Editing is gated on ownership, not on being an admin.** A method is
  somebody's product. The edit control only renders for methods in
  `ownedMethodIds`, and the internal allocation line renders under the same
  condition — locked by
  `components/portfolio/investment-methods-view.test.tsx`, which asserts a
  non-owner sees neither even when the data is present in props.
- **`author` is gone; credit comes from `owner_user_id` alone.** The free-text
  column sat beside the owner relation and could name someone who did not run
  the method — two answers to one question. Dropped in `0035`, along with the
  author grouping and the "Authors" KPI in the catalogue (with one owner it
  always read "1"). The methods grid is now flat, enabled first.
- **The Methods tab is the methods, and nothing else.** The four KPI cards
  (Methods / Open to new money / Avg ROI / Best ROI) and the risk-profile bar
  were summary furniture that pushed the actual answer below the fold. Each
  card now carries the figure that matters: **capital invested in that
  method**, plus investor count and what it is worth today under the promised
  return.
- **Capital is only supplied for methods the viewer runs.** A client browsing
  the catalogue has no business seeing other people's money, so the prop
  simply carries nothing for those cards — asserted in
  `investment-methods-view.test.tsx`.
- **An owner sees every method they run, disabled included.** Hiding half of
  somebody's own catalogue behind the dev toggle made the tab lie about what
  exists. Clients browsing still see only what they can pick — covered by
  `investment-methods-view.test.tsx`.
- **`monthlyRoi` is not a cosmetic field.** It is what
  `transactions.currentValue` compounds at, so changing it moves what the owner
  owes. The dialog says this next to the input.
- **Margin is the owner's private view.** Investors are sold a *fixed* return;
  the owner deploys the pooled capital elsewhere and keeps the difference.
  `margin = assets - liability`, where liability is the investors' compounded
  `currentValue` and assets is `quantity x latest price`. A **negative** margin
  matters most — the promise is outrunning the real return and the owner is
  covering it — so it is never clamped or hidden. Surfaced as a **Margin** tab
  that only exists for method owners.
- **The owner's own stake is capital, not liability** (`splitLiability` in
  [`lib/finance/margin.ts`](../../lib/finance/margin.ts)). You cannot owe
  yourself a fixed return; counting it as debt would understate the margin by
  exactly that stake. It is carried separately as `ownPosition`.
- **Positions are DERIVED, never typed in.** A method declares an allocation
  ("100% Cardano"); each approved contribution is split by that rule and priced
  at the asset's close **on the day it landed**, and the units fall out. The
  price is stored on `transaction_allocations` precisely so it stops being a
  question — the close on 2025-08-31 is a fixed fact.
- **Editing the allocation only moves future money.** Past contributions keep
  the units they bought. Re-deriving them would mean the owner's position
  silently rewrote itself every time they changed their mind.
- **Withdrawals sell units at that day's price**, they do not subtract cash
  from a unit count — hence the signed `quantity`.
- **Contributions are priced by the daily cron**, not only on demand: money
  approved between runs would otherwise be missing from the margin until
  somebody pressed a button. `Reprice` in the UI is the manual escape hatch.
- **Prices refresh daily** at 00:30 via `/api/cron/prices` — 30 minutes after
  `/api/cron/daily` so the two don't contend for pooled connections. Providers:
  **Massive** (ex-Polygon.io, rebranded early 2026 — crypto, indices, stocks,
  ETFs, forex; needs `MASSIVE_API_KEY`; free Basic tier is end-of-day at 5
  req/min) and keyless **CoinGecko** (crypto only). `source = "manual"` is the
  escape hatch for anything neither covers — the cron never touches those.
- **Everything is on Massive, deliberately.** CoinGecko returns live spot and
  Massive returns the previous close; mixing them would value some holdings at
  one instant and the rest at another, making the margin a blend of two
  different moments. The CoinGecko fetcher stays for coins Massive doesn't
  list, but nothing uses it today.
- **Licensed indices are 403 on the free tier** — verified: `I:SPX` is refused,
  `I:NDX` is not. The ETF tracking the same index is free, so the catalogue
  lists **SPY** (S&P 500) and **QQQ** (Nasdaq-100) rather than the indices.
- **The 5 req/min free tier shapes the fetch strategy.** All crypto comes back
  in ONE grouped daily-bar call; everything else is quoted per ticker via
  `/prev` (which resolves the last *trading* day itself, so weekends aren't a
  hole). Assets are ordered stalest-first, and anything past the per-run budget
  is reported in `skipped` rather than dropped silently.
- Conventional Commits scope: `portfolio` *(not in commitlint allowlist — add it to [`commitlint.config.mjs`](../../commitlint.config.mjs) if you start committing here often, or use `finance` if the change is on shared math)*
- Daily cron at `/api/cron/daily` writes snapshots and applies monthly compound interest on the 1st.
- `createDailySnapshots` must use `inArray(...)` for the "latest snapshot per portfolio" lookup — a raw ``sql`... = ANY(${ids})` `` makes Drizzle emit `ANY(($1, $2))` (a row tuple), which Postgres rejects once there's more than one portfolio. That bug silently broke every daily portfolio snapshot from 2026-05-26 until the `inArray` fix.
- Transactions are created via `createTransactionAction` (server action). The previous `/api/transactions` route handler is gone; cron and webhook routes are the only remaining API routes.
- `PerformanceChart` and the projection charts in [Finance](./finance.md) are lazy-loaded with `next/dynamic({ ssr: false })` to keep recharts out of the initial portal bundle.
- `app/portal/portfolio/loading.tsx`, `app/portal/investment-methods/loading.tsx`, and `app/portal/admin/loading.tsx` stream skeletons for the heavy data fetches; `app/portal/portfolio/error.tsx` is the module error boundary.
- The KPI grid renders `StatCard` from `components/ui/stat-card.tsx` (shared house primitive: `Eyebrow` label + `Mono` value + tone-colored sublabel).
- The **Dev Tools drawer** (`components/dev-tools/`, mounted in `app/portal/layout.tsx`) is a portal-wide foundation: any page can call `useRegisterDevTool({ id, kind: "toggle" | "action" | "custom", ... })` and the helper shows up in the right-side `Sheet`. The floating wrench trigger only renders in `process.env.NODE_ENV === "development"` — registrations made by pages mounted in production are silently ignored. Context is split (`useDevToolsCommands` for stable register/unregister, `useDevToolsState` for the changing helpers/open) so consumer effects don't re-fire on every registration.
