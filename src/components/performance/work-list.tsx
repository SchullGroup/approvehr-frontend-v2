"use client";

import { useState } from "react";
import { Button, Card, CardBody } from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";

/** How many rows show before "Show all". */
export const WORK_SHOWN = 10;

/**
 * What every list of finished work cannot show, once, for its tooltip. It is only what was tracked in
 * Projects, so a short list is not a short record of work: meetings, mentoring and anything done outside
 * Projects are not in it. True of every server, on purpose.
 */
export const WORK_LEFT_OUT =
  "Only what was tracked in Projects is here, not meetings, mentoring or work done elsewhere, so a short list is not a short record of work.";

/**
 * A list of finished work with no heading: one small line that says how much, with every rule about the
 * list behind one info mark beside it, then the rows.
 *
 * Whatever page or drawer holds it already says what it is, so the list does not name itself, and the
 * sentences that used to sit above and below it (what it leaves out, what it does not change, what a
 * flag is, how long it is kept) are the one tooltip. Nothing recorded is a quiet "Not recorded" and the
 * same tooltip, because a short list is not a short record of work.
 *
 * `framed` draws it in a card of its own, for a page; a drawer has its own surface and leaves it off.
 */
export function WorkList({
  lead,
  note,
  rows,
  framed = false,
  label,
  problem,
  children,
}: {
  /** "12 finished", and whatever else is true of the list in a few words. */
  lead: string;
  /** Every rule about this list, in one tooltip. */
  note: string;
  /** The rows, each a `WorkRow`, newest first. */
  rows: readonly React.ReactNode[];
  framed?: boolean;
  /** What a screen reader calls the card, since it has no heading to read. */
  label?: string;
  /** A change that failed, in the server's own words. */
  problem?: string | null;
  /** What the list owns that draws nothing in the flow: its dialog. */
  children?: React.ReactNode;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, WORK_SHOWN);

  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-meta text-muted">
        <span>{rows.length === 0 ? "Not recorded" : lead}</span>
        <InfoTooltip label="About this list" text={note} />
      </div>
      {rows.length > 0 && <ul className="divide-y divide-line">{shown}</ul>}
      {rows.length > WORK_SHOWN && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `Show all ${String(rows.length)}`}
          </Button>
        </div>
      )}
      {problem && (
        <p role="alert" className="text-body-sm text-danger-text">
          {problem}
        </p>
      )}
      {children}
    </div>
  );

  return framed ? (
    <Card {...(label ? { as: "section", "aria-label": label } : {})}>
      <CardBody>{body}</CardBody>
    </Card>
  ) : (
    body
  );
}
