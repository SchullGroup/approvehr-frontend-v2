import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  TabStrip,
  tabPanelProps,
  type TabStripItem,
} from "@/app/(app)/hiring/requisitions/[id]/tab-strip";

/**
 * The strip of tabs used for Pipeline / Applicants / Stages / Access and, on a phone,
 * for the stages of the board. 44px tall is a CSS fact a component test cannot see;
 * what it can pin is the part the shared `Tabs` has and this must not lose (keyboard,
 * ARIA wiring) and the one rule this adds: a count that is not known is not a 0.
 */

const items: TabStripItem[] = [
  { id: "pipeline", label: "Pipeline" },
  { id: "applicants", label: "Applicants", count: 2, tone: "warning" },
  { id: "stages", label: "Stages", count: 0 },
  { id: "access", label: "Access", count: undefined },
];

function Strip({
  value = "pipeline",
  onChange = vi.fn(),
  variant,
}: {
  value?: string;
  onChange?: (id: string) => void;
  variant?: "pills";
}) {
  return (
    <>
      <TabStrip
        items={items}
        value={value}
        onChange={onChange}
        label="This role"
        prefix="t"
        {...(variant ? { variant } : {})}
      />
      <div {...tabPanelProps("t", value)}>panel</div>
    </>
  );
}

describe("the tab strip", () => {
  it("marks the selected tab and leaves the others out of the tab order", () => {
    render(<Strip value="applicants" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
      "false",
    ]);
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual([
      "-1",
      "0",
      "-1",
      "-1",
    ]);
  });

  it("wires each tab to the panel and the panel to the selected tab", () => {
    render(<Strip value="stages" />);
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", "t-tab-stages");
    expect(screen.getByRole("tab", { name: /Stages/ })).toHaveAttribute(
      "aria-controls",
      panel.id,
    );
    expect(screen.getByRole("tablist", { name: "This role" })).toBeVisible();
  });

  it("shows a count only when it is a number: unknown is not nought", () => {
    render(<Strip />);
    expect(screen.getByRole("tab", { name: "Pipeline" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Access" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Applicants/ })).toHaveTextContent(
      "Applicants2",
    );
    /* A real zero is the caller's to show, and when it does it is drawn. */
    expect(screen.getByRole("tab", { name: /Stages/ })).toHaveTextContent(
      "Stages0",
    );
  });

  it("changes tab on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Strip onChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: /Stages/ }));
    expect(onChange).toHaveBeenCalledWith("stages");
  });

  it("moves with the arrows, wraps at both ends, and honours Home and End", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Strip onChange={onChange} />);
    screen.getByRole("tab", { name: "Pipeline" }).focus();

    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("applicants");
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("access");
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("access");
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("pipeline");
  });

  it("draws the same tabs as pills when it sits inside another tab's panel", () => {
    render(<Strip variant="pills" />);
    const selected = screen.getByRole("tab", { name: "Pipeline" });
    expect(selected.className).toMatch(/rounded-full/);
    expect(screen.getByRole("tablist").className).not.toMatch(/border-b/);
  });
});
