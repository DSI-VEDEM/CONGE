import { prisma } from "@/lib/prisma";
import { PAID_LEAVE_VALUES, isPaidLeaveType } from "@/lib/leave-types";
import { countCalendarDaysInclusive, countLeaveDaysInclusive, countLeaveDaysOverlapInYear } from "@/lib/leave-days";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { expandRecurringAnchorToYear, normalizeUtcDateOnly, utcYearRange } from "@/lib/holidays";

const BASE_ANNUAL_DAYS = 25;

type EmployeeBalanceSource = {
  id: string;
  leaveBalance: number;
  leaveBalanceAdjustment: number;
  hireDate: Date | null;
  companyEntryDate: Date | null;
  createdAt: Date;
};

type PrismaLike = PrismaClient | Prisma.TransactionClient;

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function startOfUtcDay(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function yearsBetween(hireDate: Date, asOf: Date) {
  let years = asOf.getUTCFullYear() - hireDate.getUTCFullYear();
  const beforeAnniversary =
    asOf.getUTCMonth() < hireDate.getUTCMonth() ||
    (asOf.getUTCMonth() === hireDate.getUTCMonth() && asOf.getUTCDate() < hireDate.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

function seniorityBonusDays(seniorityYears: number) {
  if (seniorityYears >= 30) return 8;
  if (seniorityYears >= 25) return 7;
  if (seniorityYears >= 20) return 5;
  if (seniorityYears >= 15) return 3;
  if (seniorityYears >= 10) return 2;
  if (seniorityYears >= 5) return 1;
  return 0;
}

function resolveHireDate(employee: EmployeeBalanceSource) {
  return employee.companyEntryDate ?? employee.hireDate ?? null;
}

function monthsWorkedInYear(hireDate: Date, year: number) {
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year, 11, 31);
  const hireDay = startOfUtcDay(hireDate);
  if (hireDay > yearEnd) return 0;
  return hireDay <= yearStart ? 12 : 12;
}

export function calculateEntitledLeaveDaysForYear(
  employee: EmployeeBalanceSource,
  year: number
) {
  const hireDate = resolveHireDate(employee);
  if (!hireDate) {
    const entitlement = roundToOneDecimal(Math.max(0, BASE_ANNUAL_DAYS + employee.leaveBalanceAdjustment));
    return {
      entitlement,
      monthlyAccrued: BASE_ANNUAL_DAYS,
      bonusDays: 0,
      monthsWorkedThisYear: 12,
      seniorityYears: 0,
      effectiveHireDate: null,
      baseAnnualDays: BASE_ANNUAL_DAYS,
    };
  }
  const monthsWorked = monthsWorkedInYear(hireDate, year);
  if (monthsWorked === 0) {
    return {
      entitlement: 0,
      monthlyAccrued: 0,
      bonusDays: 0,
      monthsWorkedThisYear: 0,
      seniorityYears: 0,
      effectiveHireDate: hireDate,
      baseAnnualDays: 0,
    };
  }

  const monthlyAccrued = BASE_ANNUAL_DAYS;
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const seniorityYears = yearsBetween(hireDate, yearEnd);
  const bonusDays = seniorityBonusDays(seniorityYears);
  const entitlement = roundToOneDecimal(
    Math.max(0, BASE_ANNUAL_DAYS + bonusDays + employee.leaveBalanceAdjustment)
  );

  return {
    entitlement,
    monthlyAccrued,
    bonusDays,
    monthsWorkedThisYear: monthsWorked,
    seniorityYears,
    effectiveHireDate: hireDate,
    baseAnnualDays: BASE_ANNUAL_DAYS,
  };
}

export function calculateEntitledLeaveDays(employee: EmployeeBalanceSource, asOf: Date = new Date()) {
  return calculateEntitledLeaveDaysForYear(employee, asOf.getUTCFullYear());
}

export async function consumedLeaveDaysForYear(
  db: PrismaLike,
  employeeId: string,
  year: number
) {
  const { start: yearStart, endExclusive: nextYearStart } = utcYearRange(year);

  const [leaves, oneOff, recurring] = await Promise.all([
    db.leaveRequest.findMany({
      where: {
        employeeId,
        status: { in: ["SUBMITTED", "PENDING", "APPROVED"] },
        type: { in: PAID_LEAVE_VALUES },
        // Garder uniquement les congés qui chevauchent l'année demandée.
        startDate: { lt: nextYearStart },
        endDate: { gte: yearStart },
      },
      select: {
        startDate: true,
        endDate: true,
        type: true,
      },
    }),
    db.holiday.findMany({
      where: { isRecurring: { not: true }, date: { gte: yearStart, lt: nextYearStart } },
      select: { date: true },
    }),
    db.holiday.findMany({
      where: { isRecurring: true },
      select: { date: true },
    }),
  ]);

  const holidayDates = [
    ...oneOff.map((h) => normalizeUtcDateOnly(h.date)),
    ...recurring
      .map((h) => expandRecurringAnchorToYear(h.date, year))
      .filter(Boolean)
      .map((d) => d as Date),
  ];

  return leaves.reduce(
    (acc, leave) =>
      acc +
      countLeaveDaysOverlapInYear({
        start: leave.startDate,
        end: leave.endDate,
        year,
        type: leave.type,
        holidays: holidayDates,
      }),
    0
  );
}

async function debtCarriedIntoYear(
  db: PrismaLike,
  employee: EmployeeBalanceSource,
  employeeId: string,
  targetYear: number
) {
  const firstTrackedDate = resolveHireDate(employee) ?? employee.createdAt;
  const firstTrackedYear = Math.min(firstTrackedDate.getUTCFullYear(), targetYear);
  let carriedDebt = 0;

  for (let year = firstTrackedYear; year < targetYear; year += 1) {
    const entitlement = calculateEntitledLeaveDaysForYear(employee, year).entitlement;
    const effectiveEntitlement = roundToOneDecimal(Math.max(0, entitlement - carriedDebt));
    const consumed = await consumedLeaveDaysForYear(db, employeeId, year);
    carriedDebt = roundToOneDecimal(Math.max(0, consumed - effectiveEntitlement));
  }

  return carriedDebt;
}

export function consumedLeaveDaysForYearFromLeaves(
  leaves: Array<{ startDate: Date; endDate: Date; status: string; type?: string }>,
  year: number,
  holidays?: Array<string | Date>
) {
  return leaves.reduce((acc, leave) => {
    if (leave.status !== "SUBMITTED" && leave.status !== "PENDING" && leave.status !== "APPROVED") {
      return acc;
    }
    if (!isPaidLeaveType(leave.type)) {
      return acc;
    }
    return (
      acc +
      countLeaveDaysOverlapInYear({
        start: leave.startDate,
        end: leave.endDate,
        year,
        type: leave.type,
        holidays,
      })
    );
  }, 0);
}

export async function syncEmployeeLeaveBalance(db: PrismaLike, employeeId: string, asOf: Date = new Date()) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      leaveBalance: true,
      leaveBalanceAdjustment: true,
      hireDate: true,
      companyEntryDate: true,
      createdAt: true,
      gender: true,
    },
  });

  if (!employee) return null;

  const currentYear = asOf.getUTCFullYear();
  const currentCalc = calculateEntitledLeaveDaysForYear(employee, currentYear);
  const debtFromPreviousYear = await debtCarriedIntoYear(db, employee, employeeId, currentYear);
  const effectiveEntitlement = roundToOneDecimal(Math.max(0, currentCalc.entitlement - debtFromPreviousYear));

  if (Math.abs(Number(employee.leaveBalance) - effectiveEntitlement) < 0.0001) {
    return { employee, ...currentCalc, debtFromPreviousYear, effectiveEntitlement };
  }

  const updated = await db.employee.update({
    where: { id: employeeId },
    data: { leaveBalance: effectiveEntitlement },
    select: {
      id: true,
      leaveBalance: true,
      leaveBalanceAdjustment: true,
      hireDate: true,
      companyEntryDate: true,
      createdAt: true,
      gender: true,
    },
  });

  return { employee: updated, ...currentCalc, debtFromPreviousYear, effectiveEntitlement };
}

export async function syncAllActiveEmployeesLeaveBalance(asOf: Date = new Date()) {
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  for (const employee of employees) {
    await syncEmployeeLeaveBalance(prisma, employee.id, asOf);
  }

  return employees.length;
}

export function requestedLeaveDays(startDate: Date, endDate: Date) {
  return countCalendarDaysInclusive(startDate, endDate);
}

export function requestedLeaveDaysForType(
  startDate: Date,
  endDate: Date,
  type?: unknown,
  holidays?: Array<string | Date>
) {
  return countLeaveDaysInclusive({ start: startDate, end: endDate, type, holidays });
}
