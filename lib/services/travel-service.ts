import "server-only";

import { randomBytes } from "node:crypto";
import { cache } from "react";

import { and, asc, desc, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { tripCost } from "@/lib/travel/pricing";

/** `[{ itemId, memberId }]` → `Map<itemId, memberId[]>`, for payers and attendees alike. */
function groupByItem(rows: { itemId: string; memberId: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.itemId) ?? [];
    list.push(row.memberId);
    map.set(row.itemId, list);
  }
  return map;
}

/** The handle inside `db.transaction`, which is the same shape as `db`. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
import {
  trips,
  tripContributions,
  tripItems,
  tripItemAttendees,
  tripItemPayers,
  tripItemStops,
  tripMembers,
  tripPhotos,
  tripShares,
} from "@/db/schema";
import type {
  DashboardTravelFeaturedTrip,
  DashboardTravelSummary,
  DashboardTravelTripState,
  PublicTripScope,
  PublicTripView,
  Trip,
  TripContribution,
  TripItem,
  TripItemWithStops,
  TripPhoto,
  TripShare,
  TripWithRelations,
} from "@/types/travel";
import type {
  CreateTripInput,
  CreateTripShareInput,
  TripContributionInput,
  UpdateTripContributionInput,
  TripItemInput,
  TripPhotoInput,
  UpdateTripInput,
  UpdateTripItemInput,
  MoveTripItemInput,
} from "@/schemas/travel";

import { itemConcerns, splitTrip } from "@/lib/travel/split";

import { ensureOwnedRow } from "./ownership";

// ---------- helpers ----------

async function ensureTripOwnership(tripId: string, userId: string): Promise<void> {
  await ensureOwnedRow({
    table: trips,
    idColumn: trips.id,
    id: tripId,
    userId,
    entity: "Trip",
  });
}

/**
 * A member id is only meaningful inside its own trip.
 *
 * The foreign key proves the row exists; it says nothing about *which* trip it
 * belongs to. Scoping a share or a payment to a member borrowed from another
 * trip would otherwise be accepted.
 */
async function ensureMemberBelongsToTrip(
  memberId: string,
  tripId: string
): Promise<void> {
  const [row] = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(and(eq(tripMembers.id, memberId), eq(tripMembers.tripId, tripId)));
  if (!row) throw new Error("Traveller not found on this trip");
}

// URL-safe random token. 24 bytes → 32 chars base64url, ~192 bits of entropy.
// More than enough that brute-force enumeration is impractical without rate
// limits — and we still index the column uniquely as a defense in depth.
function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function tripState(trip: Trip, today: string): DashboardTravelTripState {
  const lastDay = trip.endDate ?? trip.startDate;
  if (lastDay < today) return "past";
  if (trip.startDate > today) return "upcoming";
  return "in_progress";
}

// ---------- trip CRUD ----------

export async function listUserTrips(userId: string): Promise<Trip[]> {
  return db
    .select()
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(asc(trips.startDate));
}

/**
 * Wrapped in React's `cache()` so calls from `generateMetadata` and the page
 * body within the same request hit the DB once. Args are part of the cache
 * key, so the per-user filter remains safe.
 */
