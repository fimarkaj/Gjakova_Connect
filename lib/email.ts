import "server-only";
import { Resend } from "resend";
import { STATUS_LABELS } from "@/lib/types";
import type { ReportStatus } from "@/lib/types";

const FROM_ADDRESS = "Gjakova Connect <onboarding@resend.dev>";

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
 * Sends (or, without RESEND_API_KEY, logs) a status-update email for a report.
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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[DEMO MODE — email not actually sent, missing RESEND_API_KEY] to=${to} subject="${subject}"\n${text}`
    );
    return { sent: false, demo: true };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      text,
    });
    if (error) {
      console.error("sendReportStatusEmail: Resend returned an error", error);
      return { sent: false, demo: false };
    }
    return { sent: true, demo: false };
  } catch (err) {
    console.error("sendReportStatusEmail: send failed", err);
    return { sent: false, demo: false };
  }
}
