"use client";

import { useState, type ReactNode } from "react";
import { Palette, Wallet, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import { AppearanceSettings } from "@/components/settings/preferences-form";
import { FinanceSettings } from "@/components/settings/milestones-form";
import type { UserPreferences } from "@/lib/services/user-preferences-service";
import { cn } from "@/lib/utils";

/**
 * Settings, grouped by the part of the app they affect — a System-Settings
 * shape (category rail on the left, one pane on the right) rendered in this
 * app's own vocabulary: shadcn Card, Geist, the standard border/muted tokens.
 *
 * Adding a category means adding one entry here plus its panel component; the
 * layout doesn't change.
 */
type Category = {
  id: string;
  label: string;
  /** One line under the pane title — what this group actually controls. */
  blurb: string;
  icon: LucideIcon;
  /** Tint for the icon chip. Apple leans on per-category colour here. */
  tint: string;
  render: (preferences: UserPreferences) => ReactNode;
};

const CATEGORIES: Category[] = [
  {
    id: "appearance",
    label: "Appearance",
    blurb: "How the portal looks and feels.",
    icon: Palette,
    tint: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
    render: (p) => <AppearanceSettings preferences={p} />,
  },
  {
    id: "finance",
    label: "Finance",
    blurb: "Defaults for your plans and projection charts.",
    icon: Wallet,
    tint: "bg-success/12 text-success",
    render: (p) => <FinanceSettings milestones={p.financeMilestones} />,
  },
];

export function SettingsShell({ preferences }: { preferences: UserPreferences }) {
  const [activeId, setActiveId] = useState(CATEGORIES[0].id);
  const active = CATEGORIES.find((c) => c.id === activeId) ?? CATEGORIES[0];

  return (
    <div className="grid gap-4 sm:grid-cols-[13rem_1fr] sm:items-start sm:gap-6">
      {/* Category rail. A vertical list from sm up (System Settings); a
          horizontal scroll rail on phones, where a fixed sidebar would eat
          half the screen. `relative` is load-bearing on the scroller — see
          the responsive-ui skill. */}
      <nav
        aria-label="Settings categories"
        className="relative -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-col sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const isActive = c.id === active.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors sm:w-full",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md",
                  c.tint
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="truncate text-sm font-medium">{c.label}</span>
            </button>
          );
        })}
      </nav>

      <Card className="min-w-0">
        <CardContent className="space-y-5">
          <div className="space-y-1">
            <Heading level="h5" as="h2">
              {active.label}
            </Heading>
            <Text variant="muted">{active.blurb}</Text>
          </div>
          {active.render(preferences)}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * One setting inside a pane: label + explanation on the left, its control on
 * the right. Rows are separated by hairlines rather than each being its own
 * card — the grouped-list look, and it keeps a pane readable as one block.
 */
export function SettingRow({
  label,
  description,
  control,
  children,
}: {
  label: string;
  description?: string;
  /** Right-aligned control (switch, button…). Omit for full-width settings. */
  control?: ReactNode;
  /** Content below the row — editors that need the full width. */
  children?: ReactNode;
}) {
  return (
    <div className="border-t pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <Text variant="small" className="font-medium text-foreground">
            {label}
          </Text>
          {description && (
            <Text variant="small" className="text-muted-foreground">
              {description}
            </Text>
          )}
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