export const getTripWithRelations = cache(async function getTripWithRelations(
  tripId: string,
  userId: string
): Promise<TripWithRelations | null> {
  const [trip] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)));
  if (!trip) return null;

  const [items, photos, shares, stops, members, contributions, payers, attendees] =
    await Promise.all([
    db
      .select()
      .from(tripItems)
      .where(eq(tripItems.tripId, tripId))
      .orderBy(asc(tripItems.scheduledOn), asc(tripItems.sortOrder), asc(tripItems.createdAt)),
    db
      .select()
      .from(tripPhotos)
      .where(eq(tripPhotos.tripId, tripId))
      .orderBy(asc(tripPhotos.sortOrder), asc(tripPhotos.createdAt)),
    db
      .select()
      .from(tripShares)
      .where(eq(tripShares.tripId, tripId))
      .orderBy(asc(tripShares.createdAt)),
    // Every stop for this trip in one query, attached to its item below. A
    // query per item would be N+1 for something that is at most a couple of
    // dozen rows.
    db
      .select({
        id: tripItemStops.id,
        itemId: tripItemStops.itemId,
        dayNumber: tripItemStops.dayNumber,
        stopOn: tripItemStops.stopOn,
        place: tripItemStops.place,
        note: tripItemStops.note,
      })
      .from(tripItemStops)
      .innerJoin(tripItems, eq(tripItemStops.itemId, tripItems.id))
      .where(eq(tripItems.tripId, tripId))
      .orderBy(asc(tripItemStops.dayNumber)),
    db
      .select({
        id: tripMembers.id,
        name: tripMembers.name,
        email: tripMembers.email,
        sharePercent: tripMembers.sharePercent,
      })
      .from(tripMembers)
      .where(eq(tripMembers.tripId, tripId))
      .orderBy(asc(tripMembers.sortOrder), asc(tripMembers.createdAt)),
    db
      .select()
      .from(tripContributions)
      .where(eq(tripContributions.tripId, tripId))
      // Newest first: a payment log is read from the top, and the question it
      // answers is "did the last one land", not "what happened first".
      .orderBy(desc(tripContributions.paidOn), desc(tripContributions.createdAt)),
    // Who covers what, in one query for the trip. `splitTrip` has honoured
    // this since it was written; nothing ever loaded it, so every item was
    // divided among everybody.
    db
      .select({ itemId: tripItemPayers.itemId, memberId: tripItemPayers.memberId })
      .from(tripItemPayers)
      .innerJoin(tripItems, eq(tripItemPayers.itemId, tripItems.id))
      .where(eq(tripItems.tripId, tripId)),
    // And who is actually ON each item, which is a different question.
    db
      .select({ itemId: tripItemAttendees.itemId, memberId: tripItemAttendees.memberId })
      .from(tripItemAttendees)
      .innerJoin(tripItems, eq(tripItemAttendees.itemId, tripItems.id))
      .where(eq(tripItems.tripId, tripId)),
  ]);

  const stopsByItem = new Map<string, typeof stops>();
  for (const stop of stops) {
    const list = stopsByItem.get(stop.itemId) ?? [];
    list.push(stop);
    stopsByItem.set(stop.itemId, list);
  }

  // A photo belongs to one place or the other: the gallery is the trip's own
  // photos, and an item's photos travel with the item.
  const payersByItem = groupByItem(payers);
  const attendeesByItem = groupByItem(attendees);

  const photosByItem = new Map<string, typeof photos>();
  for (const photo of photos) {
    if (!photo.itemId) continue;
    const list = photosByItem.get(photo.itemId) ?? [];
    list.push(photo);
    photosByItem.set(photo.itemId, list);
  }

  return {
    ...trip,
    items: items.map((i) => ({
      ...i,
      stops: stopsByItem.get(i.id) ?? [],
      photos: photosByItem.get(i.id) ?? [],
      payerIds: payersByItem.get(i.id) ?? [],
      attendeeIds: attendeesByItem.get(i.id) ?? [],
    })),
    photos: photos.filter((p) => !p.itemId),
    shares,
    contributions,
    members: members.map((m) => ({
      ...m,
      sharePercent: m.sharePercent === null ? null : Number(m.sharePercent),
    })),
  };
});

export async function createTrip(
  userId: string,
  data: CreateTripInput
): Promise<Trip> {
  const [trip] = await db
    .insert(trips)
    .values({
      userId,
      title: data.title,
      destination: data.destination ?? null,
      description: data.description ?? null,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      coverPhotoUrl: data.coverPhotoUrl ?? null,
      currency: data.currency,
      color: data.color,
    })
    .returning();
  return trip;
}

