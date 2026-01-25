# AI Agent Instructions

This file contains comprehensive instructions for AI coding agents working on Capital Galaxy.

**File purpose**: Local map, navigation, and operational knowledge for this specific repository.

**Related files**:
- [Agent Skills](./.github/skills/) - Reusable task playbooks (portable across projects)
- [.github/copilot-instructions.md](./.github/copilot-instructions.md) - Global coding standards and guardrails

## Project Placeholders Map

When using Agent Skills, substitute these placeholders with actual project values:

| Placeholder | Actual Value | Description |
|-------------|--------------|-------------|
| `<schema-file>` | `db/schema.ts` | Database schema definitions |
| `<migrations-dir>` | `migrations/` | Generated migration files |
| `<generate-command>` | `npm run db:generate` | Generate migrations |
| `<migrate-command>` | `npm run db:migrate` | Apply migrations |
| `<studio-command>` | `npm run db:studio` | Open Drizzle Studio |
| `<services-dir>` | `/lib/services` | Service layer location |
| `<actions-dir>` | `/app/actions` | Server actions location |
| `<ext>` | `.ts` | TypeScript extension |
| `<db-client>` | `@/db` | Database client import |
| `<orm>` | `drizzle-orm` | ORM library |
| `<types-dir>` | `@/types` | Shared types location |
| `<schemas-dir>` | `@/schemas` | Validation schemas location |
| `<auth-wrapper>` | `@/lib/services/auth-server` | Auth action wrappers |

## Project Structure

```
capital-galaxy/
├── app/                      # Next.js App Router
│   ├── actions/             # Server actions (mutations)
│   ├── api/                 # API routes
│   │   ├── auth/           # Supabase auth callbacks
│   │   └── cron/           # Scheduled jobs
│   ├── portal/             # Authenticated app area
│   └── globals.css         # Global styles + theme
├── components/              # React components
│   ├── ui/                 # shadcn/ui primitives
│   └── [feature]/          # Feature-specific components
├── lib/                     # Shared utilities
│   ├── services/           # Business logic & data access
│   ├── supabase-server.ts  # Supabase server client
│   └── utils.ts            # Utilities
├── types/                   # Shared TypeScript types
├── schemas/                 # Zod validation schemas
├── db/                      # Database layer
│   ├── schema.ts           # Drizzle schema definitions
│   └── index.ts            # Database client
├── migrations/              # Drizzle migrations
└── .github/
    ├── copilot-instructions.md
    └── skills/             # Agent Skills
```

### Key Areas

- **`/app/actions`**: Server actions for mutations (create, update, delete)
- **`/app/api`**: REST API endpoints and webhooks
- **`/app/portal`**: Main application pages (requires auth)
- **`/components/ui`**: shadcn/ui primitives (Button, Dialog, etc.)
- **`/lib/services`**: Business logic and data access layer
- **`/types`**: Shared TypeScript type definitions
- **`/schemas`**: Zod schemas for validation
- **`/db/schema.ts`**: Database schema (single source of truth)
- **`/migrations`**: Auto-generated SQL migration files

## Commands & Scripts

### Development
```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Database
```bash
npm run db:generate  # Generate migration from schema changes
npm run db:migrate   # Apply pending migrations
npm run db:studio    # Open Drizzle Studio (http://localhost:4983)
```

### Important Notes
- **Always run `db:generate` after modifying `db/schema.ts`**
- **Always run `db:migrate` to apply migrations**
- **Commit both schema + migrations together**

## Environment Setup

Required `.env` file:

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_anon_key
DATABASE_URL=your_database_url

# Base URL (required)
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Cron Secret (required for scheduled jobs)
CRON_SECRET=your_secure_random_string
```

## Tech Stack Details

- **Platform**: Windows with PowerShell
- **Node**: 22+
- **Framework**: Next.js 16 (App Router)
- **React**: 19 with Server Components
- **TypeScript**: Strict mode enabled
- **Styling**: Tailwind CSS v4
- **UI Library**: shadcn/ui components
- **Backend**: Supabase (Auth + PostgreSQL)
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **Forms**: React Hook Form + Zod

## Common Workflows

### Adding a New Feature

1. **Define types** in `/types/[feature].ts`
2. **Create schema** in `/schemas/[feature].ts`
3. **Update database** in `db/schema.ts` (if needed)
   - Run `npm run db:generate`
   - Run `npm run db:migrate`
4. **Create service** in `/lib/services/[feature]-service.ts`
5. **Create actions** in `/app/actions/[feature].ts`
6. **Build UI** in `/components/[feature]/`
7. **Create page** in `/app/portal/[feature]/page.tsx`

### Modifying Database

1. Edit `db/schema.ts`
2. Run `npm run db:generate` (creates migration)
3. Review migration file in `migrations/`
4. Run `npm run db:migrate` (applies to DB)
5. Verify in Drizzle Studio: `npm run db:studio`
6. Commit both files: `git add db/schema.ts migrations/`

### Creating Authenticated Endpoints

1. Import `authenticatedAction` from `@/lib/services/auth-server`
2. Define Zod schema in `/schemas/`
3. Create service function in `/lib/services/`
4. Create action in `/app/actions/` using template
5. Call service from action handler
6. Revalidate affected paths

### UI Component Development

