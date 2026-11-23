/**
 * The standard periods a company appraises, as dates.
 *
 * Most companies appraise a quarter, a half or a year, so the wizard offers
 * those by name and fills the dates in. Calendar quarters; a company on another
 * year uses custom dates.
 */

export type PresetId = "Q1" | "Q2" | "Q3" | "Q4" | "H1" | "H2" | "FY";

export const PRESETS: readonly { id: PresetId; label: string }[] = [
  { id: "Q1", label: "Q1" },
  { id: "Q2", label: "Q2" },
  { id: "Q3", label: "Q3" },
  { id: "Q4", label: "Q4" },
  { id: "H1", label: "H1" },
  { id: "H2", label: "H2" },
  { id: "FY", label: "Full year" },
];

const SPANS: Record<
  PresetId,
  [month: number, day: number, month2: number, day2: number]
> = {
  Q1: [1, 1, 3, 31],
  Q2: [4, 1, 6, 30],
  Q3: [7, 1, 9, 30],
  Q4: [10, 1, 12, 31],
  H1: [1, 1, 6, 30],
  H2: [7, 1, 12, 31],
  FY: [1, 1, 12, 31],
};

const two = (n: number) => String(n).padStart(2, "0");

/** `start` and `end` as `YYYY-MM-DD`. */
export function presetDates(
  id: PresetId,
  year: number,
): { start: string; end: string } {
  const [m1, d1, m2, d2] = SPANS[id];
  return {
    start: `${String(year)}-${two(m1)}-${two(d1)}`,
    end: `${String(year)}-${two(m2)}-${two(d2)}`,
  };
}

/** "Q4 2026 appraisal", "2026 appraisal". */
export function presetName(id: PresetId, year: number): string {
  return id === "FY"
    ? `${String(year)} appraisal`
    : `${id} ${String(year)} appraisal`;
}

/**
 * When reviews are due unless somebody says otherwise: 14 days after the period
 * ends, or 14 days from `today` when it has already ended.
 */
export function defaultDueDate(periodEnd: string, today: string): string {
  const base = periodEnd >= today ? periodEnd : today;
  const date = new Date(`${base}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 14);
  return date.toISOString().slice(0, 10);
}
