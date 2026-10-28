import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiChoiceOption, ApiCompetency } from "@/lib/api/performance";
import {
  GIVE_A_LABEL,
  KIND_FROZEN,
  SCORE_RANGE,
} from "@/lib/performance/answer-kind";

/**
 * How one subsection is answered, set from the panel under it.
 *
 * `tsc` cannot see any of what matters here. A kind written to the wrong field, a
 * list of choices sent without the ids the API keys them on, a frozen kind that
 * still lets somebody try, and a refusal replaced by "Something went wrong" are
 * all well-typed. Each is what a person finds by pressing the button.
 */

let updateCompetency: Mock<(...args: unknown[]) => Promise<unknown>>;
let setChoiceOptions: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
  useFrameworkActions: () => ({
    updateCompetency: (...args: unknown[]) => updateCompetency(...args),
    setChoiceOptions: (...args: unknown[]) => setChoiceOptions(...args),
  }),
}));

const { DirectAnswerPanel } =
  await import("@/app/(app)/performance/direct-answer-panel");

const competency = (over: Partial<ApiCompetency> = {}): ApiCompetency => ({
  id: "c1",
  name: "Punctuality",
  sectionId: "s1",
  sectionName: "Core competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
  ...over,
});

const option = (
  id: string,
  label: string,
  scoreBp: number,
  sortOrder: number,
): ApiChoiceOption => ({ id, label, scoreBp, sortOrder });

const TWO = [option("o1", "Exceeds", 10000, 0), option("o2", "Meets", 6000, 1)];
const THREE = [...TWO, option("o3", "Falls short", 2000, 2)];

const pickList = (options: ApiChoiceOption[] = TWO) =>
  competency({ answerKind: "CHOICE", choiceOptions: options });

const show = (
  subject: ApiCompetency,
  props: Partial<React.ComponentProps<typeof DirectAnswerPanel>> = {},
) => {
  const onChanged = vi.fn();
  const view = render(
    <ToastProvider>
      <DirectAnswerPanel
        competency={subject}
        section={{ name: "Core competency", weightBp: 4000 }}
        editable
        whyNot={null}
        onChanged={onChanged}
        {...props}
      />
    </ToastProvider>,
  );
  return { onChanged, ...view };
};

const kindSelect = () =>
  screen.getByLabelText("How it is answered") as HTMLSelectElement;

beforeEach(() => {
  updateCompetency = vi.fn().mockResolvedValue({});
  setChoiceOptions = vi.fn().mockResolvedValue({});
});

