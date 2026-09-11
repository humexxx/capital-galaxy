import "server-only";

import { unstable_cache } from "next/cache";

import { F1_DATA } from "@/lib/data/sports/f1";
import type {
  F1Constructor,
  F1Data,
  F1Driver,
  F1Race,
} from "@/types/sports";
import { upstreamSignal } from "./upstream";

const JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1";
const REVALIDATE_SECONDS = 300;

type JolpicaDriver = {
  driverId: string;
  code?: string;
  givenName: string;
  familyName: string;
  nationality: string;
};

type JolpicaConstructor = {
  constructorId: string;
  name: string;
  nationality?: string;
};

type JolpicaDriverStanding = {
  position: string;
  points: string;
  wins: string;
  Driver: JolpicaDriver;
  Constructors: JolpicaConstructor[];
};

type JolpicaConstructorStanding = {
  position: string;
  points: string;
  wins: string;
  Constructor: JolpicaConstructor;
};

type JolpicaResult = {
  position: string;
  Driver: JolpicaDriver;
  Constructor: JolpicaConstructor;
};

type JolpicaRace = {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit: {
    circuitName: string;
    Location: {
      locality: string;
      country: string;
    };
  };
  Results?: JolpicaResult[];
};

type JolpicaSeasonRacesResponse = {
  MRData: {
    RaceTable: { season: string; Races: JolpicaRace[] };
  };
};

type JolpicaDriverStandingsResponse = {
  MRData: {
    StandingsTable: {
      StandingsLists: Array<{
        season: string;
        round: string;
        DriverStandings: JolpicaDriverStanding[];
      }>;
    };
  };
};

type JolpicaConstructorStandingsResponse = {
  MRData: {
    StandingsTable: {
      StandingsLists: Array<{
        season: string;
        round: string;
        ConstructorStandings: JolpicaConstructorStanding[];
      }>;
    };
  };
};

type JolpicaAllResultsResponse = {
  MRData: { RaceTable: { Races: JolpicaRace[] } };
};

const NATIONALITY_FLAG: Record<string, string> = {
  Argentine: "🇦🇷",
  Australian: "🇦🇺",
  Austrian: "🇦🇹",
  Belgian: "🇧🇪",
  Brazilian: "🇧🇷",
  British: "🇬🇧",
  Canadian: "🇨🇦",
  Chinese: "🇨🇳",
  Colombian: "🇨🇴",
  Danish: "🇩🇰",
  Dutch: "🇳🇱",
  Finnish: "🇫🇮",
  French: "🇫🇷",
  German: "🇩🇪",
  Italian: "🇮🇹",
  Japanese: "🇯🇵",
  Mexican: "🇲🇽",
  "Monégasque": "🇲🇨",
  Monegasque: "🇲🇨",
  "New Zealander": "🇳🇿",
  Polish: "🇵🇱",
  Russian: "🇷🇺",
  Spanish: "🇪🇸",
  Swedish: "🇸🇪",
  Swiss: "🇨🇭",
  Thai: "🇹🇭",
  American: "🇺🇸",
  Venezuelan: "🇻🇪",
};

const NATIONALITY_CODE: Record<string, string> = {
  Argentine: "ARG",
  Australian: "AUS",
  Austrian: "AUT",
  Belgian: "BEL",
  Brazilian: "BRA",
  British: "GBR",
  Canadian: "CAN",
  Chinese: "CHN",
  Colombian: "COL",
  Danish: "DEN",
  Dutch: "NED",
  Finnish: "FIN",
  French: "FRA",
  German: "GER",
  Italian: "ITA",
  Japanese: "JPN",
  Mexican: "MEX",
  "Monégasque": "MON",
  Monegasque: "MON",
  "New Zealander": "NZL",
  Polish: "POL",
  Russian: "RUS",
  Spanish: "ESP",
  Swedish: "SWE",
  Swiss: "SUI",
  Thai: "THA",
  American: "USA",
  Venezuelan: "VEN",
};

