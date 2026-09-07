"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Check, Copy, Link2, Loader2, QrCode, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Mono, Text } from "@/components/ui/typography";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createTripShareAction,
  deleteTripShareAction,
  revokeTripShareAction,
} from "@/app/actions/travel";
import type { TripShare, TripWithRelations } from "@/types/travel";

type TripSharePanelProps = {
  trip: TripWithRelations;
  baseUrl: string;
  /** Traveller in focus upstairs — the picker's starting point, not a lock. */
  scopeToMemberId?: string | null;
};

/** Sentinel for "not scoped to anybody" — Select has no value for null. */
const EVERYONE = "__everyone__";

function shareUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/trips/${token}`;
}

export function TripSharePanel({
  trip,
  baseUrl,
  scopeToMemberId = null,
}: TripSharePanelProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [creating, startCreate] = useTransition();
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  // Who the link is for is asked here, not inherited from a click behind the
  // dialog. It starts on whoever is in focus, so the common case is still one
  // button — but changing your mind no longer means closing this first.
  const [scopeId, setScopeId] = useState<string>(scopeToMemberId ?? EVERYONE);
  const scopeName = trip.members.find((m) => m.id === scopeId)?.name ?? null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Enter a valid email or leave it blank");
      return;
    }
    startCreate(async () => {
      const res = await createTripShareAction(trip.id, {
        inviteeEmail: trimmed || null,
        memberId: scopeId === EVERYONE ? null : scopeId,
      });
      if (res.success && res.data) {
        const url = shareUrl(baseUrl, res.data.token);
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Share link copied to clipboard");
        } catch {
          toast.success("Share link created");
        }
        setEmail("");
        router.refresh();
      } else if (!res.success) {
        toast.error(res.error);
      }
    });
  };

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(baseUrl, token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((current) => (current === token ? null : current)), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  // Expired links are rejected by the public resolver exactly like revoked
  // ones — listing them as "Active" hands the owner a copyable dead link.
  // Snapshot "now" once per mount: render-pure, and expiry granularity is
  // days, so a stale-by-minutes comparison is irrelevant.
  const [now] = useState(() => Date.now());
  const isExpired = (s: TripShare): boolean =>
    s.expiresAt !== null && new Date(s.expiresAt).getTime() < now;
  const active = trip.shares.filter((s) => s.revokedAt === null && !isExpired(s));
  const revoked = trip.shares.filter((s) => s.revokedAt !== null || isExpired(s));

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCreate} className="flex flex-col gap-2 ">
        <Field className="gap-1.5">
          <FieldLabel htmlFor="share-scope" className="text-xs">
            Who is this link for?
          </FieldLabel>
          <Select value={scopeId} onValueChange={setScopeId}>
            <SelectTrigger id="share-scope" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={EVERYONE}>Everyone — the whole trip</SelectItem>
                {trip.members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field className="gap-1.5">
          <FieldLabel htmlFor="share-email" className="text-xs">
            Label <span className="text-muted-foreground">(optional)</span>
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="share-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              disabled={creating}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" variant="default" disabled={creating}>
                {creating ? <Loader2 className="animate-spin" /> : <Link2 />}
                {scopeName ? `For ${scopeName.split(" ")[0]}` : "Create"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>

        {/* Said before the click, not after: which traveller a link exposes is
            not something to discover from the result. */}
        <Text variant="small">
          {scopeName ? (
            <>
              This link shows{" "}
              <span className="font-medium text-foreground">{scopeName}&apos;s</span>{" "}
              share of each cost — not the trip totals, and not the other
              travellers.
            </>
          ) : (
            <>
              This link shows the plan without any prices. The label is only for
              you — nothing is sent to it.
            </>
          )}
        </Text>
      </form>

      {active.length > 0 && (
        <div className="flex flex-col gap-2 ">
          <Text variant="small" weight="medium">Active links</Text>
          <ul className="flex flex-col gap-2 ">
            {active.map((share) => (
              <ShareRow
                key={share.id}
                tripId={trip.id}
                share={share}
                baseUrl={baseUrl}
                copied={copiedToken === share.token}
                memberName={
                  trip.members.find((m) => m.id === share.memberId)?.name ?? null
                }
                onCopy={() => handleCopy(share.token)}
              />
            ))}
          </ul>
        </div>
      )}

      {revoked.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            Revoked or expired ({revoked.length})
          </summary>
          <ul className="flex flex-col gap-1 mt-2">
            {revoked.map((share) => (
              <li key={share.id} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1">
                <Text as="span" variant="small">
                  {share.inviteeEmail ?? "Anonymous"} ·{" "}
                  {share.revokedAt ? (
                    <Mono>{format(new Date(share.revokedAt), "MMM d")}</Mono>
                  ) : share.expiresAt ? (
                    <Mono>expired {format(new Date(share.expiresAt), "MMM d")}</Mono>
                  ) : (
                    ""
                  )}
                </Text>
                <DeleteRevokedButton tripId={trip.id} shareId={share.id} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ShareRow({
  tripId,
  share,
  baseUrl,
  copied,
  memberName,
  onCopy,
}: {
  tripId: string;
  share: TripShare;
  baseUrl: string;
  copied: boolean;
  /** Traveller this link is scoped to, or null for the whole trip. */
  memberName: string | null;
  onCopy: () => void;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [showQr, setShowQr] = useState(false);
  const url = shareUrl(baseUrl, share.token);

  const handleRevoke = () => {
    startTransition(async () => {
      const res = await revokeTripShareAction(tripId, share.id);
      if (res.success) {
        toast.success("Link revoked");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <li className="flex flex-col gap-1 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">
            {share.inviteeEmail ?? "Anyone with the link"}
          </span>
          {/* Two links to the same trip can show completely different money.
              Which is which cannot live only in the owner's memory. */}
          <Badge variant="outline" className="shrink-0 text-2xs font-normal">
            {memberName ?? "Whole trip"}
          </Badge>
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 text-destructive hover:text-destructive sm:size-7"
          onClick={handleRevoke}
          disabled={busy}
          aria-label="Revoke link"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {/* One control instead of a box that looks like a field sitting next to
          a button that is not part of it. The link stays selectable, and the
          thing you actually want — copy — is inside it. */}
      <InputGroup className="h-8">
        <InputGroupInput readOnly value={url} className="font-mono text-2xs" />
        <InputGroupAddon align="inline-end">
          {/* A phone cannot be handed a URL. The code is the way this link
              crosses to a device that is not this one. */}
          <InputGroupButton
            type="button"
            size="icon-xs"
            onClick={() => setShowQr((v) => !v)}
            aria-label={showQr ? "Hide QR code" : "Show QR code"}
            aria-expanded={showQr}
          >
            <QrCode />
          </InputGroupButton>
          <InputGroupButton
            type="button"
            size="icon-xs"
            onClick={onCopy}
            aria-label={copied ? "Copied" : "Copy link"}
          >
            {copied ? <Check /> : <Copy />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      {showQr && (
        <div className="flex flex-col items-center gap-2 rounded-md border bg-card p-3">
          {/* The code is a link, not a picture of one. A phone cannot scan
              its own screen, so on the device holding this the useful gesture
              is a long press — which only offers "open" and "copy" when the
              thing pressed is an anchor. */}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open this link"
            // White behind the code whatever the theme: a dark surface
            // inverts the quiet zone and most scanners give up.
            className="rounded bg-white p-2 outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <QRCodeSVG value={url} size={132} level="M" marginSize={0} />
          </a>
          <Text className="text-center text-2xs text-muted-foreground">
            Point a camera at this — or hold it down to open it here
          </Text>
        </div>
      )}
    </li>
  );
}

function DeleteRevokedButton({ tripId, shareId }: { tripId: string; shareId: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-8 sm:size-6"
      onClick={() =>
        startTransition(async () => {
          const res = await deleteTripShareAction(tripId, shareId);
          if (res.success) {
            router.refresh();
          } else {
            toast.error(res.error);
          }
        })
      }
      disabled={busy}
      aria-label="Delete record"
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
