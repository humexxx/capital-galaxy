"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { ChartConfig } from "@/types/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useState, useMemo } from "react";
import { subDays } from "date-fns";

const chartConfig = {
  value: {
    label: "Portfolio Value",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type PerformanceChartProps = {
  data: Array<{
    date: string;
    value: number;
  }>;
};

export function PerformanceChart({ data }: PerformanceChartProps) {
  const [timeRange, setTimeRange] = useState("All");
  
  // Filter data based on time range
  const filteredData = useMemo(() => {
    if (timeRange === "All" || data.length === 0) {
      return data;
    }

    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case "30d":
        startDate = subDays(now, 30);
        break;
      case "90d":
        startDate = subDays(now, 90);
        break;
      case "120d":
        startDate = subDays(now, 120);
        break;
      case "1yr":
        startDate = subDays(now, 365);
        break;
      default:
        return data;
    }

    return data.filter((point) => new Date(point.date) >= startDate);
  }, [data, timeRange]);
  
  return (
    <Card className="col-span-2 bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xl font-bold">History</CardTitle>
          <Info className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
          {["30d", "90d", "120d", "1yr", "All"].map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? "secondary" : "ghost"}
              size="sm"
              className={`h-7 px-3 text-xs ${timeRange === range ? "bg-background shadow-sm" : "hover:bg-background/50"}`}
              onClick={() => setTimeRange(range)}
            >
              {range}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pl-0">
        <ChartContainer config={chartConfig} className="h-87.5 w-full">
          <AreaChart
            accessibilityLayer
            data={filteredData}
            margin={{ left: 10, right: 10, top: 10, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" strokeOpacity={0.5} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={30}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", { 
                  month: "short", 
                  day: "numeric",
                  year: "numeric"
                });
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              width={60}
              tickFormatter={(value) => `$${value.toLocaleString()}`}
              domain={['auto', 'auto']}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent 
                  indicator="line"
                  labelFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric"
                    });
                  }}
                />
              }
            />
            <Area
              dataKey="value"
              type="bump"
              fill="var(--color-value)"
              fillOpacity={0.4}
              stroke="var(--color-value)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
