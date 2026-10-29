import type { Metadata } from "next";
import { HolidaysImport } from "./holidays-import";

export const metadata: Metadata = {
  title: "Import public holidays",
  description:
    "Add a year of public holidays from one spreadsheet: download the template, fill in each date as DD/MM, pick the year, and check every row before anything is saved.",
};

/**
 * The year is read here, on the server, as `leave/page.tsx` reads its tab:
 * `useSearchParams` in the screen would put the page behind a Suspense boundary
 * for one number. `?year=` is the year the holiday calendar was showing.
 */
export default async function HolidaysImportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const { year } = await searchParams;
  const single = Number(Array.isArray(year) ? year[0] : year);
  const defaultYear =
    Number.isInteger(single) && single >= 2000 && single <= 2100
      ? single
      : new Date().getFullYear();
  return <HolidaysImport defaultYear={defaultYear} />;
}
