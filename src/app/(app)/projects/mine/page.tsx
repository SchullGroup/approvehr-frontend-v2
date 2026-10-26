import type { Metadata } from "next";
import { MyTasksScreen } from "./my-tasks-screen";

export const metadata: Metadata = {
  title: "My tasks",
  description: "Your own list of things to do, apart from any project board.",
};

/* A client screen: the list is the signed-in person's own. */
export default function MyTasksPage() {
  return <MyTasksScreen />;
}
