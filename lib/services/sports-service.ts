import "server-only";

import { cache } from "react";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { userSportsPreferences } from "@/db/schema";
import { F1_DATA } from "@/lib/data/sports/f1";
import { getFootballLeagues } from "@/lib/data/sports/football";
import { LOL_DATA } from "@/lib/data/sports/lol";
import { NBA_DATA } from "@/lib/data/sports/nba";
import { NFL_DATA } from "@/lib/data/sports/nfl";
import { PADEL_DATA } from "@/lib/data/sports/padel";
import { SPORTS_BY_ID } from "@/lib/data/sports/registry";
import { TENNIS_DATA } from "@/lib/data/sports/tennis";
import { WORLD_CUP_DATA } from "@/lib/data/sports/world-cup";
import {
  getFootballData,
  getWorldCupData,
} from "@/lib/services/football-data-service";
import { getF1Data } from "@/lib/services/jolpica-f1-service";
import { getLolData } from "@/lib/services/lolesports-service";
import { getPadelData } from "@/lib/services/padel-api-service";
import { getTennisData } from "@/lib/services/thesportsdb-tennis-service";
import type {
  DashboardSportHighlight,
  F1Data,
  FootballLeagueData,
  LolData,
  Match,
  PadelData,
  SportId,
  Team,
  TennisData,
  UserSportsPreference,
} from "@/types/sports";

// ---------- Favourite CRUD ----------

export async function listUserSportsFavorites(
  userId: string
): Promise<UserSportsPreference[]> {
  return db
    .select()
    .from(userSportsPreferences)
    .where(eq(userSportsPreferences.userId, userId))
    .orderBy(asc(userSportsPreferences.createdAt));
}

/**
 * Request-cached: the dashboard's sports card, its F1 card and the summary
 * builder all ask for the same list during one render.
 */
export const listUserFavoriteSportIds = cache(async function listUserFavoriteSportIds(
  userId: string
): Promise<SportId[]> {
  const rows = await listUserSportsFavorites(userId);
  return rows.map((row) => row.sportId as SportId);
});

export async function setSportFavorite(
  userId: string,
  sportId: SportId,
  isFavorite: boolean
): Promise<void> {
  if (isFavorite) {
    await db
      .insert(userSportsPreferences)
      .values({ userId, sportId })
      .onConflictDoNothing({
        target: [userSportsPreferences.userId, userSportsPreferences.sportId],
      });
    return;
  }
  await db
    .delete(userSportsPreferences)
    .where(
      and(
        eq(userSportsPreferences.userId, userId),
        eq(userSportsPreferences.sportId, sportId)
      )
    );
}

// ---------- Dashboard summary ----------

/**
 * Build a compact dashboard highlight for each favourite sport. LoL pulls from
 * Lolesports, F1 from Jolpica (both cached); the rest are mock fixtures. When
 * more APIs are wired in, this function stays the single place to swap
 * implementations.
 */
/**
 * The dashboard's per-sport highlights.
 *
 * `exclude` is how F1 stays out of this card: it has one of its own that
 * carries the same highlight plus its news, and the same race in two cards
 * next to each other is just the same race twice.
 */
export async function getDashboardSportsSummary(
  userId: string,
  exclude: readonly SportId[] = []
): Promise<DashboardSportHighlight[]> {
  const all = await listUserFavoriteSportIds(userId);
  const favIds = all.filter((id) => !exclude.includes(id));
  const [lolData, f1Data, footballLeagues, worldCupData, padelData, tennisData] =
    await Promise.all([
      favIds.includes("lol") ? getLolData() : Promise.resolve(null),
      favIds.includes("f1") ? getF1Data() : Promise.resolve(null),
      favIds.includes("football")
        ? getFootballData()
        : Promise.resolve(null),
      favIds.includes("worldcup") ? getWorldCupData() : Promise.resolve(null),
      favIds.includes("padel") ? getPadelData() : Promise.resolve(null),
      favIds.includes("tennis") ? getTennisData() : Promise.resolve(null),
    ]);
  return favIds
    .map((id) =>
      buildHighlight(id, {
        lolData,
        f1Data,
        footballLeagues,
        worldCupData,
        padelData,
        tennisData,
      }),
    )
    .filter((h): h is DashboardSportHighlight => h !== null);
}

