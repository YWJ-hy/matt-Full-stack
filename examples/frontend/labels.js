export function ticketStatus(ticket) {
  return ticket.owner ? `处理中 · ${ticket.owner}` : '待领取';
}
