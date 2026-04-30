import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

type SendEmailOptions = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

let transporterPromise: Promise<nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null> | null = null;
let missingConfigLogged = false;

function env(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseBoolean(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function getFromAddress() {
  return env("SMTP_FROM") ?? env("MAIL_FROM");
}

function isEmailEnabled() {
  const explicit = parseBoolean(env("EMAIL_NOTIFICATIONS_ENABLED"));
  if (explicit === false) return false;
  return Boolean(env("SMTP_HOST") && getFromAddress());
}

async function getTransporter() {
  if (!isEmailEnabled()) {
    if (!missingConfigLogged && process.env.NODE_ENV !== "test") {
      console.info(
        "Notifications email désactivées: configurez SMTP_HOST et SMTP_FROM pour activer l'envoi."
      );
      missingConfigLogged = true;
    }
    return null;
  }

  if (!transporterPromise) {
    transporterPromise = Promise.resolve().then(() => {
      const port = Number(env("SMTP_PORT") ?? 587);
      const secure = parseBoolean(env("SMTP_SECURE")) ?? port === 465;
      const user = env("SMTP_USER");
      const pass = env("SMTP_PASS");

      return nodemailer.createTransport({
        host: env("SMTP_HOST"),
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
      });
    });
  }

  return transporterPromise;
}

export async function sendEmail(options: SendEmailOptions) {
  const transporter = await getTransporter();
  if (!transporter) return;

  await transporter.sendMail({
    from: getFromAddress(),
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}
