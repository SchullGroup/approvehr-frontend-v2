import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WIDGET_COMPONENTS } from "@/app/(app)/dashboard/widgets";
import type { ReportHeadline } from "@/lib/api/company-report";
import type { DashboardData, ReportsData } from "@/lib/api/insights";
import { printableCompanyHeadline } from "@/lib/api/company-report";

/**
 * The owner's banner draws one sentence when the company report has one, and
 * nothing at all otherwise.
 *
 * "Nothing" is asserted as an **empty container**, the precondition the
 * dashboard grid's `empty:hidden` depends on (see `dashboard-widgets.test.tsx`).
 * The retired explorer rule is in the list on purpose: it named a department as
 * the weakest task-logger when it was only the one anybody had graded a task
 * for, and an API that has not been redeployed still sends it. This build must be
 * silent about it whatever the API does, and about any rule it does not know.
 */

const gate = vi.hoisted(() => ({
  connected: true,
  canEditRecords: true,
  answer: undefined as unknown,
  fail: false,
}));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: gate.connected }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => gate.canEditRecords,
  usePermissions: () => ({ can: () => gate.canEditRecords, loading: false }),
}));
vi.mock("@/lib/api/company-report", async (original) => ({
  ...(await original<typeof import("@/lib/api/company-report")>()),
  companyReportApi: {
    headline: () =>
      gate.fail
        ? Promise.reject(new Error("503"))
        : Promise.resolve(gate.answer),
  },
}));

const EMPTY: DashboardData = {
  asOf: "2026-10-23T09:00:00.000Z",
  announcements: { notices: [], total: 0 },
};

const headline = (rule: string, sentence = "A sentence."): ReportHeadline =>
  ({
    rule,
    sentence,
    figure: { n: 1, of: 2 },
    firstStep: { sentence: "Do it." },
  }) as ReportHeadline;

async function renderBanner() {
  const Widget = WIDGET_COMPONENTS["workforce-headline"];
  if (!Widget) throw new Error("No component for workforce-headline");
  const view = render(
    <Widget
      dashboard={EMPTY}
      reports={null as ReportsData | null}
      reportsLoading={false}
    />,
  );
  // Let the hook's read settle.
  await new Promise((resolve) => setTimeout(resolve, 20));
  return view;
}

beforeEach(() => {
  gate.connected = true;
  gate.canEditRecords = true;
  gate.answer = undefined;
  gate.fail = false;
});

describe("the company report headline banner", () => {
  it("draws the sentence, with a link to the report", async () => {
    gate.answer = {
      headline: headline(
        "H1",
        "5 of the 7 marks the Fairness check flagged still need a decision.",
      ),
    };
    const { findByText, getByRole } = await renderBanner();
    expect(await findByText(/5 of the 7 marks/)).toBeInTheDocument();
    expect(
      getByRole("link", { name: /Open the company report/ }),
    ).toHaveAttribute("href", "/reports/company");
  });

  it("draws NOTHING when the API has no headline", async () => {
    gate.answer = {};
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it("draws NOTHING for the retired explorer rule, even if an older API still sends it", async () => {
    gate.answer = {
      headline: headline(
        "task-intensity-outlier",
        "Engineering has the weakest task-logging this cycle.",
      ),
    };
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it("draws NOTHING when the read fails, and NOTHING without EDIT_RECORDS", async () => {
    gate.fail = true;
    expect((await renderBanner()).container).toBeEmptyDOMElement();
    gate.fail = false;
    gate.canEditRecords = false;
    gate.answer = { headline: headline("H1") };
    expect((await renderBanner()).container).toBeEmptyDOMElement();
  });
});

describe("printableCompanyHeadline", () => {
  it("prints the five rules this build knows and nothing else", () => {
    for (const rule of ["H1", "H2", "H3", "H4", "H5"]) {
      expect(printableCompanyHeadline(headline(rule))).not.toBeNull();
    }
    expect(printableCompanyHeadline(headline("H6"))).toBeNull();
    expect(printableCompanyHeadline(headline("none"))).toBeNull();
    expect(printableCompanyHeadline(headline("H1", "  "))).toBeNull();
    expect(printableCompanyHeadline(null)).toBeNull();
    expect(printableCompanyHeadline(undefined)).toBeNull();
  });
});
