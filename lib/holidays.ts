const MS_PER_DAY = 86_400_000;

// Année "technique" utilisée pour stocker les jours fériés récurrents (mois/jour).
// On la choisit hors de la plage utilisée par l'app (GET /api/holidays limite les années à 2000..3000).
export const RECURRING_HOLIDAY_ANCHOR_YEAR = 1000;

export function normalizeUtcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function toRecurringAnchorDate(value: Date) {
  const d = normalizeUtcDateOnly(value);
  return new Date(Date.UTC(RECURRING_HOLIDAY_ANCHOR_YEAR, d.getUTCMonth(), d.getUTCDate()));
}

export function expandRecurringAnchorToYear(anchor: Date, year: number) {
  const month = anchor.getUTCMonth();
  const day = anchor.getUTCDate();
  const expanded = new Date(Date.UTC(year, month, day));
  // Ignore les dates invalides (ex: 29/02 sur année non bissextile).
  if (expanded.getUTCMonth() !== month || expanded.getUTCDate() !== day) return null;
  return expanded;
}

export function yearsOverlappingRangeInclusive(start: Date, end: Date) {
  const s = normalizeUtcDateOnly(start);
  const e = normalizeUtcDateOnly(end);
  const startYear = s.getUTCFullYear();
  const endYear = e.getUTCFullYear();
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
}

export function expandRecurringAnchorsBetweenInclusive(
  recurringAnchors: Date[],
  start: Date,
  end: Date
) {
  if (!Array.isArray(recurringAnchors) || recurringAnchors.length === 0) return [];
  const s = normalizeUtcDateOnly(start).getTime();
  const e = normalizeUtcDateOnly(end).getTime();
  if (e < s) return [];

  const years = yearsOverlappingRangeInclusive(new Date(s), new Date(e));
  const out: Date[] = [];
  for (const year of years) {
    for (const anchor of recurringAnchors) {
      const expanded = expandRecurringAnchorToYear(anchor, year);
      if (!expanded) continue;
      const t = expanded.getTime();
      if (t < s || t > e) continue;
      out.push(expanded);
    }
  }
  // Déduplication: certaines plages peuvent contenir la même date (si des doublons existent en base).
  const unique = new Map<number, Date>();
  for (const d of out) unique.set(d.getTime(), d);
  return Array.from(unique.values()).sort((a, b) => a.getTime() - b.getTime());
}

export function utcYearRange(year: number) {
  const start = new Date(Date.UTC(year, 0, 1));
  const endExclusive = new Date(Date.UTC(year + 1, 0, 1));
  return { start, endExclusive };
}

export function utcYearEndInclusive(year: number) {
  const { start, endExclusive } = utcYearRange(year);
  const endInclusive = new Date(endExclusive.getTime() - MS_PER_DAY);
  return { start, endInclusive };
}