const COUNTRY_FLAG: Record<string, string> = {
  Argentina: "🇦🇷",
  Australia: "🇦🇺",
  Austria: "🇦🇹",
  Azerbaijan: "🇦🇿",
  Bahrain: "🇧🇭",
  Belgium: "🇧🇪",
  Brazil: "🇧🇷",
  Canada: "🇨🇦",
  China: "🇨🇳",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Hungary: "🇭🇺",
  India: "🇮🇳",
  Italy: "🇮🇹",
  Japan: "🇯🇵",
  Korea: "🇰🇷",
  Malaysia: "🇲🇾",
  Mexico: "🇲🇽",
  Monaco: "🇲🇨",
  Morocco: "🇲🇦",
  Netherlands: "🇳🇱",
  Portugal: "🇵🇹",
  Qatar: "🇶🇦",
  Russia: "🇷🇺",
  "Saudi Arabia": "🇸🇦",
  Singapore: "🇸🇬",
  Spain: "🇪🇸",
  Sweden: "🇸🇪",
  Switzerland: "🇨🇭",
  Turkey: "🇹🇷",
  UAE: "🇦🇪",
  "United Arab Emirates": "🇦🇪",
  UK: "🇬🇧",
  "United Kingdom": "🇬🇧",
  USA: "🇺🇸",
  "United States": "🇺🇸",
  Vietnam: "🇻🇳",
};

const CONSTRUCTOR_COLOR: Record<string, string> = {
  Mercedes: "#27F4D2",
  "Red Bull": "#3671C6",
  "Red Bull Racing": "#3671C6",
  Ferrari: "#E80020",
  McLaren: "#FF8000",
  "Aston Martin": "#229971",
  Alpine: "#FF87BC",
  "Alpine F1 Team": "#FF87BC",
  Williams: "#64C4FF",
  RB: "#6692FF",
  AlphaTauri: "#6692FF",
  "Racing Bulls": "#6692FF",
  Sauber: "#52E252",
  "Kick Sauber": "#52E252",
  Audi: "#52E252",
  Haas: "#B6BABD",
  "Haas F1 Team": "#B6BABD",
  Cadillac: "#2C3E50",
};

function flagForNationality(n: string): string {
  return NATIONALITY_FLAG[n] ?? "🏁";
}

function codeForNationality(n: string): string {
  return NATIONALITY_CODE[n] ?? n.slice(0, 3).toUpperCase();
}

function flagForCountry(c: string): string {
  return COUNTRY_FLAG[c] ?? "🏁";
}

function colorForConstructor(name: string): string {
  if (CONSTRUCTOR_COLOR[name]) return CONSTRUCTOR_COLOR[name];
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(CONSTRUCTOR_COLOR)) {
    if (lower.includes(k.toLowerCase())) return v;
  }
  return "#666";
}

function shortConstructor(name: string): string {
  return name
    .replace(/\s*F1\s*Team\s*$/i, "")
    .replace(/\s*Racing\s*$/i, " Racing")
    .replace(/^Red Bull Racing$/i, "Red Bull")
    .trim();
}

function driverShortName(driver: JolpicaDriver): string {
  const given = driver.givenName;
  const initial = given ? `${given[0]}. ` : "";
  return `${initial}${driver.familyName}`;
}

function driverCode(driver: JolpicaDriver): string {
  return driver.code ?? driver.familyName.slice(0, 3).toUpperCase();
}

