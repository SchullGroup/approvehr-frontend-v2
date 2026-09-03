import type { Metadata } from "next";
import { PaySetupScreen } from "./pay-setup-screen";
import { isPaySetupTab } from "./tabs";

export const metadata: Metadata = {
  title: "Pay setup",
  description:
    "Allowances, deductions and salary grades in one place, with what each one does to tax, pension and take-home pay.",
};

/**
 * The tab is read here, on the server, and handed down as a prop.
 *
 * `useSearchParams` in the screen would force the whole page into a Suspense
 * boundary and a client-side read for one string. A prop is simpler and cannot
 * be forgotten — the same call the reset-password page makes, for the same
 * reason.
 *
 * `isPaySetupTab` comes from `./tabs`, not from the screen: the screen is a
 * client module, and calling a function exported from one inside a server
 * component throws at request time while passing `tsc` and `lint` cleanly.
 */
export default async function PaySetupPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const single = Array.isArray(tab) ? tab[0] : tab;
  return (
    <PaySetupScreen initialTab={isPaySetupTab(single) ? single : "allowances"} />
  );
}
