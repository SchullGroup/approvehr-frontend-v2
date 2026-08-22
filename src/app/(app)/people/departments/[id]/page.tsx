import type { Metadata } from "next";

import { DepartmentDetailScreen } from "./detail-screen";

export const metadata: Metadata = {
  title: "Department",
  description:
    "Everyone in one department or sub-department, what it costs a month, and the units inside it.",
};

export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DepartmentDetailScreen id={id} />;
}
