---
name: server-action-creation
description: Create server actions for client-server communication in Next.js projects. Use when building forms, mutations, or data operations triggered from the client. Follows authentication, validation, and cache revalidation patterns.
---

# Server Action Creation Workflow

This skill guides you through creating properly structured Next.js server actions.

## When to Use

- Building form handlers
- Creating data mutation operations
- Handling client-initiated server operations
- Implementing authenticated endpoints

## Action Location

All actions go in: `<actions-dir>/[feature].<ext>`

Example structure:
```
<actions-dir>/
  ├── portfolio-snapshots.<ext>
  ├── road-path.<ext>
  ├── board.<ext>
  └── admin-transactions.<ext>
```

## Action Template

```typescript
"use server";

import { authenticatedAction } from "<auth-wrapper>";
import { featureSchema } from "<schemas-dir>/feature";
import { createFeature, updateFeature, deleteFeature } from "<services-dir>/feature-service";
import { revalidatePath } from "next/cache";

// Create action
export const createFeatureAction = authenticatedAction
  .createServerAction()
  .input(featureSchema)
  .handler(async ({ input, ctx }) => {
    const result = await createFeature(ctx.user.id, input);
    revalidatePath("/path/to/revalidate");
    return result;
  });

// Update action
export const updateFeatureAction = authenticatedAction
  .createServerAction()
  .input(featureSchema.extend({ id: z.string() }))
  .handler(async ({ input, ctx }) => {
    const { id, ...data } = input;
    const result = await updateFeature(id, ctx.user.id, data);
    revalidatePath("/path/to/revalidate");
    return result;
  });

// Delete action
export const deleteFeatureAction = authenticatedAction
  .createServerAction()
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, ctx }) => {
    await deleteFeature(input.id, ctx.user.id);
    revalidatePath("/path/to/revalidate");
  });
```

## Required Patterns

### 1. File Header

Always start with:

```typescript
"use server";
```

This marks the file as containing server actions.

### 2. Authentication Wrapper

Use the appropriate wrapper:

```typescript
// For authenticated users
import { authenticatedAction } from "<auth-wrapper>";

export const myAction = authenticatedAction
  .createServerAction()
  // ...

// For admin users only
import { adminAction } from "<auth-wrapper>";

export const adminOnlyAction = adminAction
  .createServerAction()
  // ...
```

### 3. Input Validation

Always validate with Zod schema:

```typescript
import { createBoardTaskSchema } from "<schemas-dir>/board";

export const createTask = authenticatedAction
  .createServerAction()
  .input(createBoardTaskSchema)  // ← Zod validation
  .handler(async ({ input, ctx }) => {
    // input is now type-safe and validated
  });
```

### 4. Service Layer Calls

Never put business logic in actions. Call services:

```typescript
// ✅ Good - calls service
export const createTask = authenticatedAction
  .createServerAction()
  .input(createTaskSchema)
  .handler(async ({ input, ctx }) => {
    const task = await createBoardTask(ctx.user.id, input);
    revalidatePath("<task-list-path>");
    return task;
  });

// ❌ Bad - logic in action
export const createTask = authenticatedAction
  .createServerAction()
  .input(createTaskSchema)
  .handler(async ({ input, ctx }) => {
    // Direct database operations here ❌
    const [task] = await db.insert(tasks).values({
      userId: ctx.user.id,
      ...input,
    }).returning();
    revalidatePath("<task-list-path>");
    return task;
  });
```

### 5. Cache Revalidation

Always revalidate affected paths:

```typescript
import { revalidatePath } from "next/cache";

export const updateTask = authenticatedAction
  .createServerAction()
  .input(updateTaskSchema)
  .handler(async ({ input, ctx }) => {
    const task = await updateBoardTask(input.id, ctx.user.id, input);
    
    // Revalidate all affected paths
    revalidatePath("/portal/productivity/board");
    revalidatePath(`/portal/productivity/board/${task.boardId}`);
    
    return task;
  });
```

### 6. Error Handling

Actions automatically handle errors, but you can throw for specific cases:

```typescript
export const deleteTask = authenticatedAction
  .createServerAction()
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, ctx }) => {
    const task = await getBoardTask(input.id);
    
    if (!task) {
      throw new Error("Task not found");
    }
    
    if (task.userId !== ctx.user.id) {
      throw new Error("Access denied");
    }
    
    await deleteBoardTask(input.id, ctx.user.id);
    revalidatePath("/portal/productivity/board");
  });
```

## Complete Example

