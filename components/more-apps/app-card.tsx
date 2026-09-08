"use client";

import {
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  MoreHorizontal,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "@/components/more-apps/provider-icon";
import {
  deriveConsoleUrl,
  type AppListing,
} from "@/app/portal/more-apps/apps-data";

// Deterministic per-app gradient — used when no screenshot is available.
const GRADIENT_BY_SLUG: Record<string, string> = {
  "cv-galaxy": "from-sky-500 to-cyan-500",
  "padel-galaxy": "from-success to-teal-500",
  "trim-success": "from-orange-500 to-destructive",
  lixcore: "from-violet-500 to-purple-500",
};

const PROVIDER_LABEL: Record<AppListing["provider"], string> = {
  vercel: "Vercel",
  firebase: "Firebase",
  other: "Other",
};

const PROVIDER_CONSOLE_LABEL: Record<AppListing["provider"], string> = {
  vercel: "Open in Vercel",
  firebase: "Open in Firebase",
  other: "Open console",
};

function getHostname(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function AppCard({
  app,
  screenshotUrl,
  onHide,
  onShow,
}: {
  app: AppListing;
  screenshotUrl: string | null;
  onHide?: () => void;
  onShow?: () => void;
}) {
  const isLive = app.status === "live" && Boolean(app.url);
  const gradient = GRADIENT_BY_SLUG[app.slug] ?? "from-slate-500 to-slate-700";
  const domain = getHostname(app.url);
  const consoleUrl = deriveConsoleUrl(app);

  const description =
    app.description || (isLive ? "No description" : "Not yet deployed");

  // Treat the dropdown as the single home for secondary actions. Console
  // link, hide / unhide all live here — keeps the card header tidy and
  // mirrors the plans-workspace rail pattern (3-dots in the corner).
  const hasMenuItems = Boolean(consoleUrl) || Boolean(onHide) || Boolean(onShow);

  return (
    <Card
      className={cn(
        "flex flex-col transition-shadow",
        isLive && "hover:ring-foreground/25 hover:shadow-md",
        (!isLive || onShow) && "opacity-60"
      )}
    >
      {/* Screenshot — kept as the visual hero so apps are recognisable at
          a glance. The Card primitive auto-rounds img:first-child, so the
          gradient placeholder mirrors that with rounded-t-xl manually. */}
      {screenshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={screenshotUrl}
          alt={`${app.name} preview`}
          className="aspect-video w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          aria-hidden="true"
          className={cn(
            "flex aspect-video w-full items-center justify-center rounded-t-xl bg-gradient-to-br text-6xl font-bold text-white/90 select-none",
            gradient
          )}
        >
          {app.name.charAt(0)}
        </div>
      )}

      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            <CardTitle className="line-clamp-1">{app.name}</CardTitle>
            <CardDescription className="line-clamp-2">
              {description}
            </CardDescription>
          </div>
          {hasMenuItems && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-2 h-8 w-8"
                  aria-label={`Actions for ${app.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {consoleUrl && (
                  <DropdownMenuItem asChild>
                    <a
                      href={consoleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ProviderIcon
                        provider={app.provider}
                        className="mr-2 h-4 w-4"
                      />
                      {PROVIDER_CONSOLE_LABEL[app.provider]}
                    </a>
                  </DropdownMenuItem>
                )}
                {(consoleUrl && (onHide || onShow)) && <DropdownMenuSeparator />}
                {onShow && (
                  <DropdownMenuItem onSelect={onShow}>
                    <Eye className="mr-2 h-4 w-4" /> Unhide
                  </DropdownMenuItem>
                )}
                {onHide && (
                  <DropdownMenuItem onSelect={onHide}>
                    <EyeOff className="mr-2 h-4 w-4" /> Hide
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="gap-1">
            <ProviderIcon provider={app.provider} className="size-3" />
            {PROVIDER_LABEL[app.provider]}
          </Badge>
          <Badge variant={isLive ? "secondary" : "outline"} className="gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "inline-block size-1.5 rounded-full",
                isLive ? "bg-success" : "bg-muted-foreground/40"
              )}
            />
            {isLive ? "Live" : "Coming soon"}
          </Badge>
          {app.updatedAt && (
            <Badge variant="outline">
              Updated{" "}
              {formatDistanceToNow(new Date(app.updatedAt), { addSuffix: true })}
            </Badge>
          )}
          {domain && (
            <Badge variant="outline" className="font-mono">
              {domain}
            </Badge>
          )}
        </div>

        <div className="mt-auto">
          {isLive ? (
            <Button variant="outline" className="w-full" asChild>
              <a href={app.url!} target="_blank" rel="noopener noreferrer">
                Open
                <ExternalLink className="ml-1 h-4 w-4" />
              </a>
            </Button>
          ) : (
            <Button variant="outline" className="w-full" disabled>
              Coming soon
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
