"use client";

import { Check, CircleDashed, TriangleAlert } from "lucide-react";
import type { BadgeTone } from "@/components/ui";
import type { RowStatus } from "./checklist";

/**
 * The words for where a setup step stands, shared by the Settings page and the
 * dashboard's setup card so the two cannot describe one step differently. Shown
 * as plain gray text.
 */

export const STATUS: Record<
  RowStatus,
  { label: string; tone: BadgeTone; icon: React.ReactNode }
> = {
  done: {
    label: "Done",
    tone: "success",
    icon: <Check aria-hidden="true" className="size-4" />,
  },
  attention: {
    label: "Needs attention",
    tone: "warning",
    icon: <TriangleAlert aria-hidden="true" className="size-4" />,
  },
  todo: {
    label: "Not set up",
    tone: "danger",
    icon: <CircleDashed aria-hidden="true" className="size-4" />,
  },
  optional: {
    label: "Your choice",
    tone: "neutral",
    icon: <CircleDashed aria-hidden="true" className="size-4" />,
  },
  unknown: {
    label: "Not known offline",
    tone: "neutral",
    icon: <CircleDashed aria-hidden="true" className="size-4" />,
  },
};
