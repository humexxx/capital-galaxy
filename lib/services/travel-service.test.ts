import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// travel-service composes several Drizzle chain shapes:
//   select().from().where()                              (single-row reads)
//   select().from().where().orderBy()                    (list reads)
//   insert().values().returning()
//   update().set().where()                               (revoke / delete-style)
//   update().set().where().returning()                   (mutating with row read-back)
//   delete().where()                                     (terminal)
//   delete().where().returning()                         (terminal + returning row)
//
// Several entry points (getTripWithRelations, getPublicTripByToken, the
// dashboard summary) call db.select() multiple times in sequence. We back the
// mocks with FIFO queues so each test scripts the rows the next chain should
// resolve to. `ensureTripOwnership` always issues a SELECT first, so writes
// must seed a "[{ userId }]" select before the insert/update/delete chain.

type SelectRows = unknown[];

const selectQueue: SelectRows[] = [];
const insertQueue: unknown[][] = []; // each entry = rows returned by .returning()
const updateQueue: unknown[][] = []; // each entry = rows returned by .returning() (may be unused)
const deleteQueue: unknown[][] = []; // each entry = rows returned by .returning() (may be unused)

function makeSelectThenable(rows: SelectRows) {
  // The chain must be awaitable at any of: after .where() (when no orderBy)
  // OR after .orderBy() (when orderBy is appended). We make the intermediate
  // builder both chainable and a thenable that resolves to `rows`.
  const thenable: Record<string, unknown> = {};
  const resolve = (cb: (rows: SelectRows) => unknown) => Promise.resolve(rows).then(cb);
  thenable.from = vi.fn(() => thenable);
  // The stops query joins trip_items to scope by trip, so the chain has to
  // survive an innerJoin too.
  thenable.innerJoin = vi.fn(() => thenable);
  thenable.where = vi.fn(() => thenable);
  thenable.orderBy = vi.fn(() => Promise.resolve(rows));
  // Awaiting at the .where() boundary works via a thenable
  thenable.then = (onFulfilled: (rows: SelectRows) => unknown, onRejected?: unknown) =>
    resolve(onFulfilled).catch(onRejected as never);
  return thenable;
}

