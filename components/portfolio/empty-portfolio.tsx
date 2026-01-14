import { Button } from "@/components/ui/button";

export function EmptyPortfolio({ onAddTransaction }: { onAddTransaction: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="relative">
        <svg
          className="h-48 w-48"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="40" y="60" width="120" height="80" rx="8" fill="hsl(var(--primary))" opacity="0.1" />
          <rect x="60" y="80" width="80" height="40" rx="4" fill="hsl(var(--primary))" opacity="0.2" />
          <circle cx="100" cy="140" r="30" fill="hsl(var(--muted))" />
          <circle cx="100" cy="140" r="20" fill="hsl(var(--background))" />
          <path d="M100 130 L100 150 M90 140 L110 140" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-semibold">This portfolio needs some final touches...</h2>
        <p className="text-muted-foreground">Add a coin to get started</p>
      </div>
      <Button onClick={onAddTransaction} size="lg">
        + Add Transaction
      </Button>
    </div>
  );
}
