import type { Metadata } from "next";
import { ProjectsScreen } from "./projects-screen";

export const metadata: Metadata = {
  title: "Projects",
  description: "Plan work as projects, with issues, sprints and a board.",
};

/* A client screen: which projects there are depends on who is signed in and on
   the company's switch, and creating one changes the list under the person's
   hands. Only the metadata stays on the server. */
export default function ProjectsPage() {
  return <ProjectsScreen />;
}
