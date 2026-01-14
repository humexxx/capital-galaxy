"use client";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { NavUser } from "./nav-user";
import { User } from "@supabase/supabase-js";
import Link from "next/link";

export function AppHeader({ user }: { user: User }) {
  const userData = {
    name: user.user_metadata.full_name || user.email?.split("@")[0] || "User",
    email: user.email || "",
    avatar: user.user_metadata.avatar_url || "",
  };

  return (
    <header className="sticky top-0 flex h-16 shrink-0 items-center gap-4 border-b bg-background px-6 justify-between">
      <div className="flex items-center gap-6">
        <Link href="/portal" className="text-xl font-bold">
          Capital Galaxy
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/portal/portfolio">
            <Button variant="ghost">Portfolio</Button>
          </Link>
          <Link href="/portal/investment-methods">
            <Button variant="ghost">Investment Methods</Button>
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <ModeToggle />
        <NavUser user={userData} />
      </div>
    </header>
  );
}

