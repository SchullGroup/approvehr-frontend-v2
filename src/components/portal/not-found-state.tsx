"use client";

import { Compass } from "lucide-react";
import { Button, ButtonLink, EmptyState } from "@/components/ui";
import { useRouter } from "next/navigation";

/**
 * The one calm answer to "that is not here" inside the signed-in product.
 *
 * ## Why there is one
 *
 * The audit counted four. A calm card ("This endpoint is not here"), a red "did
 * not load" error on one-to-ones, an inline "That batch is not here", and — for
 * any URL nothing recognised — the **marketing 404**, with a Book a demo button
 * and a module list, shown to somebody in the middle of running payroll. A link
 * that does not resolve is not a failure and not a sales opportunity; it is a
 * dead end, and the useful thing to do with a dead end is say so plainly and
 * offer the two ways out.
 *
 * Nothing here claims anything was lost. A missing page changes no record.
 *
 * ## Where it is used
 *
 * - `app/(app)/not-found.tsx`, which Next renders when a route in the signed-in
 *   product calls `notFound()`.
 * - Directly, by a screen that wants the same words inline for a record that is
 *   not there (an id in a stale link). Pass `subject` to name it.
 */
export function NotFoundState({
  subject = "that page",
  className,
}: {
  /** What was not found, as it reads mid-sentence: "that page", "this payslip". */
  subject?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <EmptyState
      {...(className ? { className } : {})}
      icon={<Compass aria-hidden="true" />}
      title={`We could not find ${subject}`}
      description="The link may be out of date, or it may have moved. Nothing has been changed."
      action={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/dashboard" variant="accent">
            Go to your home
          </ButtonLink>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Go back
          </Button>
        </div>
      }
    />
  );
}
