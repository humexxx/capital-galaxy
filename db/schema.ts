import { pgTable, text, uuid, timestamp, pgSchema, real, pgEnum } from "drizzle-orm/pg-core";

export const riskLevelEnum = pgEnum("risk_level", ["Low", "Medium", "High"]);

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
