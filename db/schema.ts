import { pgTable, text, uuid, timestamp, pgSchema, real, pgEnum, numeric } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const riskLevelEnum = pgEnum("risk_level", ["Low", "Medium", "High"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "approved", "rejected"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["buy", "withdrawal"]);

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
