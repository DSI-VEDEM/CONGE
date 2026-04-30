import { prisma } from "@/lib/prisma";
import { PAID_LEAVE_VALUES, isPaidLeaveType } from "@/lib/leave-types";
import {
  countCalendarDaysInclusive,
  countLeaveDaysInclusive,
  countLeaveDaysOverlapInRange,
  countLeaveDaysOverlapInYear,
} from "@/lib/leave-days";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  expandRecurringAnchorsBetweenInclusive,
  expandRecurringAnchorToYear,
  normalizeUtcDateOnly,
  utcYearRange,
} from "@/lib/holidays";

const BASE_ANNUAL_DAYS = 26;
const MS_PER_DAY = 86_400_000;

type EmployeeBalanceSource = {
  id: string;
  leaveBalance: number;
  leaveBalanceAdjustment: number;
  firstYearLeaveUsedDays: number;
  firstYearLeaveUsedYear: number | null;
  hireDate: Date | null;
  companyEntryDate: Date | null;
  createdAt: Date;
};

type PrismaLike = Pick<PrismaClient, "employee" | "holiday" | "leaveRequest"> | Prisma.TransactionClient;

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function startOfUtcDay(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function startOfUtcDayDate(value: Date) {
  return new Date(startOfUtcDay(value));
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addUtcYears(value: Date, years: number) {
  const source = startOfUtcDayDate(value);
  const year = source.getUTCFullYear() + years;
  const month = source.getUTCMonth();
  const day = Math.min(source.getUTCDate(), daysInUtcMonth(year, month));
  return new Date(Date.UTC(year, month, day));
}

function previousUtcDay(value: Date) {
  return new Date(startOfUtcDay(value) - MS_PER_DAY);
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

export function resolveLeaveAnchorDate(employee: Pick<EmployeeBalanceSource, "companyEntryDate" | "hireDate" | "createdAt">) {
  return employee.companyEntryDate ?? employee.hireDate ?? employee.createdAt ?? null;
}

function firstYearLeaveUsedDaysForYear(employee: Pick<EmployeeBalanceSource, "firstYearLeaveUsedDays" | "firstYearLeaveUsedYear">, year: number) {
  if (employee.firstYearLeaveUsedYear !== year) return 0;
  return Math.max(0, Number(employee.firstYearLeaveUsedDays ?? 0));
}

export function firstYearLeaveUsedDaysForCycle(
  employee: Pick<EmployeeBalanceSource, "firstYearLeaveUsedDays" | "firstYearLeaveUsedYear">,
  cycleStart: Date,
  cycleEndExclusive: Date
) {
  const markerYear = employee.firstYearLeaveUsedYear;
  if (!markerYear) return 0;
  const marker = Date.UTC(markerYear, 0, 1);
  if (marker < startOfUtcDay(cycleStart) || marker >= startOfUtcDay(cycleEndExclusive)) return 0;
  return Math.max(0, Number(employee.firstYearLeaveUsedDays ?? 0));
}

export function getPaidLeaveEligibilityDate(
  employee: Pick<EmployeeBalanceSource, "companyEntryDate" | "hireDate" | "createdAt">
) {
  const anchorDate = resolveLeaveAnchorDate(employee);
  return anchorDate ? addUtcYears(anchorDate, 1) : null;
}

export function getLeaveCycleForDate(
  employee: Pick<EmployeeBalanceSource, "companyEntryDate" | "hireDate" | "createdAt">,
  asOf: Date = new Date()
) {
  const anchorDate = resolveLeaveAnchorDate(employee);
  const asOfDay = startOfUtcDayDate(asOf);

  if (!anchorDate) {
    const start = new Date(Date.UTC(asOfDay.getUTCFullYear(), 0, 1));
    const endExclusive = new Date(Date.UTC(asOfDay.getUTCFullYear() + 1, 0, 1));
    return {
      start,
      endExclusive,
      endInclusive: previousUtcDay(endExclusive),
      nextStart: endExclusive,
      eligibilityDate: null,
      effectiveHireDate: null,
      isPaidLeaveEligible: true,
    };
  }

  const anchor = startOfUtcDayDate(anchorDate);
  const eligibilityDate = addUtcYears(anchor, 1);

  if (startOfUtcDay(asOfDay) < startOfUtcDay(eligibilityDate)) {
    return {
      start: anchor,
      endExclusive: eligibilityDate,
      endInclusive: previousUtcDay(eligibilityDate),
      nextStart: eligibilityDate,
      eligibilityDate,
      effectiveHireDate: anchor,
      isPaidLeaveEligible: false,
    };
  }

  let anniversaryYears = asOfDay.getUTCFullYear() - anchor.getUTCFullYear();
  const anniversaryThisYear = addUtcYears(anchor, anniversaryYears);
  if (startOfUtcDay(anniversaryThisYear) > startOfUtcDay(asOfDay)) anniversaryYears -= 1;
  anniversaryYears = Math.max(1, anniversaryYears);

  const start = addUtcYears(anchor, anniversaryYears);
  const endExclusive = addUtcYears(anchor, anniversaryYears + 1);
  return {
    start,
    endExclusive,
    endInclusive: previousUtcDay(endExclusive),
    nextStart: endExclusive,
    eligibilityDate,
    effectiveHireDate: anchor,
    isPaidLeaveEligible: true,
  };
}

export function calculateEntitledLeaveDaysForCycle(
  employee: EmployeeBalanceSource,
  asOf: Date = new Date()
) {
  const cycle = getLeaveCycleForDate(employee, asOf);
  if (!cycle.effectiveHireDate) {
    const entitlement = roundToOneDecimal(Math.max(0, BASE_ANNUAL_DAYS + employee.leaveBalanceAdjustment));
    return {
      entitlement,
      monthlyAccrued: BASE_ANNUAL_DAYS,
      bonusDays: 0,
      monthsWorkedThisYear: 12,
      seniorityYears: 0,
      effectiveHireDate: null,
      baseAnnualDays: BASE_ANNUAL_DAYS,
      leaveCycleStart: cycle.start,
      leaveCycleEndExclusive: cycle.endExclusive,
      leaveCycleEndInclusive: cycle.endInclusive,
      paidLeaveEligibilityDate: cycle.eligibilityDate,
      isPaidLeaveEligible: cycle.isPaidLeaveEligible,
    };
  }
  if (!cycle.isPaidLeaveEligible) {
    return {
      entitlement: 0,
      monthlyAccrued: 0,
      bonusDays: 0,
      monthsWorkedThisYear: 0,
      seniorityYears: yearsBetween(cycle.effectiveHireDate, cycle.start),
      effectiveHireDate: cycle.effectiveHireDate,
      baseAnnualDays: 0,
      leaveCycleStart: cycle.start,
      leaveCycleEndExclusive: cycle.endExclusive,
      leaveCycleEndInclusive: cycle.endInclusive,
      paidLeaveEligibilityDate: cycle.eligibilityDate,
      isPaidLeaveEligible: false,
    };
  }

  const monthlyAccrued = BASE_ANNUAL_DAYS;
  const seniorityYears = yearsBetween(cycle.effectiveHireDate, cycle.start);
  const bonusDays = seniorityBonusDays(seniorityYears);
  const entitlement = roundToOneDecimal(
    Math.max(0, BASE_ANNUAL_DAYS + bonusDays + employee.leaveBalanceAdjustment)
  );

  return {
    entitlement,
    monthlyAccrued,
    bonusDays,
    monthsWorkedThisYear: 12,
    seniorityYears,
    effectiveHireDate: cycle.effectiveHireDate,
    baseAnnualDays: BASE_ANNUAL_DAYS,
    leaveCycleStart: cycle.start,
    leaveCycleEndExclusive: cycle.endExclusive,
    leaveCycleEndInclusive: cycle.endInclusive,
    paidLeaveEligibilityDate: cycle.eligibilityDate,
    isPaidLeaveEligible: true,
  };
}

export function calculateEntitledLeaveDaysForYear(
  employee: EmployeeBalanceSource,
  year: number
) {
  return calculateEntitledLeaveDaysForCycle(employee, new Date(Date.UTC(year, 11, 31)));
}

export function calculateEntitledLeaveDays(employee: EmployeeBalanceSource, asOf: Date = new Date()) {
  return calculateEntitledLeaveDaysForCycle(employee, asOf);
}

export async function consumedLeaveDaysForYear(
  db: PrismaLike,
  employeeId: string,
  year: number
) {
  const { start: yearStart, endExclusive: nextYearStart } = utcYearRange(year);

  const [leaves, oneOff, recurring, employee] = await Promise.all([
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
    db.employee.findUnique({
      where: { id: employeeId },
      select: { firstYearLeaveUsedDays: true, firstYearLeaveUsedYear: true },
    }),
  ]);

  const holidayDates = [
    ...oneOff.map((h) => normalizeUtcDateOnly(h.date)),
    ...recurring
      .map((h) => expandRecurringAnchorToYear(h.date, year))
      .filter(Boolean)
      .map((d) => d as Date),
  ];

  const consumedFromRequests = leaves.reduce(
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

  const consumedBeforeDeployment = employee
    ? firstYearLeaveUsedDaysForYear(employee, year)
    : 0;

  return consumedFromRequests + consumedBeforeDeployment;
}

export async function consumedLeaveDaysForRange(
  db: PrismaLike,
  employeeId: string,
  rangeStart: Date,
  rangeEndExclusive: Date
) {
  const [leaves, oneOff, recurring, employee] = await Promise.all([
    db.leaveRequest.findMany({
      where: {
        employeeId,
        status: { in: ["SUBMITTED", "PENDING", "APPROVED"] },
        type: { in: PAID_LEAVE_VALUES },
        startDate: { lt: rangeEndExclusive },
        endDate: { gte: rangeStart },
      },
      select: {
        startDate: true,
        endDate: true,
        type: true,
      },
    }),
    db.holiday.findMany({
      where: { isRecurring: { not: true }, date: { gte: rangeStart, lt: rangeEndExclusive } },
      select: { date: true },
    }),
    db.holiday.findMany({
      where: { isRecurring: true },
      select: { date: true },
    }),
    db.employee.findUnique({
      where: { id: employeeId },
      select: { firstYearLeaveUsedDays: true, firstYearLeaveUsedYear: true },
    }),
  ]);

  const rangeEndInclusive = previousUtcDay(rangeEndExclusive);
  const holidayDates = [
    ...oneOff.map((h) => normalizeUtcDateOnly(h.date)),
    ...expandRecurringAnchorsBetweenInclusive(
      recurring.map((h) => h.date),
      rangeStart,
      rangeEndInclusive
    ),
  ];

  const consumedFromRequests = leaves.reduce(
    (acc, leave) =>
      acc +
      countLeaveDaysOverlapInRange({
        start: leave.startDate,
        end: leave.endDate,
        rangeStart,
        rangeEndExclusive,
        type: leave.type,
        holidays: holidayDates,
      }),
    0
  );

  const consumedBeforeDeployment = employee
    ? firstYearLeaveUsedDaysForCycle(employee, rangeStart, rangeEndExclusive)
    : 0;

  return consumedFromRequests + consumedBeforeDeployment;
}

export async function debtCarriedIntoCycle(
  db: PrismaLike,
  employee: EmployeeBalanceSource,
  employeeId: string,
  targetCycleStart: Date
) {
  const anchor = resolveLeaveAnchorDate(employee);
  if (!anchor) return 0;

  let cycleStart = startOfUtcDayDate(anchor);
  const targetStart = startOfUtcDay(targetCycleStart);
  let carriedDebt = 0;

  while (startOfUtcDay(cycleStart) < targetStart) {
    const cycleEndExclusive = addUtcYears(cycleStart, 1);
    const entitlement = calculateEntitledLeaveDaysForCycle(employee, cycleStart).entitlement;
    const effectiveEntitlement = roundToOneDecimal(Math.max(0, entitlement - carriedDebt));
    const consumed = await consumedLeaveDaysForRange(db, employeeId, cycleStart, cycleEndExclusive);
    carriedDebt = roundToOneDecimal(Math.max(0, consumed - effectiveEntitlement));
    cycleStart = cycleEndExclusive;
  }

  return carriedDebt;
}

export function consumedLeaveDaysForYearFromLeaves(
  leaves: Array<{ startDate: Date; endDate: Date; status: string; type?: string }>,
  year: number,
  holidays?: Array<string | Date>,
  consumedBeforeDeployment = 0
) {
  const consumedFromRequests = leaves.reduce((acc, leave) => {
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

  return consumedFromRequests + Math.max(0, Number(consumedBeforeDeployment ?? 0));
}

export function consumedLeaveDaysForRangeFromLeaves(
  leaves: Array<{ startDate: Date; endDate: Date; status: string; type?: string }>,
  rangeStart: Date,
  rangeEndExclusive: Date,
  holidays?: Array<string | Date>,
  consumedBeforeDeployment = 0
) {
  const consumedFromRequests = leaves.reduce((acc, leave) => {
    if (leave.status !== "SUBMITTED" && leave.status !== "PENDING" && leave.status !== "APPROVED") {
      return acc;
    }
    if (!isPaidLeaveType(leave.type)) {
      return acc;
    }
    return (
      acc +
      countLeaveDaysOverlapInRange({
        start: leave.startDate,
        end: leave.endDate,
        rangeStart,
        rangeEndExclusive,
        type: leave.type,
        holidays,
      })
    );
  }, 0);

  return consumedFromRequests + Math.max(0, Number(consumedBeforeDeployment ?? 0));
}

export async function syncEmployeeLeaveBalance(db: PrismaLike, employeeId: string, asOf: Date = new Date()) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      leaveBalance: true,
      leaveBalanceAdjustment: true,
      firstYearLeaveUsedDays: true,
      firstYearLeaveUsedYear: true,
      hireDate: true,
      companyEntryDate: true,
      createdAt: true,
      gender: true,
    },
  });

  if (!employee) return null;

  const currentCalc = calculateEntitledLeaveDaysForCycle(employee, asOf);
  const debtFromPreviousYear = await debtCarriedIntoCycle(db, employee, employeeId, currentCalc.leaveCycleStart);
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
      firstYearLeaveUsedDays: true,
      firstYearLeaveUsedYear: true,
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
