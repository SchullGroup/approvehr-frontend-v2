"use client";

import { useEffect, useState } from "react";
import { Disclosure } from "@/components/ui";

/** Where the new-task form remembers that "More options" was left open. */
export const MORE_OPTIONS_KEY = "projects.moreOptions";

/**
 * Whether a form's "More options" is open, remembered per browser.
 *
 * Read when the form opens (`active` turns true), after mount, so a server
 * render and the first client render agree. Storage that cannot be read or
 * written leaves it closed and remembers nothing. `force` opens it whatever was
 * remembered: a field inside has an error, and a closed section would hide it.
 */
export function useMoreOptions(storageKey: string, active: boolean) {
  const [remembered, setRemembered] = useState(false);

  useEffect(() => {
    if (!active) return;
    let open = false;
    try {
      open = localStorage.getItem(storageKey) === "open";
    } catch {
      /* storage unavailable: closed */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount to match the server render
    setRemembered(open);
  }, [storageKey, active]);

  const toggle = (next: boolean) => {
    setRemembered(next);
    try {
      localStorage.setItem(storageKey, next ? "open" : "closed");
    } catch {
      /* not remembered */
    }
  };

  return { remembered, toggle };
}

/**
 * The fields a form can do without, behind one "More options" section.
 *
 * Closed, it says in one line which of them are not at their defaults
 * (`summary`, e.g. "Priority: High · Effort: 3"), so nothing chosen is hidden
 * without a word. The fields stay mounted while closed, so what was typed in
 * them survives a close.
 */
export function MoreOptions({
  open,
  onToggle,
  summary,
  children,
}: {
  open: boolean;
  onToggle: (next: boolean) => void;
  /** The non-default values, already worded. Empty for none. */
  summary: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <Disclosure
      title="More options"
      open={open}
      onToggle={() => onToggle(!open)}
      keepMounted
      region={false}
      level={3}
      {...(summary.length > 0 ? { hint: summary.join(" · ") } : {})}
      panelClassName="space-y-4"
    >
      {children}
    </Disclosure>
  );
}
