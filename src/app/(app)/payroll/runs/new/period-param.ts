/**
 * The month a `?period=` link names, as `YYYY-MM` (U28).
 *
 * The API's approval email and notification link with the first day of the
 * month (`2026-11-01`), and the wizard read only `2026-11`, so the link opened
 * an empty Approve step for a "period" of `2026-11-01`. A month, a date or a
 * timestamp all read as their month; anything else is no period.
 */
export function periodFromParam(value: string | null): string | null {
  const match = value
    ? /^(\d{4})-(\d{2})(?:-\d{2}.*)?$/.exec(value.trim())
    : null;
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : null;
}
