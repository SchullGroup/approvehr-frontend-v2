import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { personOf } from "@/components/performance/team-appraisals";
import type { ApiProgressPerson } from "@/lib/api/performance";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  nudge: vi.fn(),
  progress: null as unknown,
  unavailable: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  usePathname: () => "/performance/appraisals",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/performance")>()),
  performanceApi: { nudgePerson: (...a: unknown[]) => state.nudge(...a) },
}));
vi.mock("@/lib/store/performance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/performance")>()),
  useAppraisals: () => ({
    cycles: [{ id: "c1", name: "H2 2026", stage: "SELF" }],
    mine: {
      toComplete: [
        { id: "rev-d", kind: "MANAGER", subjectId: "e-d", cycleId: "c1" },
      ],
    },
    loading: false,
    error: null,
  }),
  useAppraisalProgress: () => ({
    progress: state.progress,
    loading: false,
    unavailable: state.unavailable,
    error: null,
    reload: () => {},
  }),
}));

const step = (key: string, done: boolean) => ({
  key,
  label: key,
  total: 1,
  answered: done ? 1 : 0,
  done,
});
const person = (over: Partial<ApiProgressPerson>): ApiProgressPerson => ({
  employeeId: "e-1",
  employeeName: "Ada",
  selfSubmitted: true,
  submitted: false,
  overallRating: null,
  locked: false,
  lockedReason: null,
  currentStep: "questions",
  steps: [step("questions", false), step("core", false)],
  ...over,
});

const { AppraisalsScreen } =
  await import("@/app/(app)/performance/appraisals/appraisals-screen");
const mount = () =>
  render(
    <ToastProvider>
      <AppraisalsScreen />
    </ToastProvider>,
  );

beforeEach(() => {
  state.unavailable = false;
  state.nudge = vi.fn().mockResolvedValue({ nudged: true });
  state.push = vi.fn();
  state.progress = {
    cycleId: "c1",
    cycleName: "H2 2026",
    stage: "SELF",
    mine: {
      reviewId: "rev-mine",
      submitted: false,
      currentStep: "core",
      steps: [step("questions", true), step("core", false)],
    },
    team: [
      person({ employeeId: "e-d", employeeName: "Dayo" }),
      person({
        employeeId: "e-e",
        employeeName: "Efe",
        selfSubmitted: false,
        locked: true,
        lockedReason: "Efe has not sent their self review yet.",
      }),
    ],
  };
});

describe("personOf", () => {
  it("is done when submitted, locked when locked, else by steps done", () => {
    expect(personOf(person({ submitted: true })).status).toBe("done");
    expect(personOf(person({ locked: true })).status).toBe("locked");
    expect(personOf(person({})).status).toBe("ready");
    expect(
      personOf(person({ steps: [step("a", true), step("b", false)] })).status,
    ).toBe("in-progress");
  });
});

describe("the appraisals screen", () => {
  it("says nothing is there, calmly, when the API does not have the route yet", () => {
    state.progress = null;
    state.unavailable = true;
    mount();
    expect(screen.getByText("Nothing to fill in right now")).toBeVisible();
    expect(screen.queryByText(/error|could not/i)).toBeNull();
  });

  it("shows my own steps and a Continue to my form", () => {
    mount();
    const link = screen.getByRole("link", { name: "Continue" });
    expect(link).toHaveAttribute(
      "href",
      "/performance/reviews/rev-mine/answer",
    );
    expect(screen.getByText("1 of 2 steps")).toBeVisible();
  });

  it("shows the team, opens a person's manager form, and says why a row is locked", async () => {
    mount();
    expect(
      screen.getByText("Efe has not sent their self review yet."),
    ).toBeVisible();
    const row = screen.getByText("Dayo").closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "Start" }));
    expect(state.push).toHaveBeenCalledWith(
      "/performance/reviews/rev-d/answer",
    );
  });

  it("nudges a locked person through the API, once", async () => {
    mount();
    const row = screen.getByText("Efe").closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "Nudge" }));
    expect(state.nudge).toHaveBeenCalledWith("c1", "e-e");
    expect(
      await within(row).findByRole("button", { name: "Reminded today" }),
    ).toBeDisabled();
  });

  it("shows the API's own refusal when a nudge is refused, and keeps the button", async () => {
    state.nudge = vi.fn().mockRejectedValue(
      Object.assign(new Error("Reminded in the last 24 hours."), {
        status: 409,
      }),
    );
    mount();
    const row = screen.getByText("Efe").closest("li") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "Nudge" }));
    expect(await screen.findByText("Not sent")).toBeVisible();
    expect(within(row).getByRole("button", { name: "Nudge" })).toBeEnabled();
  });
});
