import { EmployeeGender } from "@/lib/employee-gender";
import type { LeaveType } from "@/generated/prisma/client";

type LeaveOption = {
  value: LeaveType;
  label: string;
  allowedGenders?: EmployeeGender[];
  hidden?: boolean;
  showWhenPaidLeaveExhausted?: boolean;
  hideWhenPaidLeaveExhausted?: boolean;
};

export const LEAVE_TYPE_OPTIONS: LeaveOption[] = [
  { value: "ANNUAL_PAID", label: "Congé payé", hideWhenPaidLeaveExhausted: true },
  { value: "ANTICIPATED_PAID", label: "Congé anticipé", showWhenPaidLeaveExhausted: true },
  { value: "FAMILY_EXCEPTIONAL", label: "Congé familial exceptionnel" },
  { value: "MENSTRUAL", label: "Congé menstruel", allowedGenders: ["FEMALE"] },
  { value: "CONGE_M", label: "Congé M (historique)", allowedGenders: ["FEMALE"], hidden: true },
  { value: "MATERNITY_PATERNITY", label: "Congé maternité/paternité" },
  { value: "SICKNESS", label: "Congé maladie" },
  { value: "UNPAID", label: "Mise à  disponibilité " },
  { value: "TRAINING", label: "Congé de formation" },
  { value: "ANNUAL", label: "Ancien congé annuel", hidden: true },
  { value: "SICK", label: "Ancien congé maladie", hidden: true },
  { value: "OTHER", label: "Autre type de congé", hidden: true },
] as const;

export type LeaveTypeValue = LeaveType;

export const DEFAULT_LEAVE_TYPE = LEAVE_TYPE_OPTIONS[0].value;

export const LEAVE_TYPE_VALUES = LEAVE_TYPE_OPTIONS.map((opt) => opt.value) as LeaveType[];
export const LEAVE_TYPE_SET = new Set<LeaveType>(LEAVE_TYPE_VALUES);

export function leaveOptionsForGender(
  gender?: EmployeeGender | null,
  options: { remainingPaidLeaveDays?: number | null; canUseAnticipatedPaid?: boolean } = {}
) {
  const hasPaidLeaveBalance =
    typeof options.remainingPaidLeaveDays === "number" ? options.remainingPaidLeaveDays > 0 : true;
  const canUseAnticipatedPaid = options.canUseAnticipatedPaid ?? !hasPaidLeaveBalance;

  return LEAVE_TYPE_OPTIONS.filter((option) => {
    if (option.hidden) return false;
    if (option.hideWhenPaidLeaveExhausted && !hasPaidLeaveBalance) return false;
    if (option.showWhenPaidLeaveExhausted && (hasPaidLeaveBalance || !canUseAnticipatedPaid)) return false;
    if (!option.allowedGenders) return true;
    if (!gender) return false;
    return option.allowedGenders.includes(gender);
  });
}

export function isLeaveType(value: unknown): value is LeaveTypeValue {
  return typeof value === "string" && LEAVE_TYPE_SET.has(value as LeaveTypeValue);
}

export function leaveTypeLabel(value?: string | null) {
  if (!value) return "—";
  if (value === "ANNUAL") return "Congé payé";
  if (value === "SICK") return "Congé maladie";
  if (value === "CONGE_M") return "Congé menstruel";
  return LEAVE_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export const ANTICIPATED_PAID_LEAVE_VALUE: LeaveType = "ANTICIPATED_PAID";
export const PAID_LEAVE_VALUES: LeaveType[] = ["ANNUAL_PAID", "ANTICIPATED_PAID", "ANNUAL"];
const PAID_LEAVE_SET = new Set<LeaveTypeValue>(PAID_LEAVE_VALUES);
export function isPaidLeaveType(value: unknown): value is LeaveTypeValue {
  return typeof value === "string" && PAID_LEAVE_SET.has(value as LeaveTypeValue);
}

export function isAnticipatedPaidLeaveType(value: unknown): value is LeaveTypeValue {
  return value === ANTICIPATED_PAID_LEAVE_VALUE;
}

export const MENSTRUAL_LEAVE_VALUES: LeaveType[] = ["MENSTRUAL", "CONGE_M"];
const MENSTRUAL_LEAVE_SET = new Set<LeaveTypeValue>(MENSTRUAL_LEAVE_VALUES);
export function isMenstrualLeaveType(value: unknown): value is LeaveTypeValue {
  return typeof value === "string" && MENSTRUAL_LEAVE_SET.has(value as LeaveTypeValue);
}
