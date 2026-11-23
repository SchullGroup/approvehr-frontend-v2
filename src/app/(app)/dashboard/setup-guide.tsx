"use client";

import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { useCan } from "@/lib/permissions";
import { useSetupChecklist } from "@/lib/store/setup-checklist";
import { checklistProgress, checklistRows } from "../settings/checklist";
import { STATUS } from "../settings/setup-row";
import { dismissGuide, useSetupGuideState } from "@/lib/store/setup-guide";

/**
 * What is still to set up, as a card on the dashboard that can be hidden.
 *
 * UAT 23 Nov (U43, NC-17). A new owner met the setup wizard, then the product
 * tour, then a six-step "Setting up your company" modal that opened again on
 * every visit to the dashboard. It is one card now, under the greeting, never a
 * modal: what is still to do, and a link to the page that sets each one.
 * "Hide" puts it away for good in this browser; every step is also listed under
 * Settings beside the page it belongs to.
 *
 * ## What is done comes from the server, every time
 *
 * The steps, their wording and their state are `checklistRows(facts)`, the same
 * function the Settings page reads, from the same `GET /setup/checklist`, so the
 * two cannot disagree. Nothing here ticks a step: a card that recorded its own
 * progress would show a company a mark against work nobody did.
 *
 * ## Only where somebody can act, and only while something is left
 *
 * A reader without Change company settings gets nothing: every link would
 * refuse them. A finished company gets nothing: a card congratulating somebody
 * on every load is the kind people learn to scroll past.
 */
export function SetupCard() {
  const canManage = useCan("MANAGE_SETTINGS");
  const { facts, loading } = useSetupChecklist();
  const guide = useSetupGuideState();

  if (!canManage || loading || facts === null || guide.dismissed) return null;

  const rows = checklistRows(facts).filter(
    (row) => row.status !== "optional" && row.status !== "unknown",
  );
  const progress = checklistProgress(rows);
  if (progress.outstanding.length === 0) return null;

  return (
    <Card as="section" className="mb-4" aria-labelledby="setup-card-title">
      <CardHeader
        level={2}
        title={<span id="setup-card-title">Setting up your company</span>}
        description={`${progress.done} of ${progress.total} done`}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={dismissGuide}
            aria-label="Hide setting up your company"
          >
            <X aria-hidden="true" className="size-4" />
            Hide
          </Button>
        }
      />
      {/* What is left, not the whole list: the count above says how much is
          done, and Settings shows each step beside its own page. */}
      <ul className="divide-y divide-line border-t border-line">
        {progress.outstanding.map((row) => {
          const done = row.status === "done";
          return (
            <li key={row.id}>
              <Link
                href={row.href}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
              >
                <span
                  aria-hidden="true"
                  className={
                    done
                      ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"
                      : "flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong"
                  }
                >
                  {done && <Check className="size-3.5" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-ink">{row.title}</span>
                  {!done && (
                    <span className="truncate text-body-sm text-muted">
                      {row.detail}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-meta text-muted">
                  {STATUS[row.status].label}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
