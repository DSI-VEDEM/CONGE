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

function isWeekdayUtc(utcDayMs: number) {
  const dow = new Date(utcDayMs).getUTCDay(); // 0=Sun, 6=Sat
  return dow !== 0 && dow !== 6;
}

function countHolidayWeekdaysInRange(startUtcDayMs: number, endUtcDayMs: number, holidays?: Array<string | Date>) {
  if (!Array.isArray(holidays) || holidays.length === 0) return 0;
  const unique = new Set<number>();
  for (const h of holidays) {
    const day = toUtcDayMs(h);
    if (day == null) continue;
    if (day < startUtcDayMs || day > endUtcDayMs) continue;
    if (!isWeekdayUtc(day)) continue;
    unique.add(day);
  }
  return unique.size;
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
  holidays?: Array<string | Date>;
}) {
  if (!isPaidLeaveType(options.type)) {
    return countCalendarDaysInclusive(options.start, options.end);
  }

  const startUtc = toUtcDayMs(options.start);
  const endUtc = toUtcDayMs(options.end);
  if (startUtc == null || endUtc == null) return 0;
  if (endUtc < startUtc) return 0;

  const weekdays = countWeekdaysInclusive(new Date(startUtc), new Date(endUtc));
  const holidayWeekdays = countHolidayWeekdaysInRange(startUtc, endUtc, options.holidays);
  return Math.max(0, weekdays - holidayWeekdays);
}

export function countLeaveDaysOverlapInYear(options: {
  start: string | Date;
  end: string | Date;
  year: number;
  type?: unknown;
  holidays?: Array<string | Date>;
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

  if (!isPaidLeaveType(options.type)) {
    return countCalendarDaysInclusive(new Date(s), new Date(e));
  }

  const weekdays = countWeekdaysInclusive(new Date(s), new Date(e));
  const holidayWeekdays = countHolidayWeekdaysInRange(s, e, options.holidays);
  return Math.max(0, weekdays - holidayWeekdays);
}
