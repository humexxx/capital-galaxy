import { pgTable, jsonb, text, uuid, timestamp, pgSchema, real, pgEnum, numeric, index, boolean, integer, date, check, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// Three kinds of account, and the role answers exactly ONE question: may this
// person create investment methods?
//   user     — a client. Invests in methods, creates none.
//   provider — offers methods that clients choose.
//   admin    — everything a provider can do, plus impersonation and the admin area.
// WHICH methods somebody runs is NOT here: that is `investment_methods
// .owner_user_id`, which the whole app already keys off. Restating it in the
// role would give two sources of truth that can disagree.
export const userRoleEnum = pgEnum("user_role", ["admin", "provider", "user"]);
export const riskLevelEnum = pgEnum("risk_level", ["Low", "Medium", "High"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "approved", "rejected", "closed"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["buy", "withdrawal"]);
export const snapshotSourceEnum = pgEnum("snapshot_source", ["system_cron", "admin_approval", "manual", "admin_enforce"]);
export const roadPathFrequencyEnum = pgEnum("road_path_frequency", ["daily", "every_other_day", "weekly", "biweekly", "monthly"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high"]);
export const debtPaymentTypeEnum = pgEnum("debt_payment_type", ["fixed", "percent_of_balance"]);
export const debtStrategyEnum = pgEnum("debt_strategy", ["avalanche", "snowball", "none"]);
export const financeSnapshotSourceEnum = pgEnum("finance_snapshot_source", ["system_cron", "confirmation", "manual"]);
// "user" = the human confirmed their real numbers. "auto" = the cron rolled the
// baseline forward through a period the user left unconfirmed (best-estimate,
// still re-promptable). Lets the UI flag auto rows and keeps the chart honest.
export const financeConfirmationSourceEnum = pgEnum("finance_confirmation_source", ["user", "auto"]);
export const financePlanLineKindEnum = pgEnum("finance_plan_line_kind", ["recurring", "one_time"]);
// Shape of a recurring entry's cadence.
//   monthly_day      — hits dayOfMonth every month (current default behaviour)
//   monthly_weekday  — hits the Nth weekday of every month (e.g. 2nd Tuesday);
//                       a 5th-weekday request falls back to the last occurrence
//   every_n_months   — hits every intervalMonths starting from recurrenceStart
export const financePlanRecurrenceTypeEnum = pgEnum(
  "finance_plan_recurrence_type",
  ["monthly_day", "monthly_weekday", "every_n_months"]
);
// Which side a per-month override targets. Discriminator + parentId acts as a
// "polymorphic FK" — we don't enforce the actual FK at the DB level because
// the three line tables can't be referenced by a single column.
export const financePlanOverrideSideEnum = pgEnum(
  "finance_plan_override_side",
  ["income", "expense", "debt"]
);
// What the override does for that one month:
//   skip        — pretend the recurring entry doesn't hit this month
//   reschedule  — move the occurrence to a different date (still that month)
//   amount      — keep the date but use a different amount this month only
export const financePlanOverrideActionEnum = pgEnum(
  "finance_plan_override_action",
  ["skip", "reschedule", "amount"]
);
// `flight` and `cruise` are split out of the generic `transport` because they
// are what people actually plan a trip around, and because a cruise carries a
// port-by-port itinerary that no other category has.
export const tripItemCategoryEnum = pgEnum("trip_item_category", [
  "lodging",
  "flight",
  "cruise",
  "transport",
  "food",
  "activity",
  "shopping",
  "other",
]);
export const tripPhotoSourceEnum = pgEnum("trip_photo_source", ["upload", "url"]);
// What a price is per. Without this every figure is summed as a total, so a
// hotel at "$100–200" quietly means one night and a cruise at "$1,900 per
// person" quietly means the whole party — both wrong, and wrong silently.
export const tripPriceUnitEnum = pgEnum("trip_price_unit", [
  "total",
  "per_night",
  "per_person",
]);

// Define auth schema to reference auth.users
const authSchema = pgSchema("auth");
const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }), // Foreign Key with Cascade Delete
  email: text("email"),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").default("user"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const investmentMethods = pgTable(
  "investment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    // Who runs this method. Other users invest through them, so this is what
    // "who is invested in MY methods" is keyed on, and it is ALSO the display
    // credit — there used to be a free-text `author` column beside it, which
    // could name someone who did not run the method. One relation, one answer.
    // Nullable: a method without an owner is the old global-catalogue behaviour.
    // SET NULL rather than cascade — deleting an admin must never delete a
    // method other people hold money in.
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    riskLevel: riskLevelEnum("risk_level").notNull(),
    monthlyRoi: numeric("monthly_roi", { precision: 7, scale: 4 }).notNull(),
    // Disabled methods are hidden from portfolio transaction selectors but still
    // appear in finance plan auto-invest pickers (so they can be modelled as
    // hypothetical scenarios without being actively used).
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // "Whose methods" is the hot filter for margin, portfolio and allocation
  // reads; every other user-keyed column already carries one.
  (t) => [index("investment_methods_owner_user_id_idx").on(t.ownerUserId)]
);

/**
 * Where an admin actually deploys the capital raised by a method, and what it
 * is worth right now.
 *
 * The business model: investors are promised the method's fixed `monthlyRoi`
 * (that is what `transactions.currentValue` compounds at, and it is a
 * LIABILITY). The admin invests the pooled capital elsewhere; whatever the
 * real holdings earn above the promised return is the admin's margin.
 */
export const priceAssets = pgTable("price_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Ticker shown in the UI, e.g. ADA. */
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  /** Provider's identifier — for CoinGecko this is its coin id ("cardano"),
   *  which is NOT the symbol. Nullable for assets priced by hand. */
  externalId: text("external_id"),
  /** Which source refreshes this. "manual" means only a human writes prices,
   *  which is the escape hatch for anything the provider doesn't cover. */
  source: text("source").notNull().default("coingecko"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Price history. Append-only: the cron inserts, nothing updates, so a bad
 * fetch can be traced instead of silently overwriting a good price.
 */
export const priceQuotes = pgTable(
  "price_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => priceAssets.id, { onDelete: "cascade" }),
    price: numeric("price", { precision: 24, scale: 8 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("price_quotes_asset_id_idx").on(t.assetId),
    index("price_quotes_fetched_at_idx").on(t.fetchedAt),
    // Serves the "newest quote per asset" DISTINCT ON in price-service.
    index("price_quotes_asset_id_fetched_at_idx").on(t.assetId, t.fetchedAt.desc()),
  ]
);

/**
 * A method's investment policy: what share of incoming money goes to which
 * asset. Percentages of a method should add up to 100.
 *
 * This is the RULE, not the position. It is what the owner edits, and it only
 * governs money arriving from now on — changing it never rewrites what past
 * contributions already bought.
 */
export const methodAllocations = pgTable(
  "method_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    methodId: uuid("method_id")
      .notNull()
      .references(() => investmentMethods.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => priceAssets.id, { onDelete: "restrict" }),
    /** Share of each contribution, 0–100. */
    percent: numeric("percent", { precision: 6, scale: 3 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("method_allocations_method_id_idx").on(t.methodId),
    uniqueIndex("method_allocations_method_asset_uq").on(t.methodId, t.assetId),
  ]
);

/**
 * What a single contribution actually bought, priced at the day it landed.
 *
 * This is the HISTORICAL FACT and it is immutable once written. Storing the
 * price here rather than recomputing it later is the whole point: the asset's
 * price on 2025-08-31 is a fixed truth, and a position derived from it stays
 * correct no matter how the allocation policy changes afterwards.
 *
 * `quantity` is signed by intent: a buy adds units, a withdrawal removes them.
 */
export const transactionAllocations = pgTable(
  "transaction_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => priceAssets.id, { onDelete: "restrict" }),
    /** Cash from this contribution routed to this asset. */
    amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),
    /** The asset's close on (or most recently before) the contribution date. */
    priceAtPurchase: numeric("price_at_purchase", { precision: 24, scale: 8 }).notNull(),
    /** amount / priceAtPurchase, negative for a withdrawal. */
    quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull(),
    /** The bar's date, which may precede the contribution date when it fell on
     *  a weekend or holiday and the asset does not trade every day. */
    pricedOn: timestamp("priced_on", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("transaction_allocations_transaction_id_idx").on(t.transactionId),
    index("transaction_allocations_asset_id_idx").on(t.assetId),
    uniqueIndex("transaction_allocations_tx_asset_uq").on(t.transactionId, t.assetId),
  ]
);

/**
 * Who is going on a trip.
 *
 * `email` is optional and, for now, purely informational — nothing is sent.
 * A member is not a user account: most travelling companions will never sign
 * in, and requiring an account to appear on a trip would make the common case
 * impossible.
 */
/**
 * A stop on a multi-day activity's itinerary — a cruise's ports, day by day.
 *
 * Its own table rather than a JSON blob on the item: these are rows people
 * read, sort and compare against dates, and a blob would make "what are we
 * doing on the 20th" unanswerable without parsing every item.
 *
 * `note` holds the human phrasing the operator publishes ("Docked 10:00 AM –
 * 6:00 PM", "Departs 4:30 PM") rather than parsed times: itineraries state
 * arrival and departure inconsistently, and inventing a schema for that would
 * lose information the traveller actually wants to read.
 */
export const tripItemStops = pgTable(
  "trip_item_stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => tripItems.id, { onDelete: "cascade" }),
    /** Day 1, 2, 3… as the operator numbers them. */
    dayNumber: integer("day_number").notNull(),
    stopOn: date("stop_on"),
    /** "Cozumel, Mexico", or "At sea". */
    place: text("place").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trip_item_stops_item_id_idx").on(t.itemId),
    uniqueIndex("trip_item_stops_item_day_uq").on(t.itemId, t.dayNumber),
  ]
);

export const tripMembers = pgTable(
  "trip_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    /** Share of the trip's cost, 0-100. NULL = split the remainder equally,
     *  which is what most trips want and what nobody should have to type. */
    sharePercent: numeric("share_percent", { precision: 6, scale: 3 }),
    sortOrder: real("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trip_members_trip_id_idx").on(t.tripId),
    check(
      "trip_members_share_chk",
      sql`${t.sharePercent} IS NULL OR (${t.sharePercent} >= 0 AND ${t.sharePercent} <= 100)`
    ),
  ]
);

/**
 * Who pays for ONE activity, when it is not the trip's usual split.
 *
 * No rows means "split it the way the trip splits". Rows mean this activity is
 * different — one person covering dinner, two sharing a room. Modelled as an
 * override rather than a full split table so the common case stores nothing.
 */
/**
 * Who an item is FOR — not who pays for it.
 *
 * The two are different questions and conflating them was wrong in both
 * directions. All four travellers go to the festival and two of them cover the
 * package: filtering on payers dropped it off the other two's itinerary, which
 * is not where they are. A flight from one city is the opposite — one person
 * takes it and one person pays for it, and it has no business on anybody
 * else's day.
 *
 * Empty means everybody, which is the common case and the reason this stays a
 * side table rather than a column.
 */
export const tripItemAttendees = pgTable(
  "trip_item_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => tripItems.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tripMembers.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("trip_item_attendees_item_id_idx").on(t.itemId),
    uniqueIndex("trip_item_attendees_item_member_uq").on(t.itemId, t.memberId),
  ]
);

/** Who splits the cost. See `tripItemAttendees` for who is actually going. */
export const tripItemPayers = pgTable(
  "trip_item_payers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => tripItems.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tripMembers.id, { onDelete: "cascade" }),
    /** NULL = split this activity equally among the listed payers. */
    sharePercent: numeric("share_percent", { precision: 6, scale: 3 }),
  },
  (t) => [
    index("trip_item_payers_item_id_idx").on(t.itemId),
    uniqueIndex("trip_item_payers_item_member_uq").on(t.itemId, t.memberId),
  ]
);

