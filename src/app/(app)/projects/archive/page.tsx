import { Suspense } from "react";
import type { Metadata } from "next";
import { ArchiveScreen } from "./archive-screen";

export const metadata: Metadata = {
  title: "Archive",
  description:
    "Archived programs and projects, their tasks, and tasks finished more than 14 days ago.",
};

/* A client screen: what is archived, and what the person may open of it, depends
   on who is signed in. The boundary is for the tab and filters kept in the address. */
export default function ArchivePage() {
  return (
    <Suspense fallback={null}>
      <ArchiveScreen />
    </Suspense>
  );
}
