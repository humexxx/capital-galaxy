"use client";

import Link from "next/link";
import { useTransition } from "react";
import { UserCog, X } from "lucide-react";
import { User } from "@supabase/supabase-js";

import { Logo } from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { CommandMenu } from "@/components/command-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NavUser } from "./nav-user";
import { stopImpersonationAction } from "@/app/actions/impersonation";
import { type Role } from "@/components/portal/nav-config";
import { cn } from "@/lib/utils";

type ImpersonatedUser = {
  id: string;
  email: string | null;
  fullName: string | null;
};

type AppHeaderProps = {
  realUser: User;
  impersonatedUser: ImpersonatedUser | null;
  /** Effective role from the server context (DB-backed). Drives whether the
   *  Admin link surfaces in the horizontal nav. */
  role?: Role;
  isImpersonating?: boolean;
};

// The section links that used to sit here were the sidebar's own groups
// repeated a second time, three inches away and always visible. One list of
// places to go is enough; the header keeps the things the sidebar has no room
// for — search, theme, account, and the impersonation banner.
//
// Header height is 56px (`h-14`). The sidebar offsets itself by the same
// amount via `top-14 h-[calc(100svh-3.5rem)]` in app-sidebar.tsx — keep them
// in sync if you adjust this.
export function AppHeader({
  realUser,
  impersonatedUser,
  role,
  isImpersonating: isImpersonatingProp,
}: AppHeaderProps) {
  const [isStopping, startStop] = useTransition();
  const isImpersonating = isImpersonatingProp ?? impersonatedUser !== null;

  const userData = {
    name:
      realUser.user_metadata.full_name ||
      realUser.email?.split("@")[0] ||
      "User",
    email: realUser.email || "",
    avatar: realUser.user_metadata.avatar_url || "",
  };

  const impersonatedDisplayName =
    impersonatedUser?.fullName || impersonatedUser?.email || "user";

  const handleStop = () => {
    startStop(async () => {
      await stopImpersonationAction();
    });
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 px-3 sm:gap-4 sm:px-6",
        // Frosted bar like the shadcn docs site — flat, no bottom divider, with
        // a solid fallback where backdrop-filter isn't supported. The only time
        // we frame it is while impersonating, to keep that state obvious.
        isImpersonating
          ? "border-b border-warning/40 bg-warning/15"
          : "bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur"
      )}
    >
      {/* Trigger only on mobile — it opens the sidebar sheet. On desktop the
          sidebar is always visible (like the shadcn docs), so no collapse
          control is shown. */}
      <SidebarTrigger className="size-9 shrink-0 md:hidden" />

      {/* Brand: compact mark + wordmark, the first inline element of one flat
          strip (no separators, no "zone" wrapper) — matches shadcn's header. */}
      <Link
        href="/portal"
        aria-label="Allstars Galaxy"
        // Below sm the wordmark is hidden, so the link would collapse to the
        // 20px mark — under the 24px minimum tap target. The negative margin
        // cancels the padding, so the hit area grows to 36px without moving
        // the mark; from sm up the box is exactly what it was.
        className="-m-2 flex shrink-0 items-center gap-2 rounded-md p-2 transition-opacity hover:opacity-80 sm:m-0 sm:p-0"
      >
        <Logo className="size-5" />
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">
          Allstars Galaxy
        </span>
      </Link>

      {/* Flexible spacer pushes utilities to the far right; the impersonation
          banner sits centred when active. */}
      <div className="flex flex-1 items-center justify-center gap-2">
        {isImpersonating && (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-warning/60 bg-background/60 text-warning"
            >
              <UserCog className="mr-1 h-3 w-3" />
              Impersonating
            </Badge>
            <span className="text-sm font-medium text-foreground">
              {impersonatedDisplayName}
            </span>
            {impersonatedUser?.email && impersonatedUser?.fullName && (
              <span className="hidden text-xs text-foreground/70 sm:inline">
                ({impersonatedUser.email})
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isImpersonating && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleStop}
            disabled={isStopping}
            className="border-warning/60 bg-background/60 text-warning hover:bg-warning/20"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            {isStopping ? "Stopping…" : "Stop impersonating"}
          </Button>
        )}
        <CommandMenu role={role} isImpersonating={isImpersonating} />
        <ModeToggle />
        <NavUser user={userData} />
      </div>
    </header>
  );
}