/** Just F1's highlight, for the card that owns it on the dashboard. */
export async function getF1DashboardHighlight(): Promise<DashboardSportHighlight | null> {
  const meta = SPORTS_BY_ID.get("f1");
  if (!meta) return null;
  const data = (await getF1Data()) ?? F1_DATA;
  return f1Highlight(
    { sportId: "f1", emoji: meta.emoji, label: meta.label },
    data
  );
}

type HighlightContext = {
  lolData: LolData | null;
  f1Data: F1Data | null;
  footballLeagues: FootballLeagueData[] | null;
  worldCupData: FootballLeagueData | null;
  padelData: PadelData | null;
  tennisData: TennisData | null;
};

function buildHighlight(
  sportId: SportId,
  ctx: HighlightContext,
): DashboardSportHighlight | null {
  const meta = SPORTS_BY_ID.get(sportId);
  if (!meta) return null;
  const base = { sportId, emoji: meta.emoji, label: meta.label };

  switch (sportId) {
    case "football":
      return footballHighlight(base, ctx.footballLeagues);
    case "worldcup":
      return worldCupHighlight(base, ctx.worldCupData ?? WORLD_CUP_DATA);
    case "nba":
      return nbaHighlight(base);
    case "f1":
      return f1Highlight(base, ctx.f1Data ?? F1_DATA);
    case "nfl":
      return nflHighlight(base);
    case "tennis":
      return tennisHighlight(base, ctx.tennisData ?? TENNIS_DATA);
    case "padel":
      return padelHighlight(base, ctx.padelData ?? PADEL_DATA);
    case "lol":
      return lolHighlight(base, ctx.lolData ?? LOL_DATA);
  }
}

type HighlightBase = Pick<DashboardSportHighlight, "sportId" | "emoji" | "label">;

function footballHighlight(
  base: HighlightBase,
  liveLeagues: FootballLeagueData[] | null,
): DashboardSportHighlight {
  const leagues = liveLeagues ?? getFootballLeagues();
  const ucl = leagues.find((l) => l.league.id === "uefa-champions-league") ?? leagues[0];
  const teamsMap = new Map<string, Team>(ucl.teams.map((t) => [t.id, t]));
  const featured = pickFeaturedMatch(ucl.matches);
  const leader = ucl.standings[0];
  const leaderTeam = leader ? teamsMap.get(leader.teamId) : null;

  return {
    ...base,
    headline: featured
      ? matchHeadline(featured, teamsMap)
      : `${ucl.league.shortName} · season ${ucl.league.season}`,
    context: featured?.stageLabel ?? ucl.league.name,
    tone: featured ? matchTone(featured) : "upcoming",
    secondary: leaderTeam
      ? { label: "League leader", value: `${leaderTeam.shortName} · ${leader.points} pts` }
      : undefined,
  };
}

function worldCupHighlight(
  base: HighlightBase,
  data: FootballLeagueData,
): DashboardSportHighlight {
  const teamsMap = new Map<string, Team>(data.teams.map((t) => [t.id, t]));
  const featured = pickFeaturedMatch(data.matches);
  const lastResult = data.matches
    .filter((m) => m.status === "ft" || m.status === "aet" || m.status === "pen")
    .sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime())[0];
  const secondary =
    lastResult && lastResult.id !== featured?.id
      ? { label: "Latest result", value: matchHeadline(lastResult, teamsMap) }
      : undefined;

  return {
    ...base,
    headline: featured
      ? matchHeadline(featured, teamsMap)
      : data.league.name,
    context: featured?.stageLabel
      ? `${featured.stageLabel} · ${data.league.name}`
      : data.league.name,
    tone: featured ? matchTone(featured) : "upcoming",
    secondary,
  };
}

