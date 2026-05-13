import { isEmployeeGender } from "@/lib/employee-gender";
import { isMaritalStatus } from "@/lib/marital-status";
import { isCompletePhone } from "@/lib/phone";
import {
  PROFILE_PHOTO_TOO_LARGE_MESSAGE,
  isProfilePhotoDataUrlTooLarge,
} from "@/lib/profile-photo";

export type ProfileField =
  | "firstName"
  | "lastName"
  | "email"
  | "jobTitle"
  | "phone"
  | "profilePhotoUrl"
  | "fullAddress"
  | "hireDate"
  | "companyEntryDate"
  | "cnpsNumber"
  | "gender"
  | "maritalStatus"
  | "childrenCount"
  | "password";

export type ProfileValidationErrors = Partial<Record<ProfileField, string>>;

export type ProfileValidationInput = {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  profilePhotoUrl?: unknown;
  fullAddress?: unknown;
  hireDate?: unknown;
  companyEntryDate?: unknown;
  cnpsNumber?: unknown;
  gender?: unknown;
  maritalStatus?: unknown;
  childrenCount?: unknown;
  password?: unknown;
};

const PROFILE_FIELD_ORDER: ProfileField[] = [
  "firstName",
  "lastName",
  "gender",
  "maritalStatus",
  "childrenCount",
  "phone",
  "fullAddress",
  "companyEntryDate",
  "hireDate",
  "cnpsNumber",
  "profilePhotoUrl",
  "password",
  "email",
  "jobTitle",
];

export const PROFILE_MESSAGES = {
  firstNameRequired: "Le prénom est obligatoire.",
  lastNameRequired: "Le nom est obligatoire.",
  emailNotEditable: "L'email ne peut pas être modifié depuis ce formulaire.",
  phoneRequired: "Le numéro de téléphone est obligatoire.",
  phoneInvalid:
    "Numéro de téléphone invalide. Format attendu : +225 00 00 00 00 00.",
  fullAddressRequired: "L'adresse précise est obligatoire.",
  companyEntryDateRequired:
    "La date d'entrée dans l'entreprise est obligatoire.",
  companyEntryDateInvalid:
    "Date d'entrée invalide. Utilisez le format AAAA-MM-JJ.",
  cnpsRequired: "Le numéro CNPS est obligatoire.",
  cnpsTooLong: "Le numéro CNPS est trop long (max 50 caractères).",
  genderRequired: "Le genre est obligatoire.",
  genderInvalid: "Genre invalide. Choisissez Femme ou Homme.",
  maritalStatusRequired: "La situation matrimoniale est obligatoire.",
  maritalStatusInvalid:
    "Situation matrimoniale invalide. Choisissez Célibataire ou Marié(e).",
  childrenCountRequired: "Le nombre d'enfants est obligatoire.",
  childrenCountInvalid:
    "Le nombre d'enfants doit être un nombre entier positif ou 0.",
  passwordInvalid: "Le mot de passe doit contenir au moins 6 caractères.",
  noFieldChanged: "Aucune modification détectée.",
};

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

export function profileTextRequiredError(value: unknown, message: string) {
  return hasText(value) ? null : message;
}

export function profilePhoneError(value: unknown, required: boolean) {
  const raw = String(value ?? "").trim();
  if (!raw) return required ? PROFILE_MESSAGES.phoneRequired : null;
  return isCompletePhone(raw) ? null : PROFILE_MESSAGES.phoneInvalid;
}

export function profileAddressError(value: unknown, required: boolean) {
  return required
    ? profileTextRequiredError(value, PROFILE_MESSAGES.fullAddressRequired)
    : null;
}

export function profileDateError(value: unknown, required: boolean) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return required ? PROFILE_MESSAGES.companyEntryDateRequired : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return PROFILE_MESSAGES.companyEntryDateInvalid;
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? PROFILE_MESSAGES.companyEntryDateInvalid
    : null;
}

export function profileCnpsError(value: unknown, required: boolean) {
  const raw = String(value ?? "").trim();
  if (!raw) return required ? PROFILE_MESSAGES.cnpsRequired : null;
  return raw.length > 50 ? PROFILE_MESSAGES.cnpsTooLong : null;
}

