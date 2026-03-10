import type { DocumentType } from "@/lib/document-types";

export const DOCUMENTS_REQUIRING_VALID_UNTIL = ["ID_CARD", "DRIVING_LICENSE"] as const;
export const DOCUMENTS_REQUIRING_VALID_UNTIL_SET = new Set<DocumentType>(DOCUMENTS_REQUIRING_VALID_UNTIL);

export function documentRequiresValidityDate(type?: DocumentType | null) {
  if (!type) return false;
  return DOCUMENTS_REQUIRING_VALID_UNTIL_SET.has(type);
}