async function fetchJolpica<T>(path: string): Promise<T> {
  const res = await fetch(`${JOLPICA_BASE_URL}${path}`, {
    signal: upstreamSignal(),
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`Jolpica ${res.status} on ${path}`);
  return (await res.json()) as T;
}

/**
 * `time` is Jolpica's race start (HH:MM:SSZ); without one the whole day is
 * treated as the live window. Nothing used to return "live" at all, so the
 * dashboard's Live pill for F1 was dead code.
 */
function deriveRaceStatus(
  date: string,
  hasResults: boolean,
  time?: string | null
): F1Race["status"] {
  if (hasResults) return "completed";
  const now = Date.now();
  const dayEnd = new Date(`${date}T23:59:59Z`).getTime();
  if (dayEnd < now - 24 * 60 * 60 * 1000) return "completed";
  const start = time ? new Date(`${date}T${time}`).getTime() : new Date(`${date}T00:00:00Z`).getTime();
  const end = time ? start + 3 * 60 * 60 * 1000 : dayEnd;
  if (!Number.isNaN(start) && now >= start && now <= end) return "live";
  return "upcoming";
}

function mapDrivers(
  standings: JolpicaDriverStanding[],
  podiumCounts: Map<string, number>,
): F1Driver[] {
  return standings.map((row) => {
    const code = driverCode(row.Driver);
    const team = row.Constructors[0]?.name ?? "—";
    return {
      position: parseInt(row.position, 10),
      code,
      name: `${row.Driver.givenName} ${row.Driver.familyName}`,
      shortName: driverShortName(row.Driver),
      team: shortConstructor(team),
      nationality: codeForNationality(row.Driver.nationality),
      flagEmoji: flagForNationality(row.Driver.nationality),
      points: parseFloat(row.points),
      wins: parseInt(row.wins, 10),
      podiums: podiumCounts.get(code) ?? 0,
    };
  });
}

function mapConstructors(
  standings: JolpicaConstructorStanding[],
  podiumCounts: Map<string, number>,
): F1Constructor[] {
  return standings.map((row) => {
    const name = row.Constructor.name;
    return {
      position: parseInt(row.position, 10),
      name,
      shortName: shortConstructor(name),
      points: parseFloat(row.points),
      wins: parseInt(row.wins, 10),
      podiums: podiumCounts.get(name) ?? 0,
      primaryColor: colorForConstructor(name),
    };
  });
}

function mapRaces(
  scheduleRaces: JolpicaRace[],
  resultsByRound: Map<string, JolpicaResult[]>,
): F1Race[] {
  return scheduleRaces.map((race) => {
    const results = resultsByRound.get(race.round);
    const status = deriveRaceStatus(race.date, !!results && results.length > 0, race.time);
    const podium =
      status === "completed" && results && results.length >= 3
        ? ([
            driverCode(results[0].Driver),
            driverCode(results[1].Driver),
            driverCode(results[2].Driver),
          ] as [string, string, string])
        : undefined;
    return {
      id: `r-${race.round}`,
      round: parseInt(race.round, 10),
      name: race.raceName,
      circuit: race.Circuit.circuitName,
      location: race.Circuit.Location.locality,
      flagEmoji: flagForCountry(race.Circuit.Location.country),
      date: race.date,
      status,
      podium,
    };
  });
}

function tallyPodiums(racesWithResults: JolpicaRace[]): {
  driverPodiums: Map<string, number>;
  constructorPodiums: Map<string, number>;
  resultsByRound: Map<string, JolpicaResult[]>;
} {
  const driverPodiums = new Map<string, number>();
  const constructorPodiums = new Map<string, number>();
  const resultsByRound = new Map<string, JolpicaResult[]>();

  for (const race of racesWithResults) {
    if (!race.Results) continue;
    resultsByRound.set(race.round, race.Results);
    for (const result of race.Results.slice(0, 3)) {
      const dCode = driverCode(result.Driver);
      driverPodiums.set(dCode, (driverPodiums.get(dCode) ?? 0) + 1);
      const cName = result.Constructor.name;
      constructorPodiums.set(cName, (constructorPodiums.get(cName) ?? 0) + 1);
    }
  }

  return { driverPodiums, constructorPodiums, resultsByRound };
}

async function fetchF1FromApi(): Promise<F1Data> {
  const [schedule, driverStandings, constructorStandings, allResults] =
    await Promise.all([
      fetchJolpica<JolpicaSeasonRacesResponse>(`/current.json`),
      fetchJolpica<JolpicaDriverStandingsResponse>(
        `/current/driverStandings.json`,
      ),
      fetchJolpica<JolpicaConstructorStandingsResponse>(
        `/current/constructorStandings.json`,
      ),
      fetchJolpica<JolpicaAllResultsResponse>(
        `/current/results.json?limit=300`,
      ).catch(() => ({
        MRData: { RaceTable: { Races: [] } },
      })),
    ]);

  const season = parseInt(schedule.MRData.RaceTable.season, 10);

  const standingsList = driverStandings.MRData.StandingsTable.StandingsLists[0];
  const constructorList =
    constructorStandings.MRData.StandingsTable.StandingsLists[0];

  if (!standingsList || !constructorList) {
    throw new Error("Jolpica returned empty standings");
  }

  const podiums = tallyPodiums(allResults.MRData.RaceTable.Races);

  return {
    season,
    drivers: mapDrivers(standingsList.DriverStandings, podiums.driverPodiums),
    constructors: mapConstructors(
      constructorList.ConstructorStandings,
      podiums.constructorPodiums,
    ),
    races: mapRaces(schedule.MRData.RaceTable.Races, podiums.resultsByRound),
  };
}

export const getF1Data = unstable_cache(
  async (): Promise<F1Data> => {
    try {
      return await fetchF1FromApi();
    } catch (err) {
      console.warn("Jolpica unavailable, falling back to mock F1_DATA:", err);
      return F1_DATA;
    }
  },
  ["jolpica:f1-data"],
  { revalidate: REVALIDATE_SECONDS, tags: ["sports:f1"] },
);
