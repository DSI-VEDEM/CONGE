import type { EmployeeSession } from "@/lib/auth-client";
import type { DocumentType, DocumentTypeItem } from "@/lib/document-types";
import { isCompletePhone } from "@/lib/phone";

export type ProfileCompletionSummary = {
  completed: number;
  total: number;
  missingLabels: string[];
};

export type ProfileDocumentCompletionSummary = ProfileCompletionSummary & {
  isLoaded: boolean;
};

type ProfileEmployee = Partial<
  Pick<
    EmployeeSession,
    | "firstName"
    | "lastName"
    | "jobTitle"
    | "phone"
    | "profilePhotoUrl"
    | "fullAddress"
    | "hireDate"
    | "companyEntryDate"
    | "cnpsNumber"
    | "maritalStatus"
    | "childrenCount"
  >
>;

type ProfileDocument = {
  type?: DocumentType | string | null;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCompanyEntryDate(employee: ProfileEmployee) {
  return hasText(employee.companyEntryDate) || hasText(employee.hireDate);
}

function summarizeRequirements(requirements: Array<{ label: string; completed: boolean }>): ProfileCompletionSummary {
  return {
    completed: requirements.filter((item) => item.completed).length,
    total: requirements.length,
    missingLabels: requirements.filter((item) => !item.completed).map((item) => item.label),
  };
}

export function calculatePersonalProfileCompletion(employee: ProfileEmployee): ProfileCompletionSummary {
  return summarizeRequirements([
    { label: "Photo de profil", completed: hasText(employee.profilePhotoUrl) },
    { label: "Prénom", completed: hasText(employee.firstName) },
    { label: "Nom", completed: hasText(employee.lastName) },
    { label: "Poste", completed: hasText(employee.jobTitle) },
    { label: "Téléphone", completed: hasText(employee.phone) && isCompletePhone(String(employee.phone)) },
    { label: "Adresse précise", completed: hasText(employee.fullAddress) },
    { label: "Date d'entrée dans l'entreprise", completed: hasCompanyEntryDate(employee) },
    { label: "Numéro CNPS", completed: hasText(employee.cnpsNumber) },
    { label: "Situation matrimoniale", completed: hasText(employee.maritalStatus) },
    {
      label: "Nombre d'enfants",
      completed:
        typeof employee.childrenCount === "number" &&
        Number.isInteger(employee.childrenCount) &&
        employee.childrenCount >= 0,
    },
  ]);
}

export function calculateProfileDocumentsCompletion(
  employee: Pick<ProfileEmployee, "childrenCount" | "maritalStatus">,
  documents: readonly ProfileDocument[],
  documentTypes: readonly DocumentTypeItem[]
): ProfileCompletionSummary {
  const documentCountByType = new Map<string, number>();
  for (const document of documents) {
    if (!document.type) continue;
    documentCountByType.set(document.type, (documentCountByType.get(document.type) ?? 0) + 1);
  }

  let completed = 0;
  let total = 0;
  const missingLabels: string[] = [];
  const isMarried = employee.maritalStatus === "MARRIED";
  const childrenCount =
    typeof employee.childrenCount === "number" && Number.isInteger(employee.childrenCount) && employee.childrenCount > 0
      ? employee.childrenCount
      : 0;

  for (const item of documentTypes) {
    if (item.value === "SPOUSE_BIRTH_CERTIFICATE" && !isMarried) continue;
    if (item.value === "CHILD_BIRTH_CERTIFICATE") {
      if (childrenCount <= 0) continue;

      const uploadedChildrenDocuments = Math.min(documentCountByType.get(item.value) ?? 0, childrenCount);
      total += childrenCount;
      completed += uploadedChildrenDocuments;
      if (uploadedChildrenDocuments < childrenCount) {
        missingLabels.push(`${item.label} (${uploadedChildrenDocuments}/${childrenCount})`);
      }
      continue;
    }

    total += 1;
    if ((documentCountByType.get(item.value) ?? 0) > 0) {
      completed += 1;
    } else {
      missingLabels.push(item.label);
    }
  }

  return { completed, total, missingLabels };
}

export function completionPercent(summary: Pick<ProfileCompletionSummary, "completed" | "total">) {
  if (summary.total <= 0) return 100;
  return Math.round((summary.completed / summary.total) * 100);
}
