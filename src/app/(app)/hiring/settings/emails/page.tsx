import type { Metadata } from "next";
import { tabFromQuery } from "@/lib/url-tab";
import { EmailsScreen } from "./emails-screen";
import { EMAIL_TABS } from "./tabs";

export const metadata: Metadata = {
  title: "Candidate emails",
  description:
    "The wording of emails sent to candidates, and who they come from.",
};

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  return (
    <EmailsScreen initialTab={tabFromQuery(tab, EMAIL_TABS, "candidates")} />
  );
}
