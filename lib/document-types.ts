export const DEFAULT_DOCUMENT_TYPES = [
  { value: "CONTRACT", label: "Contrat / avenant" },
  { value: "ID_CARD", label: "CNI" },
  { value: "DRIVING_LICENSE", label: "Permis de conduire" },
  { value: "BIRTH_CERTIFICATE", label: "Extrait de naissance" },
  { value: "SPOUSE_BIRTH_CERTIFICATE", label: "Extrait du conjoint" },
  { value: "CHILD_BIRTH_CERTIFICATE", label: "Extrait de naissance d’un enfant" },
  { value: "CURRICULUM_VITAE", label: "Curriculum Vitae (CV)" },
  { value: "COVER_LETTER", label: "Lettre de motivation" },
  { value: "GEOGRAPHIC_LOCATION", label: "Localisation géographique" },
] as const;

export type DocumentTypeItem = (typeof DEFAULT_DOCUMENT_TYPES)[number];
export type DocumentType = DocumentTypeItem["value"];
export const PROFILE_DOCUMENT_TYPES = DEFAULT_DOCUMENT_TYPES.filter(
  (item) => item.value !== "CONTRACT"
);
