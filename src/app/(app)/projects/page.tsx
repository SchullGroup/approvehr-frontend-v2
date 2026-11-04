import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectsScreen } from "./projects-screen";

export const metadata: Metadata = {
  title: "Projects",
  description: "Plan work as projects, with tasks, sprints and a board.",
};

/* A client screen: which projects there are depends on who is signed in and on
   the company's switch, and creating one changes the list under the person's
   hands. Only the metadata stays on the server.

   The `Suspense` boundary is required: the screen keeps its search and
   department in the address bar with `useSearchParams`, and a prerendered route
   calling that hook renders everything up to the nearest boundary on the client. */
export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsScreen />
    </Suspense>
  );
}
