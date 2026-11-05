import type { Metadata } from "next";
import { ProjectScreen } from "./project-screen";

export const metadata: Metadata = {
  title: "Project",
  description: "A project's board, issues, sprints and settings.",
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectScreen id={id} />;
}
