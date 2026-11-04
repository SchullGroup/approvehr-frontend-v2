"use client";

import { useSearchParams } from "next/navigation";
import { Clock } from "lucide-react";
import { EmptyState } from "@/components/ui";
import {
  PROGRAM,
  PROGRAM_TAB_LABEL,
  type ProgramViewId,
} from "@/lib/projects/terms";

/**
 * A tab that is registered and not built yet: Board, Tasks, Workload and
 * Timeline across a program's projects. It says what is coming rather than
 * showing an empty page that looks broken; the registry entry in
 * `program-views.tsx` is all that changes when the real view arrives.
 */
export function ComingView() {
  const params = useSearchParams();
  const id = (params.get("view") ?? "") as ProgramViewId;
  const label = PROGRAM_TAB_LABEL[id] ?? "This view";
  return (
    <EmptyState
      icon={<Clock />}
      title={`${label} is coming in the next step`}
      description={`It will show this ${PROGRAM.one}'s projects together. The Overview and each project's own ${PROGRAM_TAB_LABEL.board.toLowerCase()} work in the meantime.`}
    />
  );
}
