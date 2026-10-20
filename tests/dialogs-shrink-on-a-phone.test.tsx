import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RequestCorrectionDialog } from "@/app/(app)/people/attendance/my-attendance-history";
import { RejectDialog } from "@/components/hiring/reject-dialog";
import { ScorecardDialog } from "@/components/hiring/scorecard-dialog";
import { BulkMoveDialog } from "@/components/hiring/bulk-dialogs";
import { ConfirmDialog } from "@/components/ui";

/**
 * A phone sheet is built so nothing in it can be wider than the sheet.
 *
 * jsdom cannot measure a layout, so these cannot prove a pixel; they hold the
 * *structure* that lets the browser do it. They are the rendered half of
 * `field-shrinks-on-a-phone.test.tsx` (which tests the parts) and
 * `no-unsafe-form-rows.test.ts` (which reads every file): here a few real
 * dialogs are mounted and every control, row and shell in them is checked.
 *
 * "Ask for a correction" is first because it is the one that broke — two time
 * inputs in a two-column grid ran past the right edge of a 375px iPhone — and
 * the others are a spread of shapes: a form with a select and a textarea, a
 * dialog with rated rows and a score, and a picker beside a switch.
 */

const classes = (node: Element) => Array.from(node.classList);

/** Controls whose width is not the form's business: boxes, files, hidden. */
const NOT_SIZED = new Set(["checkbox", "radio", "file", "hidden", "range"]);

function expectShrinkSafe(dialog: HTMLElement) {
  /* 1. The body scrolls down and never across, and can be narrower than its
        widest child. */
  const body = dialog.querySelector(".overflow-y-auto");
  expect(body, "the dialog body").not.toBeNull();
  expect(classes(body as Element)).toEqual(
    expect.arrayContaining(["min-w-0", "overflow-x-clip"]),
  );

  /* 2. Every sized control may shrink and may not exceed its parent. */
  const controls = Array.from(
    dialog.querySelectorAll<HTMLElement>("input, select, textarea"),
  ).filter((el) => !NOT_SIZED.has((el as HTMLInputElement).type));
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(
      classes(control),
      `${control.tagName.toLowerCase()} ${(control as HTMLInputElement).type}`,
    ).toEqual(expect.arrayContaining(["w-full", "min-w-0", "max-w-full"]));
  }

  /* 3. Every column count that applies on a phone belongs to a row whose cells
        may all shrink. */
  const grids = Array.from(dialog.querySelectorAll<HTMLElement>("div")).filter(
    (el) => classes(el).some((c) => /^grid-cols-[2-9]$/.test(c)),
  );
  for (const grid of grids) {
    expect(classes(grid), grid.className).toContain("[&>*]:min-w-0");
  }

  /* 4. A field that is a grid or flex item can shrink: its root says so. The
        root is the label's grandparent — label, then the row that holds it. */
  for (const label of Array.from(dialog.querySelectorAll("label[for]"))) {
    const root = label.parentElement?.parentElement;
    if (root && classes(root).includes("flex-col")) {
      expect(classes(root), `field "${label.textContent}"`).toContain(
        "min-w-0",
      );
    }
  }

  /* 5. The sheet itself can be no wider than the screen. */
  expect(classes(dialog)).toContain("min-w-0");
}

describe("the dialog that broke", () => {
  it("Ask for a correction: two time inputs side by side, each allowed to shrink", () => {
    render(
      <RequestCorrectionDialog
        row={{ date: "2026-10-15", clockIn: "08:02", clockOut: null }}
        onClose={vi.fn()}
        onSent={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expectShrinkSafe(dialog);

    const clockIn = screen.getByLabelText("Clock in should be");
    const clockOut = screen.getByLabelText("Clock out should be");
    expect((clockIn as HTMLInputElement).type).toBe("time");
    expect((clockOut as HTMLInputElement).type).toBe("time");

    /* Both in one row, which is two across on a phone on purpose, and which
       lets either cell shrink — the property the iPhone bug took away. */
    const row = clockIn.closest(".grid");
    expect(row).not.toBeNull();
    expect(row).toBe(clockOut.closest(".grid"));
    expect(classes(row as Element)).toEqual(
      expect.arrayContaining(["grid-cols-2", "[&>*]:min-w-0"]),
    );
  });
});

describe("a spread of other dialogs", () => {
  it("Reject: a select, a note and a switch", () => {
    render(
      <RejectDialog
        open
        onClose={vi.fn()}
        subject="Kelechi Yakubu-Adeyemi"
        reasons={[
          {
            id: "r1",
            label: "Not enough experience for the level",
            active: true,
          },
          { id: "r2", label: "Salary expectation", active: true },
        ]}
        onConfirm={vi.fn()}
      />,
    );
    expectShrinkSafe(screen.getByRole("dialog"));
  });

  it("Scorecard: several rated rows and a free-text note", () => {
    render(<ScorecardDialog open onClose={vi.fn()} onConfirm={vi.fn()} />);
    expectShrinkSafe(screen.getByRole("dialog"));
  });

  it("Move people: a select and an email choice", () => {
    render(
      <BulkMoveDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        count={12}
        targets={[
          {
            key: "stage:s2",
            label: "First interview with the hiring manager",
            stageId: "s2",
            type: "INTERVIEW",
            ends: null,
            order: 2,
          },
        ]}
      />,
    );
    expectShrinkSafe(screen.getByRole("dialog"));
  });

  it("a confirmation has nothing to overflow but still has the shell", () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Archive Zenith Bank?"
        body="Nobody can be paid from it any more."
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(classes(dialog)).toContain("min-w-0");
    /* Two buttons that may wrap onto a second line rather than run off. */
    expect(classes(dialog.lastElementChild as Element)).toContain("flex-wrap");
  });
});
