import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Drawer,
  Field,
  FieldRow,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";

/**
 * A field can always be narrower than it wants to be.
 *
 * "Ask for a correction" ran past the right edge of a 375px iPhone: two time
 * inputs in a two-column grid, the second one starting mid-screen and ending
 * off it, so the person could not see "Clock out should be" at all. In iPhone
 * Safari a native time or date input is sized by the platform theme — measured
 * 187px wide in a 161px column with `width: 100%` and an author `min-width: 0`
 * both set — and a grid item will not shrink below its content.
 *
 * jsdom cannot lay anything out, so none of this can assert a pixel. What it
 * can hold is the structure that makes the layout engine's job possible: every
 * link between a control and the dialog edge is allowed to shrink, and the one
 * property that stops an iPhone date field obeying its width is switched off.
 * Each of these was a real cause, found by measuring in an iOS simulator, and
 * not one of them is visible on a laptop.
 */

const classes = (node: Element) => Array.from(node.classList);

describe("Field", () => {
  it("can shrink below its control's intrinsic width", () => {
    render(
      <Field label="Clock in should be">
        <Input type="time" />
      </Field>,
    );
    /* The grid item. Without `min-w-0` its automatic minimum is the control's
       own width, which is how a 161px column held a 187px input. */
    const root = screen.getByLabelText("Clock in should be").closest("div");
    expect(classes(root as Element)).toContain("min-w-0");
  });

  it("lets a long label wrap instead of widening the row", () => {
    render(
      <Field label="A label long enough to need two lines on a narrow phone">
        <Input />
      </Field>,
    );
    const label = screen.getByText(/A label long enough/);
    expect(classes(label)).toContain("min-w-0");
    expect(classes(label.parentElement as Element)).toContain("min-w-0");
  });
});

describe("a hidden label", () => {
  it("is left exactly as it was — it lives in a 1px box and must not be made to wrap in it", () => {
    render(
      <Field label="Search" hideLabel>
        <Input />
      </Field>,
    );
    const label = screen.getByText("Search");
    expect(classes(label)).not.toContain("min-w-0");
  });
});

describe("the controls", () => {
  it.each(["text", "number", "date", "time", "datetime-local", "month"])(
    "Input type=%s is full width, may shrink, and never exceeds its parent",
    (type) => {
      render(<Input type={type} aria-label="x" />);
      const input = screen.getByLabelText("x");
      expect(classes(input)).toEqual(
        expect.arrayContaining(["w-full", "min-w-0", "max-w-full"]),
      );
    },
  );

  it("keeps the same promise when an icon or a suffix wraps the control", () => {
    render(<Input aria-label="Amount" suffix="NGN" />);
    const input = screen.getByLabelText("Amount");
    expect(classes(input.parentElement as Element)).toContain("min-w-0");
    expect(classes(input)).toContain("min-w-0");
  });

  it("applies to a Select and its wrapper", () => {
    render(
      <Select aria-label="Pick one">
        <option>a</option>
      </Select>,
    );
    const select = screen.getByLabelText("Pick one");
    expect(classes(select)).toEqual(
      expect.arrayContaining(["w-full", "min-w-0", "max-w-full"]),
    );
    expect(classes(select.parentElement as Element)).toContain("min-w-0");
  });

  it("applies to a Textarea", () => {
    render(<Textarea aria-label="Why" />);
    expect(classes(screen.getByLabelText("Why"))).toEqual(
      expect.arrayContaining(["w-full", "min-w-0", "max-w-full"]),
    );
  });
});

describe("FieldRow", () => {
  const row = (props: React.ComponentProps<typeof FieldRow>) => {
    const { container } = render(<FieldRow {...props} />);
    return container.firstElementChild as HTMLElement;
  };

  it("is one column on a phone and two from sm up, by default", () => {
    const el = row({
      children: (
        <Field label="A">
          <Input />
        </Field>
      ),
    });
    expect(classes(el)).toEqual(
      expect.arrayContaining(["grid", "grid-cols-1", "sm:grid-cols-2"]),
    );
    /* A bare `grid-cols-2` is what would make it two across on a phone. */
    expect(classes(el)).not.toContain("grid-cols-2");
  });

  it("stays two across on a phone only when asked to", () => {
    const el = row({
      phone: "pair",
      children: (
        <Field label="A">
          <Input />
        </Field>
      ),
    });
    expect(classes(el)).toContain("grid-cols-2");
    expect(classes(el)).not.toContain("grid-cols-1");
  });

  it("does three across from sm up, or on a phone when asked", () => {
    expect(
      classes(
        row({
          cols: 3,
          children: (
            <Field label="A">
              <Input />
            </Field>
          ),
        }),
      ),
    ).toEqual(expect.arrayContaining(["grid-cols-1", "sm:grid-cols-3"]));
    expect(
      classes(
        row({
          cols: 3,
          phone: "pair",
          children: (
            <Field label="B">
              <Input />
            </Field>
          ),
        }),
      ),
    ).toContain("grid-cols-3");
  });

  it("lets every cell shrink, whatever is put in it", () => {
    const el = row({
      phone: "pair",
      children: (
        <>
          <Field label="A">
            <Input type="date" />
          </Field>
          <div>not a Field at all</div>
        </>
      ),
    });
    /* The one rule that makes a cell shrinkable without every call site
       remembering `min-w-0` on its own wrapper. */
    expect(classes(el)).toContain("[&>*]:min-w-0");
  });
});

