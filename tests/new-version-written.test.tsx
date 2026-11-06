import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiCompetency, NewVersionResult } from "@/lib/api/performance";
import { WRITTEN_NEVER_COUNTS } from "@/lib/performance/answer-kind";
import {
  answeredAsWords,
  newVersionEffects,
  otherKinds,
  startedLine,
} from "@/lib/performance/new-version";

/**
 * Starting a new version of a subsection that people answer in their own words.
 *
 * The request was for the "Start a new version of Communication" dialog, whose list
 * of ways to answer offered only a yes or no and a pick from a list, to offer
 * "In their own words". What is worth a test is that it is there, that it is chosen
 * and sent as `TEXT`, that the dialog says before the press the thing that is
 * different about it (it never counts towards a mark), that it does not inherit a
 * line written for a pick (no choices to add, no draft period that stops asking),
 * and that a subsection that was written does not claim marks were made from it.
 */

let newCompetencyVersion: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
  useFrameworkActions: () => ({
    newCompetencyVersion: (...args: unknown[]) => newCompetencyVersion(...args),
  }),
}));

const { NewVersionDialog } =
  await import("@/app/(app)/performance/new-version-dialog");

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
  ratingCount: 12,
  answerKind: "RATING",
  ...over,
});

const started = (notes: string[] = []): NewVersionResult => ({
  competency: competency({ id: "c2", ratingCount: 0, answerKind: "TEXT" }),
  retired: { id: "c1", name: "Communication (retired)", ratingsKept: 12 },
  notes,
});

const show = (subject: ApiCompetency = competency()) => {
  const onClose = vi.fn();
  const onStarted = vi.fn();
  render(
    <ToastProvider>
      <NewVersionDialog
        competency={subject}
        onClose={onClose}
        onStarted={onStarted}
      />
    </ToastProvider>,
  );
  return { onClose, onStarted };
};

const kindSelect = () =>
  screen.getByLabelText(/How the new version is answered/) as HTMLSelectElement;
const confirm = () => screen.getByRole("button", { name: "Start new version" });
const WORDS = "In their own words";

beforeEach(() => {
  newCompetencyVersion = vi.fn().mockResolvedValue(started());
});

describe("the ways a new version can be answered", () => {
  it("includes their own words for a level, a yes or no and a pick, after the others", () => {
    for (const from of ["RATING", "BOOLEAN", "CHOICE"] as const) {
      expect(otherKinds(from).at(-1)).toBe("TEXT");
      expect(otherKinds(from)).toContain("TEXT");
    }
  });

  it("offers the other three for a subsection that is already written, and never its own", () => {
    expect(otherKinds("TEXT")).toEqual(["RATING", "BOOLEAN", "CHOICE"]);
  });

  it("is a way every kind has to be able to reach and leave", () => {
    for (const from of ["RATING", "BOOLEAN", "CHOICE", "TEXT"] as const) {
      expect(otherKinds(from)).toHaveLength(3);
      expect(otherKinds(from)).not.toContain(from);
    }
  });
});

describe("what starting one says, before it is pressed", () => {
  const effects = (to: Parameters<typeof newVersionEffects>[0]["to"]) =>
    newVersionEffects({ name: "Communication", ratingCount: 12, to });

  it("says, for their own words, the thing that is different: it never counts towards a mark", () => {
    const lines = effects("TEXT");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe(WRITTEN_NEVER_COUNTS);
  });

  it("says it nowhere else, so a pick or a level is not told something untrue", () => {
    for (const to of [null, "RATING", "BOOLEAN", "CHOICE"] as const) {
      expect(effects(to)).toHaveLength(3);
      expect(effects(to)).not.toContain(WRITTEN_NEVER_COUNTS);
    }
  });

  it("does not tell a written version to add its choices, or say draft periods stop asking it", () => {
    const [, , third] = effects("TEXT");
    expect(third).toContain("ask the new version in its place");
    expect(third).not.toContain("choices");
    expect(third).not.toContain("stop asking");
  });

  it("keeps saying published periods keep the old one", () => {
    expect(effects("TEXT")[2]).toContain("Published periods keep the old one");
  });

  describe("when the subsection being replaced was written", () => {
    it("does not say marks stay, because none was ever made from its words", () => {
      const [first] = newVersionEffects({
        name: "Communication",
        ratingCount: 12,
        from: "TEXT",
        to: "RATING",
      });
      expect(first).toBe(
        "Communication keeps its 12 ratings. It is marked retired and leaves this list.",
      );
      expect(first).not.toContain("every mark");
    });

    it("agrees in number", () => {
      const [first] = newVersionEffects({
        name: "Communication",
        ratingCount: 1,
        from: "TEXT",
        to: null,
      });
      expect(first).toBe(
        "Communication keeps its 1 rating. It is marked retired and leaves this list.",
      );
    });

    it("still says it is retired when there is nothing to keep", () => {
      const [first] = newVersionEffects({
        name: "Communication",
        ratingCount: 0,
        from: "TEXT",
        to: "RATING",
      });
      expect(first).toBe(
        "Communication is marked retired and leaves this list.",
      );
    });
  });

  describe("when it was another kind, or the kind is not said", () => {
    it("keeps saying every mark made from the ratings stays as it is", () => {
      for (const from of ["RATING", "BOOLEAN", "CHOICE", undefined] as const) {
        const [first] = newVersionEffects({
          name: "Communication",
          ratingCount: 12,
          from,
          to: "TEXT",
        });
        expect(first).toContain("every mark made from them stays as it is");
      }
    });
  });
});