export async function updateTrip(
  userId: string,
  data: UpdateTripInput
): Promise<Trip> {
  await ensureTripOwnership(data.id, userId);
  const [trip] = await db
    .update(trips)
    .set({
      title: data.title,
      destination: data.destination ?? null,
      description: data.description ?? null,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      coverPhotoUrl: data.coverPhotoUrl ?? null,
      currency: data.currency,
      color: data.color,
      updatedAt: new Date(),
    })
    .where(eq(trips.id, data.id))
    .returning();
  return trip;
}

export async function deleteTrip(userId: string, tripId: string): Promise<void> {
  await ensureTripOwnership(tripId, userId);
  await db.delete(trips).where(eq(trips.id, tripId));
}

// ---------- items ----------

/**
 * Replaces one of an item's member lists wholesale.
 *
 * Delete-then-insert rather than a diff: the set is at most a handful of rows
 * and reconciling it would be more code than it saves. Members are checked
 * against the trip for the same reason everything else here is — the foreign
 * key proves the row exists, not which trip it belongs to.
 *
 * Takes the table because payers and attendees differ in nothing else, and two
 * copies of this drift the moment one of them is fixed.
 */
async function setItemMembers(
  table: typeof tripItemPayers | typeof tripItemAttendees,
  tx: Tx,
  tripId: string,
  itemId: string,
  memberIds: string[]
): Promise<void> {
  await tx.delete(table).where(eq(table.itemId, itemId));
  if (memberIds.length === 0) return;

  const valid = await tx
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), inArray(tripMembers.id, memberIds)));
  if (valid.length !== memberIds.length) {
    throw new Error("Traveller not found on this trip");
  }

  await tx.insert(table).values(memberIds.map((memberId) => ({ itemId, memberId })));
}

