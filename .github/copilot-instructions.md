# GitHub Copilot Instructions

These instructions guide GitHub Copilot's inline code suggestions, completions, and quick coding assistance.

## Language

Write all code, comments, and documentation in English.

## Type System

### Type Organization
- Shared types → `/types` folder (export from `/types/index.ts`)
- Validation types → same file as Zod schema in `/schemas`
- Component-specific types → only in file if not used elsewhere

### Type Categories
1. **Database**: `typeof table.$inferSelect` (Drizzle ORM)
2. **Validation**: `z.infer<typeof schema>` (Zod)
3. **Business**: Domain models in `/types`

### Return Types
Always explicit for functions:
- GET (nullable): `Promise<Type | null>`
- GET (always): `Promise<Type>` or `Promise<Type[]>`
- CREATE/UPDATE: `Promise<Type>`
- DELETE: `Promise<void>`

## Validation Schemas

- Location: `/schemas` folder
- Pattern: Define schema, infer type
- Naming: `[name]Schema` and `[Name]Data`
- Export both schema and type

## Database

### Schema Changes
1. Modify `db/schema.ts`
2. Run `npm run db:generate`
3. Run `npm run db:migrate`
4. Commit schema + migrations together

### Patterns
- Use Drizzle ORM for all operations
- Transactions for multi-table operations
- Foreign key constraints with cascade rules
- Timestamps (createdAt, updatedAt) on all tables

## UI Components

- Use shadcn/ui components from `/components/ui`
- Follow shadcn patterns: composable, accessible
- Style with Tailwind CSS utilities and CSS variables
- Minimalist design philosophy

## Code Quality

- Simple functions (extract complex logic)
- Meaningful, descriptive names
- Avoid `any` type (use `unknown` with type guards)
- Consult official docs for libraries
- Minimal comments (only for complex logic)

## Project Structure

```
/app/actions     - Server actions
/app/api         - API routes
/components      - React components
/components/ui   - shadcn/ui primitives
/lib/services    - Business logic
/types           - Shared TypeScript types
/schemas         - Zod validation schemas
/db              - Database schema & migrations
```
