import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Bearer check for the cron routes.
 *
 * Reads `CRON_SECRET` at request time, not module load: a module-scope throw
 * made every `next build` without the secret fail while collecting page data,
 * and an unset secret should refuse requests, not builds. Fails closed.
 */
export function isCronAuthorized(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (!authHeader || authHeader.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}
