import { db } from "@/db";
import { investmentMethods } from "@/db/schema";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Investment Methods | Capital Galaxy",
  description: "Explore available investment methods and strategies",
};

async function getInvestmentMethods() {
  const methods = await db.select().from(investmentMethods);
  return methods;
}

export default async function InvestmentMethodsPage() {
  const methods = await getInvestmentMethods();

  const groupedMethods = methods.reduce((acc, method) => {
    if (!acc[method.author]) {
      acc[method.author] = [];
    }
    acc[method.author].push(method);
    return acc;
  }, {} as Record<string, typeof methods>);

  return (
    <>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Investment Methods</h1>
        <p className="text-muted-foreground">Explore available investment strategies and their expected returns</p>
      </div>
      
      <div className="space-y-8">
        {Object.entries(groupedMethods).map(([author, authorMethods]) => (
          <div key={author} className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {author.substring(0,2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-lg font-semibold">{author}</h2>
                <p className="text-sm text-muted-foreground">{authorMethods.length} {authorMethods.length === 1 ? 'method' : 'methods'}</p>
              </div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {authorMethods.map((method) => (
                <Card key={method.id} className="border-border">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1">
                        <CardTitle className="text-lg">{method.name}</CardTitle>
                        <CardDescription className="line-clamp-2">
                          {method.description}
                        </CardDescription>
                      </div>
                      <Badge 
                        variant={method.riskLevel === 'Low' ? 'secondary' : method.riskLevel === 'Medium' ? 'default' : 'destructive'}
                        className="shrink-0"
                      >
                        {method.riskLevel}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Separator />
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold">{method.monthlyRoi}%</span>
                      <span className="text-sm text-muted-foreground">monthly ROI</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
