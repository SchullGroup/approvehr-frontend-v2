import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * With no objectives, the page says what they are worth in the score, starts
 * with the company's, and offers to ask everyone once a period exists.
 */
let cycles: { id: string; stage: string }[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/kpis",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/performance", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/performance")>()),
  useAppraisals: () => ({ cycles }),
  useCycleMutations: () => ({ notifyObjectives: vi.fn() }),
  useScoringWeights: () => ({
    weights: { rows: [{ component: "OBJECTIVES", weightBp: 3000 }] },
  }),
}));

const { EmptyObjectives } = await import("@/app/(app)/performance/kpis");
const { ToastProvider } = await import("@/components/ui");

const draw = () =>
  render(
    <ToastProvider>
      <EmptyObjectives scope="company" href="/performance/kpis/new" />
    </ToastProvider>,
  );

describe("the empty objectives page", () => {
  it("says what objectives are worth and starts with the company's", () => {
    cycles = [];
    draw();
    expect(screen.getByText(/30% of an appraisal score/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Set a company objective/ }),
    ).toHaveAttribute("href", "/performance/kpis/new");
    expect(screen.queryByRole("button", { name: /Ask everyone/ })).toBeNull();
  });

  it("offers to ask everyone once there is a period to ask them in", () => {
    cycles = [{ id: "c1", stage: "DRAFT" }];
    draw();
    expect(
      screen.getByRole("button", { name: "Ask everyone to set theirs" }),
    ).toBeInTheDocument();
  });
});
