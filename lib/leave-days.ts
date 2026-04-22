import { isPaidLeaveType } from "@/lib/leave-types";

const MS_PER_DAY = 86_400_000;

function startOfUtcDayMs(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function toUtcDayMs(value: string | Date | null | undefined) {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return startOfUtcDayMs(d);
}

export function countCalendarDaysInclusive(start: string | Date, end: string | Date) {
  const s = toUtcDayMs(start);
  const e = toUtcDayMs(end);
  if (s == null || e == null) return 0;
  if (e < s) return 0;
  return Math.floor((e - s) / MS_PER_DAY) + 1;
}

export function countWeekdaysInclusive(start: string | Date, end: string | Date) {
  const s = toUtcDayMs(start);
  const e = toUtcDayMs(end);
  if (s == null || e == null) return 0;
  if (e < s) return 0;

  const totalDays = Math.floor((e - s) / MS_PER_DAY) + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  let weekdays = fullWeeks * 5;

  const remainingDays = totalDays % 7;
  const startDow = new Date(s).getUTCDay(); // 0=Sun, 6=Sat
  for (let i = 0; i < remainingDays; i++) {
    const dow = (startDow + i) % 7;
    if (dow !== 0 && dow !== 6) weekdays += 1;
  }

  return weekdays;
}

export function countLeaveDaysInclusive(options: {
  start: string | Date;
  end: string | Date;
  type?: unknown;
}) {
  return isPaidLeaveType(options.type)
    ? countWeekdaysInclusive(options.start, options.end)
    : countCalendarDaysInclusive(options.start, options.end);
}

export function countLeaveDaysOverlapInYear(options: {
  start: string | Date;
  end: string | Date;
  year: number;
  type?: unknown;
}) {
  const startUtc = toUtcDayMs(options.start);
  const endUtc = toUtcDayMs(options.end);
  if (startUtc == null || endUtc == null) return 0;
  if (endUtc < startUtc) return 0;

  const yearStart = Date.UTC(options.year, 0, 1);
  const yearEnd = Date.UTC(options.year, 11, 31);
  const s = Math.max(startUtc, yearStart);
  const e = Math.min(endUtc, yearEnd);
  if (s > e) return 0;

  return isPaidLeaveType(options.type)
    ? countWeekdaysInclusive(new Date(s), new Date(e))
    : countCalendarDaysInclusive(new Date(s), new Date(e));
}

