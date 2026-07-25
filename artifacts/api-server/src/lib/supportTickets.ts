import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, supportTickets } from "@workspace/db";

/** Human-readable ticket id: BX-YYYYMMDD-XXXX (phone/email friendly). */
export function formatTicketNumber(date = new Date(), suffix?: string): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const tail =
    suffix ||
    randomBytes(3)
      .toString("hex")
      .toUpperCase()
      .slice(0, 4);
  return `BX-${y}${m}${d}-${tail}`;
}

export async function allocateTicketNumber(maxAttempts = 8): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const ticketNumber = formatTicketNumber();
    const [existing] = await db
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(eq(supportTickets.ticketNumber, ticketNumber))
      .limit(1);
    if (!existing) return ticketNumber;
  }
  // Extremely unlikely collision fallback
  return formatTicketNumber(
    new Date(),
    randomBytes(4).toString("hex").toUpperCase().slice(0, 6),
  );
}

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "normal", "high"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_CHANNELS = ["phone", "email", "other", "app"] as const;
export type TicketChannel = (typeof TICKET_CHANNELS)[number];

export function isTicketStatus(value: string): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

export function isTicketPriority(value: string): value is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value);
}

export function isTicketChannel(value: string): value is TicketChannel {
  return (TICKET_CHANNELS as readonly string[]).includes(value);
}

export function statusLabel(status: string): string {
  switch (status) {
    case "open":
      return "Open";
    case "in_progress":
      return "In progress";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}
