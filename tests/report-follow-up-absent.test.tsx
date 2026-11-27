import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportTabs } from "@/app/(app)/performance/periods/[id]/report/report-screen";
import type { ApiCycleReport } from "@/lib/api/performance";

/**
 * A card that says the news is good is a card nobody needed (owner, 27 Nov
 * 2026): the follow-up lists render nothing when empty, and the tab is absent
 * when all four are.
 */

const person = (id: string, name: string) => ({
  employeeId: id,
  employeeName: name,
  jobTitle: "Analyst",
  departmentName: "Finance",
  note: "Nothing recorded.",
  reviewId: null,
  employeeComment: null,
});

const report = (over: Partial<ApiCycleReport> = {}) =>
  ({
    marks: { people: 2 },
    published: false,
    distribution: { bands: [], scored: 0, unscored: 0 },
    components: [],
    unscored: [],
    unfinalised: [],
    awaitingAcknowledgement: [],
    disputed: [],
    ...over,
  }) as unknown as ApiCycleReport;

describe("the period report's follow-up", () => {
  it("has no To follow up tab when everybody is accounted for", () => {
    render(
      <ReportTabs
        report={report()}
        register={null}
        tab="marks"
        onTab={() => {}}
      />,
    );
    expect(screen.getByRole("tab", { name: /Scores/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /To follow up/ })).toBeNull();
    expect(screen.queryByText(/Nothing outstanding/)).toBeNull();
  });

  it("falls back to Scores when a link names the missing tab", () => {
    render(
      <ReportTabs
        report={report()}
        register={null}
        tab="follow-up"
        onTab={() => {}}
      />,
    );
    expect(screen.getByRole("tab", { name: /Scores/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows only the lists that have somebody on them", () => {
    render(
      <ReportTabs
        report={report({ unfinalised: [person("e1", "Ada")] as never })}
        register={null}
        tab="follow-up"
        onTab={() => {}}
      />,
    );
    expect(
      screen.getByRole("tab", { name: /To follow up/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Written")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByText("No score")).toBeNull();
    expect(screen.queryByText("Disputed")).toBeNull();
    expect(screen.queryByText(/Nobody has disputed/)).toBeNull();
  });

  it("has no Forms and sign-off tab", () => {
    render(
      <ReportTabs
        report={report({ disputed: [person("e2", "Chidi")] as never })}
        register={null}
        tab="marks"
        onTab={() => {}}
      />,
    );
    expect(
      screen.queryByRole("tab", { name: /Forms and sign-off/ }),
    ).toBeNull();
  });
});
