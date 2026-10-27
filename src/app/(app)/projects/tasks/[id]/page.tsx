import type { Metadata } from "next";
import { TaskScreen } from "./task-screen";

export const metadata: Metadata = {
  title: "Task",
  description: "One task, opened by its id.",
};

/* A client screen: what opens depends on who is reading. */
export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TaskScreen id={id} />;
}
