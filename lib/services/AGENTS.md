# Services Layer - Agent Instructions

## Purpose

Services contain **business logic** and **data access** for the application. They sit between server actions and the database, providing a clean separation of concerns.

## File Organization

```
lib/services/
  ├── feature-service.ts      # Main service for a feature
  ├── feature-utils-service.ts # Helper utilities
  └── AGENTS.md               # This file
```

## TypeScript Best Practices

### Always Use Explicit Return Types

```typescript
// ❌ DON'T rely on inference
export async function getUser(userId: string) {
  return await db.query.users.findFirst(...);
}

// ✅ DO use explicit types
export async function getUser(userId: string): Promise<User | null> {
  return await db.query.users.findFirst(...);
}
```

**Why?**
- Better IDE autocomplete
- Clearer API contracts
- Easier to catch errors
- Self-documenting code

### Import Types from /types

Always import domain types from `/types` directory:

```typescript
import type { User, UserWithPosts } from "@/types";
import type { CreateUserData, UpdateUserData } from "@/schemas/user";
```

### Handle Nullable Fields

Database columns can be nullable. Handle them explicitly:

```typescript
export async function calculateStats(userId: string): Promise<Stats> {
  const user = await getUser(userId);
  
  // Handle nullable date
  const startDate = user.createdAt ? new Date(user.createdAt) : new Date();
  
  // Provide defaults for nullable values
  const score = user.score ?? 0;
}
```

## Service Patterns

### Basic CRUD Operations

```typescript
export async function getThings(userId: string): Promise<Thing[]> {
  return await db.query.things.findMany({
    where: eq(things.userId, userId),
  });
}

export async function getThing(id: string, userId: string): Promise<Thing | null> {
  return await db.query.things.findFirst({
    where: and(eq(things.id, id), eq(things.userId, userId)),
  });
}

export async function createThing(userId: string, data: CreateThingData): Promise<Thing> {
  const [thing] = await db
    .insert(things)
    .values({ userId, ...data })
    .returning();
  return thing;
}

export async function updateThing(
  id: string,
  userId: string,
  data: Partial<UpdateThingData>
): Promise<Thing> {
  const [thing] = await db
    .update(things)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(things.id, id), eq(things.userId, userId)))
    .returning();
  return thing;
}

export async function deleteThing(id: string, userId: string): Promise<void> {
  await db
    .delete(things)
    .where(and(eq(things.id, id), eq(things.userId, userId)));
}
```

### Complex Queries with Relations

```typescript
export async function getThingWithRelations(
  id: string,
  userId: string
): Promise<ThingWithDetails | null> {
  return await db.query.things.findFirst({
    where: and(eq(things.id, id), eq(things.userId, userId)),
    with: {
      subThings: {
        orderBy: [asc(subThings.order)],
      },
      owner: true,
    },
  });
}
```

### Calculations and Business Logic

```typescript
export async function calculateProgress(thingId: string, userId: string): Promise<ProgressStats> {
  const thing = await getThing(thingId, userId);
  if (!thing) {
    throw new Error("Thing not found");
  }

  const total = parseFloat(thing.targetValue ?? "0");
  const current = parseFloat(thing.currentValue ?? "0");
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return {
    percentage,
    remaining: total - current,
    isComplete: current >= total,
  };
}
```

### Batch Operations

```typescript
export async function processMultipleThings(
  userId: string,
  thingIds: string[]
): Promise<Thing[]> {
  const results: Thing[] = [];

  for (const id of thingIds) {
    const thing = await processThing(id, userId);
    results.push(thing);
  }

  return results;
}
```

## Data Transformation

### Converting Database Types

```typescript
// Database stores as string/numeric, convert to number for business logic
export async function calculateTotal(userId: string): Promise<number> {
  const items = await getItems(userId);
  return items.reduce((sum, item) => sum + parseFloat(item.amount), 0);
}

// Convert booleans (stored as 0/1 in some DBs)
export async function updateStatus(id: string, isActive: boolean): Promise<Thing> {
  const [thing] = await db
    .update(things)
    .set({ isActive: isActive ? 1 : 0 })
    .where(eq(things.id, id))
    .returning();
  return thing;
}
```

