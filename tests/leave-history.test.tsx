import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LeaveHistory } from "@/components/leave/leave-history";
import type { LeaveHistoryEntry } from "@/lib/api/leave";

/**
 * What happened to a request, as the panel tells it.
 *
 * The list is the API's and is never rewritten, so a reopen does not erase what
 * was said before it. What is checked here is that the screen keeps it: every
 * entry, in order, with who and when and the words they used, and the employee's
 * own reason not said twice.
 */

const entry = (over: Partial<LeaveHistoryEntry>): LeaveHistoryEntry => ({
  kind: "REQUESTED",
  at: "2026-10-18",
  byName: "Ada Okafor",
  byJobTitle: "Analyst",
  note: null,
  ...over,
});

describe("the history of a request", () => {
  it("draws nothing for a request with no history, as in an API that predates it", () => {
    const { container } = render(<LeaveHistory history={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every entry in the order given, with who, when and what they said", () => {
    render(
      <LeaveHistory
        history={[
          entry({ note: "Flu" }),
          entry({
            kind: "FIRST_APPROVED",
            at: "2026-10-19",
            byName: "Tolu Bello",
            byJobTitle: "Head of Operations",
            note: "Covered by Kemi.",
          }),
          entry({
            kind: "DECLINED",
            at: "2026-10-20",
            byName: "Fatima Bello",
            byJobTitle: "HR manager",
            note: "Two people are already off that week.",
          }),
          entry({ kind: "REOPENED", at: "2026-10-21", note: null }),
        ]}
      />,
    );
    const items = within(
      screen.getByRole("list", { name: "What happened" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Requested");
    expect(items[1]).toHaveTextContent("Approved first");
    expect(items[1]).toHaveTextContent("Tolu Bello, Head of Operations");
    expect(items[1]).toHaveTextContent("“Covered by Kemi.”");
    expect(items[2]).toHaveTextContent("Sent back");
    expect(items[2]).toHaveTextContent(
      "“Two people are already off that week.”",
    );
    expect(items[3]).toHaveTextContent("Reopened");
  });

  it("does not repeat the employee's own reason, which is a row above it", () => {
    render(<LeaveHistory history={[entry({ note: "Flu" })]} />);
    expect(screen.queryByText(/Flu/)).toBeNull();
  });

  it("keeps what was said before a reopen, which the decision's own note does not", () => {
    render(
      <LeaveHistory
        history={[
          entry({}),
          entry({
            kind: "DECLINED",
            at: "2026-10-20",
            note: "Not that week.",
          }),
          entry({ kind: "REOPENED", at: "2026-10-21" }),
          entry({ kind: "APPROVED", at: "2026-10-22", note: "Fine now." }),
        ]}
      />,
    );
    expect(screen.getByText("“Not that week.”")).toBeInTheDocument();
    expect(screen.getByText("“Fine now.”")).toBeInTheDocument();
  });

  it("does not make up a person for an entry with no name", () => {
    render(
      <LeaveHistory
        history={[entry({ kind: "CANCELLED", byName: null, byJobTitle: null })]}
      />,
    );
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
    expect(screen.queryByText(/null|undefined|Unknown/)).toBeNull();
  });
});
