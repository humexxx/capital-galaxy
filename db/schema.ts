import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

// We'll handle the foreign key to auth.users in the SQL trigger or manually if needed, 
// as crossing schemas with Drizzle can be tricky without full introspection.
// For now, simple ID matching is enough as the trigger handles insertion.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().notNull(), // This will reference auth.users.id
  email: text("email"),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
