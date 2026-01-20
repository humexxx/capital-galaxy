"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig } from "@/types/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Pie, PieChart, LabelList } from "recharts";

const chartConfig = {
  value: {
    label: "Value",
  },
} satisfies ChartConfig;

export function AllocationChart({ data }: { data?: any[] }) {
  const chartData = data || [];

  // Build dynamic config from data
  const dynamicConfig = chartData.reduce((acc, item, index) => {
    acc[item.name] = {
      label: item.name,
      color: `var(--chart-${(index % 5) + 1})`,
    };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  return (
    <Card className="col-span-1 bg-card h-full flex flex-col">
      <CardHeader>
        <CardTitle>Allocation</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={{ ...chartConfig, ...dynamicConfig }}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart>
            <ChartTooltip
              content={<ChartTooltipContent nameKey="value" hideLabel />}
            />
            <Pie data={chartData} dataKey="value">
              <LabelList
                dataKey="name"
                className="fill-background"
                stroke="none"
                fontSize={12}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
