export const DOCUMENTS_REQUIRING_VALID_UNTIL = ["ID_CARD", "DRIVING_LICENSE"] as const;

const DOCUMENTS_REQUIRING_VALID_UNTIL_SET = new Set(DOCUMENTS_REQUIRING_VALID_UNTIL);

export function documentRequiresValidityDate(type?: string | null) {
  if (!type) return false;
  return DOCUMENTS_REQUIRING_VALID_UNTIL_SET.has(type);
}
