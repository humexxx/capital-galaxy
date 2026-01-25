---
name: database-migration
description: Handle database schema changes using Drizzle ORM. Use when modifying database tables, columns, relationships, or any schema changes. Includes migration generation, application, and verification steps.
---

# Database Migration Workflow

This skill guides you through the complete database migration process using Drizzle ORM.

## When to Use

- Adding new tables to the database
- Modifying existing table columns
- Changing relationships or constraints
- Adding indexes or foreign keys
- Any schema changes in `<schema-file>`

## Prerequisites

- Node.js installed
- Database connection configured
- Drizzle Kit available in project

## Step-by-Step Process

### 1. Modify the Schema

Edit `<schema-file>` with your schema changes:

```typescript
// Example: Adding a new column
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  newField: text("new_field"), // New field added
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### 2. Generate Migration

Run the migration generation command:

```bash
<generate-command>
```

This command:
- Analyzes your schema changes
- Creates a new migration file in `<migrations-dir>`
- Names it with a timestamp and description

**Example output:**
```
✔ Loaded env from .env
✔ Pulling schema from database...
✔ Pulling migration state...
✔ Loaded all config
✔ Pulling existing migrations...
◐ Pulling schema from database...0001_new_field_migration.sql migrated!
```

### 3. Review the Migration

Check the generated migration file in `<migrations-dir>`:

```sql
-- Example: migrations/0001_add_new_field.sql
ALTER TABLE "users" ADD COLUMN "new_field" text;
```

**Important**: Review the SQL to ensure it matches your intentions.

### 4. Apply the Migration

Run the migration to update your database:

```bash
<migrate-command>
```

This applies all pending migrations to your database.

### 5. Verify Changes

Open Drizzle Studio to verify:

```bash
<studio-command>
```

Check:
- New columns appear
- Data is preserved
- Constraints are applied

### 6. Commit Changes

Always commit both files together:

```bash
git add <schema-file> <migrations-dir>/
git commit -m "feat: add new_field to users table"
```

## Common Scenarios

### Adding a New Table

```typescript
export const newTable = pgTable("new_table", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### Adding a Foreign Key

```typescript
export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // other fields...
});
```

### Making a Field Required

```typescript
// Before
description: text("description"),

// After
description: text("description").notNull(),
```

## Important Rules

1. **Never edit migration files manually** - Always regenerate if needed
2. **Always commit schema and migrations together** - They must stay in sync
3. **Test migrations on development first** - Never run untested migrations in production
4. **Review generated SQL** - Ensure it matches your expectations
5. **Use transactions** - Drizzle handles this, but be aware for complex migrations

## Troubleshooting

### Migration Drift Detected

If you get a drift warning:

```bash
# Reset and regenerate (DEVELOPMENT ONLY)
<generate-command>
```

### Migration Fails

1. Check the error message
2. Review the generated SQL
3. Ensure database is running
4. Check for data conflicts

### Rollback

Drizzle doesn't support automatic rollback. To undo:

1. Manually write a down migration
2. Or restore from backup

## Acceptance Criteria

✅ Schema file modified
✅ Migration generated successfully
✅ Migration SQL reviewed
✅ Migration applied without errors
✅ Changes verified in database
✅ Both files committed together

## Project-Specific Placeholders

- `<schema-file>`: Path to schema definition file
- `<migrations-dir>`: Directory where migrations are stored
- `<generate-command>`: Command to generate migrations
- `<migrate-command>`: Command to apply migrations
- `<studio-command>`: Command to open database studio
- Names it with a timestamp and description

**Example output:**
```
✔ Loaded env from .env
✔ Pulling schema from database...
✔ Pulling migration state...
✔ Loaded all config
✔ Pulling existing migrations...
✔ Loaded env from .env
◐ Pulling schema from database...0001_new_field_migration.sql migrated!
```

### 3. Review the Migration

Check the generated migration file in `migrations/`:

```sql
-- Example: migrations/0001_add_new_field.sql
ALTER TABLE "users" ADD COLUMN "new_field" text;
```

**Important**: Review the SQL to ensure it matches your intentions.

### 4. Apply the Migration

Run the migration to update your database:

```bash
npm run db:migrate
```

This applies all pending migrations to your database.

### 5. Verify Changes

Open Drizzle Studio to verify:

```bash
npm run db:studio
```

Navigate to `http://localhost:4983` and check:
- New columns appear
- Data is preserved
- Constraints are applied

### 6. Commit Changes

Always commit both files together:

```bash
git add db/schema.ts migrations/
git commit -m "feat: add new_field to users table"
```

## Common Scenarios

### Adding a New Table

```typescript
export const newTable = pgTable("new_table", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### Adding a Foreign Key

```typescript
export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // other fields...
});
```

### Making a Field Required

```typescript
// Before
description: text("description"),

// After
description: text("description").notNull(),
```

## Important Rules

1. **Never edit migration files manually** - Always regenerate if needed
2. **Always commit schema and migrations together** - They must stay in sync
3. **Test migrations on development first** - Never run untested migrations in production
4. **Review generated SQL** - Ensure it matches your expectations
5. **Use transactions** - Drizzle handles this, but be aware for complex migrations

## Troubleshooting

### Migration Drift Detected

If you get a drift warning:

```bash
# Reset and regenerate (DEVELOPMENT ONLY)
npm run db:generate
```

### Migration Fails

1. Check the error message
2. Review the generated SQL
3. Ensure database is running
4. Check for data conflicts

### Rollback

Drizzle doesn't support automatic rollback. To undo:

1. Manually write a down migration
2. Or restore from backup

## Related Files

- `db/schema.ts` - Schema definitions
- `drizzle.config.ts` - Drizzle configuration
- `migrations/` - Generated migration files
- `.env` - Database connection string