/**
 * Money a member has already put in.
 *
 * Kept apart from what they OWE: one is a fact about the past, the other is a
 * consequence of the split. Netting them into a single number would destroy
 * the ability to say why somebody is square.
 */
export const tripContributions = pgTable(
  "trip_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tripMembers.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),
    note: text("note"),
    paidOn: date("paid_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trip_contributions_trip_id_idx").on(t.tripId),
    check("trip_contributions_amount_chk", sql`${t.amount} >= 0`),
  ]
);

export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  name: text("name").notNull().default("My Main Portfolio"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    investmentMethodId: uuid("investment_method_id")
      .notNull()
      .references(() => investmentMethods.id, { onDelete: "restrict" }),
    type: transactionTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),
    fee: numeric("fee", { precision: 20, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 20, scale: 2 }).notNull(),
    initialValue: numeric("initial_value", { precision: 20, scale: 2 }),
    currentValue: numeric("current_value", { precision: 20, scale: 2 }),
    sourceTransactionId: uuid("source_transaction_id"),
    withdrawalTransactionIds: text("withdrawal_transaction_ids").array(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    notes: text("notes"),
    status: transactionStatusEnum("status").notNull().default("pending"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedBy: uuid("rejected_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("transactions_portfolio_id_idx").on(t.portfolioId),
    index("transactions_investment_method_id_idx").on(t.investmentMethodId),
    index("transactions_status_idx").on(t.status),
    index("transactions_date_idx").on(t.date),
    index("transactions_approved_by_idx").on(t.approvedBy),
    index("transactions_rejected_by_idx").on(t.rejectedBy),
  ]
);

export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    totalValue: numeric("total_value", { precision: 20, scale: 2 }).notNull(),
    source: snapshotSourceEnum("source").notNull().default("system_cron"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("portfolio_snapshots_portfolio_id_idx").on(t.portfolioId),
    index("portfolio_snapshots_date_idx").on(t.date),
  ]
);

