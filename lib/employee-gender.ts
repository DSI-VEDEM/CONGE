export const EMPLOYEE_GENDERS = ["FEMALE", "MALE"] as const;
export type EmployeeGender = (typeof EMPLOYEE_GENDERS)[number];

export const EMPLOYEE_GENDER_LABELS: Record<EmployeeGender, string> = {
  FEMALE: "Femme",
  MALE: "Homme",
};

export function isEmployeeGender(value: unknown): value is EmployeeGender {
  return (
    typeof value === "string" &&
    EMPLOYEE_GENDERS.includes(value as EmployeeGender)
  );
}
