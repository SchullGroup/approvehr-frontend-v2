import type { Metadata } from "next";
import { BelowScreen } from "./below-screen";

export const metadata: Metadata = {
  title: "Below the pass mark",
  description:
    "Applicants a person should look at, because of a score or an answer. Nobody is rejected until you confirm.",
};

/**
 * `/hiring/postings/[id]/below-pass-mark`
 *
 * A shell: who may open it and everything it shows is a client fact.
 */
export default async function BelowPassMarkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BelowScreen id={id} />;
}
