"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Minus, Trophy } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eyebrow, Mono, Text } from "@/components/ui/typography";
import type { RacquetData, Team } from "@/types/sports";

import { DrawMatchCard } from "../shared/draw-match-card";
import { KnockoutBracket } from "../shared/knockout-bracket";
import { SportShell } from "../shared/sport-shell";
import { StatusPill } from "../shared/status-pill";
import { SportsTh } from "../shared/table-primitives";

/**
 * A `YYYY-MM-DD` read as a calendar day. `new Date("2026-03-08")` is UTC
 * midnight, which anybody west of Greenwich renders as the 7th.
 */
function dateOnly(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date(iso);
}

type TourTab = { value: string; label: string; data: RacquetData };

type RacquetViewProps = {
  emoji: string;
  title: string;
  subtitle: string;
  tours: TourTab[];
};

export function RacquetView({ emoji, title, subtitle, tours }: RacquetViewProps) {
  const defaultTour = tours[0]?.value ?? "main";
  const [tourValue, setTourValue] = useState<string>(defaultTour);
  const activeTour = tours.find((t) => t.value === tourValue) ?? tours[0];
  const drawn = activeTour.data.tournaments.filter((t) => t.bracket?.length);
  // The players travel with the tour as a list so they cross the boundary as
  // plain data; the lookup is built here.
  const players = useMemo(
    () => new Map((activeTour.data.drawPlayers ?? []).map((p) => [p.id, p])),
    [activeTour.data.drawPlayers]
  );

  return (
    <Tabs defaultValue="rankings" className="space-y-6">
      <SportShell
        emoji={emoji}
        title={title}
        subtitle={subtitle}
        controls={
          tours.length > 1 ? (
            <Select value={tourValue} onValueChange={setTourValue}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Tour" />
              </SelectTrigger>
              <SelectContent>
                {tours.map((tour) => (
                  <SelectItem key={tour.value} value={tour.value}>
                    {tour.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null
        }
        tabs={
          <TabsList>
            <TabsTrigger value="rankings">Rankings</TabsTrigger>
            <TabsTrigger value="tournaments">Tournaments</TabsTrigger>
            {/* Only when there is a draw to show. A tab that opens on nothing
                is worse than one that is not there. */}
            {drawn.length > 0 && <TabsTrigger value="draw">Draw</TabsTrigger>}
          </TabsList>
        }
      >
        <TabsContent value="rankings">
          <RankingsTable data={activeTour.data} />
        </TabsContent>
        <TabsContent value="tournaments">
          <TournamentsList data={activeTour.data} />
        </TabsContent>
        {drawn.length > 0 && (
          <TabsContent value="draw">
            <DrawPanel tournaments={drawn} players={players} />
          </TabsContent>
        )}
      </SportShell>
    </Tabs>
  );
}

/**
 * The draw for one tournament, the way a draw sheet reads: pick the event,
 * then follow the winners across.
 */
function DrawPanel({
  tournaments,
  players,
}: {
  tournaments: RacquetData["tournaments"];
  players: Map<string, Team>;
}) {
  const [openId, setOpenId] = useState(tournaments[0]?.id ?? "");
  const open = tournaments.find((t) => t.id === openId) ?? tournaments[0];

  return (
    <div className="flex flex-col gap-4">
      {tournaments.length > 1 && (
        <Select value={open.id} onValueChange={setOpenId}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tournaments.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <KnockoutBracket
            rounds={open.bracket ?? []}
            teams={players}
            renderMatch={(match, teams) => (
              <DrawMatchCard match={match} teams={teams} />
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function RankingsTable({ data }: { data: RacquetData }) {
  // Padel's provider reports no week-on-week movement, so the column was a
  // stack of "— 0" down the whole table. A column that never says anything is
  // better left out than filled with a placeholder.
  const showsMovement = data.rankings.some((p) => p.movement !== 0);

  if (data.rankings.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Text variant="muted">No rankings published for this tour yet.</Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <SportsTh className="w-12">
                Rank
              </SportsTh>
              <SportsTh>
                Player
              </SportsTh>
              <SportsTh className="text-right">
                Points
              </SportsTh>
              {showsMovement ? (
                <SportsTh className="text-center">
                  Move
                </SportsTh>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rankings.map((p, idx) => (
              <TableRow key={`${p.position}-${p.name}-${idx}`}>
                <TableCell className="text-sm tabular-nums text-muted-foreground">
                  {p.position}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="text-base leading-none">{p.flagEmoji}</span>
                    <span className="text-sm font-medium">{p.shortName}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Mono className="text-sm font-semibold">{p.points.toLocaleString()}</Mono>
                </TableCell>
                {showsMovement ? (
                  <TableCell className="text-center">
                    <Movement movement={p.movement} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Movement({ movement }: { movement: number }) {
  if (movement === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }
  if (movement > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success">
        <ArrowUp className="h-3 w-3" /> {movement}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive">
      <ArrowDown className="h-3 w-3" /> {Math.abs(movement)}
    </span>
  );
}

function TournamentsList({ data }: { data: RacquetData }) {
  if (data.tournaments.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Text variant="muted">No tournaments on the calendar for this tour.</Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {data.tournaments.map((t) => (
        <Card key={t.id} size="sm">
          <CardContent className="space-y-2 py-1">
            <div className="flex items-start justify-between gap-2">
              <div className="leading-tight">
                <Eyebrow className="text-2xs">{t.surface ?? "Tour"}</Eyebrow>
                <div className="text-sm font-semibold">{t.name}</div>
                <Text variant="small" as="div">{t.location}</Text>
              </div>
              <StatusPill status={t.status} />
            </div>
            <Mono className="block text-xs text-muted-foreground">
              {formatRange(t.startDate, t.endDate)}
            </Mono>
            {t.champion && (
              <div className="flex items-center gap-2 border-t pt-2 text-xs">
                <Trophy className="h-3.5 w-3.5 text-warning" />
                <span className="font-medium">{t.champion}</span>
                {t.runnerUp && (
                  <>
                    <span className="text-muted-foreground">def.</span>
                    <span className="text-muted-foreground">{t.runnerUp}</span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatRange(start: string, end: string): string {
  const s = dateOnly(start);
  const e = dateOnly(end);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (sameMonth) {
    return `${s.toLocaleDateString(undefined, opts)} – ${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}, ${e.getFullYear()}`;
}
