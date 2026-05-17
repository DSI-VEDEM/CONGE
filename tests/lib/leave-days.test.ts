import { describe, it, expect } from "vitest";
import {
  countCalendarDaysInclusive,
  countWeekdaysInclusive,
  countLeaveDaysInclusive,
  countLeaveDaysOverlapInYear,
  countLeaveDaysOverlapInRange,
  computeReturnDate,
} from "@/lib/leave-days";

/// Helpers
const d = (s: string) => new Date(s);

describe("countCalendarDaysInclusive", () => {
  it("compte 1 jour pour une plage d'un seul jour", () => {
    expect(countCalendarDaysInclusive("2026-01-05", "2026-01-05")).toBe(1);
  });

  it("compte 7 jours pour une semaine inclusive", () => {
    expect(countCalendarDaysInclusive("2026-01-05", "2026-01-11")).toBe(7);
  });

  it("retourne 0 si end < start", () => {
    expect(countCalendarDaysInclusive("2026-01-10", "2026-01-05")).toBe(0);
  });

  it("retourne 0 sur entrée invalide", () => {
    expect(countCalendarDaysInclusive("not-a-date", "2026-01-05")).toBe(0);
  });

  it("traverse correctement un changement de mois", () => {
    // 28, 29, 30, 31 janvier + 1, 2 février = 6 jours
    expect(countCalendarDaysInclusive("2026-01-28", "2026-02-02")).toBe(6);
  });

  it("accepte des Date au lieu de strings", () => {
    expect(countCalendarDaysInclusive(d("2026-01-01"), d("2026-01-03"))).toBe(3);
  });
});

describe("countWeekdaysInclusive", () => {
  it("retourne 5 sur une semaine ouvrée complète (lundi → vendredi)", () => {
    // 2026-01-05 est un lundi
    expect(countWeekdaysInclusive("2026-01-05", "2026-01-09")).toBe(5);
  });

  it("exclut samedi et dimanche d'une semaine complète", () => {
    // Lundi → dimanche
    expect(countWeekdaysInclusive("2026-01-05", "2026-01-11")).toBe(5);
  });

  it("retourne 0 sur un week-end seul", () => {
    expect(countWeekdaysInclusive("2026-01-10", "2026-01-11")).toBe(0);
  });

  it("compte correctement sur 2 semaines + 3 jours", () => {
    // 17 jours du lundi 5/1 au mercredi 21/1 : 13 weekdays
    expect(countWeekdaysInclusive("2026-01-05", "2026-01-21")).toBe(13);
  });

  it("retourne 0 si end < start", () => {
    expect(countWeekdaysInclusive("2026-01-21", "2026-01-05")).toBe(0);
  });
});

describe("countLeaveDaysInclusive", () => {
  it("type non payé : compte tous les jours calendaires", () => {
    expect(countLeaveDaysInclusive({ start: "2026-01-05", end: "2026-01-11", type: "UNPAID" })).toBe(7);
  });

  it("type payé : exclut week-ends et jours fériés", () => {
    // Lundi 5/1 → vendredi 9/1, avec mercredi 7/1 férié → 4 jours
    const result = countLeaveDaysInclusive({
      start: "2026-01-05",
      end: "2026-01-09",
      type: "PAID",
      holidays: ["2026-01-07"],
    });
    expect(result).toBe(4);
  });

  it("type payé : jour férié tombant un samedi n'est pas décompté", () => {
    // Samedi 10/1 est férié — n'enlève rien aux jours ouvrés
    const result = countLeaveDaysInclusive({
      start: "2026-01-05",
      end: "2026-01-09",
      type: "PAID",
      holidays: ["2026-01-10"],
    });
    expect(result).toBe(5);
  });

  it("plage couvrant 2 semaines payée sans férié = 10 jours", () => {
    expect(countLeaveDaysInclusive({ start: "2026-01-05", end: "2026-01-16", type: "PAID" })).toBe(10);
  });
});

describe("countLeaveDaysOverlapInYear", () => {
  it("compte uniquement les jours dans l'année donnée", () => {
    // Du 28/12/2026 au 5/1/2027 — 4 jours en 2026 (28, 29, 30, 31)
    const result2026 = countLeaveDaysOverlapInYear({
      start: "2026-12-28",
      end: "2027-01-05",
      year: 2026,
      type: "UNPAID",
    });
    expect(result2026).toBe(4);
  });

  it("retourne 0 si la plage ne croise pas l'année", () => {
    expect(
      countLeaveDaysOverlapInYear({
        start: "2025-01-01",
        end: "2025-12-31",
        year: 2027,
        type: "UNPAID",
      })
    ).toBe(0);
  });
});

describe("countLeaveDaysOverlapInRange", () => {
  it("borne par rangeStart / rangeEndExclusive", () => {
    // demande sur tout janvier, range sur les 5 premiers jours (exclusif au 6)
    const result = countLeaveDaysOverlapInRange({
      start: "2026-01-01",
      end: "2026-01-31",
      rangeStart: "2026-01-01",
      rangeEndExclusive: "2026-01-06",
      type: "UNPAID",
    });
    expect(result).toBe(5);
  });
});

describe("computeReturnDate", () => {
  it("retourne le jour ouvré suivant la fin (samedi → lundi)", () => {
    // Samedi 10/1/2026 → lundi 12/1/2026
    const result = computeReturnDate("2026-01-10");
    expect(result).toContain("Lundi");
    expect(result).toContain("12");
    expect(result).toContain("Janvier");
  });

  it("saute par-dessus un jour férié", () => {
    // Vendredi 9/1, lundi 12/1 férié → mardi 13/1
    const result = computeReturnDate("2026-01-09", ["2026-01-12"]);
    expect(result).toContain("Mardi");
    expect(result).toContain("13");
  });

  it("retourne null si end est null/invalide", () => {
    expect(computeReturnDate(null)).toBeNull();
    expect(computeReturnDate(undefined)).toBeNull();
    expect(computeReturnDate("pas-une-date")).toBeNull();
  });
});
