# Capital Galaxy - Complete Project Setup

Setting up the Capital Galaxy project following the comprehensive setup guide. This includes creating the proper folder structure, installing dependencies, configuring theme support, authentication with Supabase, forms with validation, database setup, and CI/CD automation.

## User Review Required

> [!IMPORTANT]
> **Supabase Configuration**: You'll need to provide Supabase credentials (project URL and anon key) when we reach the authentication setup phase. We'll create a `.env.local` file for these values.

> [!IMPORTANT]
> **Database Selection**: The guide mentions Drizzle ORM with PostgreSQL. Please confirm if you want to use Supabase's PostgreSQL or a separate database instance.

> [!NOTE]
> **GitHub Actions**: The semantic-release workflow requires a GitHub repository with `main` and `develop` branches. This will be configured but won't run until the repo is set up.

---

## Proposed Changes

### Phase 1: Folder Structure & Core Utilities

#### [NEW] Directory Structure
Creating the following directories:
- `lib/services/` - API service layer
- `lib/utils/` - Utility functions
- `lib/constants/` - Application constants
- `lib/templates/` - Templates (PDFs, emails)
- `types/` - TypeScript type definitions
- `schemas/` - Zod validation schemas
- `hooks/` - Custom React hooks
- `db/` - Database schema and migrations
- `scripts/` - Utility scripts
- `public/images/` - Organized image assets
- `docs/` - Project documentation
- `components/` - React components (if not exists)

#### [NEW] [lib/utils.ts](file:///c:/Users/jahum/code/capital-galaxy/lib/utils.ts)
Core utility functions including the `cn()` helper for class name merging with Tailwind.

#### [NEW] [lib/env.ts](file:///c:/Users/jahum/code/capital-galaxy/lib/env.ts)
Centralized environment variable management with type safety.

---

### Phase 2: Theme System (Dark/Light Mode)

#### Dependencies
Install `next-themes` for theme management.

#### [NEW] [components/theme-provider.tsx](file:///c:/Users/jahum/code/capital-galaxy/components/theme-provider.tsx)
Client-side theme provider wrapping the application.

#### [NEW] [components/mode-toggle.tsx](file:///c:/Users/jahum/code/capital-galaxy/components/mode-toggle.tsx)
UI component for toggling between light/dark/system themes.

#### [MODIFY] [app/globals.css](file:///c:/Users/jahum/code/capital-galaxy/app/globals.css)
Add CSS variables for light and dark themes following the Tailwind v4 inline theme pattern.

#### [MODIFY] [app/layout.tsx](file:///c:/Users/jahum/code/capital-galaxy/app/layout.tsx)
Integrate ThemeProvider with `suppressHydrationWarning` attribute.

---

### Phase 3: Layout & Navigation

#### shadcn/ui Sidebar
Install sidebar component using: `npx shadcn@latest add sidebar-12`

This provides:
- Responsive sidebar with mobile drawer
- AppSidebar component pre-configured
- Header/AppBar integration
- Collapsible navigation

---

### Phase 4: Authentication (Supabase)

#### Dependencies
Install `@supabase/supabase-js` and `@supabase/ssr`.

#### [NEW] [.env.local](file:///c:/Users/jahum/code/capital-galaxy/.env.local)
Environment variables for Supabase configuration (user will provide values).

#### [NEW] [lib/supabase.ts](file:///c:/Users/jahum/code/capital-galaxy/lib/supabase.ts)
Client-side Supabase client using `@supabase/ssr`.

#### [NEW] [lib/supabase-server.ts](file:///c:/Users/jahum/code/capital-galaxy/lib/supabase-server.ts)
Server-side Supabase client with cookie handling.

#### [NEW] [middleware.ts](file:///c:/Users/jahum/code/capital-galaxy/middleware.ts)
Authentication middleware for protected routes.

#### [NEW] [app/auth/callback/route.ts](file:///c:/Users/jahum/code/capital-galaxy/app/auth/callback/route.ts)
OAuth callback handler for Supabase auth flow.

#### Auth Pages
Install login and signup pages using:
- `npx shadcn@latest add login-02`
- `npx shadcn@latest add signup-02`

Then customize with Supabase integration.

---

### Phase 5: Forms & Validation

#### Dependencies
Install `react-hook-form`, `@hookform/resolvers`, and `zod`.

#### [NEW] [schemas/user.ts](file:///c:/Users/jahum/code/capital-galaxy/schemas/user.ts)
Example Zod schema for user validation.

#### [NEW] Example Form Component
Demonstrate the pattern of using react-hook-form + Zod + shadcn/ui Form components.

---

### Phase 6: Database (Drizzle ORM)

#### Dependencies
Install `drizzle-orm` and `drizzle-kit`.

#### [NEW] [drizzle.config.ts](file:///c:/Users/jahum/code/capital-galaxy/drizzle.config.ts)
Drizzle configuration for PostgreSQL.

#### [NEW] [db/schema.ts](file:///c:/Users/jahum/code/capital-galaxy/db/schema.ts)
Example database schema with users table.

#### [MODIFY] [package.json](file:///c:/Users/jahum/code/capital-galaxy/package.json)
Add database scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:seed`.

---

### Phase 7: GitHub Actions & Semantic Release

#### [NEW] [.releaserc.json](file:///c:/Users/jahum/code/capital-galaxy/.releaserc.json)
Semantic release configuration with conventional commits.

#### [NEW] [.github/workflows/release.yml](file:///c:/Users/jahum/code/capital-galaxy/.github/workflows/release.yml)
Automated release workflow for main branch.

#### [NEW] [.github/workflows/sync-develop.yml](file:///c:/Users/jahum/code/capital-galaxy/.github/workflows/sync-develop.yml)
Workflow to sync develop branch after releases.

#### Dependencies
Install semantic-release packages.

---

### Phase 8: Documentation

#### [NEW] [docs/setup-guide.md](file:///c:/Users/jahum/code/capital-galaxy/docs/setup-guide.md)
Copy of the comprehensive setup guide for reference.

#### [NEW] [.github/copilot-instructions.md](file:///c:/Users/jahum/code/capital-galaxy/.github/copilot-instructions.md)
Project conventions and best practices for AI assistants.

#### [MODIFY] [README.md](file:///c:/Users/jahum/code/capital-galaxy/README.md)
Update with project overview and quick start guide.

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify TypeScript compilation
- Run `npm run lint` to check code quality
- Test theme toggle functionality
- Verify form validation with Zod schemas

### Manual Verification
- Test dark/light mode switching
- Navigate through sidebar/layout
- Test authentication flow (once Supabase is configured)
- Verify database migrations (once DB is configured)
- Check that all imports resolve correctly
