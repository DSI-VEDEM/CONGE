import pino from "pino";

/**
 * Logger applicatif structuré.
 * En prod : JSON minimal (compatible Cloud Logging / Datadog / ELK).
 * En dev : sortie lisible humaine via pino-pretty si installé.
 */
const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  base: {
    service: "conge",
    env: process.env.NODE_ENV ?? "development",
  },
  // Redacte automatiquement les champs sensibles si jamais on tente de les logger
  redact: {
    paths: [
      "password",
      "newPassword",
      "currentPassword",
      "token",
      "authorization",
      "*.password",
      "*.token",
      "headers.authorization",
      "headers.cookie",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l" },
        },
      }),
});

/// Helper pratique pour scoper le logger à un module.
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
