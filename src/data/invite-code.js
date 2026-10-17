/* Общий формат кода-приглашения для клиента и серверных адаптеров. */
export const isInviteCode = (value) =>
  typeof value === 'string' && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value);
