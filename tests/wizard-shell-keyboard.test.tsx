import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { WizardShell } from "@/components/performance/wizard-shell";

/**
 * The full-screen wizards keep the keyboard on themselves (F49, 25 Nov walkthrough).
 *
 * Tab used to run on from the last control into the page behind (the skip link,
 * the search, the bell), Shift+Tab out of the first one landed on a card behind
 * it, Escape closed the wizard and left focus on the page body, and a disabled
 * Continue said nothing about why it was off.
 *
 * The trap decides what is tabbable from `offsetParent`, which jsdom answers
 * with null for everything; the stub below is the one the other focus-trap tests
 * use, so a real Tab goes through the real hook.
 */

const realOffsetParent = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetParent",
);
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.isConnected ? (this.parentElement ?? document.body) : null;
    },
  });
});
afterAll(() => {
  if (realOffsetParent) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetParent",
      realOffsetParent,
    );
  }
});
afterEach(() => cleanup());

function Harness({
  canNext = true,
  whyNot,
  onClose = () => undefined,
}: {
  canNext?: boolean;
  whyNot?: string | null;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        New appraisal period
      </button>
      <a href="#behind">Page behind</a>
      <WizardShell
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        step={0}
        total={3}
        title="Which period?"
        onNext={() => undefined}
        canNext={canNext}
        whyNot={whyNot}
      >
        <label>
          Name
          <input />
        </label>
      </WizardShell>
    </>
  );
}

describe("the wizard keeps the keyboard on itself", () => {
  it("opens with focus on the question, not on the page behind", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "New appraisal period" }),
    );
    expect(
      screen.getByRole("heading", { name: "Which period?" }),
    ).toHaveFocus();
  });

  it("wraps Tab from the last control to the first, and never reaches the page behind", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "New appraisal period" }),
    );
    const dialog = screen.getByRole("dialog");
    const seen = new Set<Element | null>();
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      seen.add(document.activeElement);
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    expect(seen.has(screen.getByRole("link", { name: "Page behind" }))).toBe(
      false,
    );
  });

  it("wraps Shift+Tab from the first control to the last", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "New appraisal period" }),
    );
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 6; i += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("closes on Escape once, and gives focus back to what opened it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "New appraisal period" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("lets the page scroll again after it closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "New appraisal period" }),
    );
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("a disabled Continue says why", () => {
  it("shows the reason beside it and ties it to the button", async () => {
    const user = userEvent.setup();
    render(<Harness canNext={false} whyNot="Choose a quarter to continue." />);
    await user.click(
      screen.getByRole("button", { name: "New appraisal period" }),
    );
    const why = screen.getByText("Choose a quarter to continue.");
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-describedby", why.id);
  });

  it("says nothing once Continue is on, even if a reason is still passed", async () => {
    const user = userEvent.setup();
    render(<Harness canNext whyNot="Choose a quarter to continue." />);
    await user.click(
      screen.getByRole("button", { name: "New appraisal period" }),
    );
    expect(screen.queryByText("Choose a quarter to continue.")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).not.toHaveAttribute("aria-describedby");
  });

  it("says nothing when no reason was given", async () => {
    const user = userEvent.setup();
    render(<Harness canNext={false} />);
    await user.click(
      screen.getByRole("button", { name: "New appraisal period" }),
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(document.querySelector("#wizard-why-not")).toBeNull();
  });
});
