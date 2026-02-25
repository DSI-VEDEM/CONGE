"use client";

export type SalarySlip = {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  fileName: string;
  signedAt?: string | null;
  createdAt: string;
  signedBy?: {
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  employee?: {
    firstName: string;
    lastName: string;
    matricule?: string | null;
    email: string;
  };
};

export type MonthGroup = {
  month: number;
  slips: SalarySlip[];
};

export type YearGroup = {
  year: number;
  months: MonthGroup[];
};

export const MONTH_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export function toPeriod(year: number, month: number) {
  const label = MONTH_LABELS[month - 1] ?? String(month);
  return `${label} ${year}`;
}

export function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("fr-FR");
}

export function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function groupSlipsByYearMonth(slips: SalarySlip[]): YearGroup[] {
  const years = new Map<number, Map<number, SalarySlip[]>>();
  for (const slip of slips) {
    const months = years.get(slip.year) ?? new Map<number, SalarySlip[]>();
    const monthSlips = months.get(slip.month) ?? [];
    monthSlips.push(slip);
    months.set(slip.month, monthSlips);
    years.set(slip.year, months);
  }

  return Array.from(years.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: Array.from(months.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([month, monthSlips]) => ({ month, slips: monthSlips })),
    }));
}
