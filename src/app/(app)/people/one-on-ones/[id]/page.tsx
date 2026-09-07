import type { Metadata } from "next";
import { OneOnOneScreen } from "./one-on-one-screen";

export const metadata: Metadata = {
  title: "One-to-one",
  description:
    "One standing one-to-one: the meetings, the shared notes and what each of you agreed to do.",
};

/**
 * No `generateStaticParams`. A series id is a uuid and there is no demo
 * version — see `lib/store/one-on-ones.ts` for why this module has no offline
 * mode at all — so this renders on demand and the API decides both what exists
 * and who may read it.
 */
export default async function OneOnOnePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OneOnOneScreen seriesId={id} />;
}
