import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiProgressPerson } from "@/lib/api/performance";

/**
 * Two things from the 25 November walkthrough that the helpers alone do not prove,
 * because the bug was in what the screens did with the answer.
 *
 * F31: progress said where somebody had got to by finished steps, so a person
 * with one of two questions answered read "Ready to start", and "Start" beside
 * "Step 1 of 2" as though they had not begun. The wording is `progress-words`;
 * this is that the two surfaces use it.
 *
 * F33: a manager's "What Chidi did this period" drawer was a title and nothing
 * under it when the work could not be shown. `whenNothing` says so, once the
 * panel has settled, and never while it is still reading.
 */

const hook = vi.hoisted(() => ({
  read: null as unknown,
  projects: { enabled: true, loading: false },
}));
vi.mock("@/lib/store/completions", () => ({
  useWorkThisCycle: () => hook.read,
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => hook.projects,
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/work-flags", () => ({
  useWorkFlags: () => ({
    on: false,
    flags: null,
    flag: vi.fn(),
    unflag: vi.fn(),
  }),
}));
vi.mock("@/app/(app)/hiring/requisitions/[id]/use-phone", () => ({
  usePhone: () => false,
}));

const { personOf } = await import("@/components/performance/team-appraisals");
const { YourAppraisalCard, stepLine } =
  await import("@/components/performance/your-appraisal");
const { WorkThisCycle } =
  await import("@/components/performance/work-this-cycle");

afterEach(() => cleanup());

const step = (label: string, total: number, answered: number) => ({
  key: label,
  label,
  total,
  answered,
  done: total > 0 && answered >= total,
});
const person = (over: Partial<ApiProgressPerson>): ApiProgressPerson =>
  ({
    employeeId: "e1",
    employeeName: "Chidi Nwosu",
    submitted: false,
    locked: false,
    lockedReason: null,
    steps: [],
    ...over,
  }) as ApiProgressPerson;

describe("F31: part-way through a step is in progress, not ready to start", () => {
  it("a person with a question answered and no step finished is in progress", () => {
    const row = person({
      steps: [step("Questions", 2, 1), step("Core", 3, 0)],
    });
    expect(personOf(row).status).toBe("in-progress");
    expect(personOf(row).answered).toBe("1 of 5 answered");
  });

  it("a person with nothing answered is still ready to start, with no count", () => {
    const row = person({ steps: [step("Questions", 2, 0)] });
    expect(personOf(row).status).toBe("ready");
    expect(personOf(row).answered).toBeNull();
  });

  it("a locked or sent form keeps its own status whatever was answered", () => {
    const steps = [step("Questions", 2, 1)];
    expect(personOf(person({ steps, locked: true })).status).toBe("locked");
    expect(personOf(person({ steps, submitted: true })).status).toBe("done");
  });

  it("the card says how much of the step is answered and offers Continue", () => {
    const mine = {
      reviewId: "r1",
      submitted: false,
      steps: [step("Questions", 2, 1), step("Core competencies", 3, 0)],
    };
    render(<YourAppraisalCard mine={mine as never} />);
    expect(
      screen.getByText("Step 1 of 2: Questions, 1 of 2 answered"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toBeInTheDocument();
    expect(stepLine(mine as never)).toBe(
      "Step 1 of 2: Questions, 1 of 2 answered",
    );
  });

  it("with nothing answered the card offers Start and no count", () => {
    const mine = {
      reviewId: "r1",
      submitted: false,
      steps: [step("Questions", 2, 0), step("Core competencies", 3, 0)],
    };
    render(<YourAppraisalCard mine={mine as never} />);
    expect(screen.getByRole("link", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2: Questions")).toBeInTheDocument();
  });
});

const nothing = (
  <p data-testid="nothing">Nothing from the project boards is shown.</p>
);
const show = (over: Partial<Parameters<typeof WorkThisCycle>[0]> = {}) =>
  render(
    <WorkThisCycle
      subjectId="e1"
      cycleId="c1"
      periodStart="2026-07-01"
      periodEnd="2026-12-31"
      subjectName="Chidi Nwosu"
      own={false}
      whenNothing={nothing}
      {...over}
    />,
  );
const answered = (data: unknown, error: unknown = null) => ({
  data,
  loading: false,
  error,
  reload: vi.fn(),
});

describe("F33: the work drawer says why it is empty, once it has settled", () => {
  beforeEach(() => {
    hook.projects = { enabled: true, loading: false };
    hook.read = answered(null);
  });

  it("says it when there is no list", () => {
    show();
    expect(screen.getByTestId("nothing")).toBeInTheDocument();
  });

  it("says it when the company does not use Projects", () => {
    hook.projects = { enabled: false, loading: false };
    show();
    expect(screen.getByTestId("nothing")).toBeInTheDocument();
  });

  it("says it when the API will not show this reader the work", () => {
    hook.read = answered(null, new ApiError(403, "forbidden", "Not yours."));
    show();
    expect(screen.getByTestId("nothing")).toBeInTheDocument();
    hook.read = answered(null, new ApiError(404, "not_found", "Not there."));
    cleanup();
    show();
    expect(screen.getByTestId("nothing")).toBeInTheDocument();
  });

  it("says nothing while the company's switches are still arriving", () => {
    hook.projects = { enabled: false, loading: true };
    show();
    expect(screen.queryByTestId("nothing")).toBeNull();
  });

  it("says nothing while the list is still being read", () => {
    hook.read = { data: null, loading: true, error: null, reload: vi.fn() };
    show();
    expect(screen.queryByTestId("nothing")).toBeNull();
  });

  it("says nothing where the caller turned the panel off", () => {
    show({ enabled: false });
    expect(screen.queryByTestId("nothing")).toBeNull();
  });

  it("draws nothing at all without it, as it always did beside a review", () => {
    const { container } = show({ whenNothing: undefined });
    expect(container).toBeEmptyDOMElement();
  });
});
