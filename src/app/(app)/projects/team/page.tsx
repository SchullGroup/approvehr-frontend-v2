import type { Metadata } from "next";
import { TeamTasksScreen } from "./team-tasks-screen";

export const metadata: Metadata = {
  title: "Team tasks",
  description:
    "What the people you lead have on, across projects and their own lists.",
};

/* A client screen: whose tasks these are depends on who is signed in. */
export default function TeamTasksPage() {
  return <TeamTasksScreen />;
}
