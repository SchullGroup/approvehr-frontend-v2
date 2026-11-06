import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import type {
  ApiChoiceOption,
  ApiCompetency,
  ReviewAudience,
} from "@/lib/api/performance";
import { WRITTEN_NEVER_COUNTS } from "@/lib/performance/answer-kind";
import { NEW_VERSION_BUTTON } from "@/lib/performance/new-version";
import type { SubsectionAsk } from "@/lib/performance/subsection-ask";

/**
 * A subsection answered in the person's own words, set from the panel under it.
 *
 * It is the one kind that is never scored, so the panel's whole job here is to not
 * claim otherwise: no choices to give it, no line saying how much of the mark an
 * answer recorded on it is worth, one sentence saying it never counts, and the same
 * "Ask it on the review form" control as the others with the lines under it true of
 * words. `tsc` cannot see any of that. A wrong sentence is a well-typed string.
 */

let updateCompetency: Mock<(...args: unknown[]) => Promise<unknown>>;
let onAsk: Mock<(...args: unknown[]) => Promise<void>>;
let onStop: Mock<(...args: unknown[]) => Promise<void>>;
let held: ReviewAudience[] | null;

vi.mock("@/lib/store/performance", () => ({
  useFrameworkActions: () => ({
    updateCompetency: (...args: unknown[]) => updateCompetency(...args),
    setChoiceOptions: vi.fn().mockResolvedValue({}),
  }),
}));

const { DirectAnswerPanel } =
  await import("@/app/(app)/performance/direct-answer-panel");

const competency = (over: Partial<ApiCompetency> = {}): ApiCompetency => ({
  id: "c1",
  name: "Communication",
  sectionId: "s1",
  sectionName: "Behavioural competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
  answerKind: "TEXT",
  ...over,
});

const OLD_CHOICES: ApiChoiceOption[] = [
  { id: "o1", label: "Meets", scoreBp: 6000, sortOrder: 0 },
  { id: "o2", label: "Exceeds", scoreBp: 10000, sortOrder: 1 },
];

const ask = (over: Partial<SubsectionAsk> = {}): SubsectionAsk => ({
  periodName: "H2 2026 Appraisal",
  draft: true,
  askedOf: () => held,
  onAsk: (...args) => onAsk(...args),
  onStop: (...args) => onStop(...args),
  ...over,
});

const show = (
  subject: ApiCompetency = competency(),
  props: Partial<React.ComponentProps<typeof DirectAnswerPanel>> = {},
) => {
  const onChanged = vi.fn();
  render(
    <ToastProvider>
      <DirectAnswerPanel
        competency={subject}
        section={{ name: "Behavioural competency", weightBp: 3000 }}
        editable
        whyNot={null}
        onChanged={onChanged}
        ask={ask()}
        {...props}
      />
    </ToastProvider>,
  );
  return { onChanged };
};

const kindSelect = () =>
  screen.getByLabelText("How it is answered") as HTMLSelectElement;
const askSelect = () =>
  screen.getByLabelText("Ask it on the review form") as HTMLSelectElement;
const ADD = "Add to the review form";

beforeEach(() => {
  updateCompetency = vi.fn().mockResolvedValue({});
  onAsk = vi.fn().mockResolvedValue(undefined);
  onStop = vi.fn().mockResolvedValue(undefined);
  held = null;
});

