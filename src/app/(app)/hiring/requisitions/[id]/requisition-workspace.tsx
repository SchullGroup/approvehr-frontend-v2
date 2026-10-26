"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardBody } from "@/components/ui";
import { TabStrip, tabPanelProps, type TabStripItem } from "./tab-strip";

/**
 * The layout of one role's page: a glance at the role, then the work.
 *
 * ## The order is the change
 *
 * The page was one column in the order somebody built it: role details, who can
 * see the job, the careers-page applicants, the stage editor, and at the very
 * bottom the pipeline board, which is the thing a recruiter opens this page to use
 * (3,121px tall on a desktop, 5,111px on a phone, with the board starting below
 * the first screen on both). Now:
 *
 * 1. **A glance** at the role: the facts a person needs beside a CV (the band,
 *    where, what kind, how many places) and where the hiring stands.
 * 2. **Tabs for the work**: Pipeline first and open, then Applicants, Stages and
 *    Access. Three of those are configuration or intake that is done once or now
 *    and then, and none of them is lost: each is one tap away, and Applicants
 *    carries the number waiting on a first look so it can be seen from the board.
 *
 * ## The tab is in the address
 *
 * `?tab=applicants` opens that tab, and choosing one updates the address without
 * adding a history entry. It is what lets a link say "the two people waiting on a
 * first look" instead of "this page, then scroll". It is read once, when the page
 * has already loaded (this component only mounts after the role has), so nothing
 * here runs on the server and nothing can disagree with what it rendered.
 */

export type WorkspaceTab = TabStripItem & { content: React.ReactNode };

const TAB_PARAM = "tab";

function initialTab(tabs: readonly WorkspaceTab[]): string {
  const first = tabs[0]?.id ?? "";
  if (typeof window === "undefined") return first;
  const asked = new URLSearchParams(window.location.search).get(TAB_PARAM);
  return tabs.some((tab) => tab.id === asked) && asked ? asked : first;
}

export function RequisitionWorkspace({
  tabs,
  glance,
}: {
  tabs: readonly WorkspaceTab[];
  glance: React.ReactNode;
}) {
  const prefix = useId();
  const [picked, setPicked] = useState(() => initialTab(tabs));
  /* A tab that has since gone (the stages tab goes with a seeded role) falls back
     to the first rather than leaving a panel with nothing in it. */
  const value = tabs.some((tab) => tab.id === picked)
    ? picked
    : (tabs[0]?.id ?? "");
  const active = tabs.find((tab) => tab.id === value);

  const choose = (id: string) => {
    setPicked(id);
    /* `replaceState`, not a navigation: a tab is a view of this page, and one
       Back press should leave the page rather than step back through tabs. */
    const url = new URL(window.location.href);
    if (id === tabs[0]?.id) url.searchParams.delete(TAB_PARAM);
    else url.searchParams.set(TAB_PARAM, id);
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <div className="flex flex-col gap-5">
      {glance}

      <div>
        <TabStrip
          label="This role"
          prefix={prefix}
          value={value}
          onChange={choose}
          items={tabs.map(({ id, label, count, tone }) => ({
            id,
            label,
            count,
            ...(tone ? { tone } : {}),
          }))}
          className="-mx-5 px-5 sm:mx-0 sm:px-0"
        />
        <div
          {...tabPanelProps(prefix, value)}
          className="flex flex-col gap-5 pt-5 focus-visible:outline-none"
        >
          {active?.content}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export type Fact = {
  label: string;
  value: React.ReactNode;
};

/**
 * The facts of a role in one card.
 *
 * ## On a phone it is one line
 *
 * The first fact (the band) is the summary, and everything else is behind the
 * button beside it. With the whole card open the first candidate on a phone began
 * at roughly 800px, below the first screen, after two screens of facts about a job
 * the person already knows; closed, it is a 64px row and the stage they came to
 * work is what the screen shows. The control is a real button that says what it
 * does and whether it is open. On a desktop there is no toggle and nothing is
 * hidden.
 */
export function RoleGlance({
  facts,
  figures,
  description,
}: {
  facts: readonly Fact[];
  /** Where the hiring stands: counts and the like, beside the description. */
  figures?: React.ReactNode;
  description?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [summary] = facts;
  const long = (description?.length ?? 0) > 220;
  const [full, setFull] = useState(false);

  return (
    <Card>
      <CardBody className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-5">
        {summary && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text sm:hidden"
          >
            <span className="min-w-0">
              <span className="block text-meta text-faint">
                {summary.label}
              </span>
              <span className="block text-body-sm font-medium text-ink">
                {summary.value}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-body-sm font-medium text-accent-text">
              {open ? "Less" : "More"}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 transition-transform motion-reduce:transition-none",
                  open && "rotate-180",
                )}
              />
            </span>
          </button>
        )}

        <div className={cn("flex flex-col gap-4", !open && "max-sm:hidden")}>
          <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3 text-body-sm sm:flex sm:flex-wrap sm:gap-x-8">
            {facts.map((fact, index) => (
              <div
                key={fact.label}
                className={cn("min-w-0", index === 0 && "max-sm:hidden")}
              >
                <dt className="text-meta text-faint">{fact.label}</dt>
                <dd className="mt-0.5 font-medium text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>

          {(description || figures) && (
            <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-2 border-t border-line pt-3">
              {description && (
                <div className="min-w-0 flex-1 basis-80">
                  <p
                    className={cn(
                      "whitespace-pre-line text-body-sm leading-relaxed text-body",
                      long && !full && "line-clamp-2",
                    )}
                  >
                    {description}
                  </p>
                  {long && (
                    <button
                      type="button"
                      aria-expanded={full}
                      onClick={() => setFull((was) => !was)}
                      className="mt-1 inline-flex min-h-11 items-center text-body-sm font-medium text-accent-text hover:underline sm:min-h-0"
                    >
                      {full ? "Show less" : "Read the whole description"}
                    </button>
                  )}
                </div>
              )}
              {figures && (
                <div className="tabular flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-meta text-muted">
                  {figures}
                </div>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