## Error Handling

```typescript
export async function getThing(id: string, userId: string): Promise<Thing | null> {
  const thing = await db.query.things.findFirst({
    where: and(eq(things.id, id), eq(things.userId, userId)),
  });
  
  // Return null for "not found" - let caller decide how to handle
  return thing || null;
}

export async function requireThing(id: string, userId: string): Promise<Thing> {
  const thing = await getThing(id, userId);
  
  if (!thing) {
    // Throw for required resources
    throw new Error("Thing not found");
  }
  
  return thing;
}
```

## Security Guidelines

### Always Verify Ownership

```typescript
// ✅ GOOD - Checks userId
export async function updateThing(id: string, userId: string, data: UpdateData): Promise<Thing> {
  const [thing] = await db
    .update(things)
    .set(data)
    .where(and(
      eq(things.id, id),
      eq(things.userId, userId) // Ensures user owns this resource
    ))
    .returning();
  
  if (!thing) {
    throw new Error("Thing not found or access denied");
  }
  
  return thing;
}

// ❌ BAD - Missing userId check
export async function updateThing(id: string, data: UpdateData): Promise<Thing> {
  const [thing] = await db
    .update(things)
    .set(data)
    .where(eq(things.id, id)) // Anyone can update any thing!
    .returning();
  
  return thing;
}
```

## Checklist for New Services

- [ ] All functions have explicit return types
- [ ] Imported types from `/types` and `/schemas`
- [ ] Handle nullable database fields properly
- [ ] Verify ownership with userId checks
- [ ] Throw errors for truly exceptional cases
- [ ] Return null for "not found" (let caller handle)
- [ ] Use transactions for multi-table operations
- [ ] Follow naming conventions (get*, create*, update*, delete*)
- [ ] Add utility functions (getNext*, calculate*, etc.)

## Common Patterns Reference

### Get Next Order Number
```typescript
export async function getNextOrder(parentId: string, userId: string): Promise<number> {
  const items = await db.query.things.findMany({
    where: and(eq(things.parentId, parentId), eq(things.userId, userId)),
    orderBy: [desc(things.order)],
    limit: 1,
  });
  
  return items.length > 0 ? items[0].order + 1 : 0;
}
```

### Initialize Default Records
```typescript
export async function initializeDefaults(userId: string): Promise<Thing[]> {
  const existing = await db.query.things.findMany({
    where: eq(things.userId, userId),
  });

  if (existing.length > 0) {
    return existing;
  }

  const defaults = [
    { name: "Default 1", order: 0 },
    { name: "Default 2", order: 1 },
  ];

  return await db
    .insert(things)
    .values(defaults.map((d) => ({ userId, ...d })))
    .returning();
}
```

### Complex Reordering Logic
```typescript
export async function reorderItem(
  itemId: string,
  userId: string,
  newOrder: number
): Promise<Thing> {
  // 1. Get current item
  const item = await getThing(itemId, userId);
  if (!item) throw new Error("Item not found");

  const oldOrder = item.order;

  // 2. Shift other items
  if (newOrder > oldOrder) {
    await db
      .update(things)
      .set({ order: sql`"order" - 1` })
      .where(
        and(
          eq(things.userId, userId),
          gt(things.order, oldOrder),
          lte(things.order, newOrder)
        )
      );
  } else if (newOrder < oldOrder) {
    await db
      .update(things)
      .set({ order: sql`"order" + 1` })
      .where(
        and(
          eq(things.userId, userId),
          gte(things.order, newOrder),
          lt(things.order, oldOrder)
        )
      );
  }

  // 3. Update item order
  return await updateThing(itemId, userId, { order: newOrder });
}
```
