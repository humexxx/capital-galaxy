"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig } from "@/types/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

const chartConfig = {
  value: {
    label: "Portfolio Value",
    color: "hsl(142.1 76.2% 36.3%)", // Green-500 equivalent used in shadcn
  },
} satisfies ChartConfig;

type PerformanceChartProps = {
  data: Array<{
    date: string;
    value: number;
  }>;
};

export function PerformanceChart({ data }: PerformanceChartProps) {
  // Mock data for visualization if no data provided (optional, but good for empty states if desired)
  // For now, we render what is passed.
  
  return (
    <Card className="border-none bg-transparent shadow-none">
      <CardHeader className="px-0 pt-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold">History</CardTitle>
            <CardDescription>Portfolio value over time</CardDescription>
          </div>
          {/* Time range selector could go here */}
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          <AreaChart data={data} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-value)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-value)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" strokeOpacity={0.5} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={30}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              tickFormatter={(value) => `$${value.toLocaleString()}`}
              domain={['auto', 'auto']}
            />
            <ChartTooltip
              content={<ChartTooltipContent indicator="line" />}
            />
            <Area
              dataKey="value"
              type="monotone"
              fill="url(#fillValue)"
              fillOpacity={1}
              stroke="var(--color-value)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
