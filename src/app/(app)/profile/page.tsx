import type { Metadata } from "next";
import { ProfileScreen } from "./profile-screen";
import { isProfileTab } from "./tabs";

export const metadata: Metadata = {
  title: "My profile",
  description: "Your details, your pay, your time off.",
};

/**
 * The tab is read here, on the server, and handed down as a prop.
 *
 * Same call `payroll/pay-setup/page.tsx` makes, for the same two reasons:
 * `useSearchParams` in the screen would force the whole page into a Suspense
 * boundary for one string, and a prop cannot be forgotten. It also means
 * something else can link straight at the tab that answers it —
 * `/profile?tab=pay` when somebody's bank account is what payroll is waiting on.
 *
 * `isProfileTab` comes from `./tabs`, not from the screen: the screen is a
 * client module, and calling a function exported from one inside a server
 * component throws at request time while passing `tsc` and `lint` cleanly.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const single = Array.isArray(tab) ? tab[0] : tab;
  return <ProfileScreen initialTab={isProfileTab(single) ? single : "details"} />;
}
