import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiPipelineScreening } from "@/lib/api/recruitment";
import { fakeGateway } from "./screening-helpers";

/**
 * A pipeline record says what the application it came through says.
 *
 * What these hold: a board card carries the fit score, the assessment result, the
 * flagged-answer count and the pass-mark flag from the API's card fields, and
 * nothing at all for somebody added by hand; the board's filters offer only what
 * the server's board can do (no sort, no status where it has none); and a record
 * shows the answers they gave with the flagged ones marked, read-only.
 */

const current = { gateway: fakeGateway() };
vi.mock("@/lib/hiring/screening/use-gateway", () => ({
  useScreeningGateway: () => current.gateway,
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: false, isLoading: false, user: null }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const { cardScreeningFromApi } = await import("@/lib/hiring/screening/wire");
const { PipelineFilters } =
  await import("@/components/hiring/pipeline-filters");
const { useScoreFilterState } =
  await import("@/components/hiring/screening/score-filters");
const { PipelineAnswers, extrasFromPipeline } =
  await import("@/components/hiring/screening/pipeline-answers");
const { cardMatches, cleanFilters, hasFilters, appliedChips } =
  await import("@/lib/hiring/pipeline/filters");

beforeEach(() => {
  current.gateway = fakeGateway();
});

describe("a board card's screening, from the API's fields", () => {
  it("carries the fit, the assessment, the flagged answers and the pass-mark flag", () => {
    expect(
      cardScreeningFromApi({
        jobApplicationId: "a1",
        fitScore: 71,
        scoreStatus: "SCORED",
        assessment: { percent: 48.5 },
        knockoutCount: 2,
        belowCutoff: true,
      }),
    ).toEqual({
      fit: { status: "SCORED", score: 71, version: null, stale: false },
      assessment: 48.5,
      knockoutCount: 2,
      belowPassMark: true,
    });
  });

  it("says no score as no score, never as a zero", () => {
    expect(
      cardScreeningFromApi({
        jobApplicationId: "a1",
        fitScore: null,
        scoreStatus: "NEEDS_READING",
        assessment: null,
        knockoutCount: 0,
        belowCutoff: false,
      }),
    ).toMatchObject({
      fit: { status: "NO_TEXT", score: null },
      assessment: null,
      belowPassMark: false,
    });
  });

  it("draws nothing for somebody added by hand, or from a server that predates screening", () => {
    expect(
      cardScreeningFromApi({
        jobApplicationId: null,
        fitScore: null,
        scoreStatus: null,
        knockoutCount: 0,
      }),
    ).toBeNull();
    expect(cardScreeningFromApi({ knockoutCount: 3 })).toBeNull();
  });
});

describe("narrowing a board by what the application says", () => {
  const card = (screening: Record<string, unknown> | null) =>
    ({
      id: "c1",
      name: "Ada",
      email: "ada@example.test",
      reference: null,
      source: null,
      flagged: false,
      duplicate: false,
      talentPool: false,
      tags: [],
      screening,
    }) as never;
  const with_ = (knockoutCount: number, belowPassMark: boolean) =>
    card({
      fit: { status: "SCORED", score: 60, version: null, stale: false },
      assessment: null,
      knockoutCount,
      belowPassMark,
    });

  it("keeps people with at least that many flagged answers", () => {
    expect(cardMatches(with_(2, false), { knockoutMin: 2 }, "2026-10-01")).toBe(
      true,
    );
    expect(cardMatches(with_(1, false), { knockoutMin: 2 }, "2026-10-01")).toBe(
      false,
    );
    /* Somebody added by hand has no answers to be flagged on. */
    expect(cardMatches(card(null), { knockoutMin: 1 }, "2026-10-01")).toBe(
      false,
    );
  });

  it("keeps people below the pass mark", () => {
    expect(
      cardMatches(with_(0, true), { belowCutoff: true }, "2026-10-01"),
    ).toBe(true);
    expect(
      cardMatches(with_(0, false), { belowCutoff: true }, "2026-10-01"),
    ).toBe(false);
  });

  it("counts as a filter, and says so in a chip", () => {
    expect(hasFilters({ knockoutMin: 1 })).toBe(true);
    expect(hasFilters({ belowCutoff: true })).toBe(true);
    expect(cleanFilters({ knockoutMin: 0, belowCutoff: false })).toEqual({});
    const chips = appliedChips(
      { knockoutMin: 2, belowCutoff: true },
      { tags: [], clear: () => undefined },
    );
    expect(chips.map((chip) => `${chip.label}: ${chip.value}`)).toEqual([
      "Flagged answers: 2 or more",
      "Showing: Below the pass mark",
    ]);
  });
});

function Bar({ onChange }: { onChange: (next: unknown) => void }) {
  const score = useScoreFilterState();
  return (
    <PipelineFilters
      search=""
      onSearchChange={() => undefined}
      filters={{}}
      onChange={onChange}
      tags={[]}
      score={score}
    />
  );
}

const openBar = async (onChange: (next: unknown) => void = () => undefined) => {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <Bar onChange={onChange} />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: /^Filters/ }));
  return user;
};

