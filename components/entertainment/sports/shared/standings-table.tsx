import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Mono } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import type { Standing, Team } from "@/types/sports";

import { Last5Form } from "./last-5-form";
import { SportsTh, TableCellNum } from "./table-primitives";
import { TeamBadge } from "./team-badge";

type StandingsTableProps = {
  standings: Standing[];
  teams: Map<string, Team>;
  /** Show the form column when the data set carries it. */
  showForm?: boolean;
  className?: string;
};

const BAND_STYLES: Record<string, string> = {
  champions: "bg-sky-500",
  europa: "bg-orange-500",
  conference: "bg-success",
  playoff: "bg-warning",
  relegation: "bg-destructive",
};

export function StandingsTable({
  standings,
  teams,
  showForm = true,
  className,
}: StandingsTableProps) {
  const hasForm = showForm && standings.some((s) => s.form && s.form.length > 0);

  return (
    <div className={cn("relative overflow-x-auto rounded-lg border", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <SportsTh className="w-8">
              #
            </SportsTh>
            <SportsTh>
              Club
            </SportsTh>
            <SportsTh className="w-12 text-center">
              MP
            </SportsTh>
            <SportsTh className="w-12 text-center">
              W
            </SportsTh>
            <SportsTh className="w-12 text-center">
              D
            </SportsTh>
            <SportsTh className="w-12 text-center">
              L
            </SportsTh>
            <SportsTh className="w-12 text-center">
              GF
            </SportsTh>
            <SportsTh className="w-12 text-center">
              GA
            </SportsTh>
            <SportsTh className="w-12 text-center">
              GD
            </SportsTh>
            <SportsTh className="w-14 text-center text-foreground">
              Pts
            </SportsTh>
            {hasForm && (
              <SportsTh className="text-center">
                Last 5
              </SportsTh>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {standings.map((row) => {
            const team = teams.get(row.teamId);
            const goalDiff = row.goalsFor - row.goalsAgainst;
            const bandClass = row.band ? BAND_STYLES[row.band] : null;
            return (
              <TableRow key={row.teamId} className="relative">
                <TableCell className="relative pl-3 text-sm tabular-nums text-muted-foreground">
                  {bandClass && (
                    <span
                      aria-hidden
                      className={cn("absolute inset-y-1 left-0 w-1 rounded-r-sm", bandClass)}
                    />
                  )}
                  {row.position}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {team && <TeamBadge team={team} size="sm" />}
                    <span className="truncate">{team?.shortName ?? row.teamId}</span>
                  </div>
                </TableCell>
                <TableCellNum value={row.played} />
                <TableCellNum value={row.won} />
                <TableCellNum value={row.drawn} />
                <TableCellNum value={row.lost} />
                <TableCellNum value={row.goalsFor} />
                <TableCellNum value={row.goalsAgainst} />
                <TableCellNum
                  value={`${goalDiff >= 0 ? "+" : ""}${goalDiff}`}
                  className={goalDiff >= 0 ? "text-foreground" : "text-destructive"}
                />
                <TableCell className="text-center">
                  <Mono className="text-sm font-semibold tabular-nums">{row.points}</Mono>
                </TableCell>
                {hasForm && (
                  <TableCell className="text-center">
                    {row.form && row.form.length > 0 ? (
                      <Last5Form
                        results={row.form}
                        className="justify-center"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
