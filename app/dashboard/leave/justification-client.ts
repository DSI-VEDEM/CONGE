export const LEAVE_JUSTIFICATION_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
export const LEAVE_JUSTIFICATION_MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(LEAVE_JUSTIFICATION_ACCEPT.split(","));

export function validateLeaveJustificationFile(file: File) {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return "Justificatif invalide : PDF, JPG, PNG ou WebP requis.";
  }
  if (file.size > LEAVE_JUSTIFICATION_MAX_BYTES) {
    return "Justificatif trop volumineux : maximum 8 Mo.";
  }
  return null;
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });
}