describe("the dialog shells", () => {
  const modal = () => {
    render(
      <Modal
        open
        onClose={() => undefined}
        title="Ask for a correction"
        footer={<button type="button">Send</button>}
      >
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const [header, body, footer] = Array.from(dialog.children);
    return { dialog, header, body, footer } as unknown as Record<
      string,
      HTMLElement
    >;
  };

  it("Modal: the panel, the body and the title can all shrink", () => {
    const { dialog, header, body } = modal();
    /* A flex item of a row: its automatic minimum width is its content's, so
       one wide child used to stretch the whole sheet past the screen. */
    expect(classes(dialog)).toContain("min-w-0");
    expect(classes(body)).toEqual(
      expect.arrayContaining(["min-w-0", "overflow-y-auto", "overflow-x-clip"]),
    );
    expect(classes(header.firstElementChild as Element)).toContain("min-w-0");
  });

  it("Modal: the close button is never squeezed out by a long title", () => {
    const { header } = modal();
    const close = screen.getByRole("button", { name: "Close dialog" });
    expect(header.contains(close)).toBe(true);
    expect(classes(close)).toContain("shrink-0");
  });

  it("Modal: a footer with several buttons wraps rather than overflows", () => {
    const { footer } = modal();
    expect(classes(footer)).toContain("flex-wrap");
  });

  it("Drawer: the same, on its own shell", () => {
    render(
      <Drawer
        open
        onClose={() => undefined}
        title="Edit"
        footer={<button type="button">Save</button>}
      >
        <p>body</p>
      </Drawer>,
    );
    const dialog = screen.getByRole("dialog");
    const [header, body, footer] = Array.from(dialog.children);
    expect(classes(dialog as Element)).toContain("min-w-0");
    expect(classes(body as Element)).toEqual(
      expect.arrayContaining(["min-w-0", "overflow-x-clip"]),
    );
    expect(classes(header?.firstElementChild as Element)).toContain("min-w-0");
    expect(classes(footer as Element)).toContain("flex-wrap");
    expect(
      classes(screen.getByRole("button", { name: "Close panel" })),
    ).toContain("shrink-0");
  });
});

describe("the iPhone date and time rule in globals.css", () => {
  const css = readFileSync(
    path.join(process.cwd(), "src/app/globals.css"),
    "utf8",
  );
  const PICKERS = ["date", "time", "datetime-local", "month", "week"];

  it("gives every native picker a width it can be squeezed to", () => {
    for (const type of PICKERS) {
      expect(css).toContain(`input[type="${type}"]`);
    }
    const base = css.slice(
      css.indexOf('input[type="date"],'),
      css.indexOf("@supports (-webkit-touch-callout: none)"),
    );
    expect(base).toContain("min-width: 0");
    expect(base).toContain("max-width: 100%");
  });

  it("hands the sizing back to CSS on iOS only, so desktop is untouched", () => {
    const at = css.indexOf("@supports (-webkit-touch-callout: none)");
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, at + 1200);
    for (const type of PICKERS) {
      expect(block).toContain(`input[type="${type}"]`);
    }
    /* The one property found, by measuring in iOS 26 Safari, to stop a
       date/time input obeying `width: 100%` — `display` and `min-width` alone
       changed nothing. */
    expect(block).toContain("appearance: none");
    /* And not a bare, unscoped rule: that would also restyle Chrome, Firefox
       and desktop Safari, which have no bug to fix. */
    const unscoped = css
      .replace(block, "")
      .match(/input\[type="(?:date|time)"\][^{]*\{[^}]*appearance:\s*none/);
    expect(unscoped).toBeNull();
  });
});
