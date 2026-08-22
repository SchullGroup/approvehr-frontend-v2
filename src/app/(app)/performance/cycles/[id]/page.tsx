import type { Metadata } from "next";
import { CycleScreen } from "./cycle-screen";

export const metadata: Metadata = {
  title: "Review cycle",
  description:
    "Run a cycle: who is outstanding, who has nobody appraising them, and where every mark stands.",
};

/**
 * One cycle, from the point of view of whoever is running it.
 *
 * No `generateStaticParams`: a cycle id is a uuid connected and a demo constant
 * offline, so this renders on demand and the client decides whether the cycle
 * exists — only the client knows which source it is reading.
 */
export default async function CyclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CycleScreen cycleId={id} />;
}
