import type { PrismaClient } from "@/generated/prisma/client";
import { sendEmail } from "@/lib/email";

type NotificationEmailRecord = {
  id?: string;
  title: string;
  body: string;
  employeeId?: string | null;
  metadata?: unknown;
};

type Recipient = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

type EmployeeReader = Pick<PrismaClient, "employee">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRecipientName(recipient: Recipient) {
  return [recipient.firstName, recipient.lastName].filter(Boolean).join(" ").trim() || recipient.email;
}

function getActionUrl(metadata: unknown) {
  if (!isRecord(metadata)) return null;
  const actionPath = metadata.actionPath;
  if (typeof actionPath !== "string" || !actionPath.trim()) return null;

  const baseUrl = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!baseUrl) return actionPath;

  try {
    return new URL(actionPath, baseUrl).toString();
  } catch {
    return actionPath;
  }
}

function buildTextEmail(notification: NotificationEmailRecord, recipient: Recipient) {
  const actionUrl = getActionUrl(notification.metadata);
  const lines = [
    `Bonjour ${getRecipientName(recipient)},`,
    "",
    notification.title,
    "",
    notification.body,
  ];

  if (actionUrl) {
    lines.push("", `Ouvrir dans l'application : ${actionUrl}`);
  }

  lines.push("", "Cet email reprend une notification envoyée dans l'application CONGES.");
  return lines.join("\n");
}

function buildHtmlEmail(notification: NotificationEmailRecord, recipient: Recipient) {
  const actionUrl = getActionUrl(notification.metadata);
  const body = escapeHtml(notification.body).replaceAll("\n", "<br>");
  const actionHtml = actionUrl
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(
        actionUrl
      )}" style="display:inline-block;background:#8f6b2a;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;">Ouvrir dans l'application</a></p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f3ed;font-family:Arial,sans-serif;color:#1f2933;">
    <div style="max-width:620px;margin:0 auto;padding:28px 16px;">
      <div style="background:#ffffff;border:1px solid #e6dcc8;border-radius:8px;padding:24px;">
        <p style="margin:0 0 16px;">Bonjour ${escapeHtml(getRecipientName(recipient))},</p>
        <h1 style="font-size:20px;line-height:1.3;margin:0 0 14px;color:#2d2417;">${escapeHtml(notification.title)}</h1>
        <p style="font-size:15px;line-height:1.6;margin:0;">${body}</p>
        ${actionHtml}
      </div>
      <p style="font-size:12px;line-height:1.5;color:#776b5b;margin:14px 4px 0;">
        Cet email reprend une notification envoyée dans l'application CONGES.
      </p>
    </div>
  </body>
</html>`;
}

function normalizeNotificationRecord(value: unknown): NotificationEmailRecord | null {
  if (!isRecord(value)) return null;
  const title = asString(value.title);
  const body = asString(value.body);
  if (!title || !body) return null;

  return {
    id: asString(value.id) || undefined,
    title,
    body,
    employeeId: asString(value.employeeId) || null,
    metadata: value.metadata,
  };
}

export function notificationEmailRecordsFromCreateManyData(data: unknown) {
  const items = Array.isArray(data) ? data : [data];
  return items
    .map((item) => normalizeNotificationRecord(item))
    .filter((item): item is NotificationEmailRecord => Boolean(item));
}

export async function sendNotificationEmails(
  prisma: EmployeeReader,
  records: NotificationEmailRecord[]
) {
  const notificationRecords = records.filter((record) => record.employeeId);
  if (notificationRecords.length === 0) return;

  const employeeIds = Array.from(new Set(notificationRecords.map((record) => record.employeeId).filter(Boolean)));
  const recipients = await prisma.employee.findMany({
    where: { id: { in: employeeIds as string[] } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));

  await Promise.all(
    notificationRecords.map(async (notification) => {
      if (!notification.employeeId) return;
      const recipient = recipientById.get(notification.employeeId);
      if (!recipient?.email) return;

      await sendEmail({
        to: recipient.email,
        subject: `[CONGES] ${notification.title}`,
        text: buildTextEmail(notification, recipient),
        html: buildHtmlEmail(notification, recipient),
      });
    })
  );
}

export function sendNotificationEmailsInBackground(
  prisma: EmployeeReader,
  records: NotificationEmailRecord[]
) {
  if (records.length === 0) return;

  void sendNotificationEmails(prisma, records).catch((error) => {
    console.warn("Impossible d'envoyer une notification par email.", error);
  });
}