export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value"),
  error: text("error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Finance planning: each user can have multiple plans (scenarios) to model
// future cash flow, debt amortization and net worth.

export const financePlans = pgTable(
  "finance_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Anchor month for the projection (first day of the start month).
    startMonth: timestamp("start_month", { withTimezone: true }).notNull(),
    // Integer count of projected months. Minimum 12 (1 year), default 120 (10
    // years). The UI shows the first 12 months monthly and yearly snapshots after.
    monthsAhead: integer("months_ahead").notNull().default(120),
    // Opening balance for the savings line at start_month.
    initialSavings: numeric("initial_savings", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    // Monthly interest rate applied to savings (e.g. 0.007 for 0.70% per month).
    monthlySavingsRate: numeric("monthly_savings_rate", { precision: 9, scale: 6 })
      .notNull()
      .default("0"),
    // When true, the projection sums in the user's current portfolio value.
    includePortfolio: boolean("include_portfolio").notNull().default(false),
    // Fraction of monthly cash-flow surplus (income - expenses - scheduled debt
    // payments) redirected to extra debt principal each month. 0 = off (all
    // surplus goes to savings), 1 = 100% to debts. Defaults to 0 on legacy rows.
    surplusToDebtsPercent: numeric("surplus_to_debts_percent", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    // How the extra surplus payment is distributed across debts:
    //   avalanche → highest interest rate first (math-optimal)
    //   snowball  → lowest balance first (psych-optimal)
    //   none      → no extra payment (off-switch when surplusToDebtsPercent > 0)
    debtStrategy: debtStrategyEnum("debt_strategy").notNull().default("avalanche"),
    // Day of the month (1..28) when the monthly confirmation prompt should appear
    // in the dashboard. 0 means disabled. 28 is the safe upper bound (every month has it).
    confirmationDayOfMonth: integer("confirmation_day_of_month").notNull().default(1),
    // Auto-invest: after debt acceleration, optionally route a slice of what
    // remains into a compounding investment account modelled against an
    // investment method's monthly ROI. 0 = off (all remainder stays as savings).
    autoInvestPercent: numeric("auto_invest_percent", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    autoInvestMethodId: uuid("auto_invest_method_id").references(
      () => investmentMethods.id,
      { onDelete: "set null" }
    ),
    initialInvestments: numeric("initial_investments", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    // Color for chart visualisation (CSS color or theme token).
    color: text("color").notNull().default("var(--chart-1)"),
    // Marks the user's primary plan. Only ONE plan per user can have this
    // true (enforced by the partial unique index below). The Dashboard
    // confirmation host and the dashboard Finance card both follow the
    // main plan; non-main plans never auto-prompt for monthly confirmation.
    isMain: boolean("is_main").notNull().default(false),
    // Scenario plans: when set, this plan is a derived what-if of another
    // plan. Deleting the base detaches the scenario (SET NULL) instead of
    // cascading — the scenario keeps working standalone.
    basedOnPlanId: uuid("based_on_plan_id").references(
      (): AnyPgColumn => financePlans.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("finance_plans_user_id_idx").on(t.userId),
    index("finance_plans_auto_invest_method_id_idx").on(t.autoInvestMethodId),
    index("finance_plans_based_on_plan_id_idx").on(t.basedOnPlanId),
    // Partial unique index: enforce at most one main plan per user. Postgres
    // partial indexes don't count rows where `is_main = false`, so the
    // constraint kicks in only on the rows we care about.
    uniqueIndex("finance_plans_user_main_uniq")
      .on(t.userId)
      .where(sql`${t.isMain} = TRUE`),
    check("finance_plans_months_ahead_chk", sql`${t.monthsAhead} >= 1 AND ${t.monthsAhead} <= 120`),
    check("finance_plans_initial_savings_chk", sql`${t.initialSavings} >= 0`),
    check("finance_plans_initial_investments_chk", sql`${t.initialInvestments} >= 0`),
    check("finance_plans_savings_rate_chk", sql`${t.monthlySavingsRate} >= 0`),
    check("finance_plans_surplus_chk", sql`${t.surplusToDebtsPercent} >= 0 AND ${t.surplusToDebtsPercent} <= 1`),
    check("finance_plans_auto_invest_chk", sql`${t.autoInvestPercent} >= 0 AND ${t.autoInvestPercent} <= 1`),
    check("finance_plans_confirmation_day_chk", sql`${t.confirmationDayOfMonth} >= 0 AND ${t.confirmationDayOfMonth} <= 28`),
  ]
);

export const financePlanIncomes = pgTable(
  "finance_plan_incomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => financePlans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // For kind='recurring' this is the monthly amount. For kind='one_time' this
    // is the lump-sum amount paid on `date` (column name kept for compatibility).
    monthlyAmount: numeric("monthly_amount", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    kind: financePlanLineKindEnum("kind").notNull().default("recurring"),
    // For 'recurring': which day of the month the income hits (1..31). Used by
    // the calendar view only — the projection aggregates monthly regardless.
    dayOfMonth: integer("day_of_month"),
    // For 'one_time': the exact date the lump sum is received.
    date: date("date"),
    // For 'recurring': inclusive month range. null start = perpetual back to
    // plan start; null end = perpetual forward. Day-precision but only the
    // year/month is meaningful for the projection.
    startDate: date("start_date"),
    endDate: date("end_date"),
    // Recurrence shape — see financePlanRecurrenceTypeEnum. monthly_day uses
    // dayOfMonth above; monthly_weekday uses weekOfMonth+dayOfWeek; and
    // every_n_months uses intervalMonths anchored at recurrenceStart (falling
    // back to the plan's startMonth when null).
    recurrenceType: financePlanRecurrenceTypeEnum("recurrence_type")
      .notNull()
      .default("monthly_day"),
    weekOfMonth: integer("week_of_month"),
    dayOfWeek: integer("day_of_week"),
    intervalMonths: integer("interval_months"),
    recurrenceStart: date("recurrence_start"),
    sortOrder: real("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("finance_plan_incomes_plan_id_idx").on(t.planId),
    check(
      "finance_plan_incomes_day_of_month_chk",
      sql`${t.dayOfMonth} IS NULL OR (${t.dayOfMonth} >= 1 AND ${t.dayOfMonth} <= 31)`
    ),
    check(
      "finance_plan_incomes_week_of_month_chk",
      sql`${t.weekOfMonth} IS NULL OR (${t.weekOfMonth} >= 1 AND ${t.weekOfMonth} <= 5)`
    ),
    check(
      "finance_plan_incomes_day_of_week_chk",
      sql`${t.dayOfWeek} IS NULL OR (${t.dayOfWeek} >= 0 AND ${t.dayOfWeek} <= 6)`
    ),
    check(
      "finance_plan_incomes_interval_months_chk",
      sql`${t.intervalMonths} IS NULL OR (${t.intervalMonths} >= 1 AND ${t.intervalMonths} <= 12)`
    ),
  ]
);

export const financePlanExpenses = pgTable(
  "finance_plan_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => financePlans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // For kind='recurring' this is the monthly amount. For kind='one_time' this
    // is the lump-sum amount paid on `date`.
    monthlyAmount: numeric("monthly_amount", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    kind: financePlanLineKindEnum("kind").notNull().default("recurring"),
    // Day of the month for recurring expenses (1..31). Calendar-only metadata.
    dayOfMonth: integer("day_of_month"),
    // Specific date for one-time expenses.
    date: date("date"),
    // Recurrence shape — see financePlanRecurrenceTypeEnum.
    recurrenceType: financePlanRecurrenceTypeEnum("recurrence_type")
      .notNull()
      .default("monthly_day"),
    weekOfMonth: integer("week_of_month"),
    dayOfWeek: integer("day_of_week"),
    intervalMonths: integer("interval_months"),
    recurrenceStart: date("recurrence_start"),
    sortOrder: real("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("finance_plan_expenses_plan_id_idx").on(t.planId),
    check(
      "finance_plan_expenses_day_of_month_chk",
      sql`${t.dayOfMonth} IS NULL OR (${t.dayOfMonth} >= 1 AND ${t.dayOfMonth} <= 31)`
    ),
    check(
      "finance_plan_expenses_week_of_month_chk",
      sql`${t.weekOfMonth} IS NULL OR (${t.weekOfMonth} >= 1 AND ${t.weekOfMonth} <= 5)`
    ),
    check(
      "finance_plan_expenses_day_of_week_chk",
      sql`${t.dayOfWeek} IS NULL OR (${t.dayOfWeek} >= 0 AND ${t.dayOfWeek} <= 6)`
    ),
    check(
      "finance_plan_expenses_interval_months_chk",
      sql`${t.intervalMonths} IS NULL OR (${t.intervalMonths} >= 1 AND ${t.intervalMonths} <= 12)`
    ),
  ]
);

/**
 * Snapshot of a finance plan's projected position at a point in time. Mirrors
 * the `portfolio_snapshots` shape (same column names, timestamp date, no UNIQUE
 * constraint) so both subsystems share patterns and helpers can stay symmetric.
 *
 * Multiple rows per (plan_id, date) are allowed on purpose — a snapshot taken
 * by the cron at 06:00 and another written when the user confirms balances at
 * 14:00 both belong here. Queries that need "the latest" sort by date DESC.
 */
export const financePlanSnapshots = pgTable(
  "finance_plan_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => financePlans.id, { onDelete: "cascade" }),
    // Timestamp (with TZ) just like portfolio_snapshots.date — same column name
    // and type so the two subsystems are interchangeable in tooling/queries.
    date: timestamp("date", { withTimezone: true }).notNull(),
    savings: numeric("savings", { precision: 20, scale: 2 }).notNull(),
    investments: numeric("investments", { precision: 20, scale: 2 }).notNull(),
    totalDebt: numeric("total_debt", { precision: 20, scale: 2 }).notNull(),
    netWorth: numeric("net_worth", { precision: 20, scale: 2 }).notNull(),
    source: financeSnapshotSourceEnum("source").notNull().default("system_cron"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("finance_plan_snapshots_plan_id_idx").on(t.planId),
    index("finance_plan_snapshots_date_idx").on(t.date),
  ]
);

/**
 * Per-debt balance breakdown for a snapshot. Mirrors
 * finance_plan_debt_confirmations: the snapshot keeps the aggregate `totalDebt`
 * for fast reads, while this child table records each debt's balance at the
 * snapshot date so the per-debt history (each card/loan's curve over time) is
 * reconstructable, not just the total.
 */
export const financePlanSnapshotDebts = pgTable(
  "finance_plan_snapshot_debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => financePlanSnapshots.id, { onDelete: "cascade" }),
    debtId: uuid("debt_id")
      .notNull()
      .references(() => financePlanDebts.id, { onDelete: "cascade" }),
    balance: numeric("balance", { precision: 20, scale: 2 }).notNull(),
  },
  (t) => [
    uniqueIndex("finance_plan_snapshot_debts_uniq").on(t.snapshotId, t.debtId),
    index("finance_plan_snapshot_debts_debt_id_idx").on(t.debtId),
  ]
);

/**
 * User-confirmed actuals for a given month. The user is prompted on the
 * configured `confirmationDayOfMonth` to confirm their real savings,
 * investments and current debt balances. These numbers replace the
 * computed projection as the new baseline going forward (recalibration).
 */
export const financePlanConfirmations = pgTable(
  "finance_plan_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => financePlans.id, { onDelete: "cascade" }),
    // Anchor to the FIRST day of the confirmed month (always UTC midnight).
    confirmationMonth: date("confirmation_month").notNull(),
    confirmedSavings: numeric("confirmed_savings", { precision: 20, scale: 2 }).notNull(),
    confirmedInvestments: numeric("confirmed_investments", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    // Who created this confirmation — see financeConfirmationSourceEnum.
    source: financeConfirmationSourceEnum("source").notNull().default("user"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("finance_plan_confirmations_plan_month_uniq").on(t.planId, t.confirmationMonth),
    index("finance_plan_confirmations_plan_id_idx").on(t.planId),
    // No >= 0 check on confirmed_savings: a deficit is carried as negative
    // savings, and the auto-confirm cron records it as such.
    check("finance_plan_confirmations_investments_chk", sql`${t.confirmedInvestments} >= 0`),
  ]
);

/**
 * Per-debt confirmed balance at confirmation time. Lets the user say
 * "BAC card showed $4,820 today" instead of just one bucket total.
 */
export const financePlanDebtConfirmations = pgTable(
  "finance_plan_debt_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    confirmationId: uuid("confirmation_id")
      .notNull()
      .references(() => financePlanConfirmations.id, { onDelete: "cascade" }),
    debtId: uuid("debt_id")
      .notNull()
      .references(() => financePlanDebts.id, { onDelete: "cascade" }),
    confirmedBalance: numeric("confirmed_balance", { precision: 20, scale: 2 }).notNull(),
  },
  (t) => [
    uniqueIndex("finance_plan_debt_confirmations_uniq").on(t.confirmationId, t.debtId),
    index("finance_plan_debt_confirmations_debt_id_idx").on(t.debtId),
    check("finance_plan_debt_confirmations_balance_chk", sql`${t.confirmedBalance} >= 0`),
  ]
);

export const financePlanDebts = pgTable(
  "finance_plan_debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => financePlans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    initialBalance: numeric("initial_balance", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    // Monthly interest rate as a decimal (e.g. 0.02 for 2% per month).
    monthlyInterestRate: numeric("monthly_interest_rate", { precision: 9, scale: 6 })
      .notNull()
      .default("0"),
    // For payment_type='fixed' this is the actual monthly payment.
    // For payment_type='percent_of_balance' it is only used as a hint in the UI;
    // the projection uses minPaymentPercent + minPaymentFloor instead.
    monthlyPayment: numeric("monthly_payment", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    // Credit-card-style debts have a monthly minimum proportional to balance
    // (typically 2-5%, with a floor like $25). As balance drops the minimum
    // drops too, which is what produces the natural curving payoff line.
    paymentType: debtPaymentTypeEnum("payment_type").notNull().default("fixed"),
    minPaymentPercent: numeric("min_payment_percent", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    minPaymentFloor: numeric("min_payment_floor", { precision: 20, scale: 2 })
      .notNull()
      .default("0"),
    // Calendar/projection use this to know WHEN in the month the minimum hits.
    // Nullable for legacy rows; treated as day 1 when unset.
    dayOfMonth: integer("day_of_month"),
    // Recurrence shape — see financePlanRecurrenceTypeEnum.
    recurrenceType: financePlanRecurrenceTypeEnum("recurrence_type")
      .notNull()
      .default("monthly_day"),
    weekOfMonth: integer("week_of_month"),
    dayOfWeek: integer("day_of_week"),
    intervalMonths: integer("interval_months"),
    recurrenceStart: date("recurrence_start"),
    sortOrder: real("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("finance_plan_debts_plan_id_idx").on(t.planId),
    check(
      "finance_plan_debts_day_of_month_chk",
      sql`${t.dayOfMonth} IS NULL OR (${t.dayOfMonth} >= 1 AND ${t.dayOfMonth} <= 31)`
    ),
    check(
      "finance_plan_debts_week_of_month_chk",
      sql`${t.weekOfMonth} IS NULL OR (${t.weekOfMonth} >= 1 AND ${t.weekOfMonth} <= 5)`
    ),
    check(
      "finance_plan_debts_day_of_week_chk",
      sql`${t.dayOfWeek} IS NULL OR (${t.dayOfWeek} >= 0 AND ${t.dayOfWeek} <= 6)`
    ),
    check(
      "finance_plan_debts_interval_months_chk",
      sql`${t.intervalMonths} IS NULL OR (${t.intervalMonths} >= 1 AND ${t.intervalMonths} <= 12)`
    ),
  ]
);

/**
 * Per-occurrence overrides for recurring income / expense / debt entries.
 *
 * Lets the user say "move JUST this month's payment", "skip this month", or
 * "use a different amount this month" without disturbing the parent's
 * recurring schedule. Projection + calendar both consult this table per
 * (parentSide, parentId, monthYear) before generating the regular contribution.
 *
 * monthYear stores the FIRST day of the targeted month (DATE 2026-08-01); the
 * unique index on (parent_side, parent_id, month_year) enforces at most one
 * override per recurring entry per month — a new override replaces the
 * previous one.
 */
export const financePlanLineOverrides = pgTable(
  "finance_plan_line_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => financePlans.id, { onDelete: "cascade" }),
    parentSide: financePlanOverrideSideEnum("parent_side").notNull(),
    // No DB-level FK — points to one of finance_plan_incomes / _expenses /
    // _debts depending on parentSide. The service deletes matching overrides
    // when its parent is deleted; the planId cascade catches whole-plan deletes.
    parentId: uuid("parent_id").notNull(),
    monthYear: date("month_year").notNull(),
    action: financePlanOverrideActionEnum("action").notNull(),
    // For action='reschedule': specific date this month maps to.
    date: date("date"),
    // For action='amount': the replacement amount for this month.
    monthlyAmount: numeric("monthly_amount", { precision: 20, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("finance_plan_line_overrides_plan_id_idx").on(t.planId),
    uniqueIndex("finance_plan_line_overrides_parent_month_uniq").on(
      t.parentSide,
      t.parentId,
      t.monthYear
    ),
    check(
      "finance_plan_line_overrides_reschedule_chk",
      sql`(${t.action} <> 'reschedule') OR (${t.date} IS NOT NULL)`
    ),
    check(
      "finance_plan_line_overrides_amount_chk",
      sql`(${t.action} <> 'amount') OR (${t.monthlyAmount} IS NOT NULL)`
    ),
  ]
);

// Audit trail for mutations performed by an admin while impersonating another user.
export const impersonationLogs = pgTable(
  "impersonation_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    impersonatedUserId: uuid("impersonated_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    entityTable: text("entity_table"),
    entityId: uuid("entity_id"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("impersonation_logs_admin_id_idx").on(t.adminId),
    index("impersonation_logs_impersonated_user_id_idx").on(t.impersonatedUserId),
    index("impersonation_logs_created_at_idx").on(t.createdAt),
  ]
);

// Productivity Feature Tables
export const boardColumns = pgTable(
  "board_columns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    order: real("order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("board_columns_user_id_idx").on(t.userId)]
);

export const boardTasks = pgTable(
  "board_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    columnId: uuid("column_id")
      .notNull()
      .references(() => boardColumns.id, { onDelete: "cascade" }),
    roadPathId: uuid("road_path_id").references(() => roadPaths.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: taskPriorityEnum("priority"),
    order: real("order").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("board_tasks_user_id_idx").on(t.userId),
    index("board_tasks_column_id_idx").on(t.columnId),
    index("board_tasks_road_path_id_idx").on(t.roadPathId),
  ]
);

export const roadPaths = pgTable(
  "road_paths",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    targetValue: numeric("target_value", { precision: 20, scale: 2 }),
    currentValue: numeric("current_value", { precision: 20, scale: 2 }).default("0"),
    unit: text("unit"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    targetDate: timestamp("target_date", { withTimezone: true }),
    autoCreateTasks: boolean("auto_create_tasks").notNull().default(false),
    taskFrequency: roadPathFrequencyEnum("task_frequency"),
    lastTaskCreatedAt: timestamp("last_task_created_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("road_paths_user_id_idx").on(t.userId)]
);

export const roadPathMilestones = pgTable(
  "road_path_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roadPathId: uuid("road_path_id")
      .notNull()
      .references(() => roadPaths.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    targetValue: numeric("target_value", { precision: 20, scale: 2 }),
    order: real("order").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("road_path_milestones_road_path_id_idx").on(t.roadPathId)]
);

export const roadPathProgress = pgTable(
  "road_path_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roadPathId: uuid("road_path_id")
      .notNull()
      .references(() => roadPaths.id, { onDelete: "cascade" }),
    value: numeric("value", { precision: 20, scale: 2 }).notNull(),
    notes: text("notes"),
    date: timestamp("date", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("road_path_progress_road_path_id_idx").on(t.roadPathId),
    index("road_path_progress_date_idx").on(t.date),
  ]
);

// Relations
export const transactionsRelations = relations(transactions, ({ one }) => ({
  investmentMethod: one(investmentMethods, {
    fields: [transactions.investmentMethodId],
    references: [investmentMethods.id],
  }),
  portfolio: one(portfolios, {
    fields: [transactions.portfolioId],
    references: [portfolios.id],
  }),
}));

export const boardColumnsRelations = relations(boardColumns, ({ one, many }) => ({
  user: one(users, {
    fields: [boardColumns.userId],
    references: [users.id],
  }),
  tasks: many(boardTasks),
}));

export const boardTasksRelations = relations(boardTasks, ({ one }) => ({
  user: one(users, {
    fields: [boardTasks.userId],
    references: [users.id],
  }),
  column: one(boardColumns, {
    fields: [boardTasks.columnId],
    references: [boardColumns.id],
  }),
  roadPath: one(roadPaths, {
    fields: [boardTasks.roadPathId],
    references: [roadPaths.id],
  }),
}));

export const roadPathsRelations = relations(roadPaths, ({ one, many }) => ({
  user: one(users, {
    fields: [roadPaths.userId],
    references: [users.id],
  }),
  milestones: many(roadPathMilestones),
  progress: many(roadPathProgress),
  tasks: many(boardTasks),
}));

export const roadPathMilestonesRelations = relations(roadPathMilestones, ({ one }) => ({
  roadPath: one(roadPaths, {
    fields: [roadPathMilestones.roadPathId],
    references: [roadPaths.id],
  }),
}));

export const roadPathProgressRelations = relations(roadPathProgress, ({ one }) => ({
  roadPath: one(roadPaths, {
    fields: [roadPathProgress.roadPathId],
    references: [roadPaths.id],
  }),
}));

// Entertainment → Travel Planner
//
// trips: top-level user-owned record. Dates are date-only (calendar days, no TZ)
// because a "trip" is a calendar concept — the user thinks "Aug 12 → Aug 20",
// not "Aug 12 00:00:00 in some timezone".
export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    destination: text("destination"),
    description: text("description"),
    startDate: date("start_date").notNull(),
    // null end_date allows open-ended trips ("relocating", "sabbatical").
    endDate: date("end_date"),
    // Primary cover image. URL may point to Supabase Storage or any external URL.
    coverPhotoUrl: text("cover_photo_url"),
    // Currency code (ISO 4217) used to aggregate item prices into estimates.
    currency: text("currency").notNull().default("USD"),
    color: text("color").notNull().default("var(--chart-1)"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trips_user_id_idx").on(t.userId),
    index("trips_start_date_idx").on(t.startDate),
    check("trips_date_range_chk", sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
  ]
);

// trip_items: planned activities, reservations, transport, food stops, etc.
// Each item can carry a link (booking URL), a price, and an optional scheduled
// datetime so the detail view can render a day-by-day itinerary.
export const tripItems = pgTable(
  "trip_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: tripItemCategoryEnum("category").notNull().default("activity"),
    link: text("link"),
    // Optional video for THIS activity — a walkthrough of the hotel, a tour of
    // the ship. YouTube or Instagram. Stored as the URL the user pasted, NOT a
    // pre-built embed: the provider and id are derived at render time, so a
    // link saved in any of the shapes those sites hand out keeps working.
    // See lib/travel/video.ts.
    videoUrl: text("video_url"),
    // Where a flight or a transfer goes. Free text rather than a validated
    // IATA code: "MCO" and "Orlando Intl" are both useful to a human planning
    // a trip, and rejecting the second buys nothing.
    fromCode: text("from_code"),
    toCode: text("to_code"),
    // A return flight is one purchase, not two. Modelling it as one item means
    // the price is unambiguous — with two rows somebody has to decide which
    // one carries the fare and the other reads as free.
    roundTrip: boolean("round_trip").notNull().default(false),
    // Upper end of an estimate. `price` is the low/expected figure and this is
    // optional — an unbooked flight is honestly "$400-600", and forcing a
    // single number would make the trip total look more certain than it is.
    priceMax: numeric("price_max", { precision: 20, scale: 2 }),
    priceUnit: tripPriceUnitEnum("price_unit").notNull().default("total"),
    // Optional price. Null = "not estimated yet". Currency lives on the parent
    // trip — multi-currency itineraries are out of scope for v1.
    price: numeric("price", { precision: 20, scale: 2 }),
    // Calendar day this item happens on (date-only, matches trips date columns).
    // Allows grouping by day in the UI without timezone math.
    // An activity can span days — a week-long cruise is one activity, not
    // seven. `scheduledOn` is the start; null `endsOn` means a single day.
    scheduledOn: date("scheduled_on"),
    endsOn: date("ends_on"),
    notes: text("notes"),
    sortOrder: real("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trip_items_trip_id_idx").on(t.tripId),
    index("trip_items_scheduled_on_idx").on(t.scheduledOn),
    check("trip_items_price_chk", sql`${t.price} IS NULL OR ${t.price} >= 0`),
  ]
);

// trip_photos: gallery shots. Both uploaded files (Supabase Storage public URLs)
// and external URLs land here — the `source` enum just records provenance for
// future cleanup (e.g. when a trip is deleted we may want to also delete the
// storage objects, but only for `source = upload`).
export const tripPhotos = pgTable(
  "trip_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    // When set, the photo belongs to that activity rather than the trip's own
    // gallery. Nullable rather than a second table: a photo is a photo, and two
    // tables would mean two uploaders and two delete paths.
    itemId: uuid("item_id").references((): AnyPgColumn => tripItems.id, {
      onDelete: "cascade",
    }),
    url: text("url").notNull(),
    // Storage object key for uploads (e.g. `user-id/trip-id/uuid.jpg`). Null for
    // external URLs. Used at deletion time to remove the underlying file.
    storagePath: text("storage_path"),
    source: tripPhotoSourceEnum("source").notNull().default("url"),
    caption: text("caption"),
    sortOrder: real("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("trip_photos_trip_id_idx").on(t.tripId)]
);

// trip_shares: opaque tokens that grant read-only public access to a trip via
// `/trips/{token}`. The invitee_email column is metadata only — we record who
// the link was generated for; the link itself is the credential.
export const tripShares = pgTable(
  "trip_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    // URL-safe random token. Unique across all trips so it can be the sole path
    // segment in the public URL.
    token: text("token").notNull(),
    inviteeEmail: text("invitee_email"),
    // Scopes the link to one traveller: the public page then shows what THEY
    // owe rather than what the trip costs. Null is the whole trip. Set null on
    // delete rather than cascade — removing somebody from the trip should
    // widen their old link, not silently break it.
    memberId: uuid("member_id").references(() => tripMembers.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // Revoked shares stay around as audit history but stop resolving on the
    // public page. Hard delete is also offered in the UI for cleanup.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // What the recipient may see. Defaults are the safest reading of "share my
    // trip": the plan, not the money and not who else is coming.
    showPrices: boolean("show_prices").notNull().default(false),
    showMembers: boolean("show_members").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("trip_shares_token_uniq").on(t.token),
    index("trip_shares_trip_id_idx").on(t.tripId),
  ]
);

export const tripsRelations = relations(trips, ({ one, many }) => ({
  user: one(users, {
    fields: [trips.userId],
    references: [users.id],
  }),
  items: many(tripItems),
  photos: many(tripPhotos),
  shares: many(tripShares),
}));

export const tripItemsRelations = relations(tripItems, ({ one }) => ({
  trip: one(trips, {
    fields: [tripItems.tripId],
    references: [trips.id],
  }),
}));

export const tripPhotosRelations = relations(tripPhotos, ({ one }) => ({
  trip: one(trips, {
    fields: [tripPhotos.tripId],
    references: [trips.id],
  }),
}));

export const tripSharesRelations = relations(tripShares, ({ one }) => ({
  trip: one(trips, {
    fields: [tripShares.tripId],
    references: [trips.id],
  }),
}));

// Entertainment → Sports
//
// user_sports_preferences: which of the catalog sports the user has marked as
// favourites. The sport identifier is a free-form text key (matches SportId in
// /types/sports.ts) so adding/removing sports does not require an enum
// migration. The UNIQUE (user_id, sport_id) constraint backs the toggle
// semantics in the manage-favourites sheet.
/**
 * F1 news, kept rather than fetched on demand.
 *
 * RapidAPI's feed is a rolling window of the last 25 articles, so anything
 * older is gone the moment it falls off. Storing each article is what makes an
 * archive possible at all — the 163 rows this started with came from the
 * humex-champions Firebase project, which had been collecting them daily since
 * August 2025.
 *
 * `articleId` is RapidAPI's own `dataSourceIdentifier`, and it is what makes a
 * refresh idempotent: the same article arriving twice updates its row instead
 * of adding one.
 */
export const f1News = pgTable(
  "f1_news",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: text("article_id").notNull(),
    headline: text("headline").notNull(),
    description: text("description"),
    link: text("link"),
    /** `[{ url, alt, caption, width, height }]` as the provider sends it. */
    images: jsonb("images").$type<F1NewsImage[]>().default([]).notNull(),
    /** When the article first reached us, not when it was published — the
     *  provider does not send a publication date. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("f1_news_article_id_uniq").on(t.articleId),
    index("f1_news_first_seen_at_idx").on(t.firstSeenAt),
  ]
);

export type F1NewsImage = {
  url: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
};

export const userSportsPreferences = pgTable(
  "user_sports_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sportId: text("sport_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("user_sports_preferences_user_sport_uniq").on(t.userId, t.sportId),
    index("user_sports_preferences_user_id_idx").on(t.userId),
  ]
);

// Portal-wide user preferences — one row per user, created lazily on first
// write. Absence of a row means "all defaults" (the service layer owns the
// default values so no backfill migration is needed when adding a column).
export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  // Decorative module mascot shown after page content (e.g. the miner on
  // finance pages). Toggleable from /portal/settings.
  showContextAvatar: boolean("show_context_avatar").notNull().default(true),
  // Net-worth milestones annotated on the projection charts. Global (not
  // per-plan) and editable from /portal/settings. NULL means "never touched
  // it" and falls back to the built-in list in code — a default here would
  // freeze today's list into every existing row.
  financeMilestones: jsonb("finance_milestones").$type<number[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