function makeInsertThenable(rows: unknown[]) {
  const thenable: Record<string, unknown> = {};
  thenable.values = vi.fn(() => thenable);
  thenable.returning = vi.fn(() => Promise.resolve(rows));
  // Allow awaiting after .values() in case any caller skips .returning()
  thenable.then = (onFulfilled: (r: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled);
  return thenable;
}

function makeUpdateThenable(rows: unknown[]) {
  const thenable: Record<string, unknown> = {};
  thenable.set = vi.fn(() => thenable);
  thenable.where = vi.fn(() => thenable);
  thenable.returning = vi.fn(() => Promise.resolve(rows));
  // Allow awaiting after .where() (revokeTripShare path doesn't call .returning)
  thenable.then = (onFulfilled: (r: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled);
  return thenable;
}

function makeDeleteThenable(rows: unknown[]) {
  const thenable: Record<string, unknown> = {};
  thenable.where = vi.fn(() => thenable);
  thenable.returning = vi.fn(() => Promise.resolve(rows));
  // Allow awaiting after .where() (deleteTrip/deleteTripItem do this)
  thenable.then = (onFulfilled: (r: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled);
  return thenable;
}

vi.mock("@/db", () => ({
  db: {
    // Party size for the dashboard estimate.
    $count: vi.fn(async () => 1),
    select: vi.fn(() => {
      const rows = selectQueue.shift() ?? [];
      return makeSelectThenable(rows);
    }),
    insert: vi.fn(() => {
      const rows = insertQueue.shift() ?? [];
      return makeInsertThenable(rows);
    }),
    update: vi.fn(() => {
      const rows = updateQueue.shift() ?? [];
      return makeUpdateThenable(rows);
    }),
    delete: vi.fn(() => {
      const rows = deleteQueue.shift() ?? [];
      return makeDeleteThenable(rows);
    }),
    // Item writes touch three tables and run in a transaction. The handle has
    // the same shape as `db`, so hand the callback the mock itself and let the
    // same FIFO queues serve it.
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(dbMock)),
  },
}));

import { db } from "@/db";
import {
  addTripItem,
  addTripPhoto,
  createTrip,
  createTripShare,
  deleteTrip,
  deleteTripItem,
  deleteTripPhoto,
  deleteTripShare,
  getDashboardTravelSummary,
  getPublicTripByToken,
  getTripWithRelations,
  listUserTrips,
  revokeTripShare,
  updateTrip,
  updateTripItem,
} from "./travel-service";

const dbMock = vi.mocked(db, true);

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const TRIP_ID = "trip-1";

function queueSelect(rows: SelectRows) {
  selectQueue.push(rows);
}
function queueInsert(rows: unknown[]) {
  insertQueue.push(rows);
}
function queueUpdate(rows: unknown[]) {
  updateQueue.push(rows);
}
function queueDelete(rows: unknown[]) {
  deleteQueue.push(rows);
}

function tripFixture(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: TRIP_ID,
    userId: USER_ID,
    title: "Tokyo",
    destination: "Japan",
    description: null,
    startDate: "2026-06-01",
    endDate: "2026-06-10",
    coverPhotoUrl: null,
    currency: "USD",
    color: "var(--chart-1)",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  selectQueue.length = 0;
  insertQueue.length = 0;
  updateQueue.length = 0;
  deleteQueue.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------- listUserTrips ----------

describe("listUserTrips", () => {
  it("queries trips for the given user and returns them ordered", async () => {
    const rows = [tripFixture({ id: "t-a" }), tripFixture({ id: "t-b" })];
    queueSelect(rows);

    const out = await listUserTrips(USER_ID);

    expect(out).toEqual(rows);
    expect(dbMock.select).toHaveBeenCalledOnce();
  });

  it("returns an empty list when the user has no trips", async () => {
    queueSelect([]);
    await expect(listUserTrips(USER_ID)).resolves.toEqual([]);
  });
});

// ---------- getTripWithRelations ----------

describe("getTripWithRelations", () => {
  it("returns null when the trip is not found / belongs to another user", async () => {
    queueSelect([]); // trip lookup misses
    const out = await getTripWithRelations("missing", USER_ID);
    expect(out).toBeNull();
  });

  it("returns the trip with items, photos, and shares stitched together", async () => {
    // Use a unique trip id so React's per-request cache doesn't hit the "null"
    // result from the previous test.
    const tripId = "trip-with-relations-1";
    const trip = tripFixture({ id: tripId });
    const items = [{ id: "i-1", tripId, title: "Hotel", category: "lodging" }];
    const photos = [{ id: "p-1", tripId, url: "https://x/y.jpg" }];
    const shares = [{ id: "s-1", tripId, token: "abc" }];
    const stops = [{ id: "st-1", itemId: "i-1", dayNumber: 1, place: "At sea" }];
    const members = [{ id: "m-1", name: "Ana", email: null, sharePercent: null }];

    queueSelect([trip]);
    queueSelect(items);
    queueSelect(photos);
    queueSelect(shares);
    queueSelect(stops);
    queueSelect(members);

    const out = await getTripWithRelations(tripId, USER_ID);

    expect(out).not.toBeNull();
    expect(out?.id).toBe(tripId);
    expect(out?.photos).toEqual(photos);
    expect(out?.shares).toEqual(shares);
    // Each item carries its own stops, attached from the single stops query
    // rather than one query per item.
    expect(out?.items).toEqual([
      { ...items[0], stops, photos: [], payerIds: [], attendeeIds: [] },
    ]);
    expect(out?.members).toEqual(members);
    // 1 for the trip + 8 parallel queries for relations. The count is the
    // point: every relation is one query for the whole trip, so adding a
    // relation must not add a query per row.
    expect(dbMock.select).toHaveBeenCalledTimes(9);
  });
});

// ---------- createTrip ----------

describe("createTrip", () => {
  it("inserts a row and returns the new trip", async () => {
    const created = tripFixture({ id: "new-trip" });
    queueInsert([created]);

    const out = await createTrip(USER_ID, {
      title: "Paris",
      destination: "France",
      startDate: "2026-07-01",
      endDate: "2026-07-08",
      currency: "USD",
      color: "var(--chart-1)",
    } as unknown as Parameters<typeof createTrip>[1]);

    expect(out).toEqual(created);
    expect(dbMock.insert).toHaveBeenCalledOnce();
  });
});

// ---------- updateTrip ----------

describe("updateTrip", () => {
  it("updates the trip after verifying ownership", async () => {
    queueSelect([{ userId: USER_ID }]); // ensureTripOwnership
    const updated = tripFixture({ title: "Updated" });
    queueUpdate([updated]);

    const out = await updateTrip(USER_ID, {
      id: TRIP_ID,
      title: "Updated",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      currency: "USD",
      color: "var(--chart-1)",
    } as unknown as Parameters<typeof updateTrip>[1]);

    expect(out).toEqual(updated);
    expect(dbMock.update).toHaveBeenCalledOnce();
  });

  it("throws Trip not found when the trip belongs to another user", async () => {
    queueSelect([{ userId: OTHER_USER_ID }]);

    await expect(
      updateTrip(USER_ID, {
        id: TRIP_ID,
        title: "Hacked",
        startDate: "2026-06-01",
        currency: "USD",
        color: "var(--chart-1)",
      } as unknown as Parameters<typeof updateTrip>[1])
    ).rejects.toThrow("Trip not found");
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});

// ---------- deleteTrip ----------

describe("deleteTrip", () => {
  it("deletes the trip after ownership check", async () => {
    queueSelect([{ userId: USER_ID }]);
    queueDelete([]);

    await deleteTrip(USER_ID, TRIP_ID);

    expect(dbMock.delete).toHaveBeenCalledOnce();
  });

  it("throws when the trip is not owned by the user", async () => {
    queueSelect([]); // no row at all → not found

    await expect(deleteTrip(USER_ID, TRIP_ID)).rejects.toThrow("Trip not found");
    expect(dbMock.delete).not.toHaveBeenCalled();
  });
});

// ---------- trip items ----------

describe("addTripItem", () => {
  it("inserts the item under the trip after ownership check", async () => {
    queueSelect([{ userId: USER_ID }]);
    const item = { id: "i-new", tripId: TRIP_ID, title: "Sushi", category: "food" };
    queueInsert([item]);

    const out = await addTripItem(USER_ID, TRIP_ID, {
      title: "Sushi",
      category: "food",
    } as unknown as Parameters<typeof addTripItem>[2]);

    expect(out).toEqual(item);
    expect(dbMock.insert).toHaveBeenCalledOnce();
  });

  it("rejects when the trip is not owned by the user", async () => {
    queueSelect([{ userId: OTHER_USER_ID }]);
    await expect(
      addTripItem(USER_ID, TRIP_ID, {
        title: "x",
        category: "food",
      } as unknown as Parameters<typeof addTripItem>[2])
    ).rejects.toThrow("Trip not found");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});

describe("updateTripItem", () => {
  it("updates the item scoped to the trip after ownership check", async () => {
    queueSelect([{ userId: USER_ID }]);
    const updated = { id: "i-1", tripId: TRIP_ID, title: "Ramen" };
    queueUpdate([updated]);

    const out = await updateTripItem(USER_ID, TRIP_ID, {
      id: "i-1",
      title: "Ramen",
      category: "food",
    } as unknown as Parameters<typeof updateTripItem>[2]);

    expect(out).toEqual(updated);
    expect(dbMock.update).toHaveBeenCalledOnce();
  });
});

describe("deleteTripItem", () => {
  it("deletes the item after ownership check", async () => {
    queueSelect([{ userId: USER_ID }]);
    queueDelete([]);

    await deleteTripItem(USER_ID, TRIP_ID, "i-1");

    expect(dbMock.delete).toHaveBeenCalledOnce();
  });
});

// ---------- trip photos ----------

describe("addTripPhoto", () => {
  it("inserts the photo after ownership check", async () => {
    queueSelect([{ userId: USER_ID }]);
    const photo = { id: "p-new", tripId: TRIP_ID, url: "https://x/y.jpg", source: "url" };
    queueInsert([photo]);

    const out = await addTripPhoto(USER_ID, TRIP_ID, {
      url: "https://x/y.jpg",
      source: "url",
    } as unknown as Parameters<typeof addTripPhoto>[2]);

    expect(out).toEqual(photo);
    expect(dbMock.insert).toHaveBeenCalledOnce();
  });
});

describe("deleteTripPhoto", () => {
  it("returns the removed row when a photo is deleted", async () => {
    queueSelect([{ userId: USER_ID }]);
    const removed = { id: "p-1", tripId: TRIP_ID, url: "https://x/y.jpg" };
    queueDelete([removed]);

    const out = await deleteTripPhoto(USER_ID, TRIP_ID, "p-1");

    expect(out).toEqual(removed);
  });

  it("returns null when the photo did not exist (no rows returned)", async () => {
    queueSelect([{ userId: USER_ID }]);
    queueDelete([]);

    const out = await deleteTripPhoto(USER_ID, TRIP_ID, "missing");
    expect(out).toBeNull();
  });
});

// ---------- shares ----------

describe("createTripShare", () => {
  it("inserts a share with a generated token after ownership check", async () => {
    queueSelect([{ userId: USER_ID }]);
    const inserted = {
      id: "s-new",
      tripId: TRIP_ID,
      token: "generated",
      inviteeEmail: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date(),
    };
    queueInsert([inserted]);

    const out = await createTripShare(USER_ID, TRIP_ID, {
      inviteeEmail: null,
      expiresAt: null,
    } as unknown as Parameters<typeof createTripShare>[2]);

    expect(out).toEqual(inserted);

    // Inspect the values payload to verify a non-empty base64url-ish token
    // was generated by the service (we don't mock node:crypto — real entropy
    // is fine for the assertion).
    const insertCallReturn = dbMock.insert.mock.results[0]?.value as unknown as {
      values: { mock: { calls: unknown[][] } };
    };
    const payload = insertCallReturn.values.mock.calls[0][0] as { token: string };
    expect(typeof payload.token).toBe("string");
    expect(payload.token.length).toBeGreaterThan(20);
  });
});

describe("createTripShare — scoped to one traveller", () => {
  it("refuses a traveller who belongs to somebody else's trip", async () => {
    // The foreign key proves the member row exists; it says nothing about
    // which trip it is on. Without this check a member id lifted from another
    // trip would be accepted and the link would resolve against it.
    queueSelect([{ userId: USER_ID }]); // ownership
    queueSelect([]); // membership lookup finds nothing on THIS trip

    await expect(
      createTripShare(USER_ID, TRIP_ID, {
        memberId: "11111111-1111-1111-1111-111111111111",
      } as unknown as Parameters<typeof createTripShare>[2])
    ).rejects.toThrow(/not found on this trip/i);

    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("carries prices when it is scoped, and hides them when it is not", async () => {
    // A link that names one traveller exists to show that traveller their own
    // bill. Inheriting the cautious default would hide the only thing the
    // scoping was for.
    queueSelect([{ userId: USER_ID }]);
    queueSelect([{ id: "m1" }]);
    queueInsert([{ id: "s1" }]);

    await createTripShare(USER_ID, TRIP_ID, {
      memberId: "m1",
    } as unknown as Parameters<typeof createTripShare>[2]);

    const call = dbMock.insert.mock.results[0]?.value as unknown as {
      values: { mock: { calls: unknown[][] } };
    };
    const payload = call.values.mock.calls[0][0] as {
      memberId: string | null;
      showPrices: boolean;
    };
    expect(payload).toMatchObject({ memberId: "m1", showPrices: true });
  });

  it("leaves an unscoped link with prices hidden", async () => {
    queueSelect([{ userId: USER_ID }]);
    queueInsert([{ id: "s2" }]);

    await createTripShare(USER_ID, TRIP_ID, {
      inviteeEmail: null,
    } as unknown as Parameters<typeof createTripShare>[2]);

    const call = dbMock.insert.mock.results[0]?.value as unknown as {
      values: { mock: { calls: unknown[][] } };
    };
    const payload = call.values.mock.calls[0][0] as {
      memberId: string | null;
      showPrices: boolean;
    };
    expect(payload).toMatchObject({ memberId: null, showPrices: false });
  });
});

describe("revokeTripShare", () => {
  it("sets revokedAt on the share after ownership check", async () => {
    queueSelect([{ userId: USER_ID }]);
    queueUpdate([]);

    await revokeTripShare(USER_ID, TRIP_ID, "s-1");

    expect(dbMock.update).toHaveBeenCalledOnce();
    // Confirm the set payload included a revokedAt Date.
    const updateReturn = dbMock.update.mock.results[0]?.value as unknown as {
      set: { mock: { calls: unknown[][] } };
    };
    const payload = updateReturn.set.mock.calls[0][0] as { revokedAt: Date };
    expect(payload.revokedAt).toBeInstanceOf(Date);
  });
});

describe("deleteTripShare", () => {
  it("deletes the share after ownership check", async () => {
    queueSelect([{ userId: USER_ID }]);
    queueDelete([]);

    await deleteTripShare(USER_ID, TRIP_ID, "s-1");

    expect(dbMock.delete).toHaveBeenCalledOnce();
  });
});

// ---------- getPublicTripByToken ----------

describe("getPublicTripByToken", () => {
  it("returns the trip view for a valid, unrevoked, unexpired token", async () => {
    const share = {
      id: "s-1",
      tripId: TRIP_ID,
      token: "tok",
      revokedAt: null,
      expiresAt: null,
      inviteeEmail: null,
      createdAt: new Date(),
    };
    const trip = tripFixture();
    const items = [{ id: "i-1", tripId: TRIP_ID, title: "Hotel" }];
    const photos = [{ id: "p-1", tripId: TRIP_ID, url: "https://x/y.jpg" }];

    queueSelect([share]); // share lookup
    queueSelect([trip]); // trip lookup
    queueSelect(items); // items
    queueSelect(photos); // photos
    queueSelect([]); // stops
    queueSelect([]); // payers
    queueSelect([]); // attendees

    const out = await getPublicTripByToken("tok");

    expect(out).not.toBeNull();
    expect(out?.share).toEqual(share);
    expect(out?.trip).toEqual(trip);
    // Items carry their stops: a cruise's ports are half of what its row
    // says, and a link that hides them shows a booking, not a journey.
    // No `payerIds` / `attendeeIds`: those are trip_members UUIDs and a public
    // link is unauthenticated. The service narrows and splits with them, then
    // drops them before the payload crosses the boundary.
    expect(out?.items).toEqual(items.map((i) => ({ ...i, stops: [], photos: [] })));
    expect(out?.photos).toEqual(photos);
  });

  it("hands a scoped link one traveller's figures and nobody else's", async () => {
    // The whole point of scoping. Every member is needed to work out the
    // split — their count sets the party size — but only the named
    // traveller's numbers may leave the server. Filtering in the browser
    // would put the others in the payload of a link created to hide them.
    const share = {
      id: "s-1", tripId: TRIP_ID, token: "tok", revokedAt: null, expiresAt: null,
      inviteeEmail: null, memberId: "bruno", showPrices: true, createdAt: new Date(),
    };
    const items = [
      { id: "i-1", tripId: TRIP_ID, title: "Flight", price: "600.00",
        priceMax: "800.00", priceUnit: "total", scheduledOn: null, endsOn: null },
    ];

    queueSelect([share]);
    queueSelect([tripFixture()]);
    // One round: items, photos, members, payments. The scope reuses the items
    // already fetched rather than querying them a second time.
    queueSelect(items);
    queueSelect([]); // photos
    queueSelect([]); // stops
    queueSelect([]); // payers
    queueSelect([]); // attendees
    queueSelect([
      { id: "jason", name: "Jason Hume", sharePercent: null },
      { id: "bruno", name: "Bruno Fabián", sharePercent: null },
    ]);
    queueSelect([{ amount: "300.00" }]);

    const out = await getPublicTripByToken("tok");

    expect(out?.scope).toEqual({
      memberName: "Bruno Fabián",
      lines: [{ itemId: "i-1", low: 300, high: 400 }],
      owedLow: 300,
      owedHigh: 400,
      paid: 300,
    });
    // Jason is nowhere in what crosses the boundary.
    expect(JSON.stringify(out)).not.toContain("Jason");
    // The scope reuses the items already in hand rather than querying them a
    // second time. Counting the selects is what keeps a second round trip
    // from creeping back in behind the first.
    expect(dbMock.select).toHaveBeenCalledTimes(9);
  });

  it("leaves an unscoped link with no traveller attached", async () => {
    queueSelect([
      { id: "s-1", tripId: TRIP_ID, token: "tok", revokedAt: null, expiresAt: null,
        inviteeEmail: null, memberId: null, showPrices: false, createdAt: new Date() },
    ]);
    queueSelect([tripFixture()]);
    queueSelect([]); // items
    queueSelect([]); // photos
    queueSelect([]); // stops
    queueSelect([]); // payers
    queueSelect([]); // attendees

    const out = await getPublicTripByToken("tok");
    expect(out?.scope).toBeNull();
  });

  it("falls back to the whole trip when the scoped traveller is gone", async () => {
    // The column is ON DELETE SET NULL so this is nearly unreachable, but a
    // link that quietly reports somebody else's bill would be far worse than
    // one that widens.
    queueSelect([
      { id: "s-1", tripId: TRIP_ID, token: "tok", revokedAt: null, expiresAt: null,
        inviteeEmail: null, memberId: "ghost", showPrices: true, createdAt: new Date() },
    ]);
    queueSelect([tripFixture()]);
    queueSelect([]); // items
    queueSelect([]); // photos
    queueSelect([]); // stops
    queueSelect([]); // payers
    queueSelect([]); // attendees
    queueSelect([{ id: "jason", name: "Jason Hume", sharePercent: null }]);
    queueSelect([]); // payments

    const out = await getPublicTripByToken("tok");
    expect(out?.scope).toBeNull();
  });

  it("returns null when the token does not resolve to a share (or it's revoked)", async () => {
    // The service's WHERE clause filters revoked shares out at the SQL level,
    // so the resolved row set will simply be empty in that case. We model both
    // "token not found" and "revoked" the same way here.
    queueSelect([]);

    const out = await getPublicTripByToken("revoked-or-unknown");
    expect(out).toBeNull();
  });

  it("returns null when the share has expired", async () => {
    const expired = {
      id: "s-1",
      tripId: TRIP_ID,
      token: "tok",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 60_000), // 1 minute ago
      inviteeEmail: null,
      createdAt: new Date(),
    };
    queueSelect([expired]);

    const out = await getPublicTripByToken("tok");
    expect(out).toBeNull();
  });

  it("returns null when the share resolves but the trip row is missing", async () => {
    const share = {
      id: "s-1",
      tripId: TRIP_ID,
      token: "tok",
      revokedAt: null,
      expiresAt: null,
    };
    queueSelect([share]);
    queueSelect([]); // trip lookup misses

    const out = await getPublicTripByToken("tok");
    expect(out).toBeNull();
  });
});

// ---------- getDashboardTravelSummary ----------

describe("getDashboardTravelSummary", () => {
  it("returns empty totals when the user has no trips", async () => {
    queueSelect([]);

    const out = await getDashboardTravelSummary(USER_ID);
    expect(out).toEqual({
      totalTrips: 0,
      upcomingCount: 0,
      inProgressCount: 0,
      featured: null,
    });
  });

  it("picks an in-progress trip as featured and folds item prices into a total", async () => {
    // Pin "today" so the date-comparison branches in the service are deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T12:00:00Z"));

    const inProgress = tripFixture({
      id: "ip-1",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
    });
    const upcoming = tripFixture({
      id: "up-1",
      startDate: "2026-07-01",
      endDate: "2026-07-05",
    });
    const past = tripFixture({
      id: "past-1",
      startDate: "2026-01-01",
      endDate: "2026-01-05",
    });
    // Service orders by startDate ASC so the historical trip comes first.
    queueSelect([past, inProgress, upcoming]);
    // Item prices for the featured trip
    queueSelect([{ price: "100.50" }, { price: "49.50" }, { price: null }, { price: "not-a-number" }]);

    const out = await getDashboardTravelSummary(USER_ID);

    expect(out.totalTrips).toBe(3);
    expect(out.inProgressCount).toBe(1);
    expect(out.upcomingCount).toBe(1);
    expect(out.featured).not.toBeNull();
    expect(out.featured?.id).toBe("ip-1");
    expect(out.featured?.state).toBe("in_progress");
    expect(out.featured?.itemCount).toBe(4);
    expect(out.featured?.totalEstimate).toBeCloseTo(150);

    vi.useRealTimers();
  });

  it("falls back to the next upcoming trip when nothing is in progress", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));

    const upcoming = tripFixture({
      id: "up-1",
      startDate: "2026-07-01",
      endDate: "2026-07-05",
    });
    const past = tripFixture({
      id: "past-1",
      startDate: "2026-01-01",
      endDate: "2026-01-05",
    });
    queueSelect([past, upcoming]);
    queueSelect([]); // no items for the featured trip

    const out = await getDashboardTravelSummary(USER_ID);

    expect(out.inProgressCount).toBe(0);
    expect(out.upcomingCount).toBe(1);
    expect(out.featured?.id).toBe("up-1");
    expect(out.featured?.state).toBe("upcoming");
    expect(out.featured?.itemCount).toBe(0);
    expect(out.featured?.totalEstimate).toBe(0);

    vi.useRealTimers();
  });

  it("falls back to the most recent past trip when nothing is upcoming", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));

    const older = tripFixture({
      id: "past-old",
      startDate: "2026-01-01",
      endDate: "2026-01-05",
    });
    const newerPast = tripFixture({
      id: "past-new",
      startDate: "2026-03-01",
      endDate: "2026-03-05",
    });
    queueSelect([older, newerPast]);
    queueSelect([]);

    const out = await getDashboardTravelSummary(USER_ID);

    expect(out.featured?.id).toBe("past-new");
    expect(out.featured?.state).toBe("past");

    vi.useRealTimers();
  });
});