describe("what happened", () => {
  const result = (ratingsKept: number): NewVersionResult => ({
    competency: competency({ answerKind: "TEXT" }),
    retired: { id: "old", name: "Communication (retired)", ratingsKept },
    notes: [],
  });

  it("reads a written answer as a written answer", () => {
    expect(answeredAsWords("TEXT")).toBe("a written answer");
  });

  it("names the new version as answered in words, and says what the old one kept, marks included", () => {
    expect(startedLine(result(12), "TEXT")).toBe(
      "Communication is now answered as a written answer. Communication (retired) keeps its 12 ratings and every mark made from them.",
    );
  });

  it("does not claim marks for a retired subsection that was written", () => {
    expect(startedLine(result(12), "RATING", "TEXT")).toBe(
      "Communication is now answered as a level on a scale. Communication (retired) keeps its 12 ratings.",
    );
    expect(startedLine(result(1), "BOOLEAN", "TEXT")).toBe(
      "Communication is now answered as a yes or no. Communication (retired) keeps its 1 rating.",
    );
  });

  it("does not claim ratings that were not there", () => {
    expect(startedLine(result(0), "TEXT", "RATING")).toContain(
      "Communication (retired) is kept, retired.",
    );
  });
});

describe("the dialog", () => {
  it("offers In their own words in How the new version is answered, after the other ways", () => {
    show();
    expect(
      within(kindSelect())
        .getAllByRole("option")
        .map((one) => one.textContent),
    ).toEqual([
      "Choose how it is answered",
      "Yes or no",
      "Pick one from a list",
      WORDS,
    ]);
  });

  it("offers the other three for a subsection that is already written", () => {
    show(competency({ answerKind: "TEXT" }));
    expect(
      within(kindSelect())
        .getAllByRole("option")
        .map((one) => one.textContent),
    ).toEqual([
      "Choose how it is answered",
      "A level on a scale, 1 to 5",
      "Yes or no",
      "Pick one from a list",
    ]);
  });

  it("chooses nothing for anybody: it will not go ahead until a way is chosen", () => {
    show();
    expect(kindSelect().value).toBe("");
    expect(confirm()).toBeDisabled();
  });

  it("says, on the page and before the button, that a written answer never counts, once", async () => {
    show();
    expect(screen.queryByText(WRITTEN_NEVER_COUNTS)).not.toBeInTheDocument();

    await userEvent.selectOptions(kindSelect(), WORDS);
    expect(screen.getAllByText(WRITTEN_NEVER_COUNTS)).toHaveLength(1);
    expect(screen.getByText(WRITTEN_NEVER_COUNTS)).toBeVisible();
    expect(confirm()).toBeEnabled();
  });

  it("takes the sentence away again when another way is chosen, because it was about this one", async () => {
    show();
    await userEvent.selectOptions(kindSelect(), WORDS);
    await userEvent.selectOptions(kindSelect(), "Yes or no");
    expect(screen.queryByText(WRITTEN_NEVER_COUNTS)).not.toBeInTheDocument();
  });

  it("does not talk of choices or of periods that stop asking, for words", async () => {
    show();
    await userEvent.selectOptions(kindSelect(), WORDS);
    expect(screen.getByText(/ask the new version in its place/)).toBeVisible();
    expect(screen.queryByText(/add its choices/)).not.toBeInTheDocument();
    expect(screen.queryByText(/stop asking it/)).not.toBeInTheDocument();
  });

  it("sends the subsection and TEXT, once, when it is started", async () => {
    show();
    await userEvent.selectOptions(kindSelect(), WORDS);
    await userEvent.click(confirm());

    await waitFor(() => expect(newCompetencyVersion).toHaveBeenCalledTimes(1));
    expect(newCompetencyVersion).toHaveBeenCalledWith("c1", "TEXT");
  });

  it("tells the owner of the list which way it was answered", async () => {
    const result = started();
    newCompetencyVersion.mockResolvedValue(result);
    const { onStarted } = show();
    await userEvent.selectOptions(kindSelect(), WORDS);
    await userEvent.click(confirm());

    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(onStarted).toHaveBeenCalledWith(result, "TEXT");
  });

  it("says the new version is a written answer, with the API's own sentences, until Done", async () => {
    const notes = ['"H2 2026 Appraisal" asks the new one.'];
    newCompetencyVersion.mockResolvedValue(started(notes));
    show();
    await userEvent.selectOptions(kindSelect(), WORDS);
    await userEvent.click(confirm());

    expect(
      await screen.findByRole("dialog", {
        name: "Started a new version of Communication",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Communication is now answered as a written answer. Communication (retired) keeps its 12 ratings and every mark made from them.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(notes[0] as string)).toBeInTheDocument();
  });

  it("does not claim marks when the one it retired was written", async () => {
    newCompetencyVersion.mockResolvedValue({
      competency: competency({
        id: "c2",
        ratingCount: 0,
        answerKind: "RATING",
      }),
      retired: { id: "c1", name: "Communication (retired)", ratingsKept: 3 },
      notes: ["A period asks the new one."],
    } satisfies NewVersionResult);
    show(competency({ answerKind: "TEXT", ratingCount: 3 }));
    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");

    /* Before the press, in the lines under the picker. */
    expect(
      screen.getByText(
        "Communication keeps its 3 ratings. It is marked retired and leaves this list.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/every mark made from/)).not.toBeInTheDocument();

    await userEvent.click(confirm());
    /* And after it, in the line that says what happened. */
    expect(
      await screen.findByText(
        "Communication is now answered as a level on a scale. Communication (retired) keeps its 3 ratings.",
      ),
    ).toBeInTheDocument();
  });

  it("still says marks stay for a subsection that was a level", () => {
    show(competency({ answerKind: "RATING" }));
    expect(
      screen.getByText(/every mark made from them stays as it is/),
    ).toBeVisible();
  });
});
