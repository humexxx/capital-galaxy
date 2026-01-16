"use client";

import { ModeToggle } from "@/components/mode-toggle";

import { NavUser } from "./nav-user";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { User } from "@supabase/supabase-js";

export function AppHeader({ user }: { user: User }) {
  const userData = {
    name: user.user_metadata.full_name || user.email?.split("@")[0] || "User",
    email: user.email || "",
    avatar: user.user_metadata.avatar_url || "",
  };

  return (
    <header className="sticky top-0 flex h-16 shrink-0 items-center gap-4 border-b bg-background px-6 justify-between">
      <div className="flex items-center gap-4">
        <SidebarTrigger />
        <h1 className="text-xl font-bold">Capital Galaxy</h1>
      </div>
      <div className="flex items-center gap-4">
        <ModeToggle />
        <NavUser user={userData} />
      </div>
    </header>
  );
}

