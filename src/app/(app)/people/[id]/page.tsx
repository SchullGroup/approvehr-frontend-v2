import type { Metadata } from "next";
import { EMPLOYEES, employeeById } from "@/lib/mock/people";
import { fullName } from "@/lib/types";
import { EmployeeRecordPage } from "./record-page";

/* Seed records are prerendered. Anyone created in the browser resolves at
   request time instead — hence no `dynamicParams = false` here. */
export function generateStaticParams() {
  return EMPLOYEES.map((e) => ({ id: e.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const employee = employeeById(id);
  return { title: employee ? fullName(employee) : "Employee" };
}

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EmployeeRecordPage id={id} />;
}