1. Check `/components/ui/` for existing primitives
2. If needed, add with: `npx shadcn@latest add [component]`
3. Compose using existing components
4. Style with Tailwind utilities
5. Support dark/light theme (use CSS variables)

## Code Coupling Rules

### When Changing One, Update the Other

- **`db/schema.ts`** ↔ Type in `/types/` (if schema changes affect types)
- **Service in `/lib/services/`** ↔ Action in `/app/actions/` (if signature changes)
- **Schema in `/schemas/`** ↔ Form component (if validation changes)
- **Server action** → Must revalidate affected page paths

## Security & Ownership

- **All server actions MUST use `authenticatedAction` or `adminAction`**
- **All service functions MUST verify userId ownership**:
  ```typescript
  where(and(
    eq(table.id, id),
    eq(table.userId, userId)  // ← Always include
  ))
  ```
- **Never trust client input** - Always validate with Zod
- **No secrets in client code** - Use server-only functions

## Language Requirements

- **Always write code comments, documentation, and user-facing text in English**
- Keep commit messages, PR descriptions, and code documentation in English for consistency

### Type Organization

- **Place types in the `/types` folder** when they are shared across the application
- Only keep types in component files if they are:
  - Props specific to that component
  - Parameters specific to a function/hook in that file
  - Not used anywhere else in the codebase
- Export commonly used types from `/types/index.ts` for easy imports

## Type System Guidelines

### Type Organization

- **Shared types** → `/types` folder (export from `/types/index.ts`)
- **Schema validation types** → same file as Zod schema in `/schemas`
- **Component-specific types** → only in file if not used elsewhere

### Type Categories (Keep Separate)

1. **Database Types**: `typeof tableName.$inferSelect` (from Drizzle ORM)
2. **Validation Types**: `z.infer<typeof schema>` (from Zod)
3. **Business Types**: Domain models in `/types` folder

**Why separate?** Each serves different purposes:
- Database types = what comes from DB (with nullables)
- Validation types = runtime input validation  
- Business types = domain model used across app

### Return Type Patterns

**Always define explicit return types** for all service functions:

- GET (nullable): `Promise<Type | null>`
- GET (array): `Promise<Type[]>`
- CREATE/UPDATE: `Promise<Type>`
- DELETE: `Promise<void>`
- With status: `Promise<{ success: boolean; data?: Type }>`

```typescript
// ✅ Good - explicit return type
export async function getUserPortfolio(userId: string): Promise<Portfolio | null> {
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.userId, userId),
  });
  return portfolio || null;
}

// ❌ Bad - inferred return type
export async function getUserPortfolio(userId: string) {
  // Missing return type
}
```

**Never define complex return types inline** - create type in `/types` and import.

### Nullable Fields

Match Drizzle's nullable returns in your types:

```typescript
// In /types/productivity.ts
export type RoadPath = {
  id: string;
  title: string;
  description: string | null;  // ✅ Nullable
  startDate: Date | null;       // ✅ Nullable
};
```

Always check nullable fields before use:
```typescript
const path = await getRoadPath(id);
if (path?.startDate) {
  const date = new Date(path.startDate);
}
```

### Utility Types Usage

Use sparingly. Prefer explicit types for clarity:

```typescript
// ✅ Preferred - explicit
export type CreateTaskData = {
  columnId: string;
  title: string;
  description?: string;
};

// ⚠️ Use only when it improves clarity
export type UpdateTaskData = Omit<CreateTaskData, "columnId">;
```

## Validation & Database Patterns

### Validation Schemas

- Location: `/schemas` folder
- Pattern: Define schema → infer type → export both
- Naming: `[name]Schema` + `[Name]Data`

```typescript
// In /schemas/board.ts
import { z } from "zod";

export const createTaskSchema = z.object({
  columnId: z.string(),
  title: z.string().min(1),
});

export type CreateTaskData = z.infer<typeof createTaskSchema>;
```

### Database Operations

When modifying `db/schema.ts`:

1. Edit schema
2. Run `npm run db:generate` 
3. Review migration in `migrations/`
4. Run `npm run db:migrate`
5. Verify with `npm run db:studio`
6. Commit both files together

**Patterns to follow:**
- Use Drizzle ORM for all operations
- Use transactions for multi-table changes
- Include foreign key constraints with cascade rules
- Add timestamps (createdAt, updatedAt) to all tables

## UI Component Patterns

- Always check `/components/ui/` for existing shadcn components first
- Add new primitives: `npx shadcn@latest add [component]`
- Follow shadcn patterns: composable, accessible, customizable
- Style with Tailwind utilities and CSS variables
- Support dark/light themes

## Code Quality Standards

- **Keep functions simple** - Extract complex logic
- **Use meaningful names** - Clear, descriptive naming
- **Avoid `any` type** - Use `unknown` with type guards if needed
- **Consult official docs** - For Zod, Drizzle, React Hook Form, etc.
- **Minimal comments** - Only for complex business logic

## Related Documentation

- [Agent Skills](./.github/skills/) - Specialized workflows (database migrations, service creation, server actions)
- [.github/copilot-instructions.md](./.github/copilot-instructions.md) - Quick reference for inline code completion
- [AI_CONTEXT.md](./AI_CONTEXT.md) - Project overview and technical stack
- [/app/actions/AGENTS.md](./app/actions/AGENTS.md) - Server actions patterns
- [/lib/services/AGENTS.md](./lib/services/AGENTS.md) - Services layer patterns
