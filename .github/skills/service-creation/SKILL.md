---
name: service-creation
description: Create new service functions for business logic and data access. Use when adding data operations, business logic, or database queries. Follows proper TypeScript patterns and return type conventions.
---

# Service Creation Workflow

This skill guides you through creating properly structured service functions following clean architecture patterns.

## When to Use

- Creating new data access functions
- Adding business logic operations
- Implementing database queries
- Building reusable data operations

## Service Location

All services go in: `<services-dir>/[feature]-service.<ext>`

Example structure:
```
<services-dir>/
  ├── portfolio-service.<ext>
  ├── transaction-service.<ext>
  ├── road-path-service.<ext>
  └── auth-service.<ext>
```

## Service Template

```typescript
import { db } from "<db-client>";
import { tableName } from "<schema-file>";
import { eq, and, desc } from "<orm>";
import type { TypeName } from "<types-dir>";

// GET operations (may not find data)
export async function getResourceById(
  id: string
): Promise<TypeName | null> {
  const result = await db.query.tableName.findFirst({
    where: eq(tableName.id, id),
  });
  
  return result || null;
}

// GET operations (always return data)
export async function getAllResources(
  userId: string
): Promise<TypeName[]> {
  const results = await db.query.tableName.findMany({
    where: eq(tableName.userId, userId),
    orderBy: [desc(tableName.createdAt)],
  });
  
  return results;
}

// CREATE operations
export async function createResource(
  userId: string,
  data: CreateResourceData
): Promise<TypeName> {
  const [resource] = await db
    .insert(tableName)
    .values({
      id: crypto.randomUUID(),
      userId,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
    
  return resource;
}

// UPDATE operations
export async function updateResource(
  id: string,
  userId: string,
  data: UpdateResourceData
): Promise<TypeName> {
  const [updated] = await db
    .update(tableName)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(
      eq(tableName.id, id),
      eq(tableName.userId, userId) // Always verify ownership
    ))
    .returning();
    
  if (!updated) {
    throw new Error("Resource not found or access denied");
  }
  
  return updated;
}

// DELETE operations
export async function deleteResource(
  id: string,
  userId: string
): Promise<void> {
  await db
    .delete(tableName)
    .where(and(
      eq(tableName.id, id),
      eq(tableName.userId, userId) // Always verify ownership
    ));
}
```

## Required Patterns

### 1. Explicit Return Types

**Always** define explicit return types:

```typescript
// ✅ Good - explicit return type
export async function getUser(id: string): Promise<User | null> {
  // ...
}

// ❌ Bad - inferred return type
export async function getUser(id: string) {
  // ...
}
```

### 2. Return Type Conventions

- **GET (nullable)**: `Promise<Type | null>`
- **GET (array)**: `Promise<Type[]>`
- **CREATE/UPDATE**: `Promise<Type>`
- **DELETE**: `Promise<void>`
- **With result status**: `Promise<{ success: boolean; data?: Type }>`

### 3. Import Types

Never define types inline. Always import from `<types-dir>`:

```typescript
// ✅ Good - imported type
import type { Portfolio } from "<types-dir>";
export async function getPortfolio(): Promise<Portfolio | null> { }

// ❌ Bad - inline type
export async function getPortfolio(): Promise<{
  id: string;
  // ... many fields
}> { }
```

### 4. Handle Nullable Fields

Match ORM's nullable returns:

```typescript
// In <types-dir>
export type RoadPath = {
  id: string;
  title: string;
  description: string | null;  // Nullable
  startDate: Date | null;       // Nullable
};

// In service
const path = await db.query.roadPaths.findFirst(...);
if (path?.startDate) {
  const date = new Date(path.startDate);
}
```

### 5. Ownership Verification

Always verify user ownership:

```typescript
export async function updateResource(
  id: string,
  userId: string,  // ← Always require userId
  data: UpdateData
): Promise<Resource> {
  const [updated] = await db
    .update(resources)
    .set(data)
    .where(and(
      eq(resources.id, id),
      eq(resources.userId, userId)  // ← Verify ownership
    ))
    .returning();
    
  if (!updated) {
    throw new Error("Resource not found or access denied");
  }
  
  return updated;
}
```

### 6. Use Transactions

For multi-table operations:

```typescript
export async function createWithRelated(
  userId: string,
  data: CreateData
): Promise<Result> {
  return await db.transaction(async (tx) => {
    const [parent] = await tx
      .insert(parents)
      .values({ userId, ...data.parent })
      .returning();
      
    const children = await tx
      .insert(children)
      .values(
        data.children.map(child => ({
          parentId: parent.id,
          ...child,
        }))
      )
      .returning();
      
    return { parent, children };
  });
}
```

## Naming Conventions

Follow these naming patterns:

- **Get single**: `getResourceById`, `getResourceBySlug`
- **Get multiple**: `getAllResources`, `getResourcesByFilter`
- **Create**: `createResource`
- **Update**: `updateResource`
- **Delete**: `deleteResource`
- **Utilities**: `calculateTotal`, `formatResource`, `validateResource`

## Complete Example

```typescript
// <services-dir>/portfolio-service.<ext>
import { db } from "<db-client>";
import { portfolios, transactions } from "<schema-file>";
import { eq, and, desc, sum, sql } from "<orm>";
import type { Portfolio, Transaction } from "<types-dir>";
import type { CreatePortfolioData, UpdatePortfolioData } from "<schemas-dir>/portfolio";

export async function getPortfolioByUserId(
  userId: string
): Promise<Portfolio | null> {
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.userId, userId),
    with: {
      transactions: {
        orderBy: [desc(transactions.date)],
        limit: 10,
      },
    },
  });
  
  return portfolio || null;
}

export async function createPortfolio(
  userId: string,
  data: CreatePortfolioData
): Promise<Portfolio> {
  const [portfolio] = await db
    .insert(portfolios)
    .values({
      id: crypto.randomUUID(),
      userId,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
    
  return portfolio;
}

export async function calculatePortfolioValue(
  portfolioId: string
): Promise<number> {
  const result = await db
    .select({
      total: sum(transactions.amount),
    })
    .from(transactions)
    .where(eq(transactions.portfolioId, portfolioId));
    
  return Number(result[0]?.total || 0);
}
```

## Checklist

Before completing a service:

- [ ] All functions have explicit return types
- [ ] Types imported from `<types-dir>` and `<schemas-dir>`
- [ ] Nullable database fields handled properly
- [ ] Ownership verified with userId checks
- [ ] Errors thrown for exceptional cases only
- [ ] Return null for "not found" (let caller handle)
- [ ] Transactions used for multi-table operations
- [ ] Naming conventions followed
- [ ] Utility functions added if needed

## Acceptance Criteria

✅ Service file created in correct location
✅ All functions have explicit return types
✅ Types properly imported (not inline)
✅ Ownership verification in place
✅ Error handling implemented
✅ Transaction usage where needed
✅ Tests added (if required)

## Project-Specific Placeholders

- `<services-dir>`: Directory for service layer files
- `<ext>`: File extension (.ts, .js, etc.)
- `<db-client>`: Database client import path
- `<schema-file>`: Schema definitions import path
- `<orm>`: ORM library name
- `<types-dir>`: Shared types directory
- `<schemas-dir>`: Validation schemas directory

## Common Mistakes to Avoid

1. **Inline types** - Always import from `<types-dir>`
2. **Missing ownership checks** - Always verify userId
3. **Inferred return types** - Always be explicit
4. **Ignoring null** - Handle nullable fields
5. **No transactions** - Use for multi-table ops
6. **Poor naming** - Follow conventions
