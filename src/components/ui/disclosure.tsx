"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * One collapsed section: a button that says what is inside **and how much**, and
 * a region that holds it.
 *
 * Promoted out of `people/new/form.tsx`, where it was `OptionalGroup` and knew
 * about employee field keys. That caller still exists and still passes its own
 * copy; everything about the mechanics — the heading, the `aria-expanded` /
 * `aria-controls` pair, the chevron, the panel — is here now, because the third
 * hand-rolled disclosure is the one that gets the ARIA wrong.
 *
 * ## Read the disclosure rule before reaching for this
 *
 * `PARITY.md` Rule 5. The short version: default closed for anything long,
 * periodic or reference-shaped, and **default open for anything that needs
 * action now**. A blocker, an exception or an approval waiting on this person
 * does not go behind a click, and a warning that belongs to a collapsed section
 * is rendered outside it — see `people/leave/holiday-calendar.tsx`, where the
 * ungazetted-dates callout sits above the closed calendar rather than inside it.
 *
 * ## `meta` is not decoration
 *
 * A closed section is only useful if its summary carries the count. "Public
 * holidays 2026 · 13 dates · 3 awaiting proclamation" is a section somebody can
 * decide not to open; "Public holidays" is a section they have to open to find
 * out whether it mattered. Pass the count. If the count is not known yet, pass
 * nothing rather than a zero.
 *
 * ## Why not `<details>`
 *
 * `<details>` cannot keep a closed panel's DOM alive selectively, and one caller
 * needs exactly that: closing a group of form fields must not throw away what
 * somebody typed into it. So `keepMounted` decides, and the ARIA is written by
 * hand. `Accordion` in `tabs.tsx` is the other neighbour — that one is
 * single-open and shaped for a question-and-answer list, which is a different
 * component, not this one with a flag.
 */
export function Disclosure({
  title,
  meta,
  hint,
  openHint,
  open: controlledOpen,
  onToggle,
  defaultOpen = false,
  keepMounted = false,
  region = true,
  level = 3,
  className,
  panelClassName,
  children,
}: {
  /** What is inside. Name the thing, not the act of opening it. */
  title: React.ReactNode;
  /** How much is inside — badges, counts. Rendered beside the title. */
  meta?: React.ReactNode;
  /** One line under the title. Say what closing this costs, if anything. */
  hint?: React.ReactNode;
  /** Replaces `hint` while open, for when the closed line is a consequence. */
  openHint?: React.ReactNode;
  /** Controlled open state. Omit to let the component hold its own. */
  open?: boolean;
  onToggle?: () => void;
  /** Uncontrolled initial state. Ignored when `open` is passed. */
  defaultOpen?: boolean;
  /**
   * Keep the panel's children in the DOM while closed.
   *
   * On for form fields, whose values must survive a close and reopen. Off for
   * anything expensive — a twelve-month calendar costs 366 cells to build and
   * `hidden` does not save that, unmounting does.
   */
  keepMounted?: boolean;
  /**
   * `role="region"` on the panel, which names it as a landmark once open.
   *
   * Right for a page-level section. Pass `false` for a group of form fields,
   * where a landmark per group turns a wizard step into a list of landmarks.
   */
  region?: boolean;
  /** Keeps the document outline correct wherever this is placed. */
  level?: 2 | 3 | 4;
  className?: string;
  panelClassName?: string;
  children: React.ReactNode;
}) {
  const baseId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);

  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolled;

  const toggle = () => {
    if (onToggle) onToggle();
    if (!controlled) setUncontrolled((was) => !was);
  };

  const Heading = `h${level}` as const;
  const titleId = `${baseId}-title`;
  const panelId = `${baseId}-panel`;
  const line = open ? (openHint ?? hint) : hint;

  return (
    <div className={cn("rounded-lg border border-line", className)}>
      <Heading>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="flex w-full items-start justify-between gap-4 rounded-lg px-4 py-3.5 text-left transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              {/* Size follows the heading level, and `text-body` never set one.
                  ---------------------------------------------------------------
                  This was `text-body font-medium`, and `text-body` is a
                  **colour** utility, not a size — `--color-body` and
                  `--text-body` collide on that name and Tailwind v4 resolves it
                  to the colour, which `text-ink` beside it then overrides. So
                  the title had no font-size at all and inherited 16px from
                  `body`, while everything it sat next to was `text-body-sm` at
                  14px.

                  That reads as arbitrarily bigger text on some rows and not
                  others, which is what it is. `globals.css` records the
                  collision and `verify-typescale`'s failure message names it;
                  this is the first place it was actually doing visible harm.

                  A level-2 disclosure heads a page section and earns the larger
                  size deliberately. A level-3 or level-4 one sits inside a card
                  among body text and has to match it. */}
              <span
                id={titleId}
                className={cn(
                  "font-medium text-ink",
                  level === 2 ? "text-body-lg" : "text-body-sm",
                )}
              >
                {title}
              </span>
              {meta}
            </span>
            {line && (
              <span className="mt-1 block text-meta leading-relaxed text-muted">
                {line}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "mt-1 size-4 shrink-0 text-muted transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </Heading>

      {/* The element itself always exists, so `aria-controls` always resolves;
          what it holds is unmounted when closed unless `keepMounted` says
          otherwise. */}
      <div
        id={panelId}
        role={region ? "region" : "group"}
        aria-labelledby={titleId}
        hidden={!open}
        className={cn("border-t border-line px-4 py-4", panelClassName)}
      >
        {(open || keepMounted) && children}
      </div>
    </div>
  );
}
