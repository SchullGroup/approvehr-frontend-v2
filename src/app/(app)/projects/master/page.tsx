import { Suspense } from "react";
import type { Metadata } from "next";
import { MASTER_DESCRIPTION } from "@/lib/projects/terms";
import { MasterScreen } from "./master-screen";

export const metadata: Metadata = {
  title: "Overview",
  description: MASTER_DESCRIPTION,
};

/* A client screen behind a permission: who may open it is decided in the screen,
   and nothing is asked of the API until it has. The boundary is for the tab kept
   in the address bar. */
export default function MasterPage() {
  return (
    <Suspense fallback={null}>
      <MasterScreen />
    </Suspense>
  );
}
