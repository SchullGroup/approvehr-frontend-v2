import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOpenSession } from "@/lib/use-open-session";

/**
 * The number a keyed dialog form hangs on.
 *
 * What matters about it is as much when it does *not* go up as when it does: a
 * list that refreshes under a half-typed field must not start a new form, and a
 * dialog that is closing must not change what is on screen while it animates.
 */

function Probe({
  open,
  identity,
}: {
  open: boolean;
  identity?: string | null;
}) {
  const session = useOpenSession(open, identity);
  return <output data-testid="session">{session}</output>;
}

const session = () => Number(screen.getByTestId("session").textContent);

describe("opening", () => {
  it("starts at nought whether the dialog is mounted open or closed", () => {
    const closed = render(<Probe open={false} />);
    expect(session()).toBe(0);
    closed.unmount();

    render(<Probe open />);
    expect(session()).toBe(0);
  });

  it("goes up each time the dialog opens, and not when it closes", () => {
    const { rerender } = render(<Probe open={false} />);

    rerender(<Probe open />);
    expect(session()).toBe(1);

    rerender(<Probe open={false} />);
    expect(session()).toBe(1);

    rerender(<Probe open />);
    expect(session()).toBe(2);
  });

  it("does not go up on a re-render of a dialog that is already open", () => {
    const { rerender } = render(<Probe open={false} />);
    rerender(<Probe open />);
    rerender(<Probe open />);
    rerender(<Probe open />);
    expect(session()).toBe(1);
  });

  it("is already the new number in the render that opens it", () => {
    /* The form below is keyed by this, so it has to be right in the same pass:
       an effect would show a frame of the last session's fields first. */
    const seen: number[] = [];
    function Logged({ open }: { open: boolean }) {
      const n = useOpenSession(open);
      seen.push(n);
      return null;
    }
    const { rerender } = render(<Logged open={false} />);
    seen.length = 0;
    rerender(<Logged open />);
    expect(seen.at(-1)).toBe(1);
    expect(seen).not.toContain(0);
  });
});

describe("a record", () => {
  it("starts a new session when a different record arrives while open", () => {
    const { rerender } = render(<Probe open identity="a" />);
    expect(session()).toBe(0);

    rerender(<Probe open identity="b" />);
    expect(session()).toBe(1);
  });

  it("does not, when the same record is handed over again", () => {
    /* The identity is a string for exactly this reason: a refetch hands over a
       new object for the same record. */
    const { rerender } = render(<Probe open identity="a" />);
    rerender(<Probe open identity="a" />);
    rerender(<Probe open identity="a" />);
    expect(session()).toBe(0);
  });

  it("does not take a cleared record as a different one", () => {
    /* The parent clears its prop to null the instant it closes a dialog. */
    const { rerender } = render(<Probe open identity="a" />);
    rerender(<Probe open identity={null} />);
    rerender(<Probe open identity={undefined} />);
    expect(session()).toBe(0);
  });

  it("counts one new session, not two, when it opens onto a new record", () => {
    const { rerender } = render(<Probe open={false} identity="a" />);
    rerender(<Probe open identity="b" />);
    expect(session()).toBe(1);
  });

  it("does not start one for a record that changes while the dialog is closed", () => {
    const { rerender } = render(<Probe open={false} identity="a" />);
    rerender(<Probe open={false} identity="b" />);
    expect(session()).toBe(0);

    rerender(<Probe open identity="b" />);
    expect(session()).toBe(1);
  });
});
