import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Objectives and Objectives to agree are one page with one flat strip of tabs
 * (owner, 24 Nov 2026: "merge the objectives and objectives to agree subs into
 * multiple tabs in one page"): My objectives, My team, Whole company, To agree.
 * No sidebar row of its own, and the old address lands on the tab.
 */

const state = vi.hoisted(() => ({
  replace: vi.fn(),
  redirect: vi.fn(),
  editRecords: true,
  manager: true,
  appraisals: true,
  couldHaveQueue: true,
  queue: [{}, {}] as unknown[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/performance/kpis",
  redirect: (to: string) => state.redirect(to),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => state.editRecords,
  useIsManager: () => state.manager,
}));
vi.mock("@/lib/store/departments", () => ({
  useHeadedDepartmentIds: () => new Set<string>(),
}));
vi.mock("@/lib/store/features", () => ({
  useFeatures: () => ({ appraisals: state.appraisals, loading: false }),
}));
vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useObjectiveApprovals: () => ({
    queue: state.queue,
    loading: false,
    error: null,
    source: "api",
    couldHaveQueue: state.couldHaveQueue,
    reload: vi.fn(),
  }),
}));
vi.mock("@/app/(app)/performance/kpis", () => ({
  KpisTab: ({ strip }: { strip: React.ReactNode }) => (
    <div>
      {strip}
      <p>The objectives list</p>
    </div>
  ),
}));
vi.mock("@/app/(app)/performance/kpis/to-agree", () => ({
  ObjectivesToAgree: ({ strip }: { strip: React.ReactNode }) => (
    <div>
      {strip}
      <p>The queue</p>
    </div>
  ),
}));

const { KpisScreen, agreeLabel } =
  await import("@/app/(app)/performance/kpis/kpis-screen");

beforeEach(() => {
  state.replace = vi.fn();
  state.redirect = vi.fn();
  state.editRecords = true;
  state.manager = true;
  state.appraisals = true;
  state.couldHaveQueue = true;
  state.queue = [{}, {}];
});

const tabs = () =>
  screen
    .getByRole("radiogroup", { name: "Objectives or objectives to agree" })
    .querySelectorAll("[role=radio]");

describe("the strip", () => {
  it("is one flat row: Objectives and To agree with its count", () => {
    render(<KpisScreen />);
    expect([...tabs()].map((tab) => tab.textContent)).toEqual([
      "Objectives",
      "To agree (2)",
    ]);
    expect(screen.getByText("The objectives list")).toBeInTheDocument();
  });

  it("opens To agree at its own address", async () => {
    render(<KpisScreen />);
    await userEvent.click(screen.getByRole("radio", { name: "To agree (2)" }));
    expect(state.replace).toHaveBeenCalledWith("/performance/kpis?tab=agree", {
      scroll: false,
    });
  });

  it("shows the queue on ?tab=agree", () => {
    render(<KpisScreen tab="agree" />);
    expect(screen.getByText("The queue")).toBeInTheDocument();
    expect(screen.queryByText("The objectives list")).not.toBeInTheDocument();
  });

  it("offers no To agree to somebody who agrees nobody's, and ?tab=agree falls back", () => {
    state.couldHaveQueue = false;
    render(<KpisScreen tab="agree" />);
    expect(
      screen.queryByRole("radio", { name: /to agree/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("The objectives list")).toBeInTheDocument();
  });

  it("offers no To agree while appraisals are off", () => {
    state.appraisals = false;
    render(<KpisScreen />);
    expect(
      screen.queryByRole("radio", { name: /to agree/i }),
    ).not.toBeInTheDocument();
  });

  it("says the count only when something waits", () => {
    expect(agreeLabel(0)).toBe("To agree");
    expect(agreeLabel(3)).toBe("To agree (3)");
  });
});

describe("the old page", () => {
  it("lands on the tab", async () => {
    const { default: Page } =
      await import("@/app/(app)/performance/approvals/page");
    Page();
    expect(state.redirect).toHaveBeenCalledWith("/performance/kpis?tab=agree");
  });

  it("has no sidebar row", async () => {
    const { NAV } = await import("@/components/portal/nav");
    const hrefs = NAV.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).not.toContain("/performance/approvals");
  });
});
