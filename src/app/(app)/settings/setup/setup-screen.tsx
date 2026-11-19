"use client";

import { Callout, ProgressMeter, Spinner, TextLink } from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useSetupChecklist } from "@/lib/store/setup-checklist";
import { checklistProgress, checklistRows } from "../checklist";
import { Row } from "../setup-row";

/**
 * What is still to set up, in full.
 *
 * This used to be a card on `/settings`, above the page the owner came for. It
 * is a page of its own now and `/settings` carries a small link to it beside the
 * search box. The rows, the count and the judgement about what "done" means are
 * the same ones: `checklistRows` is the one definition, so this page, the
 * settings search and the first-visit guide cannot disagree about a step.
 */
export function SetupScreen() {
  const { facts, loading, error, reload } = useSetupChecklist();
  const rows = facts === null ? [] : checklistRows(facts);
  const progress = checklistProgress(rows);
  const complete = progress.total > 0 && progress.done === progress.total;

  return (
    <>
      <PageHeader
        title="Setting up your company"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        description="Seven things decide how the product behaves. Each row says what it changes and takes you to where it is set."
      />

      <PageBody className="flex flex-col gap-6">
        {!loading && progress.total > 0 && (
          <div className="flex max-w-md flex-col gap-2">
            <p className="text-body-sm font-semibold text-ink">
              {progress.done} of {progress.total} done
            </p>
            <ProgressMeter
              value={progress.done}
              max={progress.total}
              tone={complete ? "success" : "accent"}
              size="sm"
              showValue={false}
            />
            {complete && (
              <p className="text-body-sm text-body">
                Everything a payroll needs is in place.
                {facts && !facts.company.logo && (
                  <>
                    {" "}
                    No logo yet: it goes on every payslip and on the emails the
                    platform sends.{" "}
                    <TextLink href="/settings/company">Add one</TextLink>.
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {error && (
          <Callout
            tone="danger"
            title="Could not work out what is still to be set up"
          >
            {error.message}{" "}
            <button
              type="button"
              onClick={reload}
              className="underline hover:text-ink"
            >
              Try again
            </button>
            .
          </Callout>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : facts === null ? (
          <p className="text-body-sm text-body">
            Nothing to show. The checklist reads one endpoint and it did not
            answer; every other settings page is unaffected.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {rows.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </ul>
        )}
      </PageBody>
    </>
  );
}
