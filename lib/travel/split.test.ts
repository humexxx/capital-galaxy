import { describe, expect, it } from "vitest";

import { defaultShares, itemConcerns, splitTrip } from "./split";
import type { SplitItem, SplitMember } from "./split";

const ana: SplitMember = { id: "ana", name: "Ana", sharePercent: null };
const bea: SplitMember = { id: "bea", name: "Bea", sharePercent: null };
const cid: SplitMember = { id: "cid", name: "Cid", sharePercent: null };

const item = (over: Partial<SplitItem> = {}): SplitItem => ({
  id: "i1",
  title: "Something",
  price: "100.00",
  priceMax: null,
  priceUnit: "total",
  scheduledOn: null,
  endsOn: null,
  payerIds: [],
  ...over,
});

describe("defaultShares", () => {
  it("splits equally when nobody has a fixed share", () => {
    const shares = defaultShares([ana, bea]);
    expect(shares.get("ana")).toBeCloseTo(0.5);
    expect(shares.get("bea")).toBeCloseTo(0.5);
  });

  it("honours a fixed share and divides the rest", () => {
    // Ana takes 60%; Bea and Cid split the remaining 40%.
    const shares = defaultShares([{ ...ana, sharePercent: 60 }, bea, cid]);
    expect(shares.get("ana")).toBeCloseTo(0.6);
    expect(shares.get("bea")).toBeCloseTo(0.2);
    expect(shares.get("cid")).toBeCloseTo(0.2);
  });

  it("never hands out a negative share when the fixed ones exceed 100", () => {
    // A typo must not turn into a rebate for everybody else.
    const shares = defaultShares([{ ...ana, sharePercent: 120 }, bea]);
    expect(shares.get("bea")).toBe(0);
  });

  it("returns nothing for a trip with nobody on it", () => {
    expect(defaultShares([]).size).toBe(0);
  });
});

describe("splitTrip", () => {
  it("divides an unassigned cost by the trip's split", () => {
    const [a, b] = splitTrip([item({ price: "300.00" })], [ana, bea]);
    expect(a.owedLow).toBe(150);
    expect(b.owedLow).toBe(150);
  });

  it("charges a named payer the whole thing", () => {
    // This is the case a plain "total ÷ people" gets wrong.
    const [a, b] = splitTrip(
      [item({ price: "300.00", payerIds: ["ana"] })],
      [ana, bea]
    );
    expect(a.owedLow).toBe(300);
    expect(b.owedLow).toBe(0);
  });

  it("splits between the named payers only", () => {
    const [a, b, c] = splitTrip(
      [item({ price: "300.00", payerIds: ["ana", "bea"] })],
      [ana, bea, cid]
    );
    expect(a.owedLow).toBe(150);
    expect(b.owedLow).toBe(150);
    expect(c.owedLow).toBe(0);
  });

  it("charges a per-person price in full to each person", () => {
    // A $1,900 fare is $1,900 each, not $1,900 shared.
    const [a, b] = splitTrip(
      [item({ price: "1900.00", priceUnit: "per_person" })],
      [ana, bea]
    );
    expect(a.owedLow).toBe(1900);
    expect(b.owedLow).toBe(1900);
  });

  it("charges a per-person price only to the payers named on it", () => {
    const [a, b] = splitTrip(
      [item({ price: "1900.00", priceUnit: "per_person", payerIds: ["ana"] })],
      [ana, bea]
    );
    expect(a.owedLow).toBe(1900);
    expect(b.owedLow).toBe(0);
  });

  it("multiplies a nightly rate before splitting it", () => {
    const [a, b] = splitTrip(
      [
        item({
          price: "100.00", priceUnit: "per_night",
          scheduledOn: "2027-01-15", endsOn: "2027-01-17",
        }),
      ],
      [ana, bea]
    );
    // 100 x 2 nights = 200, halved.
    expect(a.owedLow).toBe(100);
    expect(b.owedLow).toBe(100);
  });

  it("explains each figure line by line", () => {
    const [a] = splitTrip(
      [item({ id: "flight", title: "SJO ⇄ MCO", price: "600.00", payerIds: ["ana"] })],
      [ana, bea]
    );
    expect(a.lines).toEqual([
      { itemId: "flight", title: "SJO ⇄ MCO", low: 600, high: 600 },
    ]);
  });

  it("skips unpriced items rather than counting them as free", () => {
    const [a] = splitTrip([item({ price: null })], [ana]);
    expect(a.owedLow).toBe(0);
    expect(a.lines).toEqual([]);
  });

  it("carries both ends of a ranged price through the split", () => {
    // The whole point of the range: a $600–$800 flight makes each person's
    // bill a range too. Reporting only the low end is how a trip ends up
    // looking cheaper than anything you could actually book.
    const [a] = splitTrip(
      [item({ price: "600.00", priceMax: "800.00" })],
      [ana, bea]
    );
    expect(a.owedLow).toBe(300);
    expect(a.owedHigh).toBe(400);
    expect(a.lines[0]).toMatchObject({ low: 300, high: 400 });
  });

  it("ranges a per-person price without dividing either end", () => {
    const [a, b] = splitTrip(
      [item({ price: "1900.00", priceMax: "2100.00", priceUnit: "per_person" })],
      [ana, bea]
    );
    expect(a.owedLow).toBe(1900);
    expect(a.owedHigh).toBe(2100);
    expect(b.owedLow).toBe(1900);
  });

  it("still charges an item priced only at its upper bound", () => {
    // A zero low with a real high is a free item to anyone reading `low`
    // alone. It has to survive into the split.
    const [a] = splitTrip(
      [item({ price: "0", priceMax: "500.00" })],
      [ana, bea]
    );
    expect(a.owedHigh).toBe(250);
  });

  it("handles the real Orlando trip for two people", () => {
    const orlando: SplitItem[] = [
      { ...item(), id: "f", title: "Flight", price: "600.00", priceUnit: "per_person" },
      {
        ...item(), id: "h", title: "Hotel", price: "100.00", priceUnit: "per_night",
        scheduledOn: "2027-01-15", endsOn: "2027-01-17",
      },
      { ...item(), id: "c", title: "Cruise", price: "1900.00", priceUnit: "per_person" },
    ];
    const [a, b] = splitTrip(orlando, [ana, bea]);
    // Each: 600 flight + 100 hotel (200 halved) + 1900 cruise.
    expect(a.owedLow).toBe(2600);
    expect(b.owedLow).toBe(2600);
  });
});

