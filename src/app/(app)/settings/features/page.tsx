import type { Metadata } from "next";
import { tabFromQuery } from "@/lib/url-tab";
import { FeaturesScreen } from "./features-screen";
import { FEATURE_TABS } from "./tabs";

export const metadata: Metadata = {
  title: "Turn on more features",
  description: "Every capability in the product, one line each, with a switch.",
};

export default async function FeaturesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  return (
    <FeaturesScreen initialTab={tabFromQuery(tab, FEATURE_TABS, "modules")} />
  );
}
