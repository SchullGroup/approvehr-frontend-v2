import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiScoringParts, ScoreComponent } from "@/lib/api/performance";

/**
 * Appraisal scoring, the parts of a mark, with the Manager appraisal source.
 *
 * What is specific to it, and survives the parts being a list the company writes:
 *
 * - the API's own sentence about what weighting it does (the double count
 *   included) is drawn once, beside the part scored from it, and nowhere else;
 *   the parts read does not carry it, so it comes from the weights read and is
 *   read again after every write, because it is about the saved set;
 * - what the overall-mark card is told: a server that lists the source has the
 *   part, whether or not the company has written one from it, and says so in the
 *   company's own word when it has; a server that does not list it predates it;
 *   and with the parts not in yet, or failed, nothing is known.
 */

const SOURCES: { source: ScoreComponent; label: string }[] = [
  { source: "OBJECTIVES", label: "Delivery against objectives" },
  { source: "TASKS", label: "Weekly tasks" },
  { source: "CORE_COMPETENCY", label: "Core competencies" },
  { source: "BEHAVIOURAL_COMPETENCY", label: "Behavioural competencies" },
  { source: "LEADERSHIP", label: "Leadership" },
  { source: "MANAGER_APPRAISAL", label: "Manager appraisal" },
  { source: "SELF_ASSESSMENT", label: "Self-assessment" },
];

const NOTE = "THE API'S NOTE ABOUT MANAGER APPRAISAL";

type Part = {
  id: string;
  source: ScoreComponent;
  name: string;
  weightBp: number;
};

/** The parts read, for a server that lists these sources. */
const viewOf = (
  parts: Part[],
  { listsManager = true }: { listsManager?: boolean } = {},
): ApiScoringParts => {
  const sources = SOURCES.filter(
    (s) => listsManager || s.source !== "MANAGER_APPRAISAL",
  );
  const totalBp = parts.reduce((sum, part) => sum + part.weightBp, 0);
  return {
    parts: parts.map((part) => ({
      ...part,
      sourceLabel: sources.find((s) => s.source === part.source)!.label,
      description: null,
      shareBp:
        totalBp === 0 ? 0 : Math.round((part.weightBp * 10000) / totalBp),
    })),
    totalBp,
    sources: sources.map((s) => ({
      ...s,
      description: `About ${s.label}`,
      usedBy: parts.find((part) => part.source === s.source)?.id ?? null,
    })),
    selfAssessmentNote: "THE SELF NOTE",
  };
};

const delivery: Part = {
  id: "p-obj",
  source: "OBJECTIVES",
  name: "Delivery against objectives",
  weightBp: 6000,
};
const lineView: Part = {
  id: "p-mgr",
  source: "MANAGER_APPRAISAL",
  name: "Line view",
  weightBp: 4000,
};

/* One object per scenario, so a re-render is not mistaken for new data. */
let view: ApiScoringParts | null = viewOf([delivery, lineView]);
/* Whether the parts read has come back. Not in yet and failed both leave `parts`
   null, and neither is the same as a set that came back without the source. */
let read: "loaded" | "loading" | "failed" | "reloading" | "failed-stale" =
  "loaded";
let weightsNote: string | undefined = NOTE;
const add = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const reloadWeights = vi.fn();

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/demo", () => ({ sourceNote: () => null }));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useScoringParts: () => ({
    /* "reloading" is a re-read after a save, with the last answer still held;
       "failed-stale" is a re-read that failed with the last answer still held. */
    parts: read === "loading" || read === "failed" ? null : view,
    loading: read === "loading" || read === "reloading",
    error:
      read === "failed" || read === "failed-stale"
        ? new Error("The parts could not be read.")
        : null,
    source: "api",
    editable: true,
    refusal: "",
    add,
    update,
    remove,
    reload: vi.fn(),
  }),
  useScoringWeights: () => ({
    weights:
      weightsNote === undefined ? null : { managerAppraisalNote: weightsNote },
    loading: false,
    error: null,
    source: "api",
    editable: true,
    refusal: "",
    save: vi.fn(),
    reload: reloadWeights,
  }),
}));
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({
    overallMark: false,
    editable: true,
    loading: false,
    saving: null,
    error: null,
    setOverallMark: vi.fn(),
  }),
}));

import { ScoringWeightsForm } from "@/app/(app)/settings/performance/weights-form";

const mount = (tab: "weights" | "marks" = "weights") =>
  render(
    <ToastProvider>
      <ScoringWeightsForm scale={<p>THE SCALE FORM</p>} initialTab={tab} />
    </ToastProvider>,
  );

const row = (source: string) =>
  document.querySelector(`[data-part="${source}"]`) as HTMLElement | null;

beforeEach(() => {
  vi.clearAllMocks();
  read = "loaded";
  view = viewOf([delivery, lineView]);
  weightsNote = NOTE;
  add.mockResolvedValue({});
  update.mockResolvedValue({});
  remove.mockResolvedValue(undefined);
  window.history.replaceState(null, "", "/settings/performance");
});

