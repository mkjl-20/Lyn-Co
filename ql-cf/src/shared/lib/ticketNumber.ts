export function formatTicketNumber(ticketNumber: number): string {
  return `Q-${String(ticketNumber).padStart(3, "0")}`;
}
