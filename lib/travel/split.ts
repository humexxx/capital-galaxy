import { itemCost, type PricedItem } from "./pricing";

export type SplitMember = {
  id: string;
  name: string;
  /** Share of anything not assigned to specific payers, 0–100. Null = take an
   *  equal share of whatever the explicit shares leave over. */
  sharePercent: number | null;
};

export type SplitItem = PricedItem & {
  id: string;
  title: string;
  /** Members covering THIS item. Empty means "however the trip splits". */
  payerIds: string[];
};

/**
 * One item's contribution to one person's bill, as a range.
 *
 * Both ends travel together on purpose. They were once a single `amount` that
 * carried the low end alone, and every reader downstream presented it as if it
 * were the answer — a $600–$800 flight showed up as a flat $600.
 */
export type ShareLine = {
  itemId: string;
  title: string;
  low: number;
  high: number;
};

export type MemberShare = {
  memberId: string;
  name: string;
  /** What this person owes across the whole trip, low and high. */
  owedLow: number;
  owedHigh: number;
  /** Per item, so the figure can be explained rather than asserted. */
  lines: ShareLine[];
};

/**
 * Is this traveller named in a per-item list?
 *
 * Empty means everybody, which is what an empty list has always meant here.
 * Used for attendees — who an item is FOR — and deliberately not for payers:
 * the festival is all four travellers' even though two of them cover it, so
 * filtering an itinerary on who pays hides it from the two being invited.
 */
export function itemConcerns(memberIds: string[], memberId: string): boolean {
  return memberIds.length === 0 || memberIds.includes(memberId);
}

/**
 * How the trip splits when an item names no payers.
 *
 * Members with an explicit percentage take it; the rest divide what is left
 * equally. That way "Ana pays 60%" needs one number rather than everybody
 * restating theirs, and the shares always total 100 even when nobody has set
 * any.
 */
export function defaultShares(members: SplitMember[]): Map<string, number> {
  const shares = new Map<string, number>();
  if (members.length === 0) return shares;

  const fixed = members.filter((m) => m.sharePercent !== null);
  const rest = members.filter((m) => m.sharePercent === null);
  const claimed = fixed.reduce((sum, m) => sum + (m.sharePercent ?? 0), 0);

  // Everybody fixed and the total short of 100: scale up so the whole trip is
  // still charged to somebody. 30/30 used to leave 40% owed by nobody.
  const scale = rest.length === 0 && claimed > 0 && claimed < 100 ? 100 / claimed : 1;
  for (const m of fixed) shares.set(m.id, ((m.sharePercent ?? 0) * scale) / 100);

  if (rest.length > 0) {
    // Never negative: if the fixed shares already exceed 100 the remainder is
    // zero, not a rebate for everybody else.
    const remainder = Math.max(0, 100 - claimed) / 100;
    const each = remainder / rest.length;
    for (const m of rest) shares.set(m.id, each);
  }

  return shares;
}

/**
 * What each member owes, item by item, as a range.
 *
 * An item's own payers win over the trip's split — that is the whole point of
 * naming them. Dividing the total by the number of travellers instead would be
 * wrong the moment one person covers the flights and another the hotel, which
 * is the normal case rather than the exception.
 *
 * `perPerson` prices are NOT divided: a $1,900 fare is $1,900 for each person
 * it applies to, so it is charged to each payer in full.
 */
export function splitTrip(items: SplitItem[], members: SplitMember[]): MemberShare[] {
  const shares = defaultShares(members);
  const byMember = new Map<string, MemberShare>(
    members.map((m) => [
      m.id,
      { memberId: m.id, name: m.name, owedLow: 0, owedHigh: 0, lines: [] },
    ])
  );

  const partySize = Math.max(1, members.length);

  const charge = (id: string, item: SplitItem, low: number, high: number) => {
    const share = byMember.get(id);
    if (!share) return;
    share.owedLow += low;
    share.owedHigh += high;
    share.lines.push({ itemId: item.id, title: item.title, low, high });
  };

  for (const item of items) {
    if (item.price === null) continue;
    const cost = itemCost(item, partySize);
    if (cost.high === 0) continue;

    // Naming nobody means whoever is ON it pays for it. Falling straight
    // through to the trip's own split instead billed the other three for a
    // flight the itinerary had just told them they were not taking — the
    // exact combination the form offers by default (a named attendee, payers
    // left on "Everyone").
    const named = item.payerIds.length > 0 ? item.payerIds : (item.attendeeIds ?? []);
    const payers = named.filter((id) => byMember.has(id));

    if (item.priceUnit === "per_person") {
      // A per-person price is already one person's cost. Whoever it applies to
      // owes the whole unit price, not a slice of the multiplied total.
      const low = cost.unitLow ?? 0;
      const high = cost.unitHigh !== null && cost.unitHigh > low ? cost.unitHigh : low;
      const targets = payers.length > 0 ? payers : members.map((m) => m.id);
      // Named payers covering more seats than their own: the item is priced
      // per attendee, so the payers split the attendees' total between them
      // or the other seats' fares vanish from every bill.
      const attendees = (item.attendeeIds ?? []).filter((id) => byMember.has(id));
      const factor =
        attendees.length > 0 && item.payerIds.length > 0 && payers.length > 0 && payers.length < attendees.length
          ? attendees.length / payers.length
          : 1;
      for (const id of targets) charge(id, item, low * factor, high * factor);
      continue;
    }

    if (payers.length > 0) {
      // Named payers divide it equally between themselves — a per-payer
      // percentage is a refinement nobody has asked for yet.
      for (const id of payers) {
        charge(id, item, cost.low / payers.length, cost.high / payers.length);
      }
      continue;
    }

    for (const m of members) {
      const fraction = shares.get(m.id) ?? 0;
      if (fraction === 0) continue;
      charge(m.id, item, cost.low * fraction, cost.high * fraction);
    }
  }

  return members.map((m) => byMember.get(m.id)!);
}
