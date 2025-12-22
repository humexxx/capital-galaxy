# AI Context & Project Guidelines

## Project Overview
This project, **Capital Galaxy**, is a modern web application built with the Next.js framework.
It uses Supabase for backend services (Auth, Database) and Drizzle ORM for type-safe database interactions.

## Technology Stack
- **OS**: Windows (PowerShell)
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI**: React 19, Tailwind CSS v4, Shadcn UI, Lucide React
- **Backend/Auth**: Supabase
- **Database ORM**: Drizzle ORM (PostgreSQL)
- **Package Manager**: npm

## Architecture & Conventions

### Directory Structure
- `/app`: Application routes and pages (Next.js App Router).
- `/components`: Reusable UI components.
  - `/ui`: Primitive UI components (buttons, inputs, etc.), often from Shadcn.
- `/db`: Database schema and connection configuration.
  - `schema.ts`: Drizzle schema definitions.
- `/lib`: Utility functions and shared logic.
- `/supabase`: Supabase specific configurations or seeds.
- `/migrations`: Drizzle migration files.

### Key Commands
- **Development**: `npm run dev`
- **Lint**: `npm run lint`
- **Database Generation**: `npm run db:generate` (Generate migrations from schema)
- **Database Migration**: `npm run db:migrate` (Apply migrations)
- **Database Studio**: `npm run db:studio` (View DB via Drizzle Studio)

### Coding Standards
- **Styling**: Use Tailwind CSS utility classes. Avoid arbitrary values where possible.
- **Components**: Prefer functional components with proper TypeScript interfaces.
- **State Management**: Use React Server Components (RSC) where possible; use Client Components ('use client') only when interactivity is needed.
- **Imports**: Use absolute imports (e.g., `@/components/ui/button`) configured in `tsconfig.json`.

## Agent Guidelines
1. **Context Awareness**: Always check `AI_CONTEXT.md` (this file) and `package.json` to understand the environment.
2. **Windows Compatibility**: Ensure all shell commands proposed are PowerShell compatible.
3. **Database Changes**: Always use Drizzle Kit to manage schema changes (`npm run db:generate` -> `npm run db:migrate`). Do not manually alter the database unless necessary.
