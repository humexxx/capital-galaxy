import "server-only";

import type {
  BracketMatch,
  BracketRound,
  BracketRoundId,
  RacquetTour,
  RacquetTournament,
  Team,
} from "@/types/sports";
import { upstreamSignal } from "./upstream";

const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/tennis";
export const REVALIDATE_SECONDS = 300;

type EspnAthlete = {
  id?: string;
  displayName?: string;
  shortName?: string;
  flag?: { alt?: string; href?: string };
};

type EspnCompetitor = {
  id?: string;
  winner?: boolean;
  athlete?: EspnAthlete;
  curatedRank?: { current?: number };
  linescores?: Array<{ value?: number }>;
};

type EspnCompetition = {
  id: string;
  date?: string;
  status?: { type?: { completed?: boolean; description?: string } };
  round?: { displayName?: string };
  competitors?: EspnCompetitor[];
};

type EspnGrouping = {
  grouping?: { slug?: string; displayName?: string };
  competitions?: EspnCompetition[];
};

type EspnEvent = {
  id: string;
  name?: string;
  date?: string;
  endDate?: string;
  venue?: { fullName?: string; address?: { city?: string } };
  status?: { type?: { completed?: boolean; description?: string } };
  groupings?: EspnGrouping[];
};

type EspnScoreboard = { events?: EspnEvent[] };

/**
 * ESPN's round names, mapped onto the ids the bracket already knows.
 *
 * Only the rounds a reader follows: a 128-draw's opening rounds are 64 ties
 * of players nobody has heard of, and the qualifying rounds are not the
 * tournament. Anything unmapped is dropped.
 */
const ROUND_IDS: Record<string, BracketRoundId> = {
  "Round 1": "round-of-128",
  "Round 2": "round-of-64",
  "Round 3": "round-of-32",
  "Round 4": "round-of-16",
  Quarterfinal: "quarter-final",
  Semifinal: "semi-final",
  Final: "final",
};

const ROUND_LABELS: Record<string, string> = {
  "Round 1": "Round 1",
  "Round 2": "Round 2",
  "Round 3": "Round 3",
  "Round 4": "Round of 16",
  Quarterfinal: "Quarter-finals",
  Semifinal: "Semi-finals",
  Final: "Final",
};

/** ESPN gives a country name; the draw wants a flag. */
const FLAGS: Record<string, string> = {
  Argentina: "🇦🇷", Australia: "🇦🇺", Austria: "🇦🇹", Belgium: "🇧🇪",
  Brazil: "🇧🇷", Bulgaria: "🇧🇬", Canada: "🇨🇦", Chile: "🇨🇱",
  China: "🇨🇳", Croatia: "🇭🇷", Czechia: "🇨🇿", Denmark: "🇩🇰",
  Finland: "🇫🇮", France: "🇫🇷", Germany: "🇩🇪", "Great Britain": "🇬🇧",
  Greece: "🇬🇷", "Hong Kong": "🇭🇰", Hungary: "🇭🇺", India: "🇮🇳",
  Italy: "🇮🇹", Japan: "🇯🇵", Kazakhstan: "🇰🇿", Latvia: "🇱🇻",
  Monaco: "🇲🇨", Netherlands: "🇳🇱", Norway: "🇳🇴", Poland: "🇵🇱",
  Portugal: "🇵🇹", Romania: "🇷🇴", Russia: "🇷🇺", Serbia: "🇷🇸",
  Slovakia: "🇸🇰", Slovenia: "🇸🇮", "South Africa": "🇿🇦", Spain: "🇪🇸",
  Sweden: "🇸🇪", Switzerland: "🇨🇭", Taiwan: "🇹🇼", Tunisia: "🇹🇳",
  Ukraine: "🇺🇦", USA: "🇺🇸", Uruguay: "🇺🇾", Belarus: "🇧🇾",
  Bolivia: "🇧🇴", Colombia: "🇨🇴", Ecuador: "🇪🇨", Egypt: "🇪🇬",
  Estonia: "🇪🇪", Georgia: "🇬🇪", Israel: "🇮🇱", Lithuania: "🇱🇹",
  Mexico: "🇲🇽", Moldova: "🇲🇩", "New Zealand": "🇳🇿", Peru: "🇵🇪",
  Philippines: "🇵🇭", Turkey: "🇹🇷", Venezuela: "🇻🇪",
};

