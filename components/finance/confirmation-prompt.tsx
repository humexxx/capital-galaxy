"use client";

import { useState, useSyncExternalStore } from "react";

import { ConfirmationDialog } from "./confirmation-dialog";
import type { FinancePlanDebt } from "@/types/finance";

type ConfirmationPromptProps = {
  planId: string;
  planName: string;
  monthLabel: string;
  projected: {
    savings: number;
    investments: number;
    debts: Array<{ debtId: string; name: string; balance: number }>;
  };
  debts: FinancePlanDebt[];
};

const DISMISS_KEY_PREFIX = "cg-confirmation-dismissed:";

// useSyncExternalStore lets us read localStorage during render without violating
// the "no setState in useEffect" rule. SSR-safe via the server snapshot fn.
function subscribeStorage(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function readDismissed(key: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) !== null;
}

/**
 * Auto-opens the confirmation dialog when the user lands on the dashboard.
 * Stores a "dismissed for today" flag in localStorage so it doesn't pester them
 * if they skipped.
 */
export function ConfirmationPrompt(props: ConfirmationPromptProps) {
  // The reader's calendar day: a UTC key expired at 7pm for someone in UTC-5
  // and then re-showed the prompt mid-afternoon.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dismissKey = `${DISMISS_KEY_PREFIX}${props.planId}:${today}`;
  const dismissed = useSyncExternalStore(
    subscribeStorage,
    () => readDismissed(dismissKey),
    () => false
  );
  const [closedLocally, setClosedLocally] = useState(false);
  const open = !dismissed && !closedLocally;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setClosedLocally(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(dismissKey, "1");
      }
    }
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={handleOpenChange}
      planId={props.planId}
      planName={props.planName}
      monthLabel={props.monthLabel}
      projected={props.projected}
      debts={props.debts}
    />
  );
}
