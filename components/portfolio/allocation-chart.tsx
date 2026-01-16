"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig } from "@/types/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { Pie, PieChart, Cell, ResponsiveContainer } from "recharts";

const chartConfig = {
  // Config is dynamic based on data names, avoiding hardcoded assets
} satisfies ChartConfig;

export function AllocationChart({ data }: { data?: any[] }) {
  const chartData = data || [];

  return (
    <Card className="col-span-1 bg-card h-full">
      <CardHeader>
        <CardTitle>Allocation</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center p-0">
        <ChartContainer config={chartConfig} className="h-[300px] w-full mx-auto aspect-square">
           <PieChart accessibilityLayer>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                strokeWidth={5}
                paddingAngle={5}
              >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill || "var(--color-btc)"} />
                  ))}
              </Pie>
              <ChartLegend
                 content={<ChartLegendContent nameKey="name" />}
                 className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
              />
              {/* Custom Legend to match image more closely if needed, 
                  but ChartLegend is standard. 
                  Image shows: Blue Dot BTC 100.00% to the right. 
                  Recharts Legend usually is bottom. 
                  We can implement custom legend side-by-side if we want exact match.
              */}
              <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
               {/* Center text if needed */}
              </text>
           </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
