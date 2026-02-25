export type MaritalStatus = "SINGLE" | "MARRIED";

export const MARITAL_STATUSES: MaritalStatus[] = ["SINGLE", "MARRIED"];

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  SINGLE: "Célibataire",
  MARRIED: "Marié(e)",
};

export function isMaritalStatus(value: string): value is MaritalStatus {
  return MARITAL_STATUSES.includes(value as MaritalStatus);
}
