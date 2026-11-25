import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { stepLine } from "@/components/performance/your-appraisal";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  progress: null as unknown,
  unavailable: false,
  cycles: [{ id: "c1", name: "H2", stage: "SELF" }] as unknown[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  usePathname: () => "/performance",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useAppraisals: () => ({ cycles: state.cycles, mine: { toComplete: [] } }),
  useAppraisalProgress: () => ({
    progress: state.progress,
    unavailable: state.unavailable,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

const step = (label: string, done: boolean) => ({
  key: label,
  label,
  total: 1,
  answered: done ? 1 : 0,
  done,
});
const mine = (over: Record<string, unknown> = {}) => ({
  reviewId: "r1",
  submitted: false,
  currentStep: "core",
  steps: [
    step("Questions", true),
    step("Core competencies", false),
    step("Behavioural competencies", false),
    step("Review and submit", false),
  ],
  ...over,
});

const { YourAppraisal } =
  await import("@/components/performance/your-appraisal");
const mount = () =>
  render(
    <ToastProvider>
      <YourAppraisal />
    </ToastProvider>,
  );

beforeEach(() => {
  state.unavailable = false;
  state.cycles = [{ id: "c1", name: "H2", stage: "SELF" }];
  state.progress = { cycleId: "c1", mine: mine(), team: null };
});

describe("Your appraisal", () => {
  it("says which step, in one line, with Continue to the form", () => {
    expect(stepLine(mine() as never)).toBe("Step 2 of 4: Core competencies");
    mount();
    expect(screen.getByText("Step 2 of 4: Core competencies")).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      "/performance/reviews/r1/answer",
    );
  });

  it("says Start before anything is done, and has no step line when sent", () => {
    state.progress = {
      mine: mine({ steps: [step("Questions", false), step("Core", false)] }),
      team: null,
    };
    const { unmount } = mount();
    expect(screen.getByRole("link", { name: "Start" })).toBeVisible();
    unmount();
    state.progress = { mine: mine({ submitted: true }), team: null };
    mount();
    expect(screen.getByText("Your appraisal is sent")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Continue|Start/ })).toBeNull();
  });

  it("shows a manager their team below it", async () => {
    state.progress = {
      mine: mine(),
      team: [
        {
          employeeId: "e1",
          employeeName: "Ada",
          selfSubmitted: false,
          submitted: false,
          overallRating: null,
          locked: true,
          lockedReason: "Ada has not sent their self review yet.",
          currentStep: null,
          steps: [step("Questions", false)],
        },
      ],
    };
    mount();
    const row = screen.getByText("Ada").closest("li") as HTMLElement;
    expect(within(row).getByRole("button", { name: "Nudge" })).toBeVisible();
    expect(
      screen.getByText("Ada has not sent their self review yet."),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Continue" }));
  });

  it("draws nothing when no period is running or the API lacks the route", () => {
    state.cycles = [{ id: "c1", name: "H2", stage: "DRAFT" }];
    const { container, rerender } = mount();
    expect(container).toBeEmptyDOMElement();
    state.cycles = [{ id: "c1", name: "H2", stage: "SELF" }];
    state.unavailable = true;
    state.progress = null;
    rerender(
      <ToastProvider>
        <YourAppraisal />
      </ToastProvider>,
    );
    expect(screen.queryByText("Your appraisal")).toBeNull();
  });
});