describe("the board's filter bar", () => {
  it("offers the sort, the status, the flagged answers and the pass mark where the board can do them", async () => {
    await openBar();
    expect(
      screen.getByRole("combobox", { name: "Sort by" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Score status" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Flagged answers" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Below the pass mark/ }),
    ).toBeInTheDocument();
  });

  it("offers no sort and no status where the server's board has neither, and keeps the rest", async () => {
    current.gateway = fakeGateway({
      mode: "api",
      supports: {
        ...fakeGateway().supports,
        boardSort: false,
        boardStatus: false,
      },
    });
    await openBar();
    expect(screen.queryByRole("combobox", { name: "Sort by" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Score status" })).toBeNull();
    expect(
      screen.getByRole("textbox", { name: /Fit score from/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Flagged answers" }),
    ).toBeInTheDocument();
  });

  it("offers none of the score fields on a server whose board has no scores", async () => {
    current.gateway = fakeGateway({
      supports: { ...fakeGateway().supports, board: false },
    });
    await openBar();
    expect(
      screen.queryByRole("combobox", { name: "Flagged answers" }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: /Below the pass mark/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: /Fit score from/ }),
    ).toBeNull();
  });

  it("sends the flagged-answer count and the pass-mark flag it was given", async () => {
    const onChange = vi.fn();
    const user = await openBar(onChange);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Flagged answers" }),
      "2 or more",
    );
    expect(onChange).toHaveBeenLastCalledWith({ knockoutMin: 2 });
    await user.click(
      screen.getByRole("checkbox", { name: /Below the pass mark/ }),
    );
    expect(onChange).toHaveBeenLastCalledWith({ belowCutoff: true });
  });
});

const screeningOf = (
  over: Partial<ApiPipelineScreening> = {},
): ApiPipelineScreening => ({
  jobApplicationId: "a1",
  applicationPath: "/careers/applications/a1",
  reference: "APP-J7ET3745",
  score: 71,
  scoreStatus: "SCORED",
  assessment: { percent: 48.5 },
  knockoutCount: 1,
  belowCutoff: true,
  cutoffReasons: ["KNOCKOUT"],
  keptInRunning: false,
  answers: [
    {
      id: "q1",
      question: "Do you have the right to work in Nigeria?",
      kind: "YES_NO",
      display: "No",
      flagged: true,
      flagReason: "Answered No to a knockout question.",
    },
    {
      id: "q2",
      question: "Notice period",
      kind: "SHORT_TEXT",
      display: "Two weeks",
      flagged: false,
      flagReason: null,
    },
    {
      id: "q3",
      question: "Portfolio",
      kind: "FILE",
      display: "",
      flagged: false,
      flagReason: null,
    },
  ],
  ...over,
});

describe("a pipeline record's answers", () => {
  it("shows what they answered with the flagged answer marked and nobody rejected for it", () => {
    render(<PipelineAnswers screening={screeningOf()} />);
    expect(screen.getByText("What they answered")).toBeInTheDocument();
    expect(
      screen.getByText("Do you have the right to work in Nigeria?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Two weeks")).toBeInTheDocument();
    expect(screen.getByText(/One answer raised a flag\./)).toBeInTheDocument();
    expect(
      screen.getByText(/nobody is rejected because of it/),
    ).toBeInTheDocument();
    const flagged = screen
      .getAllByTestId("answer-row")
      .filter((row) => row.getAttribute("data-flagged") === "true");
    expect(flagged).toHaveLength(1);
    expect(screen.getByText("APP-J7ET3745")).toBeInTheDocument();
  });

  it("reads an unanswered question as unanswered, not as an empty answer", () => {
    const extras = extrasFromPipeline(screeningOf());
    expect(extras.answers[2]?.text).toBeNull();
    expect(extras.flagCount).toBe(1);
  });

  it("draws nothing for a record with no answers and no reference", () => {
    const { container } = render(
      <PipelineAnswers
        screening={screeningOf({ answers: [], reference: null })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