describe("the part scored from Manager appraisal", () => {
  it("draws the API's sentence once, verbatim, beside the part it is about", () => {
    mount();
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
    expect(
      within(row("MANAGER_APPRAISAL")!).getByText(NOTE),
    ).toBeInTheDocument();
  });

  it("draws it on no other part's row", () => {
    mount();
    expect(within(row("OBJECTIVES")!).queryByText(NOTE)).toBeNull();
  });

  it("says nothing of its own about the double count: no sentence on the page beyond the API's", () => {
    mount();
    expect(screen.queryByText(/reaches the score both/i)).toBeNull();
    expect(screen.queryByText(/counted twice/i)).toBeNull();
  });

  it("never says it is about a moved weight: a row shows the saved one", () => {
    mount();
    expect(screen.queryByText(/Saved now, not yet changed/)).toBeNull();
  });

  it("draws no sentence when the company has no part scored from it", () => {
    view = viewOf([delivery]);
    mount();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(row("MANAGER_APPRAISAL")).toBeNull();
  });

  it("draws none where the server sends no note", () => {
    weightsNote = undefined;
    mount();
    expect(row("MANAGER_APPRAISAL")).not.toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it("is offered as a source to score a part from, with the others", async () => {
    const user = userEvent.setup();
    view = viewOf([delivery]);
    mount();
    await user.click(screen.getByRole("button", { name: "Add part" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("option", { name: "Manager appraisal" }),
    ).toBeInTheDocument();
  });

  it("is not offered when it already has a part", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Add part" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByRole("option", { name: "Manager appraisal" }),
    ).toBeNull();
  });
});

describe("the sentence is about the saved set, so a write reads it again", () => {
  it("after an edit", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Edit Line view" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(reloadWeights).toHaveBeenCalledTimes(1);
  });

  it("after an add", async () => {
    const user = userEvent.setup();
    view = viewOf([delivery]);
    mount();
    await user.click(screen.getByRole("button", { name: "Add part" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Line view");
    await user.type(within(dialog).getByLabelText("Weight"), "20");
    await user.selectOptions(
      within(dialog).getByLabelText("Scored from"),
      "MANAGER_APPRAISAL",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add part" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(reloadWeights).toHaveBeenCalledTimes(1);
  });

  it("after a delete", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Delete Line view" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete the part",
      }),
    );
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(reloadWeights).toHaveBeenCalledTimes(1);
  });

  it("not after a write the server refused", async () => {
    const user = userEvent.setup();
    update.mockRejectedValueOnce(new Error("refused"));
    mount();
    await user.click(screen.getByRole("button", { name: "Edit Line view" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(reloadWeights).not.toHaveBeenCalled();
  });
});

describe("what the form tells the overall-mark card about the part", () => {
  const header = {
    has: (label: string) =>
      `Forms do not ask for an overall mark, except a manager's form in a period that weights ${label}. Otherwise the answers stand on their own.`,
    none: "Forms do not ask for an overall mark. The answers stand on their own.",
    unknown: "Whether each form ends with a page asking for one overall mark.",
  };

  it("the company has a part scored from it: the card names the exception, in the company's own word", () => {
    mount("marks");
    expect(screen.getByText(header.has("Line view"))).toBeInTheDocument();
    expect(screen.queryByText(/is not counted in it/)).toBeNull();
  });

  it("the server lists the source and the company has no part from it yet: the card names it by the source's own name", () => {
    view = viewOf([delivery]);
    mount("marks");
    expect(
      screen.getByText(header.has("Manager appraisal")),
    ).toBeInTheDocument();
    expect(screen.queryByText(/is not counted in it/)).toBeNull();
  });

  it("the server does not list the source, so it predates the part: the card says what it always did", () => {
    view = viewOf([delivery], { listsManager: false });
    mount("marks");
    expect(screen.getByText(header.none)).toBeInTheDocument();
    expect(screen.getByText(/is not counted in it/)).toBeInTheDocument();
  });

  it.each([
    ["not in yet", "loading"],
    ["failed", "failed"],
  ] as const)(
    "the parts %s: nothing is known, so the card says nothing about whether forms ask or the mark counts",
    (_name, state) => {
      read = state;
      mount("marks");
      expect(screen.getByText(header.unknown)).toBeInTheDocument();
      expect(screen.queryByText(header.none)).toBeNull();
      expect(screen.queryByText(/is not counted in it/)).toBeNull();
      expect(screen.queryByText(/shown beside the score/)).toBeNull();
      expect(screen.queryByText(/have to give one/)).toBeNull();
      expect(
        screen.getByText(
          "The person picks one of the names below after the questions.",
        ),
      ).toBeInTheDocument();
    },
  );
});

describe("the Records tab survives the parts form", () => {
  it("is still a tab, beside the other two", () => {
    mount();
    expect(
      screen.getByRole("tab", { name: "Parts of a mark" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Names of marks" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Records" })).toBeInTheDocument();
  });
});

describe("what the parts list may say while it waits", () => {
  it("not in yet: no list, no count, no empty state and no Add button", () => {
    read = "loading";
    mount();
    expect(screen.queryByText("No parts yet")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Add (the first )?part/ }),
    ).toBeNull();
    expect(screen.queryByText(/\d%\s+of a mark/)).toBeNull();
  });

  it("failed: says it did not load, and never that there are no parts, and offers no Add button", () => {
    read = "failed";
    mount();
    expect(
      screen.getByText("The scoring parts did not load"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No parts yet")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Add (the first )?part/ }),
    ).toBeNull();
  });

  it("read again after a save: the list stays where it is, so it does not collapse under the cursor", () => {
    read = "reloading";
    mount();
    expect(row("OBJECTIVES")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Add part" }),
    ).toBeInTheDocument();
  });

  it("a read that failed with an older answer held: the failure wins over the stale list", () => {
    read = "failed-stale";
    mount();
    expect(
      screen.getByText("The scoring parts did not load"),
    ).toBeInTheDocument();
    expect(row("OBJECTIVES")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add part" })).toBeNull();
  });
});