function nbaHighlight(base: HighlightBase): DashboardSportHighlight {
  const teamsMap = new Map<string, Team>(NBA_DATA.teams.map((t) => [t.id, t]));
  const featured = pickFeaturedMatch(NBA_DATA.games);
  const eastLeader = NBA_DATA.standings.find(
    (s) => s.conference === "east" && s.position === 1
  );
  const eastTeam = eastLeader ? teamsMap.get(eastLeader.teamId) : null;
  const secondary =
    eastLeader && eastTeam
      ? {
          label: "East leader",
          value: `${eastTeam.shortName} · ${eastLeader.won}–${eastLeader.lost}`,
        }
      : undefined;

  return {
    ...base,
    headline: featured
      ? matchHeadline(featured, teamsMap)
      : `NBA · ${NBA_DATA.season}`,
    context: featured?.stageLabel ?? `Season ${NBA_DATA.season}`,
    tone: featured ? matchTone(featured) : "upcoming",
    secondary,
  };
}

function f1Highlight(base: HighlightBase, data: F1Data): DashboardSportHighlight {
  // Live first: races are in round order, so looking for "upcoming" first
  // skipped the race happening right now in favour of the following round.
  const upcoming =
    data.races.find((r) => r.status === "live") ??
    data.races.find((r) => r.status === "upcoming");
  const last = [...data.races].reverse().find((r) => r.status === "completed");
  const leader = data.drivers[0];

  const next = upcoming ?? last;
  return {
    ...base,
    headline: next
      ? `${next.flagEmoji} Round ${next.round} · ${next.name}`
      : `F1 ${data.season}`,
    context: next
      ? `${next.circuit} · ${formatShortDate(next.date)}`
      : `Season ${data.season}`,
    tone: upcoming ? (upcoming.status === "live" ? "live" : "upcoming") : "result",
    secondary: leader
      ? { label: "Drivers' leader", value: `${leader.shortName} · ${leader.points} pts` }
      : undefined,
  };
}

function nflHighlight(base: HighlightBase): DashboardSportHighlight {
  const teamsMap = new Map<string, Team>(NFL_DATA.teams.map((t) => [t.id, t]));
  const featured = pickFeaturedMatch(NFL_DATA.games);
  const afcLeader = NFL_DATA.standings.find(
    (s) => s.conference === "afc" && s.position === 1
  );
  const afcTeam = afcLeader ? teamsMap.get(afcLeader.teamId) : null;
  const secondary =
    afcLeader && afcTeam
      ? {
          label: "AFC leader",
          value: `${afcTeam.shortName} · ${afcLeader.wins}–${afcLeader.losses}`,
        }
      : undefined;

  return {
    ...base,
    headline: featured
      ? matchHeadline(featured, teamsMap)
      : `NFL · Season ${NFL_DATA.season}`,
    context: featured?.stageLabel ?? `Season ${NFL_DATA.season}`,
    tone: featured ? matchTone(featured) : "upcoming",
    secondary,
  };
}

function tennisHighlight(base: HighlightBase, data: TennisData): DashboardSportHighlight {
  const liveTournament =
    data.atp.tournaments.find((t) => t.status === "live") ??
    data.atp.tournaments.find((t) => t.status === "upcoming");
  const atpLeader = data.atp.rankings[0];

  return {
    ...base,
    headline: liveTournament
      ? `${liveTournament.name} · ${liveTournament.location}`
      : `ATP / WTA · Season ${data.atp.season}`,
    context: liveTournament
      ? `${liveTournament.surface ?? "Tour"} · ${formatRange(
          liveTournament.startDate,
          liveTournament.endDate
        )}`
      : `Season ${data.atp.season}`,
    tone: liveTournament?.status === "live" ? "live" : "upcoming",
    secondary: atpLeader
      ? { label: "ATP #1", value: `${atpLeader.shortName} · ${atpLeader.points.toLocaleString()} pts` }
      : undefined,
  };
}

