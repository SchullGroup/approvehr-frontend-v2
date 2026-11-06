import { Suspense } from "react";
import type { Metadata } from "next";
import { PROGRAM } from "@/lib/projects/terms";
import { ProgramScreen } from "./program-screen";

export const metadata: Metadata = {
  title: "Program",
  description: `A ${PROGRAM.one}'s projects, board, tasks, workload and people.`,
};

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  /* `useSearchParams` (the tab) needs a boundary on a prerendered route. */
  return (
    <Suspense fallback={null}>
      <ProgramScreen id={id} />
    </Suspense>
  );
}
