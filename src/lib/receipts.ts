import type { NotifStatus } from "./supabase";

// WhatsApp-style receipt levels: one tick = sent, two grey = delivered, two blue = seen.
export type Receipt = "sent" | "delivered" | "seen";

const RANK: Record<Receipt, number> = { sent: 0, delivered: 1, seen: 2 };

export function receiptOf(status: NotifStatus): Receipt {
  if (status === "acknowledged") return "seen";
  return status === "delivered" ? "delivered" : "sent";
}

// A message sent to several people is only as "read" as its least-progressed recipient.
export function aggregateReceipt(statuses: NotifStatus[]): Receipt | undefined {
  if (!statuses.length) return undefined;
  return statuses.map(receiptOf).reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));
}

export const receiptLabel: Record<Receipt, string> = {
  sent: "Sent",
  delivered: "Delivered",
  seen: "Seen",
};

export function replyLabel(status: NotifStatus): string | null {
  return status === "acknowledged" ? "Acknowledged" : null;
}
