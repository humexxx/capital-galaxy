import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";

import * as schema from "./schema";

// No `server-only` marker here on purpose: `db/seed.ts` and other tsx scripts
// import this module outside Next, where the marker package does not resolve.
// The services that wrap it carry the marker, which is where a client import
// would come from anyway.

// Only unset under SKIP_ENV_VALIDATION (a build that never queries). postgres-js
// parses the URL when the client is constructed, so it needs a well-formed one
// even then; a real request without DATABASE_URL still fails on first query.
const connectionString =
  env.DATABASE_URL ?? "postgresql://unset:unset@localhost:5432/postgres";
const url = connectionString.includes("?")
  ? `${connectionString}&sslmode=require`
  : `${connectionString}?sslmode=require`;

if (process.env.NODE_ENV === "development") {
  console.log("🔌 Connecting to DB at:", url.replace(/:[^:@]+@/, ":****@"));
}

// `prepare: false` — prepared statements aren't supported in "Transaction" pool
// mode. The timeouts recycle connections so a stale/half-open pooled connection
// (a Supabase pooler/network blip on a long-idle conn) doesn't make the next
// query hang until the server statement_timeout (~8s) fires — the symptom being
// a trivial query like the portal's user-role lookup "canceling statement due to
// statement timeout".
export const client = postgres(url, {
  prepare: false,
  idle_timeout: 20, // drop a connection after 20s idle (recycles stale ones)
  max_lifetime: 60 * 30, // hard-recycle any connection after 30 min
  connect_timeout: 10, // fail fast on connect instead of hanging
});
export const db = drizzle(client, { schema });
