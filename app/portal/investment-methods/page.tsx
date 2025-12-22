import { db } from "@/db";
import { investmentMethods } from "@/db/schema";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Investment Methods</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-1">
        {Object.entries(groupedMethods).map(([author, authorMethods]) => (
          <div key={author} className="space-y-4">
             <h3 className="text-xl font-semibold text-muted-foreground flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{author.substring(0,2).toUpperCase()}</AvatarFallback>
                </Avatar>
                {author}
             </h3>
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {authorMethods.map((method) => (
                  <Card key={method.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        {method.name}
                      </CardTitle>
                      <Badge variant={method.riskLevel === 'Low' ? 'secondary' : method.riskLevel === 'Medium' ? 'default' : 'destructive'} >
                        {method.riskLevel}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">ROI: {method.monthlyRoi}%</div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {method.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
