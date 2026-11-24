import type { Metadata } from "next";
import { safeBack } from "@/lib/performance/objective-wizard";
import { ObjectiveWizard } from "./objective-wizard";

export const metadata: Metadata = {
  title: "New objective",
  description:
    "Write an objective one question at a time: the aim, the target, the period it counts in, then send it to be agreed.",
};

const one = (value: string | string[] | undefined): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/**
 * New objective, on its own page rather than in a dialog (owner request, 24
 * Nov 2026). `?parent=<id>` starts it under an objective; `?back=` is the
 * Objectives address to return to, and is ignored unless it is one.
 */
export default async function NewObjectivePage({
  searchParams,
}: {
  searchParams: Promise<{
    parent?: string | string[];
    back?: string | string[];
  }>;
}) {
  const { parent, back } = await searchParams;
  return <ObjectiveWizard parent={one(parent)} back={safeBack(one(back))} />;
}
