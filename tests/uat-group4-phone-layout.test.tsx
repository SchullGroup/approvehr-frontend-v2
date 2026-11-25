import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, IconButton, Pagination, Tabs } from "@/components/ui";

/**
 * UAT 23 Nov, group 4: the phone layout.
 *
 * - U85 (NC-23, CRAWL-1): the pager ran 40px past a 390px screen, and payslip
 *   values were cut to "Ibrahim M".
 * - U106 (PERF-24): Who appraises whom ran to 558px on a phone.
 * - L29 (SELF-22): long tab sets were cut at "Co…", and row buttons were 32px.
 * - L20 (HR-24): a chart and four tiles pushed the Employees list two screens
 *   down on a phone.
 *
 * jsdom has no layout, so these hold the classes that do the work. The widths
 * were measured in a browser at 390px.
 */

describe("the pager", () => {
  it("wraps, so the page-size picker and the pager stack on a phone", () => {
    const { container } = render(
      <Pagination
        page={1}
        pageSize={25}
        total={68}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        noun={["employee", "employees"]}
      />,
    );
    const controls = screen
      .getByRole("button", { name: /Next/ })
      .closest("div.flex-wrap");
    expect(controls).not.toBeNull();
    expect(container.innerHTML).toContain("gap-y-2");
  });
});

describe("a long set of tabs", () => {
  const items = ["Personal", "Job", "Pay", "Leave", "Conduct", "History"].map(
    (label) => ({ id: label.toLowerCase(), label }),
  );

  it("is a dropdown of every section on a phone, and the strip from sm up", () => {
    render(<Tabs items={items} value="pay" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Section" });
    expect(select.closest("div.sm\\:hidden")).not.toBeNull();
    expect(screen.getByRole("tablist").className).toContain("hidden sm:flex");
    expect(
      Array.from(select.querySelectorAll("option")).map((o) => o.textContent),
    ).toEqual(["Personal", "Job", "Pay", "Leave", "Conduct", "History"]);
  });

  it("stays a strip when it is short", () => {
    render(<Tabs items={items.slice(0, 3)} value="pay" onChange={vi.fn()} />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("tablist").className).not.toContain("hidden");
  });
});

describe("a small button", () => {
  it("is 44px under a finger", () => {
    render(
      <>
        <Button size="sm">Read</Button>
        <IconButton size="sm" label="More">
          …
        </IconButton>
      </>,
    );
    expect(screen.getByRole("button", { name: "Read" }).className).toContain(
      "pointer-coarse:h-11",
    );
    expect(screen.getByRole("button", { name: "More" }).className).toContain(
      "pointer-coarse:size-11",
    );
  });
});

describe("pages measured at 390px", () => {
  const source = (path: string) => readFileSync(path, "utf8");

  it("the payslip stacks a label over its value under 480px, and does not cut it", () => {
    const doc = source("src/components/payroll/payslip-document.tsx");
    expect(doc).toContain("min-[480px]:flex-row");
    expect(doc).toContain("break-words min-[480px]:truncate");
  });

  it("Who appraises whom has no filter bar to squeeze: department cards, then each appraiser's people", () => {
    const page = source("src/app/(app)/performance/appraiser-map.tsx");
    expect(page).not.toContain("<FilterBar");
    expect(page).toContain("sm:grid-cols-2");
  });

  it("Employees opens on one summary line, not a chart and four tiles", () => {
    const page = source("src/app/(app)/people/directory.tsx");
    expect(page).not.toContain("Where people stand");
    expect(page).not.toContain("<StatGrid>");
    expect(page).not.toContain("Fill in missing details");
  });
});
