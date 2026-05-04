# ADR-12: Better Auth as the auth library

## Status

Accepted — 2026-05-04. Supersedes the "Lucia or Auth.js" wording in ADR-2.

## Context

ADR-2 left the auth library open between Lucia and Auth.js. By Phase 0 implementation time:

1. Lucia v3 went into maintenance mode in late 2024 (the maintainer formally stopped active development and recommended users either roll their own auth with the `oslo` primitives or migrate to a successor).
2. Auth.js (NextAuth) is mature and popular but its abstractions assume OAuth-first flows; for an email + password single-user start that will grow into multi-tenant, the abstraction layer is more friction than help.
3. Better Auth (v1, released 2024) emerged as the actively-maintained spirit-successor to Lucia: lightweight, Postgres-native via a Drizzle adapter, session-based, type-safe, with email + password and social-provider plugins.

Conto needs:
- Email + password as the V1 provider (per `PLAN.md` §3 — auth provider was always email + password, no OAuth at start).
- Sessions backed by Postgres (per ADR-2 — TypeScript everywhere, Drizzle as the ORM, no extra infra).
- A clear path to add OAuth (Google / GitHub) later without rewriting auth.
- Active maintenance — auth touches enough of the stack that betting on a maintenance-mode library is a real risk.

Better Auth satisfies all four. Lucia satisfies (1)–(3) but fails (4). Auth.js satisfies (1) and (4) but its abstraction is heavier than needed for the V1 shape.

## Decision

Better Auth is the auth library for Conto. Specifically:

- `better-auth` v1.x with the Drizzle adapter against the existing Postgres database.
- Email + password provider only at Phase 0; OAuth providers can plug in later.
- Sessions stored in Better Auth's `session` table; credentials in its `account` table.
- The catch-all route at `app/api/auth/[...all]/route.ts` mounts Better Auth's request handler.
- `getCurrentUserId()` server helper at `lib/auth/server.ts` is the entry point all authenticated server code uses to scope queries.

## Consequences

- ADR-2's "Lucia or Auth.js" wording is superseded by this ADR. ADR-2 itself stands; only the auth-library option is rewritten by ADR-12.
- `users` table (PLAN.md §4) loses `password_hash` (Better Auth manages credentials in its own `account` table) and gains Better Auth's standard columns (`email_verified`, `name`, `image`, `updated_at`). `cashflow_buffer_cents` (ADR-10) is retained.
- Three new tables ship in Phase 0 alongside the §4 schema: `session`, `account`, `verification`. They are managed by Better Auth's CLI / Drizzle schema generation; Conto's domain code does not read them directly.
- `display_name` becomes `name` for consistency with Better Auth conventions.
- Adding OAuth (Google / GitHub / Apple) is a configuration change in `lib/auth/better-auth.ts`, not a rewrite.
- `next-auth` and `lucia` are NOT in `package.json`. If a future ADR supersedes this one, the migration path is straightforward (Better Auth's session shape is standard).

## References

- ADR-2: TypeScript everywhere; Drizzle ORM; Lucia or Auth.js (auth-library option superseded by this ADR).
- Spec: `Docs/superpowers/specs/2026-05-04-phase-0-foundation-design.md` §2 (auth decision) and §4.2 (Better Auth subsystem design).
