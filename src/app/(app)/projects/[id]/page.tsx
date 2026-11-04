import type { Metadata } from "next";
import { PROJECT_DESCRIPTION } from "@/lib/projects/terms";
import { ProjectScreen } from "./project-screen";

export const metadata: Metadata = {
  title: "Project",
  description: PROJECT_DESCRIPTION,
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectScreen id={id} />;
}
