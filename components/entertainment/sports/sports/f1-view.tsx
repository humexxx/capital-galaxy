"use client";

import { Trophy } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eyebrow, Mono, Text } from "@/components/ui/typography";
import type { F1Data } from "@/types/sports";

import { NewsList, type NewsItem } from "../shared/news-list";
import { SportShell } from "../shared/sport-shell";
import { StatusPill } from "../shared/status-pill";
import { SportsTh } from "../shared/table-primitives";

type F1ViewProps = {
  data: F1Data;
  /** Stored F1 news, newest first. Empty hides the tab. */
  news?: NewsItem[];
};

export function F1View({ data, news = [] }: F1ViewProps) {
  return (
    <Tabs defaultValue="drivers" className="space-y-6">
      <SportShell
        emoji="🏎️"
        title="Formula 1"
        subtitle={`${data.season} Season`}
        tabs={
          <TabsList>
            <TabsTrigger value="drivers">Drivers</TabsTrigger>
            <TabsTrigger value="constructors">Constructors</TabsTrigger>
            <TabsTrigger value="races">Races</TabsTrigger>
            {news.length > 0 && <TabsTrigger value="news">News</TabsTrigger>}
          </TabsList>
        }
      >
        <TabsContent value="drivers">
          <Card>
            <CardContent className="p-0">
              <div className="border-b px-4 py-3">
                <Eyebrow>{data.season} Standings</Eyebrow>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <SportsTh className="w-12">
                      Rank
                    </SportsTh>
                    <SportsTh>
                      Driver
                    </SportsTh>
                    <SportsTh className="text-right">
                      Points
                    </SportsTh>
                    <SportsTh className="text-right">
                      Wins
                    </SportsTh>
                    <SportsTh className="text-right">
                      Podiums
                    </SportsTh>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.drivers.map((d) => (
                    <TableRow key={d.code}>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {d.position}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="text-base leading-none">{d.flagEmoji}</span>
                          <div className="leading-tight">
                            <div className="text-sm font-medium">{d.shortName}</div>
                            <Text variant="small" as="div">{d.team}</Text>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono className="text-sm font-semibold">{d.points}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono className="text-sm">{d.wins}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono className="text-sm">{d.podiums}</Mono>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="constructors">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <SportsTh className="w-12">
                      Rank
                    </SportsTh>
                    <SportsTh>
                      Team
                    </SportsTh>
                    <SportsTh className="text-right">
                      Points
                    </SportsTh>
                    <SportsTh className="text-right">
                      Wins
                    </SportsTh>
                    <SportsTh className="text-right">
                      Podiums
                    </SportsTh>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.constructors.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {c.position}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span
                            className="h-4 w-1 rounded-sm"
                            style={{ backgroundColor: c.primaryColor }}
                          />
                          <span className="text-sm font-medium">{c.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono className="text-sm font-semibold">{c.points}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono className="text-sm">{c.wins}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono className="text-sm">{c.podiums}</Mono>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="races">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.races.map((race) => (
              <Card key={race.id} size="sm">
                <CardContent className="space-y-2 py-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl leading-none">{race.flagEmoji}</span>
                      <div className="leading-tight">
                        <Text variant="small" as="div">
                          Round {race.round}
                        </Text>
                        <div className="text-sm font-semibold">{race.name}</div>
                      </div>
                    </div>
                    <StatusPill status={race.status} />
                  </div>
                  <Text variant="small" as="div">
                    {race.circuit} · {race.location}
                  </Text>
                  <Mono className="block text-xs text-muted-foreground">
                    {new Date(race.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Mono>
                  {race.podium && (
                    <div className="mt-1 flex items-center gap-2 border-t pt-2 text-xs">
                      <Trophy className="h-3.5 w-3.5 text-warning" />
                      <Mono className="font-medium">{race.podium[0]}</Mono>
                      <span className="text-muted-foreground">·</span>
                      <Mono>{race.podium[1]}</Mono>
                      <span className="text-muted-foreground">·</span>
                      <Mono>{race.podium[2]}</Mono>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {news.length > 0 && (
          <TabsContent value="news">
            <NewsList items={news} />
          </TabsContent>
        )}
      </SportShell>
    </Tabs>
  );
}
