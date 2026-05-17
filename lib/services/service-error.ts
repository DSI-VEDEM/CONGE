/**
 * Erreur métier typée renvoyée par la couche services/.
 * Les `route.ts` la traduisent en réponse HTTP via `serviceErrorToResponse`.
 */
export class ServiceError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly extra?: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, extra?: Record<string, unknown>) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

import { jsonError, jsonServerError } from "@/lib/auth";

/// Convertit une erreur (ServiceError ou autre) en NextResponse.
export function serviceErrorToResponse(err: unknown) {
  if (err instanceof ServiceError) {
    return jsonError(err.message, err.status, { code: err.code, ...err.extra });
  }
  return jsonServerError(err);
}