describe("how it is answered", () => {
  it("offers In their own words as the fourth way, and shows it when the subsection has it", () => {
    show();
    expect(
      within(kindSelect())
        .getAllByRole("option")
        .map((one) => one.textContent),
    ).toEqual([
      "A level on a scale, 1 to 5",
      "Yes or no",
      "Pick one from a list",
      "In their own words",
    ]);
    expect(kindSelect().value).toBe("TEXT");
  });

  it("is written the moment it is picked, as the others are, in `answerKind`", async () => {
    const { onChanged } = show(competency({ answerKind: "RATING" }));
    await userEvent.selectOptions(kindSelect(), "In their own words");

    await waitFor(() =>
      expect(updateCompetency).toHaveBeenCalledWith("c1", {
        answerKind: "TEXT",
      }),
    );
    expect(updateCompetency).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    /* The picker shows what was accepted at once, and says what it means. */
    await waitFor(() => expect(kindSelect().value).toBe("TEXT"));
    expect(screen.getByText(WRITTEN_NEVER_COUNTS)).toBeInTheDocument();
  });

  it("says once, and in the one sentence, that it is read by people and never counts", () => {
    show();
    expect(screen.getAllByText(WRITTEN_NEVER_COUNTS)).toHaveLength(1);
  });

  it("does not say it of a level, a yes or no or a pick", () => {
    for (const answerKind of ["RATING", "BOOLEAN", "CHOICE"] as const) {
      const { unmount } = render(
        <ToastProvider>
          <DirectAnswerPanel
            competency={competency({
              answerKind,
              choiceOptions: OLD_CHOICES,
            })}
            section={null}
            editable
            whyNot={null}
            onChanged={() => {}}
          />
        </ToastProvider>,
      );
      expect(screen.queryByText(WRITTEN_NEVER_COUNTS)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("promises no target, no gap and no score, which words cannot have", () => {
    show();
    expect(screen.queryByText(/target/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gap list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/heatmap/i)).not.toBeInTheDocument();
  });

  it("has no list of choices to give it, however many the API still lists", () => {
    /* Switched to words before its first rating, it keeps the choices it had and
       the API still lists them. */
    show(competency({ choiceOptions: OLD_CHOICES }));
    expect(screen.queryByLabelText("Choice 1")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save choices" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add a choice" }),
    ).not.toBeInTheDocument();
  });
});

describe("what an answer recorded on it counts towards", () => {
  it.each([
    ["a weighted section", { name: "Behavioural competency", weightBp: 3000 }],
    ["a section that is not weighted", { name: "Culture", weightBp: null }],
    ["no section at all", null],
  ] as const)(
    "is not said for %s: it counts towards nothing in any of them",
    (_name, section) => {
      show(competency(), { section });
      /* The one sentence says "towards the mark"; these are the lines that quote what
       the section is worth, or warn that it is worth nothing. */
      expect(screen.queryByText(/of the mark/)).not.toBeInTheDocument();
      expect(screen.queryByText(/recorded (on|here)/)).not.toBeInTheDocument();
      expect(screen.queryByText(/not weighted/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/not filed under a section/),
      ).not.toBeInTheDocument();
    },
  );

  it("is still said for a yes or no in a weighted section, so the silence is the kind", () => {
    show(competency({ answerKind: "BOOLEAN" }));
    expect(
      screen.getByText(
        "Behavioural competency is 30% of the mark, and an answer recorded here counts towards it.",
      ),
    ).toBeInTheDocument();
  });
});

describe("fixed once somebody has answered, with the way through", () => {
  it("is disabled with the reason above it, and the new version beside it", () => {
    show(competency({ ratingCount: 4 }), { onStartNewVersion: vi.fn() });
    expect(kindSelect()).toBeDisabled();
    expect(
      screen.getByText(/Fixed: 4 ratings are recorded/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: NEW_VERSION_BUTTON }),
    ).toBeInTheDocument();
  });
});

describe("asking it on the review form", () => {
  it("offers the same four choices as it does for any other kind", () => {
    show();
    expect(
      within(askSelect())
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Not asked", "The manager", "The employee", "Both"]);
  });

  it("is not held back by a rule about choices, which words do not have", () => {
    /* A pick-one subsection needs two choices before it can be asked. A written one
       has none and needs none. */
    show(competency({ choiceOptions: [] }));
    for (const option of within(askSelect()).getAllByRole("option")) {
      expect(option).toBeEnabled();
    }
    expect(
      screen.queryByText("Add its choices first."),
    ).not.toBeInTheDocument();
  });

  it("puts it to the employee alone", async () => {
    show();
    await userEvent.selectOptions(askSelect(), "The employee");
    await userEvent.click(screen.getByRole("button", { name: ADD }));
    await waitFor(() => expect(onAsk).toHaveBeenCalledTimes(1));
    expect(onAsk).toHaveBeenLastCalledWith("c1", ["SELF"]);
  });

  it("puts it to both with the person first", async () => {
    show();
    await userEvent.selectOptions(askSelect(), "Both");
    await userEvent.click(screen.getByRole("button", { name: ADD }));
    await waitFor(() => expect(onAsk).toHaveBeenCalled());
    expect(onAsk).toHaveBeenLastCalledWith("c1", ["SELF", "MANAGER"]);
  });

  it("says what each choice means for words, and never that the answer counts", async () => {
    show();
    await userEvent.selectOptions(askSelect(), "The manager");
    expect(
      screen.getByText("Recorded when the manager sends their review."),
    ).toBeInTheDocument();

    await userEvent.selectOptions(askSelect(), "The employee");
    expect(
      screen.getByText("Recorded when they send their review."),
    ).toBeInTheDocument();

    await userEvent.selectOptions(askSelect(), "Both");
    expect(
      screen.getByText(
        "The manager's words are recorded. The employee's are shown beside them.",
      ),
    ).toBeInTheDocument();

    /* The lines a level has under this control, which say whose answer counts. The
       sentence under the picker above says "never counts towards the mark", so these
       are anchored to the start of their own line. */
    for (const wrong of [
      /^Their own answer counts/,
      /^The manager's answer counts/,
    ]) {
      expect(screen.queryByText(wrong)).not.toBeInTheDocument();
    }
  });

  it("says nothing for Not asked, which is the default", () => {
    show();
    expect(
      screen.queryByText(/Recorded when|are shown beside them/),
    ).not.toBeInTheDocument();
  });

  it("keeps saying that an answer counts, for a level, in the words it always did", async () => {
    show(competency({ answerKind: "RATING" }));
    await userEvent.selectOptions(askSelect(), "The employee");
    expect(
      screen.getByText("Their own answer counts towards the mark."),
    ).toBeInTheDocument();
  });

  it("takes it off the form with a DELETE, as for any other kind", async () => {
    held = ["MANAGER"];
    show();
    await userEvent.selectOptions(askSelect(), "Not asked");
    await userEvent.click(
      screen.getByRole("button", { name: "Take it off the form" }),
    );
    await waitFor(() => expect(onStop).toHaveBeenCalledWith("c1"));
    expect(onAsk).not.toHaveBeenCalled();
  });

  it("is read only once the period has started, and says so", () => {
    show(competency(), { ask: ask({ draft: false }) });
    expect(askSelect()).toBeDisabled();
    expect(
      screen.getByText(
        "H2 2026 Appraisal has started, so this can no longer change.",
      ),
    ).toBeInTheDocument();
  });
});