describe("an item somebody else is not paying for", () => {
  const [ana, ale] = [
    { id: "ana", name: "Ana", sharePercent: null },
    { id: "ale", name: "Alejandra", sharePercent: null },
  ];

  it("charges only the named payers, and the rest nothing", () => {
    // Four in one room, but two of them bought the festival ticket. Before
    // payers were wired the cost was divided among all four, which is the
    // wrong number for everybody in the trip.
    const shares = splitTrip(
      [item({ id: "tml", title: "Tomorrowland", price: "1200.00", payerIds: ["ana", "ale"] })],
      [ana, ale, { id: "x", name: "X", sharePercent: null }, { id: "y", name: "Y", sharePercent: null }]
    );
    expect(shares.find((s) => s.memberId === "ana")!.owedLow).toBe(600);
    expect(shares.find((s) => s.memberId === "ale")!.owedLow).toBe(600);
    expect(shares.find((s) => s.memberId === "x")!.owedLow).toBe(0);
  });

  it("still divides everything else among everybody", () => {
    const shares = splitTrip(
      [
        item({ id: "tml", title: "Tomorrowland", price: "1200.00", payerIds: ["ana", "ale"] }),
        item({ id: "hotel", title: "Hotel", price: "400.00" }),
      ],
      [ana, ale, { id: "x", name: "X", sharePercent: null }, { id: "y", name: "Y", sharePercent: null }]
    );
    // Ana: 600 of the ticket + 100 of the room. X: only the room.
    expect(shares.find((s) => s.memberId === "ana")!.owedLow).toBe(700);
    expect(shares.find((s) => s.memberId === "x")!.owedLow).toBe(100);
  });
});

describe("whose trip an item belongs to", () => {
  it("belongs to everybody when it names nobody", () => {
    expect(itemConcerns([], "ana")).toBe(true);
  });

  it("belongs only to the payers it names", () => {
    expect(itemConcerns(["jason", "jafet"], "jafet")).toBe(true);
    expect(itemConcerns(["jason", "jafet"], "ana")).toBe(false);
  });
});

describe("an item only some travellers are on", () => {
  const four: SplitMember[] = ["jason", "jafet", "ana", "ale"].map((id) => ({
    id, name: id, sharePercent: null,
  }));

  it("bills whoever is on it when no payer is named", () => {
    // The default the form offers: a named attendee, payers left on
    // "Everyone". Falling through to the trip's split charged the other three
    // for a flight the itinerary had just told them they were not taking.
    const shares = splitTrip(
      [item({ id: "mex", title: "MEX → KEF", price: "800.00", attendeeIds: ["ana"] })],
      four
    );
    expect(shares.find((s) => s.memberId === "ana")!.owedLow).toBe(800);
    expect(shares.find((s) => s.memberId === "jason")!.owedLow).toBe(0);
  });

  it("still lets payers override who is on it", () => {
    // The festival: all four go, two of them pay.
    const shares = splitTrip(
      [item({ id: "tml", title: "Festival", price: "2000.00", payerIds: ["jason", "jafet"] })],
      four
    );
    expect(shares.find((s) => s.memberId === "jason")!.owedLow).toBe(1000);
    expect(shares.find((s) => s.memberId === "ana")!.owedLow).toBe(0);
  });

  it("counts a per-person price by the people it is for", () => {
    const shares = splitTrip(
      [
        item({
          id: "fare", title: "Fare", price: "500.00",
          priceUnit: "per_person", attendeeIds: ["jason", "jafet"],
        }),
      ],
      four
    );
    expect(shares.find((s) => s.memberId === "jafet")!.owedLow).toBe(500);
    expect(shares.find((s) => s.memberId === "ana")!.owedLow).toBe(0);
  });
});

describe("splitTrip — remainder and seats", () => {
  it("scales fixed shares up when every traveller is fixed and they total under 100", () => {
    const a: SplitMember = { id: "a", name: "A", sharePercent: 30 };
    const b: SplitMember = { id: "b", name: "B", sharePercent: 30 };
    const [ra, rb] = splitTrip([item({ price: "100.00" })], [a, b]);
    // 30/30 used to leave $40 owed by nobody.
    expect(ra.owedLow).toBe(50);
    expect(rb.owedLow).toBe(50);
  });

  it("charges named payers for the attendees' per-person seats they cover", () => {
    const cee: SplitMember = { id: "cee", name: "Cee", sharePercent: null };
    const [a, b, c] = splitTrip(
      [
        item({
          price: "1900.00",
          priceUnit: "per_person",
          attendeeIds: ["ana", "bea", "cee"],
          payerIds: ["ana"],
        }),
      ],
      [ana, bea, cee]
    );
    // Three seats on the itinerary ($5,700); one payer carries them all.
    expect(a.owedLow).toBe(5700);
    expect(b.owedLow).toBe(0);
    expect(c.owedLow).toBe(0);
  });
});
