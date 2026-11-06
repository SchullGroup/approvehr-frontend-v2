import { Suspense } from "react";
import type { Metadata } from "next";
import { PROGRAM } from "@/lib/projects/terms";
import { ProgramsScreen } from "./programs-screen";

export const metadata: Metadata = {
  title: "Programs",
  description: `The ${PROGRAM.many} you can see, each with its projects and people.`,
};

/* A client screen: which programs there are depends on who is signed in and on
   the company's switch. The `Suspense` boundary is for the search kept in the
   address bar with `useSearchParams`. */
export default function ProgramsPage() {
  return (
    <Suspense fallback={null}>
      <ProgramsScreen />
    </Suspense>
  );
}