export async function addTripItem(
  userId: string,
  tripId: string,
  data: TripItemInput
): Promise<TripItem> {
  await ensureTripOwnership(tripId, userId);
  // Three tables in one save. Without a transaction a rejected traveller left
  // the item written and its member lists half-replaced — the item silently
  // becoming everybody's while the user was told the save failed.
  return db.transaction(async (tx) => {
  const [row] = await tx
    .insert(tripItems)
    .values({
      tripId,
      title: data.title,
      category: data.category,
      link: data.link ?? null,
      videoUrl: data.videoUrl ?? null,
      fromCode: data.fromCode ?? null,
      toCode: data.toCode ?? null,
      roundTrip: data.roundTrip ?? false,
      priceMax: data.priceMax ?? null,
      priceUnit: data.priceUnit ?? "total",
      endsOn: data.endsOn ?? null,
      price: data.price ?? null,
      scheduledOn: data.scheduledOn ?? null,
      notes: data.notes ?? null,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();
  // A brand-new row has nothing to clear, so only a named list is worth a
  // round trip here. On update it is unconditional — clearing is meaningful.
  if (data.payerIds?.length) {
    await setItemMembers(tripItemPayers, tx, tripId, row.id, data.payerIds);
  }
  if (data.attendeeIds?.length) {
    await setItemMembers(tripItemAttendees, tx, tripId, row.id, data.attendeeIds);
  }
  return row;
  });
}

export async function updateTripItem(
  userId: string,
  tripId: string,
  data: UpdateTripItemInput
): Promise<TripItem> {
  await ensureTripOwnership(tripId, userId);
  return db.transaction(async (tx) => {
  const [row] = await tx
    .update(tripItems)
    .set({
      title: data.title,
      category: data.category,
      link: data.link ?? null,
      videoUrl: data.videoUrl ?? null,
      fromCode: data.fromCode ?? null,
      toCode: data.toCode ?? null,
      roundTrip: data.roundTrip ?? false,
      priceMax: data.priceMax ?? null,
      priceUnit: data.priceUnit ?? "total",
      endsOn: data.endsOn ?? null,
      price: data.price ?? null,
      scheduledOn: data.scheduledOn ?? null,
      notes: data.notes ?? null,
      sortOrder: data.sortOrder,
      updatedAt: new Date(),
    })
    .where(and(eq(tripItems.id, data.id), eq(tripItems.tripId, tripId)))
    .returning();
  // The item can be gone — deleted in another tab while this dialog was open.
  // `moveTripItem` has always guarded this; without it `row.id` below is a
  // TypeError instead of a message.
  if (!row) throw new Error("Item not found on this trip");
  // Always, not only when non-empty: clearing the list is how an item goes
  // back to the trip's own split.
  await setItemMembers(tripItemPayers, tx, tripId, row.id, data.payerIds ?? []);
  await setItemMembers(tripItemAttendees, tx, tripId, row.id, data.attendeeIds ?? []);
  return row;
  });
}

/** Just the dates. See `moveTripItemSchema` for why nothing else travels. */
export async function moveTripItem(
  userId: string,
  tripId: string,
  data: MoveTripItemInput
): Promise<TripItem> {
  await ensureTripOwnership(tripId, userId);
  const [row] = await db
    .update(tripItems)
    .set({ scheduledOn: data.scheduledOn, endsOn: data.endsOn ?? null, updatedAt: new Date() })
    .where(and(eq(tripItems.id, data.id), eq(tripItems.tripId, tripId)))
    .returning();
  if (!row) throw new Error("Item not found on this trip");
  return row;
}

export async function deleteTripItem(
  userId: string,
  tripId: string,
  itemId: string
): Promise<void> {
  await ensureTripOwnership(tripId, userId);
  await db
    .delete(tripItems)
    .where(and(eq(tripItems.id, itemId), eq(tripItems.tripId, tripId)));
}

// ---------- photos ----------

export async function addTripPhoto(
  userId: string,
  tripId: string,
  data: TripPhotoInput
): Promise<TripPhoto> {
  await ensureTripOwnership(tripId, userId);
  const [row] = await db
    .insert(tripPhotos)
    .values({
      tripId,
      itemId: data.itemId ?? null,
      url: data.url,
      storagePath: data.storagePath ?? null,
      source: data.source,
      caption: data.caption ?? null,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();
  return row;
}

export async function deleteTripPhoto(
  userId: string,
  tripId: string,
  photoId: string
): Promise<TripPhoto | null> {
  await ensureTripOwnership(tripId, userId);
  const [removed] = await db
    .delete(tripPhotos)
    .where(and(eq(tripPhotos.id, photoId), eq(tripPhotos.tripId, tripId)))
    .returning();
  return removed ?? null;
}

// ---------- shares ----------

export async function createTripShare(
  userId: string,
  tripId: string,
  data: CreateTripShareInput
): Promise<TripShare> {
  await ensureTripOwnership(tripId, userId);
  if (data.memberId) await ensureMemberBelongsToTrip(data.memberId, tripId);

  const [row] = await db
    .insert(tripShares)
    .values({
      tripId,
      token: generateShareToken(),
      inviteeEmail: data.inviteeEmail ?? null,
      memberId: data.memberId ?? null,
      // A link scoped to one traveller exists to show that traveller their
      // own bill, so it carries prices unless the caller says otherwise. An
      // unscoped link keeps the cautious default.
      showPrices: data.showPrices ?? Boolean(data.memberId),
      expiresAt: data.expiresAt ?? null,
    })
    .returning();
  return row;
}

export async function revokeTripShare(
  userId: string,
  tripId: string,
  shareId: string
): Promise<void> {
  await ensureTripOwnership(tripId, userId);
  await db
    .update(tripShares)
    .set({ revokedAt: new Date() })
    .where(and(eq(tripShares.id, shareId), eq(tripShares.tripId, tripId)));
}

export async function deleteTripShare(
  userId: string,
  tripId: string,
  shareId: string
): Promise<void> {
  await ensureTripOwnership(tripId, userId);
  await db
    .delete(tripShares)
    .where(and(eq(tripShares.id, shareId), eq(tripShares.tripId, tripId)));
}

// ---------- contributions ----------

/**
 * Records money a traveller has actually handed over.
 *
 * The member is re-checked against this trip rather than trusted from the
 * request. The foreign key only proves the id names *a* member somewhere —
 * without this check a caller could credit a payment against a stranger's
 * trip and read the balance back through their own.
 */
export async function addTripContribution(
  userId: string,
  tripId: string,
  data: TripContributionInput
): Promise<TripContribution> {
  await ensureTripOwnership(tripId, userId);
  await ensureMemberBelongsToTrip(data.memberId, tripId);

  const [row] = await db
    .insert(tripContributions)
    .values({
      tripId,
      memberId: data.memberId,
      amount: data.amount,
      note: data.note ?? null,
      paidOn: data.paidOn ?? todayIso(),
    })
    .returning();
  return row;
}

export async function updateTripContribution(
  userId: string,
  tripId: string,
  data: UpdateTripContributionInput
): Promise<TripContribution> {
  await ensureTripOwnership(tripId, userId);
  const [row] = await db
    .update(tripContributions)
    .set({
      amount: data.amount,
      note: data.note ?? null,
      // No `?? todayIso()` here, unlike the insert: on an update, null means
      // "no date recorded", and defaulting it re-stamped a payment with today
      // every time somebody edited only its note.
      paidOn: data.paidOn ?? null,
    })
    // Scoped to the trip as well as the row: the id alone would let a caller
    // edit a payment recorded against somebody else's trip.
    .where(
      and(eq(tripContributions.id, data.id), eq(tripContributions.tripId, tripId))
    )
    .returning();
  if (!row) throw new Error("Payment not found on this trip");
  return row;
}

export async function deleteTripContribution(
  userId: string,
  tripId: string,
  contributionId: string
): Promise<void> {
  await ensureTripOwnership(tripId, userId);
  await db
    .delete(tripContributions)
    .where(
      and(
        eq(tripContributions.id, contributionId),
        eq(tripContributions.tripId, tripId)
      )
    );
}

/**
 * Resolves a public share token to the trip view rendered on `/trips/{token}`.
 *
 * Returns null when:
 *   - the token doesn't exist
 *   - the share has been revoked
 *   - the share has expired
 *
 * No auth required — the token IS the credential. Callers should never expose
 * trip ownership data (userId) or other shares of the same trip back to the
 * public renderer.
 *
 * `React.cache()` so `generateMetadata` and the page body share one DB hit per
 * request — same reason `getTripWithRelations` is wrapped.
 */
export const getPublicTripByToken = cache(async function getPublicTripByToken(
  token: string
): Promise<PublicTripView | null> {
  const [share] = await db
    .select()
    .from(tripShares)
    .where(and(eq(tripShares.token, token), isNull(tripShares.revokedAt)));
  if (!share) return null;
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return null;

  const [trip] = await db.select().from(trips).where(eq(trips.id, share.tripId));
  if (!trip) return null;

  // Everything the page needs in one round of queries. The scope's members
  // and payments do not depend on the items or the photos, so awaiting them
  // afterwards would have cost a second round trip for no ordering reason —
  // and at ~86ms each that is the whole budget of a small page.
  const [items, photos, stops, payers, attendees, scopeRows] = await Promise.all([
    db
      .select()
      .from(tripItems)
      .where(eq(tripItems.tripId, trip.id))
      .orderBy(asc(tripItems.scheduledOn), asc(tripItems.sortOrder), asc(tripItems.createdAt)),
    db
      .select()
      .from(tripPhotos)
      .where(eq(tripPhotos.tripId, trip.id))
      .orderBy(asc(tripPhotos.sortOrder), asc(tripPhotos.createdAt)),
    // A cruise's ports are half of what its row says, so a link that hides
    // them shows a booking rather than a journey. One query for the trip,
    // attached below — a query per item would be N+1.
    db
      .select({
        id: tripItemStops.id,
        itemId: tripItemStops.itemId,
        dayNumber: tripItemStops.dayNumber,
        stopOn: tripItemStops.stopOn,
        place: tripItemStops.place,
        note: tripItemStops.note,
      })
      .from(tripItemStops)
      .innerJoin(tripItems, eq(tripItemStops.itemId, tripItems.id))
      .where(eq(tripItems.tripId, trip.id))
      .orderBy(asc(tripItemStops.dayNumber)),
    // Who covers what, in one query for the trip. `splitTrip` has honoured
    // this since it was written; nothing ever loaded it, so every item was
    // divided among everybody.
    db
      .select({ itemId: tripItemPayers.itemId, memberId: tripItemPayers.memberId })
      .from(tripItemPayers)
      .innerJoin(tripItems, eq(tripItemPayers.itemId, tripItems.id))
      .where(eq(tripItems.tripId, trip.id)),
    // And who is on each item — what a scoped link narrows to.
    db
      .select({ itemId: tripItemAttendees.itemId, memberId: tripItemAttendees.memberId })
      .from(tripItemAttendees)
      .innerJoin(tripItems, eq(tripItemAttendees.itemId, tripItems.id))
      .where(eq(tripItems.tripId, trip.id)),
    share.memberId ? loadScopeRows(trip.id, share.memberId) : null,
  ]);

  const stopsByItem = new Map<string, typeof stops>();
  for (const stop of stops) {
    const list = stopsByItem.get(stop.itemId) ?? [];
    list.push(stop);
    stopsByItem.set(stop.itemId, list);
  }

  const payersByItem = groupByItem(payers);
  const attendeesByItem = groupByItem(attendees);

  const photosByItem = new Map<string, typeof photos>();
  for (const photo of photos) {
    if (!photo.itemId) continue;
    const list = photosByItem.get(photo.itemId) ?? [];
    list.push(photo);
    photosByItem.set(photo.itemId, list);
  }

  const enriched = items.map((i) => ({
    ...i,
    stops: stopsByItem.get(i.id) ?? [],
    photos: photosByItem.get(i.id) ?? [],
    payerIds: payersByItem.get(i.id) ?? [],
    attendeeIds: attendeesByItem.get(i.id) ?? [],
  }));

  // A link made for one traveller shows that traveller's trip: Ana's flight
  // from Mexico is not a $0 line on Jafet's page, it is not on his page at
  // all. Narrowed on who is ON the item, not who pays for it — the festival
  // is all four travellers' even though two of them cover it. The split above
  // still runs over every item, so the totals are unaffected.
  const scope = scopeRows ? buildScope(scopeRows, enriched, share.memberId!) : null;
  // The member lists did their work above; they do not cross the boundary.
  // A public link is unauthenticated, and `payerIds`/`attendeeIds` are raw
  // trip_members UUIDs — enough to count and correlate the other travellers a
  // scoped link exists to hide.
  const visible = (
    share.memberId
      ? enriched.filter((i) => itemConcerns(i.attendeeIds, share.memberId!))
      : enriched
  ).map((item) => {
    const { payerIds, attendeeIds, ...rest } = item;
    void payerIds;
    void attendeeIds;
    return rest;
  });

  return {
    trip,
    items: visible,
    photos: photos.filter((p) => !p.itemId),
    share,
    // Built from the items already in hand rather than fetched again — and
    // from the enriched ones, or a scoped link would split a festival ticket
    // among people who are not going to it.
    scope,
  };
});

/**
 * The rows a scoped link needs, fetched alongside everything else.
 *
 * Split from the arithmetic so the queries can join the page's one round of
 * IO instead of forming a second one behind it.
 */
type ScopeRows = {
  members: { id: string; name: string; sharePercent: string | null }[];
  paidRows: { amount: string }[];
};

async function loadScopeRows(
  tripId: string,
  memberId: string
): Promise<ScopeRows> {
  const [members, paidRows] = await Promise.all([
    db
      .select({
        id: tripMembers.id,
        name: tripMembers.name,
        sharePercent: tripMembers.sharePercent,
      })
      .from(tripMembers)
      .where(eq(tripMembers.tripId, tripId))
      .orderBy(asc(tripMembers.sortOrder), asc(tripMembers.createdAt)),
    db
      .select({ amount: tripContributions.amount })
      .from(tripContributions)
      .where(
        and(
          eq(tripContributions.tripId, tripId),
          eq(tripContributions.memberId, memberId)
        )
      ),
  ]);
  return { members, paidRows };
}

/**
 * One traveller's own view of the trip, worked out here rather than in the
 * browser.
 *
 * Splitting the cost needs every member — their count sets the party size and
 * their percentages set the shares — but only the named traveller's figures
 * are returned. Sending the full member list to the page and filtering there
 * would put the other travellers' names and balances in the payload of a link
 * created specifically to hide them.
 */
function buildScope(
  rows: ScopeRows,
  items: TripItemWithStops[],
  memberId: string
): PublicTripScope | null {
  const { members, paidRows } = rows;

  const me = members.find((m) => m.id === memberId);
  // The traveller was removed from the trip after the link went out. The
  // column is ON DELETE SET NULL so this is nearly unreachable, but a link
  // that silently reports somebody else's bill would be far worse than one
  // that falls back to the trip.
  if (!me) return null;

  const shares = splitTrip(
    items.map((i) => ({
      id: i.id,
      title: i.title,
      price: i.price,
      priceMax: i.priceMax,
      priceUnit: i.priceUnit,
      scheduledOn: i.scheduledOn,
      endsOn: i.endsOn,
      payerIds: i.payerIds,
      attendeeIds: i.attendeeIds,
    })),
    members.map((m) => ({
      id: m.id,
      name: m.name,
      sharePercent: m.sharePercent === null ? null : Number(m.sharePercent),
    }))
  );

  const mine = shares.find((sh) => sh.memberId === memberId);
  if (!mine) return null;

  return {
    memberName: me.name,
    lines: mine.lines.map((l) => ({ itemId: l.itemId, low: l.low, high: l.high })),
    owedLow: mine.owedLow,
    owedHigh: mine.owedHigh,
    paid: paidRows.reduce((sum, r) => sum + parseFloat(r.amount ?? "0"), 0),
  };
}

// ---------- Dashboard summary ----------

/**
 * One-call summary for the /portal dashboard card. Picks a featured trip
 * (in-progress wins, then the next upcoming, then the most recent past) and
 * folds its items into a count + estimate so the card avoids a second query.
 */
export async function getDashboardTravelSummary(
  userId: string
): Promise<DashboardTravelSummary> {
  const all = await db
    .select()
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(asc(trips.startDate));

  if (all.length === 0) {
    return { totalTrips: 0, upcomingCount: 0, inProgressCount: 0, featured: null };
  }

  const today = todayIso();
  const inProgress = all.filter((t) => tripState(t, today) === "in_progress");
  const upcoming = all.filter((t) => tripState(t, today) === "upcoming");
  const past = all.filter((t) => tripState(t, today) === "past");

  const pick =
    inProgress[0] ??
    upcoming[0] ??
    past[past.length - 1] ??
    null;

  let featured: DashboardTravelFeaturedTrip | null = null;
  if (pick) {
    const [items, partySize] = await Promise.all([
      db
        .select({
          price: tripItems.price,
          priceMax: tripItems.priceMax,
          priceUnit: tripItems.priceUnit,
          scheduledOn: tripItems.scheduledOn,
          endsOn: tripItems.endsOn,
        })
        .from(tripItems)
        .where(eq(tripItems.tripId, pick.id)),
      db.$count(tripMembers, eq(tripMembers.tripId, pick.id)),
    ]);
    // Same maths as the trip page: summing the raw column reported a
    // three-night hotel at one night's price and a per-person fare once.
    const totalEstimate = tripCost(items, Math.max(1, partySize)).low;
    featured = {
      ...pick,
      state: tripState(pick, today),
      itemCount: items.length,
      totalEstimate,
    };
  }

  return {
    totalTrips: all.length,
    upcomingCount: upcoming.length,
    inProgressCount: inProgress.length,
    featured,
  };
}

/**
 * Replace an item's itinerary wholesale.
 *
 * Delete-then-insert inside one transaction rather than diffing: the list is a
 * couple of dozen rows, it is edited as a block, and a diff would have to
 * reason about renumbered days for no benefit the user can see.
 *
 * Ownership is checked through the item's trip, so a stop can never be written
 * onto somebody else's cruise.
 */
export async function setTripItemStops(
  userId: string,
  tripId: string,
  itemId: string,
  stops: {
    dayNumber: number;
    stopOn?: string | null;
    place: string;
    note?: string | null;
  }[]
): Promise<void> {
  const [owned] = await db
    .select({ id: tripItems.id })
    .from(tripItems)
    .innerJoin(trips, eq(tripItems.tripId, trips.id))
    .where(
      and(
        eq(tripItems.id, itemId),
        eq(tripItems.tripId, tripId),
        eq(trips.userId, userId)
      )
    );
  if (!owned) throw new Error("Item not found");

  await db.transaction(async (tx) => {
    await tx.delete(tripItemStops).where(eq(tripItemStops.itemId, itemId));
    if (stops.length === 0) return;
    await tx.insert(tripItemStops).values(
      stops.map((s) => ({
        itemId,
        dayNumber: s.dayNumber,
        stopOn: s.stopOn ?? null,
        place: s.place,
        note: s.note ?? null,
      }))
    );
  });
}

/** Everyone on a trip, in the order they were added. */
export async function listTripMembers(userId: string, tripId: string) {
  return db
    .select({
      id: tripMembers.id,
      name: tripMembers.name,
      email: tripMembers.email,
      sharePercent: tripMembers.sharePercent,
    })
    .from(tripMembers)
    .innerJoin(trips, eq(tripMembers.tripId, trips.id))
    .where(and(eq(tripMembers.tripId, tripId), eq(trips.userId, userId)))
    .orderBy(asc(tripMembers.sortOrder), asc(tripMembers.createdAt));
}

/**
 * Replace the traveller list wholesale.
 *
 * Same reasoning as the itinerary: it is edited as one list, and a per-row API
 * would leave a trip half-populated whenever one row failed. Removing somebody
 * cascades their per-item payer rows, which is what should happen — a person
 * who is not on the trip cannot be paying for part of it.
 */
export async function setTripMembers(
  userId: string,
  tripId: string,
  members: { id?: string; name: string; email?: string | null; sharePercent?: number | null }[]
): Promise<void> {
  const [owned] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)));
  if (!owned) throw new Error("Trip not found");

  await db.transaction(async (tx) => {
    const keep = members.map((m) => m.id).filter((id): id is string => !!id);
    // The FK sets trip_shares.member_id to NULL when a traveller goes, and a
    // NULL scope is the WHOLE trip — a link made to show one person their bill
    // would start publishing everyone's itinerary and prices. Revoke first.
    await tx
      .update(tripShares)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(tripShares.tripId, tripId),
          isNotNull(tripShares.memberId),
          isNull(tripShares.revokedAt),
          ...(keep.length > 0 ? [notInArray(tripShares.memberId, keep)] : [])
        )
      );
    await tx
      .delete(tripMembers)
      .where(
        keep.length > 0
          ? and(eq(tripMembers.tripId, tripId), notInArray(tripMembers.id, keep))
          : eq(tripMembers.tripId, tripId)
      );

    for (const [i, m] of members.entries()) {
      const values = {
        tripId,
        name: m.name,
        email: m.email ?? null,
        sharePercent: m.sharePercent === null || m.sharePercent === undefined
          ? null
          : String(m.sharePercent),
        sortOrder: i,
      };
      if (m.id) {
        // Scoped to this trip: a member id borrowed from somebody else's trip
        // would otherwise be overwritten and re-parented onto this one.
        await tx
          .update(tripMembers)
          .set(values)
          .where(and(eq(tripMembers.id, m.id), eq(tripMembers.tripId, tripId)));
      } else {
        await tx.insert(tripMembers).values(values);
      }
    }
  });
}
