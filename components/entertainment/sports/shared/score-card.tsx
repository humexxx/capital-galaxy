import { Circle } from "lucide-react";

import { Mono } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import type { Match, Team } from "@/types/sports";

import { TeamBadge } from "./team-badge";

type ScoreCardProps = {
  match: Match;
  teams: Map<string, Team>;
  className?: string;
};

function formatStatus(match: Match): string {
  switch (match.status) {
    case "ft":
      return "FT";
    case "aet":
      return "AET";
    case "pen":
      return "PEN";
    case "live":
      return match.minute ? `${match.minute}'` : "Live";
    case "scheduled":
      return formatKickoffShort(match.kickoff);
    case "postponed":
      return "PPD";
    case "cancelled":
      return "CAN";
  }
}

function formatKickoffShort(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatKickoffTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function ScoreCard({ match, teams, className }: ScoreCardProps) {
  const home = teams.get(match.homeTeamId);
  const away = teams.get(match.awayTeamId);
  if (!home || !away) return null;

  const homeWon =
    match.homeScore !== null &&
    match.awayScore !== null &&
    match.homeScore > match.awayScore;
  const awayWon =
    match.homeScore !== null &&
    match.awayScore !== null &&
    match.awayScore > match.homeScore;
  const isLive = match.status === "live";
  const scheduled = match.status === "scheduled";

  return (
    <div
      className={cn(
        "relative grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border bg-card px-3 py-2.5",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {match.stageLabel && (
          <span className="block truncate text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {match.stageLabel}
          </span>
        )}
        <TeamRow
          team={home}
          score={match.homeScore}
          isWinner={homeWon}
          redCard={match.homeRedCard}
          dim={awayWon && !isLive}
          scheduled={scheduled}
        />
        <TeamRow
          team={away}
          score={match.awayScore}
          isWinner={awayWon}
          redCard={match.awayRedCard}
          dim={homeWon && !isLive}
          scheduled={scheduled}
        />
      </div>
      <div className="flex flex-col items-end justify-center gap-0.5 border-l pl-3 text-right">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground",
            isLive && "text-success",
          )}
        >
          {isLive && <Circle className="h-2 w-2 animate-pulse fill-current" />}
          {formatStatus(match)}
        </span>
        {scheduled ? (
          <Mono className="text-2xs text-muted-foreground">
            {formatKickoffTime(match.kickoff)}
          </Mono>
        ) : (
          !isLive && (
            <Mono className="text-2xs text-muted-foreground">
              {formatKickoffShort(match.kickoff)}
            </Mono>
          )
        )}
      </div>
    </div>
  );
}

function TeamRow({
  team,
  score,
  isWinner,
  redCard,
  dim,
  scheduled,
}: {
  team: Team;
  score: number | null;
  isWinner: boolean;
  redCard?: boolean;
  dim?: boolean;
  scheduled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 text-sm",
        dim && "text-muted-foreground",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <TeamBadge team={team} size="sm" />
        <span className={cn("min-w-0 truncate", isWinner && "font-semibold")}>
          {team.shortName}
        </span>
        {redCard && (
          <span className="h-3 w-2 rounded-xs bg-destructive" aria-label="Red card" />
        )}
      </div>
      {!scheduled && score !== null && (
        <Mono
          className={cn(
            "shrink-0 text-sm tabular-nums",
            isWinner ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {score}
        </Mono>
      )}
    </div>
  );
}
