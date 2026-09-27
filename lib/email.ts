import "server-only";
import nodemailer from "nodemailer";
import { STATUS_LABELS } from "@/lib/types";
import type { ReportStatus } from "@/lib/types";

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

function buildStatusEmail(ticketCode: string, status: ReportStatus, trackingUrl: string, customMessage?: string) {
  const statusLabel = STATUS_LABELS[status].label;
  const subject = `Raportimi ${ticketCode} — statusi u përditësua në "${statusLabel}"`;
  const lines = [
    `Përshëndetje,`,
    ``,
    `Statusi i raportimit tënd ${ticketCode} tani është: ${statusLabel}.`,
  ];
  if (customMessage) {
    lines.push(``, customMessage);
  }
  lines.push(``, `Ndiq raportimin këtu: ${trackingUrl}`, ``, `Komuna e Gjakovës`);
  return { subject, text: lines.join("\n") };
}

/**
 * Sends (or, without GMAIL_USER/GMAIL_APP_PASSWORD, logs) a status-update email for a report.
 * Never throws — a failed/unconfigured send should not break the caller's
 * status-change or admin-notify flow, so errors are caught and logged.
 */
export async function sendReportStatusEmail(params: {
  to: string;
  ticketCode: string;
  status: ReportStatus;
  trackingUrl: string;
  customMessage?: string;
}): Promise<{ sent: boolean; demo: boolean }> {
  const { to, ticketCode, status, trackingUrl, customMessage } = params;
  const { subject, text } = buildStatusEmail(ticketCode, status, trackingUrl, customMessage);

  const transporter = getTransporter();
  if (!transporter) {
    console.log(
      `[DEMO MODE — email not actually sent, missing GMAIL_USER/GMAIL_APP_PASSWORD] to=${to} subject="${subject}"\n${text}`
    );
    return { sent: false, demo: true };
  }

  try {
    await transporter.sendMail({
      from: `Gjakova Connect <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
    });
    return { sent: true, demo: false };
  } catch (err) {
    console.error("sendReportStatusEmail: send failed", err);
    return { sent: false, demo: false };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type DepartmentEmailParams = {
  departmentName: string;
  ticketCode: string;
  categoryLabel: string;
  area: string | null;
  description: string;
  mapsUrl: string | null;
  photoUrl: string | null;
};

/**
 * The fixed template. Extracted so the work-order generator's fallback path
 * (/api/admin/reports/[id]/send-department/generate) can hand the clerk exactly
 * the text that would otherwise have been sent, rather than re-deriving it.
 */
export function buildDepartmentEmail(params: DepartmentEmailParams): { subject: string; body: string } {
  const { departmentName, ticketCode, categoryLabel, area, description, mapsUrl } = params;

  const subject = `[Gjakova Connect] ${ticketCode} — ${categoryLabel} — ${area || "Pa zonë"}`;

  const lines = [
    `Raportim i ri për ${departmentName}.`,
    ``,
    `Kodi: ${ticketCode}`,
    `Kategoria: ${categoryLabel}`,
    `Zona: ${area || "Pa zonë"}`,
    ``,
    `Përshkrimi:`,
    description,
  ];
  if (mapsUrl) lines.push(``, `Vendndodhja: ${mapsUrl}`);

  return { subject, body: lines.join("\n") };
}

/**
 * Sends a formatted copy of a report to a department's contact email, with
 * the photo shown inline and (if provided) attached as a file. Unlike
 * sendReportStatusEmail, this throws on failure — the caller (the manual
 * "Send to Department" route) needs to distinguish success from failure to
 * decide whether to write the report_department_sends audit row and what
 * error to surface to the clerk who clicked the button.
 */
export async function sendDepartmentReportEmail(
  params: DepartmentEmailParams & {
    to: string;
    photoAttachment: { filename: string; content: Buffer; contentType: string } | null;
    // The clerk-approved work order, as edited in the /admin preview. When
    // absent the fixed template is rendered instead.
    subject?: string;
    body?: string;
  }
): Promise<{ sent: boolean; demo: boolean }> {
  const { to, mapsUrl, photoUrl, photoAttachment } = params;

  const template = buildDepartmentEmail(params);
  const subject = params.subject?.trim() || template.subject;
  const text = params.body?.trim() || template.body;

  // The body is plain text either way — the work-order prompt forbids markdown
  // — so the HTML part is the same text escaped, with the photo and map link
  // appended as before.
  const htmlParts = [
    `<p style="white-space:pre-wrap;">${escapeHtml(text)}</p>`,
  ];
  if (mapsUrl && !text.includes(mapsUrl)) {
    htmlParts.push(`<p><a href="${mapsUrl}">Shiko vendndodhjen në hartë</a></p>`);
  }
  if (photoUrl) {
    htmlParts.push(`<p><img src="${photoUrl}" alt="Foto e raportimit" style="max-width:480px;border-radius:8px;" /></p>`);
  }
  const html = htmlParts.join("\n");

  const transporter = getTransporter();
  if (!transporter) {
    console.log(
      `[DEMO MODE — email not actually sent, missing GMAIL_USER/GMAIL_APP_PASSWORD] to=${to} subject="${subject}"\n${text}`
    );
    return { sent: false, demo: true };
  }

  await transporter.sendMail({
    from: `Gjakova Connect <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    html,
    attachments: photoAttachment ? [photoAttachment] : undefined,
  });
  return { sent: true, demo: false };
}

/**
 * Sends the clerk-approved clarification email to the citizen who filed a
 * quality-flagged report. Like sendDepartmentReportEmail, and unlike
 * sendReportStatusEmail, this throws on failure: the caller must know whether
 * the mail actually left before it stamps clarification_sent_at on the report.
 *
 * Plain text only — the clarification prompt forbids markdown, and nothing is
 * appended to what the clerk read in the preview.
 */
export async function sendClarificationEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ sent: boolean; demo: boolean }> {
  const { to, subject, body } = params;

  const transporter = getTransporter();
  if (!transporter) {
    console.log(
      `[DEMO MODE — email not actually sent, missing GMAIL_USER/GMAIL_APP_PASSWORD] to=${to} subject="${subject}"\n${body}`
    );
    return { sent: false, demo: true };
  }

  await transporter.sendMail({
    from: `Gjakova Connect <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text: body,
    html: `<p style="white-space:pre-wrap;">${escapeHtml(body)}</p>`,
  });
  return { sent: true, demo: false };
}
