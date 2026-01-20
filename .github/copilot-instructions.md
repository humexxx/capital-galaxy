# GitHub Copilot Instructions

## Language Requirements

- **Always write code comments, documentation, and user-facing text in English**
- Keep commit messages, PR descriptions, and code documentation in English for consistency

## Type System Guidelines

- **Place types in the `/types` folder** when they are shared across the application
- Only keep types in component files if they are:
  - Props specific to that component
  - Parameters specific to a function/hook in that file
  - Not used anywhere else in the codebase
- Export commonly used types from `/types/index.ts` for easy imports

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
