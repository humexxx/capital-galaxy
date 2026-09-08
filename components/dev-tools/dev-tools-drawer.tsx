"use client";

import * as React from "react";
import { Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Eyebrow, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

import {
  type DevToolHelper,
  useDevToolsCommands,
  useDevToolsState,
} from "./dev-tools-context";

const DEFAULT_SECTION = "Tools";

/**
 * Floating trigger + right-side drawer for dev/tester helpers. Only mounted
 * in `NODE_ENV === "development"`. Reads registered helpers from
 * `DevToolsProvider` and groups them by section.
 */
export function DevToolsDrawer() {
  const state = useDevToolsState();
  const commands = useDevToolsCommands();

  if (process.env.NODE_ENV !== "development") return null;
  if (!state || !commands) return null;

  const { helpers, open } = state;
  const { setOpen } = commands;
  const grouped = groupBySection(helpers);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="Open dev tools"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-40 h-10 w-10 rounded-full shadow-lg",
          "border border-warning/40 bg-warning/10 text-warning hover:bg-warning/20",
          ""
        )}
      >
        <Wrench className="h-4 w-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-warning" /> Dev tools
            </SheetTitle>
            <SheetDescription>
              Page-scoped helpers — only visible in development.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {grouped.length === 0 ? (
              <Text variant="muted" className="text-sm">
                No helpers registered for this page yet.
              </Text>
            ) : (
              <div className="space-y-6">
                {grouped.map(({ section, items }) => (
                  <section key={section} className="space-y-2">
                    <Eyebrow as="div" className="text-2xs" role="heading" aria-level={3}>
                      {section}
                    </Eyebrow>
                    <ul className="space-y-2">
                      {items.map((helper) => (
                        <li key={helper.id ?? helper.kind}>
                          <HelperRow helper={helper} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function HelperRow({ helper }: { helper: DevToolHelper }) {
  if (helper.kind === "toggle") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{helper.label}</p>
          {helper.description && (
            <p className="text-xs text-muted-foreground">{helper.description}</p>
          )}
        </div>
        <Switch
          checked={helper.checked}
          onCheckedChange={helper.onChange}
          aria-label={helper.label}
        />
      </div>
    );
  }

  if (helper.kind === "action") {
    return <ActionRow helper={helper} />;
  }

  return <div className="rounded-md border bg-card p-3">{helper.render()}</div>;
}

function ActionRow({
  helper,
}: {
  helper: Extract<DevToolHelper, { kind: "action" }>;
}) {
  const [pending, startTransition] = React.useTransition();
  const Icon = helper.icon;
  const handleClick = () => {
    startTransition(async () => {
      try {
        await helper.onRun();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Action failed"
        );
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{helper.label}</p>
        {helper.description && (
          <p className="text-xs text-muted-foreground">{helper.description}</p>
        )}
      </div>
      <Button
        size="sm"
        variant={helper.variant === "destructive" ? "destructive" : "outline"}
        onClick={handleClick}
        disabled={pending}
      >
        {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
        {pending ? "Running…" : "Run"}
      </Button>
    </div>
  );
}

function groupBySection(
  helpers: DevToolHelper[]
): { section: string; items: DevToolHelper[] }[] {
  const map = new Map<string, DevToolHelper[]>();
  for (const h of helpers) {
    const key = h.section ?? DEFAULT_SECTION;
    const arr = map.get(key);
    if (arr) arr.push(h);
    else map.set(key, [h]);
  }
  return Array.from(map.entries()).map(([section, items]) => ({ section, items }));
}
