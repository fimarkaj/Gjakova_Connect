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
