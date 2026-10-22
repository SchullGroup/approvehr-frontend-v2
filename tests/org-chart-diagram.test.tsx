import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ApiOrgNode } from "@/lib/api/endpoints";
import { ReportingChart } from "@/app/(app)/people/org-chart/reporting-chart";

/**
 * The chart is drawn by a pure layout (`org-chart-layout.test.ts` asserts the
 * geometry) and this is what the reader does with it: open a card, close a
 * branch, search, zoom. A chart that lays out perfectly and cannot be opened
 * with a keyboard, or whose "show 12 people" button is nested in a link, passes
 * every geometry test and is still the wrong chart.
 */

let counter = 0;
const person = (
  name: string,
  reports: ApiOrgNode[] = [],
  more: Partial<ApiOrgNode> = {},
): ApiOrgNode => {
  counter += 1;
  return {
    id: `p${String(counter)}`,
    employeeNo: `E-${String(counter)}`,
    name,
    jobTitle: "Engineer",
    department: "Engineering",
    workLocation: null,
    status: "ACTIVE",
    reports,
    totalBelow: reports.reduce((sum, r) => sum + 1 + r.totalBelow, 0),
    ...more,
  };
};

const company = () =>
  person("Amara Nwachukwu", [
    person("Adaeze Okonkwo", [
      person("Chidi Nwosu", [person("Deep Report"), person("Other Deep")]),
      person("Emeka Anyanwu"),
    ]),
    person("Tunde Bakare"),
  ]);

const names = () =>
  screen
    .queryAllByRole("link")
    .map((link) => link.textContent)
    .filter(Boolean);

