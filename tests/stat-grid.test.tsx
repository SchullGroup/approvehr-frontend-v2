import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stat, StatGrid } from "@/components/ui";

/**
 * Four stat cards in a column pushed the page's content a screen down on a dozen
 * screens. Two across is the shape a phone holds; a desktop is unchanged.
 */

const grid = (columns?: 2 | 3 | 4) =>
  render(
    <StatGrid {...(columns ? { columns } : {})}>
      <Stat label="One" value="1" />
      <Stat label="Two" value="2" />
      <Stat label="Three" value="3" />
    </StatGrid>,
  ).container.firstElementChild as HTMLElement;

describe("StatGrid", () => {
  it("is two across on a phone whatever the wide layout is", () => {
    for (const columns of [2, 3, 4] as const) {
      expect(grid(columns)).toHaveClass("grid-cols-2");
    }
  });

  it("is four across from xl by default, and three from sm when asked", () => {
    expect(grid()).toHaveClass("xl:grid-cols-4");
    expect(grid(3)).toHaveClass("sm:grid-cols-3");
    expect(grid(3)).not.toHaveClass("xl:grid-cols-4");
  });

  it("lets the odd one out take the phone's whole row, and only the phone's", () => {
    const el = grid();
    expect(el.className).toContain("[&>:last-child:nth-child(odd)]:col-span-2");
    expect(el.className).toContain(
      "sm:[&>:last-child:nth-child(odd)]:col-span-1",
    );
  });
});

describe("Stat", () => {
  it("steps its padding and figure up from sm", () => {
    const stat = render(<Stat label="Payslips" value="10" />).container
      .firstElementChild as HTMLElement;
    expect(stat).toHaveClass("p-3.5", "sm:p-5");
  });

  it("lets a hint wrap rather than cut its caveat", () => {
    const { getByText } = render(
      <Stat label="Leave" value="3" hint="approved, starting within 31 days" />,
    );
    const hint = getByText("approved, starting within 31 days");
    expect(hint).toHaveClass("break-words");
  });
});
