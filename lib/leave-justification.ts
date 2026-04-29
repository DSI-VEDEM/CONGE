import { norm } from "@/lib/validators";

export const LEAVE_JUSTIFICATION_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const LEAVE_JUSTIFICATION_ACCEPT = LEAVE_JUSTIFICATION_ALLOWED_MIME_TYPES.join(",");
export const LEAVE_JUSTIFICATION_MAX_BYTES = 8 * 1024 * 1024;
export const LEAVE_JUSTIFICATION_MAX_DATA_URL_LENGTH = 12 * 1024 * 1024;
const DATA_URL_RE = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,[A-Za-z0-9+/=]+$/;

const ALLOWED_MIME_TYPES = new Set<string>(LEAVE_JUSTIFICATION_ALLOWED_MIME_TYPES);

export function parseLeaveJustificationInput(input: {
  fileName?: unknown;
  fileDataUrl?: unknown;
}) {
  const fileName = norm(input.fileName);
  const fileDataUrl = norm(input.fileDataUrl);

  if (!fileName && !fileDataUrl) {
    return { ok: true as const, value: null };
  }

  if (!fileName || !fileDataUrl) {
    return { ok: false as const, error: "Nom du fichier et justificatif requis ensemble" };
  }

  if (fileDataUrl.length > LEAVE_JUSTIFICATION_MAX_DATA_URL_LENGTH) {
    return { ok: false as const, error: "Justificatif trop volumineux" };
  }

  const match = fileDataUrl.match(DATA_URL_RE);
  const mimeType = match?.[1]?.toLowerCase();
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return { ok: false as const, error: "Justificatif invalide (PDF ou image requis)" };
  }

  return {
    ok: true as const,
    value: {
      fileName,
      mimeType,
      fileDataUrl,
    },
  };
}

export function decodeLeaveJustificationDataUrl(fileDataUrl: string) {
  const match = norm(fileDataUrl).match(DATA_URL_RE);
  const mimeType = match?.[1]?.toLowerCase();
  const payload = match?.[0]?.split(",", 2)[1];
  if (!mimeType || !payload || !ALLOWED_MIME_TYPES.has(mimeType)) return null;
  return {
    mimeType,
    bytes: Buffer.from(payload, "base64"),
  };
}