```typescript
// <actions-dir>/road-path.<ext>
"use server";

import { authenticatedAction } from "<auth-wrapper>";
import { 
  createRoadPathSchema, 
  updateRoadPathSchema 
} from "<schemas-dir>/road-path";
import {
  createRoadPath,
  updateRoadPath,
  deleteRoadPath,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from "<services-dir>/road-path-service";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Road Path Actions
export const createRoadPathAction = authenticatedAction
  .createServerAction()
  .input(createRoadPathSchema)
  .handler(async ({ input, ctx }) => {
    const roadPath = await createRoadPath(ctx.user.id, input);
    revalidatePath("<road-paths-list>");
    return roadPath;
  });

export const updateRoadPathAction = authenticatedAction
  .createServerAction()
  .input(updateRoadPathSchema)
  .handler(async ({ input, ctx }) => {
    const { id, ...data } = input;
    const roadPath = await updateRoadPath(id, ctx.user.id, data);
    revalidatePath("/portal/productivity/road-paths");
    revalidatePath(`/portal/productivity/road-paths/${id}`);
    return roadPath;
  });

export const deleteRoadPathAction = authenticatedAction
  .createServerAction()
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, ctx }) => {
    await deleteRoadPath(input.id, ctx.user.id);
    revalidatePath("/portal/productivity/road-paths");
  });

// Milestone Actions
export const createMilestoneAction = authenticatedAction
  .createServerAction()
  .input(z.object({
    roadPathId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    targetDate: z.date().optional(),
  }))
  .handler(async ({ input, ctx }) => {
    const milestone = await createMilestone(
      ctx.user.id,
      input.roadPathId,
      input
    );
    revalidatePath("/portal/productivity/road-paths");
    revalidatePath(`/portal/productivity/road-paths/${input.roadPathId}`);
    return milestone;
  });

export const updateMilestoneAction = authenticatedAction
  .createServerAction()
  .input(z.object({
    id: z.string(),
    roadPathId: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    targetDate: z.date().optional(),
    completed: z.boolean().optional(),
  }))
  .handler(async ({ input, ctx }) => {
    const { id, roadPathId, ...data } = input;
    const milestone = await updateMilestone(id, ctx.user.id, data);
    revalidatePath("/portal/productivity/road-paths");
    revalidatePath(`/portal/productivity/road-paths/${roadPathId}`);
    return milestone;
  });

export const deleteMilestoneAction = authenticatedAction
  .createServerAction()
  .input(z.object({
    id: z.string(),
    roadPathId: z.string(),
  }))
  .handler(async ({ input, ctx }) => {
    await deleteMilestone(input.id, ctx.user.id);
    revalidatePath("/portal/productivity/road-paths");
    revalidatePath(`/portal/productivity/road-paths/${input.roadPathId}`);
  });
```

## Naming Conventions

- **Create**: `create[Feature]Action`
- **Update**: `update[Feature]Action`
- **Delete**: `delete[Feature]Action`
- **Custom**: `[verb][Feature]Action` (e.g., `markTaskCompleteAction`)

## Client Usage

Actions are used with `useServerAction` hook:

```typescript
// In a React component
import { useServerAction } from "zsa-react";
import { createRoadPathAction } from "@/app/actions/road-path";

function CreateForm() {
  const { execute, isPending } = useServerAction(createRoadPathAction);
  
  const onSubmit = async (data: FormData) => {
    const [result, error] = await execute(data);
    
    if (error) {
      toast.error(error.message);
      return;
    }
    
    toast.success("Created successfully!");
  };
  
  return (
    <form action={onSubmit}>
      {/* form fields */}
      <button disabled={isPending}>
        {isPending ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
```

## Checklist

Before completing an action:

- [ ] File starts with `"use server"`
- [ ] Uses `authenticatedAction` or `adminAction`
- [ ] Input validated with Zod schema
- [ ] Calls service layer (no direct DB access)
- [ ] Revalidates affected paths
- [ ] Follows naming convention
- [ ] Returns appropriate type

## Acceptance Criteria

✅ Action file created in correct location
✅ "use server" directive at top
✅ Authentication wrapper applied
✅ Input validation with Zod
✅ Service layer called (no business logic)
✅ Cache revalidation implemented
✅ Proper naming convention
✅ Type-safe returns

## Project-Specific Placeholders

- `<actions-dir>`: Directory for server actions
- `<ext>`: File extension (.ts, .js, etc.)
- `<auth-wrapper>`: Authentication wrapper import path
- `<schemas-dir>`: Validation schemas directory
- `<services-dir>`: Service layer directory
- `<*-path>`: Paths to revalidate after mutations

## Common Mistakes to Avoid

1. **Missing `"use server"`** - Required at file top
2. **Business logic in actions** - Always use services
3. **No revalidation** - Always revalidate after mutations
4. **Direct DB access** - Use service layer
5. **Missing validation** - Always validate input
6. **Wrong wrapper** - Use appropriate auth wrapper