describe("how it is answered", () => {
  it("offers the three ways and shows the one the subsection has", () => {
    show(competency());
    expect(
      within(kindSelect())
        .getAllByRole("option")
        .map((one) => one.textContent),
    ).toEqual([
      "A level on a scale, 1 to 5",
      "Yes or no",
      "Pick one from a list",
    ]);
    expect(kindSelect().value).toBe("RATING");
  });

  it("reads a subsection that does not say as a level, which is what an older server means", () => {
    show(competency({ answerKind: undefined }));
    expect(kindSelect().value).toBe("RATING");
  });

  it("is written the moment another is picked, and the framework is asked again", async () => {
    const { onChanged } = show(competency());
    await userEvent.selectOptions(kindSelect(), "Yes or no");
    await waitFor(() =>
      expect(updateCompetency).toHaveBeenCalledWith("c1", {
        answerKind: "BOOLEAN",
      }),
    );
    expect(updateCompetency).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("says, for each kind, what it means and where it is not shown", () => {
    const { unmount } = show(competency());
    expect(
      screen.getByText(/A level from 1 to 5, with a target if one is set/),
    ).toBeInTheDocument();
    unmount();

    show(competency({ answerKind: "BOOLEAN" }));
    expect(
      screen.getByText(
        /Yes scores 100% and no scores 0%.*left out of the gap list and the heatmap/,
      ),
    ).toBeInTheDocument();
  });

  it("is fixed once a rating exists, and says why before anybody tries", () => {
    show(competency({ ratingCount: 3 }));
    expect(kindSelect()).toBeDisabled();
    expect(screen.getByText(KIND_FROZEN)).toBeInTheDocument();
  });

  it("is not frozen, and says nothing of it, while no rating exists", () => {
    show(competency({ ratingCount: 0 }));
    expect(kindSelect()).toBeEnabled();
    expect(screen.queryByText(KIND_FROZEN)).not.toBeInTheDocument();
  });

  it("is read only, with the reason beside it, for somebody who may not change it", () => {
    show(competency(), {
      editable: false,
      whyNot:
        "Only somebody who can manage settings can change sections, subsections and how they are answered.",
    });
    expect(kindSelect()).toBeDisabled();
    expect(
      screen.getByText(
        "Only somebody who can manage settings can change sections, subsections and how they are answered.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the API's refusal as it comes and leaves the kind where it was", async () => {
    const refusal =
      '"Punctuality" is a target for "Engineer". A role\'s target is a level on a rating scale, which a yes-or-no or pick-a-list subsection does not have. Take it off that role first, or keep it rated.';
    updateCompetency.mockRejectedValue(new ApiError(409, "conflict", refusal));
    const { onChanged } = show(competency());

    await userEvent.selectOptions(kindSelect(), "Yes or no");

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    /* The picker is driven by what the API holds, so a refusal leaves it where it
       was rather than showing a kind that was not saved. */
    expect(kindSelect().value).toBe("RATING");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("says where an answer counts, and that an unweighted section counts towards none of the mark", () => {
    show(competency(), {
      section: { name: "Key result area", weightBp: null },
    });
    expect(
      screen.getByText(
        "Key result area is not weighted, so a level recorded on this counts towards no part of the mark.",
      ),
    ).toBeInTheDocument();
  });

  it("says so when the subsection is filed under no section at all", () => {
    show(competency({ sectionId: null, sectionName: null }), { section: null });
    expect(
      screen.getByText(
        "This subsection is not filed under a section, so a level recorded on it counts towards no part of the mark.",
      ),
    ).toBeInTheDocument();
  });

  it("does not offer a list of choices to a subsection answered another way", () => {
    /* Switched away from picking before its first rating, it keeps the old
       choices and the API still lists them. */
    show(competency({ answerKind: "BOOLEAN", choiceOptions: TWO }));
    expect(screen.queryByLabelText("Choice 1")).not.toBeInTheDocument();
  });
});

describe("the choices of a pick-a-list subsection", () => {
  const scoreOf = (n: number) =>
    screen.getByLabelText(
      `Score for choice ${String(n)}, as a percentage`,
    ) as HTMLInputElement;
  const labelOf = (n: number) =>
    screen.getByLabelText(`Choice ${String(n)}`) as HTMLInputElement;
  const save = () => screen.getByRole("button", { name: "Save choices" });

  it("lists what is saved, each score as a percentage, with nothing to save yet", () => {
    show(pickList());
    expect(labelOf(1).value).toBe("Exceeds");
    expect(scoreOf(1).value).toBe("100");
    expect(labelOf(2).value).toBe("Meets");
    expect(scoreOf(2).value).toBe("60");
    expect(save()).toBeDisabled();
  });

  it("saves the whole list: the ids it already has, none for a new row, numbered by position", async () => {
    const { onChanged } = show(pickList());

    await userEvent.clear(scoreOf(2));
    await userEvent.type(scoreOf(2), "65");
    await userEvent.click(screen.getByRole("button", { name: "Add a choice" }));
    await userEvent.type(labelOf(3), "Falls short");
    await userEvent.type(scoreOf(3), "20");
    await userEvent.click(save());

    await waitFor(() => expect(setChoiceOptions).toHaveBeenCalledTimes(1));
    expect(setChoiceOptions).toHaveBeenCalledWith("c1", [
      { id: "o1", label: "Exceeds", scoreBp: 10000, sortOrder: 0 },
      { id: "o2", label: "Meets", scoreBp: 6500, sortOrder: 1 },
      { label: "Falls short", scoreBp: 2000, sortOrder: 2 },
    ]);
    expect(await screen.findByText("Choices saved")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("changes the order that is sent when a choice is moved", async () => {
    show(pickList());
    await userEvent.click(
      screen.getByRole("button", { name: "Move choice 2 up" }),
    );
    expect(labelOf(1).value).toBe("Meets");
    await userEvent.click(save());

    await waitFor(() => expect(setChoiceOptions).toHaveBeenCalled());
    expect(setChoiceOptions).toHaveBeenCalledWith("c1", [
      { id: "o2", label: "Meets", scoreBp: 6000, sortOrder: 0 },
      { id: "o1", label: "Exceeds", scoreBp: 10000, sortOrder: 1 },
    ]);
  });

  it("leaves a removed choice out of the list, which is how the API archives it", async () => {
    show(pickList(THREE));
    await userEvent.click(
      screen.getByRole("button", { name: "Remove choice 3" }),
    );
    await userEvent.click(save());

    await waitFor(() => expect(setChoiceOptions).toHaveBeenCalled());
    const sent = setChoiceOptions.mock.calls[0]?.[1] as { id?: string }[];
    expect(sent.map((row) => row.id)).toEqual(["o1", "o2"]);
  });

  it("offers no way to go below two choices", () => {
    show(pickList(TWO));
    expect(
      screen.queryByRole("button", { name: /^Remove choice/ }),
    ).not.toBeInTheDocument();
  });

  it("refuses an empty label and a score that is not one, before the API is asked, in the API's own sentences", async () => {
    show(pickList());
    await userEvent.click(screen.getByRole("button", { name: "Add a choice" }));
    await userEvent.click(save());

    expect(await screen.findByText(GIVE_A_LABEL)).toBeInTheDocument();
    expect(screen.getByText(SCORE_RANGE)).toBeInTheDocument();
    expect(setChoiceOptions).not.toHaveBeenCalled();
  });

  it("does not clamp a score over 100, it refuses it", async () => {
    show(pickList());
    await userEvent.clear(scoreOf(1));
    await userEvent.type(scoreOf(1), "150");
    await userEvent.click(save());

    expect(await screen.findByText(SCORE_RANGE)).toBeInTheDocument();
    expect(setChoiceOptions).not.toHaveBeenCalled();
  });

  it("shows a refusal from the API as it comes and keeps what was typed", async () => {
    const refusal =
      '"Meets" has already been picked in ratings, so changing its score would change marks people were already given. Keep its score as it is, or take it out of this list and add a new choice with the score you want. Marks already given keep the score they were given.';
    setChoiceOptions.mockRejectedValue(new ApiError(409, "conflict", refusal));
    show(pickList());

    await userEvent.clear(scoreOf(2));
    await userEvent.type(scoreOf(2), "65");
    await userEvent.click(save());

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    /* A refusal is about the set as it stands. Throwing the rows away would make
       somebody retype the ones that were fine. */
    expect(scoreOf(2).value).toBe("65");
    expect(labelOf(1).value).toBe("Exceeds");
  });

  it("asks for choices when it has none, and starts with two blank rows", () => {
    show(pickList([]));
    expect(
      screen.getByText(
        "It has no choices yet, so nobody can answer it. Give it at least two.",
      ),
    ).toBeInTheDocument();
    expect(labelOf(1).value).toBe("");
    expect(labelOf(2).value).toBe("");
  });

  it("warns, and does not refuse, when two choices share a name", async () => {
    show(pickList());
    await userEvent.clear(labelOf(2));
    await userEvent.type(labelOf(2), "exceeds");

    expect(
      screen.getByText(/Two choices are both called "Exceeds"/),
    ).toBeInTheDocument();
    await userEvent.click(save());
    await waitFor(() => expect(setChoiceOptions).toHaveBeenCalled());
  });

  it("cannot be changed by somebody who may not change it", () => {
    show(pickList(), { editable: false, whyNot: "No." });
    expect(labelOf(1)).toBeDisabled();
    expect(scoreOf(1)).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save choices" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add a choice" }),
    ).not.toBeInTheDocument();
  });

  it("starts from what the API holds again once the framework has been read again", async () => {
    const view = show(pickList());
    await userEvent.clear(scoreOf(1));
    await userEvent.type(scoreOf(1), "75");
    expect(scoreOf(1).value).toBe("75");

    /* A save reloads the framework and hands over a new list. What was typed was
       about the old one, and the rows are the API's again. */
    view.rerender(
      <ToastProvider>
        <DirectAnswerPanel
          competency={pickList([
            option("o1", "Exceeds", 9000, 0),
            option("o2", "Meets", 6000, 1),
          ])}
          section={{ name: "Core competency", weightBp: 4000 }}
          editable
          whyNot={null}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    );
    expect(scoreOf(1).value).toBe("90");
    expect(save()).toBeDisabled();
  });
});
