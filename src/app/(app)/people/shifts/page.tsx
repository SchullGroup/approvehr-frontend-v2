import type { Metadata } from "next";
import { ShiftsScreen } from "./shifts-screen";
import { isShiftTab } from "./tabs";

export const metadata: Metadata = {
  title: "Shifts",
  description:
    "Who works when: nights, earlies and weekend cover, and the cover requests waiting on an answer.",
};

/**
 * The tab is read here, on the server, and handed down as a prop.
 *
 * `useSearchParams` in the screen would force the whole page into a Suspense
 * boundary and a client-side read for one string. `isShiftTab` comes from
 * `./tabs` rather than from the screen, because the screen is a client module —
 * see the note in that file.
 */
export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const single = Array.isArray(tab) ? tab[0] : tab;
  return <ShiftsScreen initialTab={isShiftTab(single) ? single : "rota"} />;
}
