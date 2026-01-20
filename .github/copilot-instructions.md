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

## Database Schema Changes

When modifying database schemas in `db/schema.ts`:

1. **Generate migration**: Run `npm run db:generate` to create migration files
2. **Apply migration**: Run `npm run db:migrate` to apply changes to the database
3. Always commit both the schema changes and generated migration files together

## Code Quality

- **Keep functions simple**: Extract complex logic into smaller, focused functions
- **Use meaningful names**: Function and variable names should clearly describe their purpose

## Project Structure

- `/app/actions` - Server actions
- `/app/api` - API routes
- `/components` - React components
- `/lib/services` - Business logic and data services
- `/types` - Shared TypeScript types and interfaces
- `/db` - Database schema and migrations
- `/schemas` - Zod validation schemas

## Database Patterns

- Use Drizzle ORM for all database operations
- Always use transactions for operations that modify multiple tables
- Include proper foreign key constraints and cascade rules
- Add timestamps (createdAt, updatedAt) to all tables
