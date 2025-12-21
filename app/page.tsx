import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">
        Capital Galaxy
      </h1>
      <p className="text-xl text-muted-foreground">
        Welcome to your capital management platform.
      </p>
      <div className="flex gap-4">
        <Button asChild size="lg">
          <Link href="/portal">Go to Portal</Link>
        </Button>
      </div>
    </div>
  )
}
