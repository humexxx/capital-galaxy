# Auth

> **Status:** Active
> **Last reviewed:** 2026-09-11

## Overview
Supabase-backed authentication: email/password login, signup, password reset,
and SSR-friendly session management. Server-side action wrappers
(`authenticatedAction`, `adminAction`) enforce auth on every mutation.

## Routes
- `/login`
- `/signup`
- `/forgot-password`
- `/auth/callback` — OAuth / email confirmation callback. Surfaces failures
  instead of bouncing silently: provider `error`/`error_description` params, a
  missing `code`, and `exchangeCodeForSession` errors all redirect to
  `/login?error=<message>`, which the login form renders in its alert box.
  (Previously a failed exchange still redirected to `/portal`, whose layout
  bounced back to `/login` with no explanation.)

## Server actions — `/app/actions/`
- `auth.ts` — `signOutAction` (server-side sign-out + redirect to `/login`). Login / signup / password reset still use the Supabase client directly because they depend on `window.location.origin` for redirect URLs.

## Services — `/lib/services/`
- `auth-service.ts` — Supabase client setup
- `auth-server.ts` — `authenticatedAction`, `adminAction` wrappers (used by every mutation in the app)

## Schemas — `/schemas/`
- `user.ts`
- `auth.ts` — `loginSchema`, `signupSchema`, `forgotPasswordSchema` (+ `Data` types) backing the RHF auth forms

## Types — `/types/`
- `user.ts`

## Components
- `components/login-form.tsx`
- `components/signup-form.tsx`
- `components/forgot-password-form.tsx`

## DB tables
- `auth.users` (Supabase managed) — referenced by `users` via FK

## Notes
- **Three roles, and the role answers exactly one question**: may this account
  create investment methods? `user` (client) → no, `provider` → yes, `admin` →
  yes, plus impersonation and the admin area. **Which** methods somebody runs
  is NOT in the role — that is `investment_methods.owner_user_id`, and every
  ownership check reads it. Restating ownership in the role would give two
  sources of truth that can disagree.
- `UserRole` in [`types/user.ts`](../../types/user.ts) is the single definition,
  derived from the `USER_ROLES` tuple there; `schemas/user.ts`'s `userRoleEnum`
  is `z.enum(USER_ROLES)` and re-exports the type rather than redefining it (a
  second two-value copy there is what had made `provider` unreachable). The
  union was previously spelled out by hand in ten files, which is how a new
  role ends up half-added; `nav-config`'s `Role` is now an alias of it.
- **Impersonation refuses admin targets in both directions.** The action blocks
  starting one, and `loadEffectiveContext` re-checks on every read — a role can
  change while a session is live, and without the second check a promotion
  would leave the cookie granting admin-as-admin access for the rest of its
  30-minute life.
- Conventional Commits scope: `auth`
- **The OAuth callback validates `next`** the way the login form does (a path on this origin, no `//`); `${origin}${next}` with `next=@evil.com` used to leave the app. The proxy also bounces a signed-in user off `/forgot-password` and matches `/portal` exactly. The login page renders the sign-up hand-off `?message=`.
- **Every** server action across the app must wrap its handler in
  `authenticatedAction` or `adminAction`. If you add a new module, follow this
  pattern.
- See [`/app/actions/AGENTS.md`](../../app/actions/AGENTS.md) and
  [`/lib/services/AGENTS.md`](../../lib/services/AGENTS.md) for the canonical
  patterns.
- The three auth forms use react-hook-form + `zodResolver` with schemas from
  `/schemas/auth.ts`; submit buttons disable on `isSubmitting`.
- **Google OAuth requires Supabase dashboard config** (not in this repo):
  Auth → URL Configuration must allow-list every `redirect_to` origin —
  `http://localhost:3010/auth/callback` for dev and
  `https://allstars-galaxy.vercel.app/auth/callback` for prod. A `redirect_to`
  missing from the allow-list makes Supabase fall back to the Site URL after
  the Google handshake, dropping the code exchange (symptom: Google login
  "does nothing" / lands logged-out).
