"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Mono, Text } from "@/components/ui/typography";
import { searchAirportsAction } from "@/app/actions/airports";
import type { Airport } from "@/lib/travel/airports";
import { cn } from "@/lib/utils";

/**
 * Airport field: type a code, a city or a name and pick from the matches.
 *
 * Whatever is typed IS the value — suggestions only fill it in faster. A small
 * airfield, a bus terminal, "Grandma's house": the field must accept it,
 * because a picker that refuses what the traveller actually meant is worse
 * than a plain text box.
 *
 * Search runs on the server. The dataset is ~7,900 airports and shipping it to
 * the browser would cost 115 KB gzipped for one form field.
 */
export function AirportPicker({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [results, setResults] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Whether the user has reached for a suggestion (arrow keys / hover). Enter
  // otherwise keeps submitting the form, as the comment below promised.
  const [armed, setArmed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const query = value.trim();
  // Derived rather than cleared through state: a short query has no results by
  // definition, and setting state for it inside the effect would cascade a
  // render on every keystroke.
  const visible = query.length < 2 ? [] : results;

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) return;
    // Debounced: a request per keystroke would fire five times for "MCO  " and
    // land out of order.
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Loading starts when the request does, not when typing does: a spinner
      // during the debounce flickers on and off for anyone typing at speed.
      setLoading(true);
      const hits = await searchAirportsAction(q);
      if (cancelled) return;
      setResults(hits);
      setHighlight(0);
      setArmed(false);
      setLoading(false);
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setLoading(false);
    };
  }, [value]);

  // Clicking away closes the list without discarding what was typed.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (airport: Airport) => {
    onChange(airport.code);
    setOpen(false);
  };

  const exact = visible.find(
    (a) => a.code.toLowerCase() === value.trim().toLowerCase()
  );

  return (
    <div ref={boxRef} className="relative">
      <Input
        id={id}
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || visible.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setArmed(true);
            setHighlight((h) => (h + 1) % visible.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setArmed(true);
            setHighlight((h) => (h - 1 + visible.length) % visible.length);
          } else if (e.key === "Enter") {
            // Only steal Enter when a suggestion is actually highlighted —
            // otherwise it must keep submitting the form.
            if (!armed) return;
            e.preventDefault();
            pick(visible[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {/* The flag confirms the pick without spending a row on it. */}
      {exact && !open && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm">
          {exact.flag}
        </span>
      )}
      {loading && open && (
        <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {open && visible.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {visible.map((a, i) => (
            <li key={a.code}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left",
                  i === highlight ? "bg-accent" : "hover:bg-accent/60"
                )}
                onMouseEnter={() => {
                  setHighlight(i);
                  setArmed(true);
                }}
                onClick={() => pick(a)}
              >
                <span className="text-base leading-none">{a.flag}</span>
                <Mono className="w-10 shrink-0 text-xs font-semibold">{a.code}</Mono>
                <span className="min-w-0 flex-1">
                  <Text className="truncate text-xs">{a.city || a.name}</Text>
                  {a.city && (
                    <Text className="truncate text-2xs text-muted-foreground">
                      {a.name}
                    </Text>
                  )}
                </span>
                {a.code.toLowerCase() === value.trim().toLowerCase() && (
                  <Check className="size-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>
            </li>
          ))}
          <li className="px-2 py-1.5">
            <Text className="text-2xs text-muted-foreground">
              Not listed? Whatever you type is kept as-is.
            </Text>
          </li>
        </ul>
      )}
    </div>
  );
}
