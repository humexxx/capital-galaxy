import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Wallet } from "lucide-react";

export function EmptyPortfolio({ onAddTransaction }: { onAddTransaction: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-4 pt-8 md:pt-16 lg:pt-24">
      <Card className="max-w-md w-full p-8">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="rounded-full bg-primary/10 p-6">
            <Wallet className="h-12 w-12 text-primary" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              Your portfolio is empty
            </h2>
            <p className="text-sm text-muted-foreground">
              Start tracking your crypto investments by adding your first transaction
            </p>
          </div>

          <Button onClick={onAddTransaction} size="lg" className="w-full">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Transaction
          </Button>
        </div>
      </Card>
    </div>
  );
}
