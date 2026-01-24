import { pgTable, text, uuid, timestamp, pgSchema, real, pgEnum, numeric } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const riskLevelEnum = pgEnum("risk_level", ["Low", "Medium", "High"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "approved", "rejected", "closed"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["buy", "withdrawal"]);
export const snapshotSourceEnum = pgEnum("snapshot_source", ["system_cron", "admin_approval", "manual", "admin_enforce"]);
export const roadPathFrequencyEnum = pgEnum("road_path_frequency", ["daily", "every_other_day", "weekly", "biweekly", "monthly"]);

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
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const investmentMethods = pgTable("investment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  author: text("author").notNull(),
  riskLevel: riskLevelEnum("risk_level").notNull(),
  monthlyRoi: real("monthly_roi").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  name: text("name").notNull().default("My Main Portfolio"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const transactions = pgTable("transactions", {
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
});

export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  date: timestamp("date", { withTimezone: true }).notNull(),
  totalValue: numeric("total_value", { precision: 20, scale: 2 }).notNull(),
  source: snapshotSourceEnum("source").notNull().default("system_cron"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value"),
  error: text("error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Productivity Feature Tables
export const boardColumns = pgTable("board_columns", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  order: real("order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const boardTasks = pgTable("board_tasks", {
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
  order: real("order").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const roadPaths = pgTable("road_paths", {
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
  autoCreateTasks: real("auto_create_tasks").notNull().default(0),
  taskFrequency: roadPathFrequencyEnum("task_frequency"),
  lastTaskCreatedAt: timestamp("last_task_created_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const roadPathMilestones = pgTable("road_path_milestones", {
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
});

export const roadPathProgress = pgTable("road_path_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  roadPathId: uuid("road_path_id")
    .notNull()
    .references(() => roadPaths.id, { onDelete: "cascade" }),
  value: numeric("value", { precision: 20, scale: 2 }).notNull(),
  notes: text("notes"),
  date: timestamp("date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

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
