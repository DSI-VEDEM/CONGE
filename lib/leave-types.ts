import { EmployeeGender } from "@/lib/employee-gender";
import type { LeaveType } from "@/generated/prisma/client";

type LeaveOption = {
  value: LeaveType;
  label: string;
  allowedGenders?: EmployeeGender[];
  hidden?: boolean;
};

export const LEAVE_TYPE_OPTIONS: LeaveOption[] = [
  { value: "ANNUAL_PAID", label: "Congé annuel payé" },
  { value: "FAMILY_EXCEPTIONAL", label: "Congés exceptionnels familiaux" },
  { value: "MENSTRUAL", label: "Congé menstruel", allowedGenders: ["FEMALE"] },
  { value: "CONGE_M", label: "Congé M (ancien)", allowedGenders: ["FEMALE"], hidden: true },
  { value: "MATERNITY_PATERNITY", label: "Congé maternité / paternité" },
  { value: "SICKNESS", label: "Congé maladie" },
  { value: "UNPAID", label: "Congé sans solde" },
  { value: "TRAINING", label: "Congé de formation" },
  { value: "ANNUAL", label: "Ancien congé annuel", hidden: true },
  { value: "SICK", label: "Ancien congé maladie", hidden: true },
  { value: "OTHER", label: "Autre type (historique)", hidden: true },
] as const;

export type LeaveTypeValue = LeaveType;

export const DEFAULT_LEAVE_TYPE = LEAVE_TYPE_OPTIONS[0].value;

export const LEAVE_TYPE_VALUES = LEAVE_TYPE_OPTIONS.map((opt) => opt.value) as LeaveType[];
export const LEAVE_TYPE_SET = new Set<LeaveType>(LEAVE_TYPE_VALUES);

export function leaveOptionsForGender(gender?: EmployeeGender | null) {
  return LEAVE_TYPE_OPTIONS.filter((option) => {
    if (option.hidden) return false;
    if (!option.allowedGenders) return true;
    if (!gender) return false;
    return option.allowedGenders.includes(gender);
  });
}

export function isLeaveType(value: unknown): value is LeaveTypeValue {
  return typeof value === "string" && LEAVE_TYPE_SET.has(value as LeaveTypeValue);
}

export const PAID_LEAVE_VALUES: LeaveType[] = ["ANNUAL_PAID", "ANNUAL"];
const PAID_LEAVE_SET = new Set<LeaveTypeValue>(PAID_LEAVE_VALUES);
export function isPaidLeaveType(value: unknown): value is LeaveTypeValue {
  return typeof value === "string" && PAID_LEAVE_SET.has(value as LeaveTypeValue);
}

export const MENSTRUAL_LEAVE_VALUES: LeaveType[] = ["MENSTRUAL", "CONGE_M"];
const MENSTRUAL_LEAVE_SET = new Set<LeaveTypeValue>(MENSTRUAL_LEAVE_VALUES);
export function isMenstrualLeaveType(value: unknown): value is LeaveTypeValue {
  return typeof value === "string" && MENSTRUAL_LEAVE_SET.has(value as LeaveTypeValue);
}
