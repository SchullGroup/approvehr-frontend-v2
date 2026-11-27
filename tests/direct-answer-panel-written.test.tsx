import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiChoiceOption, ApiCompetency } from "@/lib/api/performance";
import { WRITTEN_NEVER_COUNTS } from "@/lib/performance/answer-kind";
import { NEW_VERSION_BUTTON } from "@/lib/performance/new-version";

/**
 * A subsection answered in the person's own words, set from the panel under it.
 *
 * It is the one kind that is never scored, so the panel's whole job here is to not
 * claim otherwise: no choices to give it, no line saying how much of the mark an
 * answer recorded on it is worth, and the one sentence saying it never counts
 * behind the icon beside the picker. `tsc` cannot see any of that. A wrong
 * sentence is a well-typed string.
 */

/** Text that holds the sentence, wherever in a longer one it sits. */
const saysNeverCounts = (content: string) =>
  content.includes(WRITTEN_NEVER_COUNTS);

let updateCompetency: Mock<(...args: unknown[]) => Promise<unknown>>;

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
        {...props}
      />
    </ToastProvider>,
  );
  return { onChanged };
};

const kindSelect = () =>
  screen.getByLabelText("How it is answered") as HTMLSelectElement;

beforeEach(() => {
  updateCompetency = vi.fn().mockResolvedValue({});
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
    expect(screen.getByText(saysNeverCounts)).toBeInTheDocument();
  });

  it("says once, and in the one sentence, behind an icon, that it is read by people and never counts", () => {
    show();
    expect(screen.getAllByText(saysNeverCounts)).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "More about this field" }),
    ).toBeInTheDocument();
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
      expect(screen.queryByText(saysNeverCounts)).not.toBeInTheDocument();
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
      expect(screen.queryByText(/of the score/)).not.toBeInTheDocument();
      expect(screen.queryByText(/recorded (on|here)/)).not.toBeInTheDocument();
      expect(screen.queryByText(/not weighted/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/not filed under a section/),
      ).not.toBeInTheDocument();
    },
  );

  it("is not said for a yes or no in a weighted section either: only the warning is", () => {
    show(competency({ answerKind: "BOOLEAN" }));
    expect(screen.queryByText(/of the score/)).not.toBeInTheDocument();
  });

  it("warns for a yes or no that counts towards nothing, which is the one thing worth saying", () => {
    show(competency({ answerKind: "BOOLEAN" }), { section: null });
    expect(
      screen.getByText(/not filed under a section, so an answer recorded/),
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
