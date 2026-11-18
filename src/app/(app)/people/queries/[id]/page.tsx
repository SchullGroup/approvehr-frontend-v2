import type { Metadata } from "next";
import { QueryScreen } from "./query-screen";

/**
 * A neutral tab title, on purpose: the notification that links here says only that a letter is
 * waiting, and a browser tab that said "Query" would say more than that to anybody looking over a
 * shoulder, or at a screen share, before the letter has been opened.
 */
export const metadata: Metadata = {
  title: "Letter",
  description: "One written letter, the reply to it, and the outcome.",
};

/**
 * Whether the record exists is the client's answer, as it is for a payslip: an id is a uuid nobody
 * can list at build time, so this renders on demand, and the API decides what each reader sees.
 */
export default async function QueryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QueryScreen id={id} />;
}