export function profileGenderError(value: unknown, required: boolean) {
  const raw = String(value ?? "").trim();
  if (!raw) return required ? PROFILE_MESSAGES.genderRequired : null;
  return isEmployeeGender(raw) ? null : PROFILE_MESSAGES.genderInvalid;
}

export function profileMaritalStatusError(value: unknown, required: boolean) {
  const raw = String(value ?? "").trim();
  if (!raw) return required ? PROFILE_MESSAGES.maritalStatusRequired : null;
  return isMaritalStatus(raw) ? null : PROFILE_MESSAGES.maritalStatusInvalid;
}

export function profileChildrenCountError(value: unknown, required: boolean) {
  if (value === "" || value === null || value === undefined) {
    return required ? PROFILE_MESSAGES.childrenCountRequired : null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0
    ? null
    : PROFILE_MESSAGES.childrenCountInvalid;
}

export function profilePasswordError(value: unknown) {
  const raw = String(value ?? "");
  if (!raw) return null;
  return raw.length >= 6 ? null : PROFILE_MESSAGES.passwordInvalid;
}

export function profilePhotoDataUrlError(value: unknown) {
  return isProfilePhotoDataUrlTooLarge(String(value ?? ""))
    ? PROFILE_PHOTO_TOO_LARGE_MESSAGE
    : null;
}

function addError(
  errors: ProfileValidationErrors,
  field: ProfileField,
  message: string | null
) {
  if (message) errors[field] = message;
}

export function validateOnboardingProfileInput(
  input: ProfileValidationInput
) {
  const errors: ProfileValidationErrors = {};
  const companyEntryDate = input.companyEntryDate ?? input.hireDate;

  addError(
    errors,
    "firstName",
    profileTextRequiredError(input.firstName, PROFILE_MESSAGES.firstNameRequired)
  );
  addError(
    errors,
    "lastName",
    profileTextRequiredError(input.lastName, PROFILE_MESSAGES.lastNameRequired)
  );
  addError(errors, "gender", profileGenderError(input.gender, true));
  addError(
    errors,
    "maritalStatus",
    profileMaritalStatusError(input.maritalStatus, true)
  );
  addError(
    errors,
    "childrenCount",
    profileChildrenCountError(input.childrenCount, true)
  );
  addError(errors, "phone", profilePhoneError(input.phone, true));
  addError(errors, "fullAddress", profileAddressError(input.fullAddress, true));
  addError(
    errors,
    "companyEntryDate",
    profileDateError(companyEntryDate, true)
  );
  addError(errors, "cnpsNumber", profileCnpsError(input.cnpsNumber, true));
  addError(
    errors,
    "profilePhotoUrl",
    profilePhotoDataUrlError(input.profilePhotoUrl)
  );

  return errors;
}

export function validateProfileUpdateInput(input: ProfileValidationInput) {
  const errors: ProfileValidationErrors = {};

  addError(
    errors,
    "firstName",
    profileTextRequiredError(input.firstName, PROFILE_MESSAGES.firstNameRequired)
  );
  addError(
    errors,
    "lastName",
    profileTextRequiredError(input.lastName, PROFILE_MESSAGES.lastNameRequired)
  );
  addError(errors, "phone", profilePhoneError(input.phone, false));
  addError(errors, "cnpsNumber", profileCnpsError(input.cnpsNumber, false));
  addError(errors, "gender", profileGenderError(input.gender, false));
  addError(
    errors,
    "maritalStatus",
    profileMaritalStatusError(input.maritalStatus, false)
  );
  addError(
    errors,
    "childrenCount",
    profileChildrenCountError(input.childrenCount, false)
  );
  addError(
    errors,
    "profilePhotoUrl",
    profilePhotoDataUrlError(input.profilePhotoUrl)
  );
  addError(errors, "password", profilePasswordError(input.password));

  return errors;
}

export function firstProfileValidationError(errors: ProfileValidationErrors) {
  const field = firstProfileValidationField(errors);
  return field ? (errors[field] as string) : null;
}

export function firstProfileValidationField(errors: ProfileValidationErrors) {
  for (const field of PROFILE_FIELD_ORDER) {
    if (errors[field]) return field;
  }
  return (Object.keys(errors)[0] as ProfileField | undefined) ?? null;
}

export function isProfileField(value: unknown): value is ProfileField {
  return typeof value === "string" && PROFILE_FIELD_ORDER.includes(value as ProfileField);
}
