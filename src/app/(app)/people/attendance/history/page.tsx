import type { Metadata } from "next";
import { HistoryScreen } from "./history-screen";
import { asIsoDay } from "./day";

export const metadata: Metadata = {
  title: "Attendance history",
  description:
    "A month at a glance, and for any day: who was in, who was late, who was on approved leave and who was not accounted for.",
};

/**
 * `?date=YYYY-MM-DD` opens the calendar on that day, so a notice about one
 * particular day can link straight to it. Read here and handed down, not
 * through `useSearchParams`, which would pull the whole screen behind a
 * Suspense boundary for one string.
 */
export default async function AttendanceHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { date } = await searchParams;
  const single = Array.isArray(date) ? date[0] : date;
  return <HistoryScreen initialDate={asIsoDay(single)} />;
}