function padelHighlight(base: HighlightBase, data: PadelData): DashboardSportHighlight {
  const live =
    data.men.tournaments.find((t) => t.status === "live") ??
    data.men.tournaments.find((t) => t.status === "upcoming");
  const leader = data.men.rankings[0];

  return {
    ...base,
    headline: live ? `${live.name} · ${live.location}` : "Padel · WPT",
    context: live
      ? formatRange(live.startDate, live.endDate)
      : `Season ${data.men.season}`,
    tone: live?.status === "live" ? "live" : "upcoming",
    secondary: leader
      ? { label: "Padel Men #1", value: `${leader.shortName} · ${leader.points.toLocaleString()} pts` }
      : undefined,
  };
}

function lolHighlight(base: HighlightBase, data: LolData): DashboardSportHighlight {
  const split = data.splits[0];
  if (!split) {
    return {
      ...base,
      headline: "League of Legends",
      context: "No active split",
      tone: "upcoming",
    };
  }
  const teamsMap = new Map<string, Team>(split.teams.map((t) => [t.id, t]));
  const featured =
    split.matches.find((m) => m.status === "live") ??
    split.matches.find((m) => m.status === "scheduled") ??
    // Results sort most-recent-first, so the fallback is the head, not the
    // tail (which was the oldest match of the split).
    split.matches[0];
  const leader = split.standings[0];
  const leaderTeam = leader ? teamsMap.get(leader.teamId) : null;

  const headline = featured
    ? lolMatchHeadline(featured, teamsMap)
    : `${split.name} · ${split.season}`;

  return {
    ...base,
    headline,
    context: featured?.stageLabel ?? `${split.name} · ${split.season}`,
    tone:
      featured?.status === "live"
        ? "live"
        : featured?.status === "scheduled"
          ? "upcoming"
          : "result",
    secondary: leaderTeam
      ? {
          label: `${split.region.toUpperCase()} leader`,
          value: `${leaderTeam.shortName} · ${leader.wins}–${leader.losses}`,
        }
      : undefined,
  };
}

// ---------- Helpers ----------

/**
 * Pick the most "interesting" match to surface: live > next scheduled > most
 * recent finished. Returns null when the list is empty.
 */
function pickFeaturedMatch(matches: Match[]): Match | null {
  const live = matches.find((m) => m.status === "live");
  if (live) return live;
  const upcoming = matches
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  if (upcoming[0]) return upcoming[0];
  const finished = matches
    .filter((m) => m.status === "ft" || m.status === "aet" || m.status === "pen")
    .sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime());
  return finished[0] ?? matches[0] ?? null;
}

function matchHeadline(match: Match, teams: Map<string, Team>): string {
  const home = teams.get(match.homeTeamId)?.shortName ?? match.homeTeamId;
  const away = teams.get(match.awayTeamId)?.shortName ?? match.awayTeamId;
  if (match.status === "scheduled") {
    return `${home} vs ${away}`;
  }
  return `${home} ${match.homeScore ?? "-"} – ${match.awayScore ?? "-"} ${away}`;
}

function lolMatchHeadline(
  match: { homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; status: string },
  teams: Map<string, Team>
): string {
  const home = teams.get(match.homeTeamId)?.shortName ?? match.homeTeamId;
  const away = teams.get(match.awayTeamId)?.shortName ?? match.awayTeamId;
  if (match.status === "scheduled") return `${home} vs ${away}`;
  return `${home} ${match.homeScore ?? "-"} – ${match.awayScore ?? "-"} ${away}`;
}

function matchTone(match: Match): DashboardSportHighlight["tone"] {
  if (match.status === "live") return "live";
  if (match.status === "scheduled") return "upcoming";
  return "result";
}

/**
 * A `YYYY-MM-DD` read as a calendar day. `new Date("2026-03-08")` is UTC
 * midnight, which anybody west of Greenwich renders as the 7th.
 */
function dateOnly(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date(iso);
}

function formatShortDate(iso: string): string {
  return dateOnly(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatRange(start: string, end: string): string {
  const s = dateOnly(start);
  const e = dateOnly(end);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (sameMonth) return `${s.toLocaleDateString(undefined, opts)} – ${e.getDate()}`;
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}
