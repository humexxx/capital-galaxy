# AI Agent Instructions

## Language Requirements

- **Always write code comments, documentation, and user-facing text in English**
- Keep commit messages, PR descriptions, and code documentation in English for consistency

## Type System Guidelines

### Type Organization

- **Place types in the `/types` folder** when they are shared across the application
- Only keep types in component files if they are:
  - Props specific to that component
  - Parameters specific to a function/hook in that file
  - Not used anywhere else in the codebase
- Export commonly used types from `/types/index.ts` for easy imports

### Type Separation Philosophy

Keep these three categories of types separate:

1. **Database Types** (from Drizzle ORM): `typeof tableName.$inferSelect`
2. **Validation Types** (from Zod schemas): `z.infer<typeof schema>`
3. **Business Types** (in `/types` folder): Domain models used across the application

Do not mix these. Each serves a different purpose:
- Database types represent what comes from the database (with nullables)
- Validation types represent runtime input validation
- Business types represent your domain model

### Explicit Return Types

**Always define explicit return types** for service functions and complex operations:

```typescript
// ✅ Good - explicit return type using imported type
export async function getUserPortfolio(userId: string): Promise<Portfolio | null> {
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.userId, userId),
  });
  return portfolio || null;
}

// ✅ Good - using defined type from /types
export async function getAdminTransactions(filters?: TransactionFilter): Promise<AdminTransactionRow[]> {
  // ...
}

// ❌ Bad - inferred return type
export async function getUserPortfolio(userId: string) {
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.userId, userId),
  });
  return portfolio || null;
}

// ❌ Bad - inline complex type definition
export async function getAdminTransactions(): Promise<Array<{
  id: string;
  amount: string;
  // ... many more fields
}>> {
  // ...
}
```

**Return Type Patterns:**
- GET operations that may not find data: `Promise<Type | null>`
- GET operations that always return data: `Promise<Type>` or `Promise<Type[]>`
- CREATE/UPDATE operations: `Promise<Type>`
- DELETE operations: `Promise<void>`
- Operations with results: `Promise<{ success: boolean; data?: Type }>`

**Important:** Never define complex return types inline. Always create a type in `/types` and import it.

### Nullable Fields

**Handle nullable fields explicitly** to match Drizzle's return types:

```typescript
// In /types/productivity.ts
export type RoadPath = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startDate: Date | null;  // ✅ Matches Drizzle return
  targetDate: Date | null;
  // ...
};

// In services, convert when needed
const roadPath = await db.query.roadPaths.findFirst(...);
if (roadPath?.startDate) {
  const startDate = new Date(roadPath.startDate); // Safe conversion
}
```

**Never assume nullable fields are present** - always check or provide defaults.

### Using Utility Types

Use TypeScript utility types sparingly and only when they improve clarity:

- `Omit<Type, 'field'>` - When you need most properties except specific ones
- `Pick<Type, 'field'>` - When you need only specific properties (rarely needed)
- `Partial<Type>` - For optional updates (prefer explicit types)

**Prefer explicit types over utility types** for better documentation and IDE support:

```typescript
// ✅ Preferred - explicit and clear
export type CreateBoardTaskData = {
  columnId: string;
  title: string;
  description?: string;
  priority?: string;
};

// ❌ Avoid - less clear what's excluded and why
export type CreateBoardTaskData = Omit<BoardTask, 'id' | 'createdAt' | 'updatedAt'>;
```

Use `Omit<>` only in services when you receive validated data but need to exclude the `id`:

```typescript
export async function updateBoardTask(
  id: string,
  data: Omit<UpdateBoardTaskData, "id">
): Promise<BoardTask> {
  // Implementation
}
```

## Validation Schemas

- **Place Zod validation schemas in `/schemas` folder** for all forms and data validation
- **Define associated TypeScript types in the same schema file** using `z.infer<typeof schema>`
- Keep schema-related types with their schemas rather than in `/types` folder
- Use consistent naming: `[name]Schema` for schemas, `[Name]Data` for inferred types
- Export both the schema and its type from the schema file

## Database Schema Changes

When modifying database schemas in `db/schema.ts`:

1. **Generate migration**: Run `npm run db:generate` to create migration files
2. **Apply migration**: Run `npm run db:migrate` to apply changes to the database
3. Always commit both the schema changes and generated migration files together

## UI Components

- **Always use shadcn/ui components** when building UI elements
- Check `/components/ui` folder for available shadcn components before creating custom UI elements
- Follow shadcn/ui patterns: composable, accessible, and customizable components
- Maintain consistent styling using Tailwind CSS utilities and CSS variables
- Prefer minimalist designs that align with shadcn/ui's design philosophy

## Code Quality

- **Keep functions simple**: Extract complex logic into smaller, focused functions
- **Use meaningful names**: Function and variable names should clearly describe their purpose
- **Avoid `any` type**: Always define proper TypeScript types and interfaces. Use `unknown` if the type is truly unknown, then narrow it with type guards
- **Consult official documentation**: When using major libraries (Zod, Drizzle, React Hook Form, etc.), always reference their official documentation for the correct API usage and avoid deprecated methods
- **Minimal comments**: Avoid excessive JSDoc or inline comments. Only add comments when truly necessary to explain complex business logic or non-obvious decisions. Let clean, self-documenting code speak for itself

## Project Structure

- `/app/actions` - Server actions
- `/app/api` - API routes
- `/components` - React components
- `/lib/services` - Business logic and data services
- `/types` - Shared TypeScript types and interfaces (excludes schema-related types)
- `/db` - Database schema and migrations
- `/schemas` - Zod validation schemas with their TypeScript types

## Database Patterns

- Use Drizzle ORM for all database operations
- Always use transactions for operations that modify multiple tables
- Include proper foreign key constraints and cascade rules
- Add timestamps (createdAt, updatedAt) to all tables
