import "server-only";

import { cache } from "react";
import { desc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { f1News, type F1NewsImage } from "@/db/schema";
import { upstreamSignal } from "./upstream";

const BASE_URL = "https://f1-motorsport-data.p.rapidapi.com";
const HOST = "f1-motorsport-data.p.rapidapi.com";
/** The provider's own window. Asking for more returns the same 25. */
const FEED_LIMIT = 25;

type RapidImage = {
  url?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
};

type RapidArticle = {
  dataSourceIdentifier?: string;
  headline?: string;
  description?: string;
  link?: string;
  images?: RapidImage[];
};

export type F1NewsArticle = {
  id: string;
  headline: string;
  description: string | null;
  link: string | null;
  images: F1NewsImage[];
  firstSeenAt: Date;
};

function articlesFrom(payload: unknown): RapidArticle[] {
  if (Array.isArray(payload)) return payload as RapidArticle[];
  const data = (payload as { data?: unknown })?.data;
  return Array.isArray(data) ? (data as RapidArticle[]) : [];
}

/**
 * Pull the provider's current window and keep whatever is new.
 *
 * The feed is the last 25 articles and nothing else — anything that falls off
 * is gone for good, which is why this stores rather than caches. Upserting on
 * the provider's own id makes a re-run idempotent: the same article arriving
 * again refreshes its row instead of adding one, and `first_seen_at` keeps the
 * first sighting so the archive stays in order.
 */
export async function refreshF1News(): Promise<{ fetched: number; stored: number }> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not configured");

  const res = await fetch(`${BASE_URL}/news?limit=${FEED_LIMIT}`, {
    signal: upstreamSignal(),
    headers: { "X-RapidAPI-Host": HOST, "X-RapidAPI-Key": key },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`rapidapi f1 ${res.status} on /news`);

  const articles = articlesFrom(await res.json());
  const rows = articles
    .filter((a) => a.dataSourceIdentifier && a.headline)
    .map((a) => ({
      articleId: String(a.dataSourceIdentifier),
      headline: a.headline as string,
      description: a.description ?? null,
      link: a.link ?? null,
      images: (a.images ?? [])
        .filter((i): i is RapidImage & { url: string } => Boolean(i.url))
        .map((i) => ({
          url: i.url,
          alt: i.alt,
          caption: i.caption,
          width: i.width,
          height: i.height,
        })),
    }));

  if (rows.length === 0) return { fetched: articles.length, stored: 0 };

  // ON CONFLICT DO UPDATE cannot touch the same row twice in one statement:
  // a repeated id in the provider's window failed the whole refresh.
  const unique = [...new Map(rows.map((r) => [r.articleId, r])).values()];

  await db
    .insert(f1News)
    .values(unique)
    .onConflictDoUpdate({
      target: f1News.articleId,
      set: {
        headline: sql`excluded.headline`,
        description: sql`excluded.description`,
        link: sql`excluded.link`,
        images: sql`excluded.images`,
        updatedAt: new Date(),
      },
    });

  return { fetched: articles.length, stored: rows.length };
}

/** One article by the provider's id, for its own page. */
/** Request-cached: `generateMetadata` and the page body share one read. */
export const getF1Article = cache(async function getF1Article(
  articleId: string
): Promise<F1NewsArticle | null> {
  const [row] = await db
    .select()
    .from(f1News)
    .where(eq(f1News.articleId, articleId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.articleId,
    headline: row.headline,
    description: row.description,
    link: row.link,
    images: row.images ?? [],
    firstSeenAt: row.firstSeenAt,
  };
});

/** The rest of the wire, for the bottom of an article's page. */
export async function getOtherF1News(
  excludeArticleId: string,
  limit = 6
): Promise<F1NewsArticle[]> {
  const rows = await db
    .select()
    .from(f1News)
    .where(ne(f1News.articleId, excludeArticleId))
    .orderBy(desc(f1News.firstSeenAt), desc(f1News.articleId))
    .limit(limit);

  return rows.map((r) => ({
    id: r.articleId,
    headline: r.headline,
    description: r.description,
    link: r.link,
    images: r.images ?? [],
    firstSeenAt: r.firstSeenAt,
  }));
}

/**
 * The stored archive, newest first.
 *
 * Reads the table, never the provider: the page should not depend on a
 * third-party call, and the daily refresh is what keeps this current.
 */
export async function getF1News(limit = 12): Promise<F1NewsArticle[]> {
  const rows = await db
    .select()
    .from(f1News)
    .orderBy(desc(f1News.firstSeenAt), desc(f1News.articleId))
    .limit(limit);

  return rows.map((r) => ({
    id: r.articleId,
    headline: r.headline,
    description: r.description,
    link: r.link,
    images: r.images ?? [],
    firstSeenAt: r.firstSeenAt,
  }));
}
