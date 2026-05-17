export const PROFILE_PHOTO_MAX_LABEL = "2 Mo";
export const MAX_PROFILE_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_PROFILE_PHOTO_DATA_URL_LENGTH = Math.ceil((MAX_PROFILE_PHOTO_SIZE_BYTES * 4) / 3) + 128;

export const PROFILE_PHOTO_TOO_LARGE_MESSAGE = `Photo trop volumineuse (max ${PROFILE_PHOTO_MAX_LABEL}).`;
export const PROFILE_PHOTO_INVALID_MESSAGE = "Photo invalide (upload image requis).";

type ProfilePhotoFile = {
  size: number;
  type: string;
};

export function profilePhotoFileError(file: ProfilePhotoFile | null | undefined) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) return "Le fichier doit être une image.";
  if (file.size > MAX_PROFILE_PHOTO_SIZE_BYTES) {
    return PROFILE_PHOTO_TOO_LARGE_MESSAGE;
  }
  return null;
}

export function isProfilePhotoDataUrl(value: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(value);
}

export function isProfilePhotoDataUrlTooLarge(value: string | null | undefined) {
  const raw = String(value ?? "");
  return raw.startsWith("data:image/") && raw.length > MAX_PROFILE_PHOTO_DATA_URL_LENGTH;
}

export function profilePhotoSaveErrorMessage(status: number, serverError: unknown, fallback: string) {
  if (typeof serverError === "string" && serverError.trim()) {
    return serverError.trim();
  }
  if (status === 413) return PROFILE_PHOTO_TOO_LARGE_MESSAGE;
  if (status === 401) return "Session expirée. Veuillez vous reconnecter.";
  if (status >= 500) {
    return "Erreur serveur lors de l'enregistrement du profil. Réessayez dans un instant.";
  }
  return fallback;
}