describe("the reporting chart", () => {
  it("opens on the top person and their reports, and says how many it is not showing", () => {
    render(<ReportingChart roots={[company()]} query="" />);
    expect(names()).toEqual([
      "Amara Nwachukwu",
      "Adaeze Okonkwo",
      "Chidi Nwosu",
      "Emeka Anyanwu",
      "Tunde Bakare",
    ]);
    expect(screen.getByText("Showing 5 of 7 people")).toBeInTheDocument();
  });

  it("links every card to that person's record", () => {
    render(<ReportingChart roots={[company()]} query="" />);
    const link = screen.getByRole("link", { name: "Adaeze Okonkwo" });
    expect(link.getAttribute("href")).toMatch(/^\/people\/p\d+$/);
  });

  it("shows job title and department on the card", () => {
    render(
      <ReportingChart
        roots={[
          person("Solo", [], {
            jobTitle: "Head of Treasury",
            department: "Finance",
            workLocation: "Lagos HQ",
          }),
        ]}
        query=""
      />,
    );
    expect(screen.getByText("Head of Treasury")).toBeInTheDocument();
    expect(screen.getByText("Finance · Lagos HQ")).toBeInTheDocument();
  });

  it("says so, in words, when a card has no department", () => {
    render(
      <ReportingChart
        roots={[person("Solo", [], { department: null })]}
        query=""
      />,
    );
    expect(screen.getByText("No department")).toBeInTheDocument();
  });

  describe("opening and closing a branch", () => {
    it("tells a closed manager from a person with nobody below them", () => {
      render(<ReportingChart roots={[company()]} query="" />);
      const open = screen.getByRole("button", {
        name: "Show the 2 people under Chidi Nwosu",
      });
      expect(open).toHaveAttribute("aria-expanded", "false");
      expect(open).toHaveTextContent("2");
      /* Emeka manages nobody, so there is nothing to open. */
      expect(
        screen.queryByRole("button", { name: /under Emeka Anyanwu/ }),
      ).toBeNull();
    });

    it("opens it, and closes it again", async () => {
      const user = userEvent.setup();
      render(<ReportingChart roots={[company()]} query="" />);
      await user.click(
        screen.getByRole("button", { name: /Show the 2 people under Chidi/ }),
      );
      expect(names()).toContain("Deep Report");
      expect(names()).toContain("Other Deep");

      await user.click(
        screen.getByRole("button", {
          name: "Hide the people under Chidi Nwosu",
        }),
      );
      expect(names()).not.toContain("Deep Report");
    });

    it("keeps the button out of the link", () => {
      render(<ReportingChart roots={[company()]} query="" />);
      const button = screen.getByRole("button", { name: /under Chidi Nwosu/ });
      expect(button.closest("a")).toBeNull();
      for (const link of screen.getAllByRole("link")) {
        expect(within(link).queryByRole("button")).toBeNull();
      }
    });

    it("expands everything, and collapses back to the top", async () => {
      const user = userEvent.setup();
      render(<ReportingChart roots={[company()]} query="" />);

      await user.click(screen.getByRole("button", { name: "Expand all" }));
      expect(names()).toContain("Deep Report");
      expect(screen.getByText("Showing 7 of 7 people")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Collapse all" }));
      expect(names()).toEqual([
        "Amara Nwachukwu",
        "Adaeze Okonkwo",
        "Tunde Bakare",
      ]);
    });
  });

  describe("searching", () => {
    it("shows the match with the people above it, and nobody else", () => {
      render(<ReportingChart roots={[company()]} query="deep report" />);
      expect(names()).toEqual([
        "Amara Nwachukwu",
        "Adaeze Okonkwo",
        "Chidi Nwosu",
        "Deep Report",
      ]);
      expect(
        screen.getByText("1 match, with the people above them"),
      ).toBeInTheDocument();
    });

    it("finds a person inside a branch that was closed", () => {
      render(<ReportingChart roots={[company()]} query="other deep" />);
      expect(names()).toContain("Other Deep");
    });

    it("offers nothing to open or close while searching", () => {
      render(<ReportingChart roots={[company()]} query="chidi" />);
      expect(screen.queryByRole("button", { name: "Expand all" })).toBeNull();
      expect(screen.queryByRole("button", { name: /under/ })).toBeNull();
    });

    it("says when nothing matches rather than drawing an empty box", () => {
      render(<ReportingChart roots={[company()]} query="zzz" />);
      expect(screen.getByText("Nothing matches “zzz”.")).toBeInTheDocument();
      expect(screen.queryByRole("region")).toBeNull();
    });
  });

  describe("a company where nobody has a manager set", () => {
    const roots = [person("Ada"), person("Bayo"), person("Chi")];

    it("hangs them from one card that says so, and explains why", () => {
      render(<ReportingChart roots={roots} query="" />);
      expect(screen.getByText("No manager set")).toBeInTheDocument();
      expect(screen.getByText("3 people in all")).toBeInTheDocument();
      expect(
        screen.getByText(/have no manager set on their record/),
      ).toBeInTheDocument();
      expect(names()).toEqual(["Ada", "Bayo", "Chi"]);
    });

    it("makes that card a label, not a link or a person", () => {
      render(<ReportingChart roots={roots} query="" />);
      const group = screen.getByText("No manager set").closest("div");
      expect(group?.querySelector("a")).toBeNull();
      expect(screen.getByText("Showing 3 of 3 people")).toBeInTheDocument();
    });
  });

  describe("zooming", () => {
    it("steps in and out, and stops at either end", async () => {
      const user = userEvent.setup();
      render(<ReportingChart roots={[company()]} query="" />);
      expect(screen.getByText("100%")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Zoom in" }));
      expect(screen.getByText("125%")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Zoom out" }));
      await user.click(screen.getByRole("button", { name: "Zoom out" }));
      expect(screen.getByText("80%")).toBeInTheDocument();
      for (let step = 0; step < 4; step += 1) {
        const out = screen.getByRole("button", { name: "Zoom out" });
        if (!(out as HTMLButtonElement).disabled) await user.click(out);
      }
      expect(screen.getByText("50%")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    });
  });

  it("can be scrolled from the keyboard", () => {
    render(<ReportingChart roots={[company()]} query="" />);
    const region = screen.getByRole("region");
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveAccessibleName(/arrow keys/);
  });
});
