import { describe, it, expect } from "vitest";
import {
  RECURRING_HOLIDAY_ANCHOR_YEAR,
  normalizeUtcDateOnly,
  toRecurringAnchorDate,
  expandRecurringAnchorToYear,
  expandRecurringAnchorsBetweenInclusive,
  yearsOverlappingRangeInclusive,
  utcYearRange,
  utcYearEndInclusive,
} from "@/lib/holidays";

describe("normalizeUtcDateOnly", () => {
  it("supprime l'heure et la renvoie en UTC", () => {
    const d = new Date("2026-05-17T13:42:11.123Z");
    const norm = normalizeUtcDateOnly(d);
    expect(norm.toISOString()).toBe("2026-05-17T00:00:00.000Z");
  });
});

describe("toRecurringAnchorDate", () => {
  it("ancre la date sur l'année technique en gardant mois et jour", () => {
    const d = new Date(Date.UTC(2026, 11, 25)); // 25/12/2026
    const anchor = toRecurringAnchorDate(d);
    expect(anchor.getUTCFullYear()).toBe(RECURRING_HOLIDAY_ANCHOR_YEAR);
    expect(anchor.getUTCMonth()).toBe(11);
    expect(anchor.getUTCDate()).toBe(25);
  });
});

describe("expandRecurringAnchorToYear", () => {
  it("développe une ancre 25/12 vers l'année cible", () => {
    const anchor = new Date(Date.UTC(RECURRING_HOLIDAY_ANCHOR_YEAR, 11, 25));
    const expanded = expandRecurringAnchorToYear(anchor, 2027);
    expect(expanded).not.toBeNull();
    expect(expanded?.getUTCFullYear()).toBe(2027);
    expect(expanded?.getUTCMonth()).toBe(11);
    expect(expanded?.getUTCDate()).toBe(25);
  });

  it("retourne null pour 29 février d'une année non bissextile", () => {
    const anchor = new Date(Date.UTC(RECURRING_HOLIDAY_ANCHOR_YEAR, 1, 29));
    expect(expandRecurringAnchorToYear(anchor, 2026)).toBeNull(); // 2026 non bissextile
    expect(expandRecurringAnchorToYear(anchor, 2028)?.getUTCDate()).toBe(29); // 2028 bissextile
  });
});

describe("yearsOverlappingRangeInclusive", () => {
  it("retourne une seule année si plage interne", () => {
    expect(yearsOverlappingRangeInclusive(new Date("2026-01-01"), new Date("2026-12-31"))).toEqual([2026]);
  });

  it("retourne plusieurs années sur plage à cheval", () => {
    expect(yearsOverlappingRangeInclusive(new Date("2025-12-30"), new Date("2027-01-02"))).toEqual([
      2025, 2026, 2027,
    ]);
  });
});

describe("expandRecurringAnchorsBetweenInclusive", () => {
  it("développe les ancres récurrentes sur toutes les années d'une plage", () => {
    const anchor = new Date(Date.UTC(RECURRING_HOLIDAY_ANCHOR_YEAR, 0, 1)); // 1er janvier
    const result = expandRecurringAnchorsBetweenInclusive(
      [anchor],
      new Date("2025-06-01"),
      new Date("2027-06-01")
    );
    // 1/1/2026 + 1/1/2027 dans la plage (1/1/2025 hors plage)
    expect(result.length).toBe(2);
    expect(result[0].getUTCFullYear()).toBe(2026);
    expect(result[1].getUTCFullYear()).toBe(2027);
  });

  it("ne duplique pas les dates", () => {
    const anchor = new Date(Date.UTC(RECURRING_HOLIDAY_ANCHOR_YEAR, 0, 1));
    const result = expandRecurringAnchorsBetweenInclusive(
      [anchor, anchor], // doublon volontaire
      new Date("2026-01-01"),
      new Date("2026-12-31")
    );
    expect(result.length).toBe(1);
  });

  it("retourne tableau vide si end < start", () => {
    const anchor = new Date(Date.UTC(RECURRING_HOLIDAY_ANCHOR_YEAR, 0, 1));
    expect(
      expandRecurringAnchorsBetweenInclusive([anchor], new Date("2027-01-01"), new Date("2026-01-01"))
    ).toEqual([]);
  });
});

describe("utcYearRange / utcYearEndInclusive", () => {
  it("retourne 1er janvier et 1er janvier de l'année suivante (exclusif)", () => {
    const { start, endExclusive } = utcYearRange(2026);
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("retourne 31 décembre comme fin inclusive", () => {
    const { endInclusive } = utcYearEndInclusive(2026);
    expect(endInclusive.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});