function playerFrom(c: EspnCompetitor): Team | null {
  const athlete = c.athlete;
  const name = athlete?.shortName || athlete?.displayName;
  const id = athlete?.id ?? c.id;
  if (!name || !id) return null;
  const country = athlete?.flag?.alt ?? "";
  const seed = c.curatedRank?.current;
  return {
    id,
    // The draw card reads `name` as the flag and `code` as the seed — see
    // `playerEntry` in draw-match-card.tsx for the one place that is written
    // down.
    name: FLAGS[country] ?? "",
    shortName: name,
    code: seed ? String(seed) : "",
  };
}

function matchFrom(c: EspnCompetition): { match: BracketMatch; players: Team[] } | null {
  const [home, away] = c.competitors ?? [];
  const homePlayer = home ? playerFrom(home) : null;
  const awayPlayer = away ? playerFrom(away) : null;

  const sets = Math.max(
    home?.linescores?.length ?? 0,
    away?.linescores?.length ?? 0
  );
  const legs = Array.from({ length: sets }, (_, i) => ({
    homeScore: home?.linescores?.[i]?.value ?? null,
    awayScore: away?.linescores?.[i]?.value ?? null,
  }));

  const winnerId = home?.winner
    ? (homePlayer?.id ?? null)
    : away?.winner
      ? (awayPlayer?.id ?? null)
      : null;

  return {
    match: {
      id: c.id,
      homeTeamId: homePlayer?.id ?? null,
      awayTeamId: awayPlayer?.id ?? null,
      legs: legs.length > 0 ? legs : undefined,
      winnerTeamId: winnerId,
      date: c.date?.slice(0, 10),
    },
    players: [homePlayer, awayPlayer].filter((p): p is Team => p !== null),
  };
}

export type EspnDraw = {
  tournament: RacquetTournament;
  players: Team[];
};

function drawFrom(event: EspnEvent, slug: string): EspnDraw | null {
  const grouping = event.groupings?.find((g) => g.grouping?.slug === slug);
  if (!grouping?.competitions?.length) return null;

  const byRound = new Map<string, EspnCompetition[]>();
  for (const c of grouping.competitions) {
    const name = c.round?.displayName ?? "";
    if (!ROUND_IDS[name]) continue;
    byRound.set(name, [...(byRound.get(name) ?? []), c]);
  }

  const players = new Map<string, Team>();
  const rounds: BracketRound[] = [];
  for (const name of Object.keys(ROUND_IDS)) {
    const comps = byRound.get(name);
    if (!comps) continue;
    const matches: BracketMatch[] = [];
    for (const c of comps) {
      const mapped = matchFrom(c);
      if (!mapped) continue;
      matches.push(mapped.match);
      for (const p of mapped.players) players.set(p.id, p);
    }
    if (matches.length > 0) {
      rounds.push({ id: ROUND_IDS[name], label: ROUND_LABELS[name] ?? name, matches });
    }
  }
  if (rounds.length === 0) return null;

  const completed = event.status?.type?.completed === true;
  const startsAt = event.date ? new Date(event.date).getTime() : NaN;
  const notStarted = !Number.isNaN(startsAt) && startsAt > Date.now();
  return {
    tournament: {
      id: `espn-${event.id}-${slug}`,
      name: event.name ?? "Tournament",
      location: event.venue?.address?.city ?? event.venue?.fullName ?? "—",
      startDate: (event.date ?? "").slice(0, 10),
      endDate: (event.endDate ?? event.date ?? "").slice(0, 10),
      status: completed ? "completed" : notStarted ? "upcoming" : "live",
      bracket: rounds,
    },
    players: [...players.values()],
  };
}

async function fetchScoreboard(tour: "atp" | "wta"): Promise<EspnScoreboard> {
  const res = await fetch(`${BASE_URL}/${tour}/scoreboard`, {
    signal: upstreamSignal(),
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`espn tennis ${res.status} for ${tour}`);
  return (await res.json()) as EspnScoreboard;
}

/**
 * The draw of whatever tournament is on, from ESPN's public scoreboard.
 *
 * No key and no signup — the same endpoint espn.com itself reads. Returns null
 * rather than throwing so a tour without a live event just has no draw.
 */
export async function getEspnDraw(tour: RacquetTour): Promise<EspnDraw | null> {
  const endpoint = tour === "atp" ? "atp" : tour === "wta" ? "wta" : null;
  if (!endpoint) return null;
  try {
    const board = await fetchScoreboard(endpoint);
    const event = board.events?.[0];
    if (!event) return null;
    const slug = endpoint === "atp" ? "mens-singles" : "womens-singles";
    return drawFrom(event, slug);
  } catch (error) {
    console.warn(`espn tennis draw unavailable for ${tour}:`, error);
    return null;
  }
}

/** Pure mappers, exported for their tests — nothing here touches the network. */
export const __testing = { drawFrom, matchFrom, playerFrom, ROUND_IDS };
