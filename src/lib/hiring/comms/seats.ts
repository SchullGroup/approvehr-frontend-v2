/**
 * A seat on a panel, for staff and for invited accounts alike.
 *
 * A company that has recruitment without Core HR has no employees to put on a panel,
 * so its panelists are **accounts**: people invited to one job by email who have a
 * sign-in and nothing else. A company with both can seat either. A seat is one or the
 * other, never both, and this is the one string that tells them apart, so a picker, a
 * list and a request all agree on who is who.
 *
 * No React, no state.
 */

export type Seat = {
  employeeId: string | null;
  userId?: string | null | undefined;
};

/** `e:<employee id>` for staff, `u:<account id>` for an invited account. */
export const seatKey = (seat: Seat): string =>
  seat.employeeId ? `e:${seat.employeeId}` : `u:${seat.userId ?? ""}`;

export const employeeSeat = (employeeId: string): string => `e:${employeeId}`;
export const accountSeat = (userId: string): string => `u:${userId}`;

/** What a request sends: the staff, and the accounts, each as its own list. */
export type PanelSeats = { employeeIds: string[]; userIds: string[] };

export function splitSeats(keys: readonly string[]): PanelSeats {
  const seats: PanelSeats = { employeeIds: [], userIds: [] };
  for (const key of new Set(keys)) {
    if (key.startsWith("e:")) seats.employeeIds.push(key.slice(2));
    else if (key.startsWith("u:")) seats.userIds.push(key.slice(2));
  }
  return seats;
}
