import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScorecardDialog } from "@/components/hiring/scorecard-dialog";
import { ApiError } from "@/lib/api/client";

/**
 * Handing in a scorecard, with weights.
 *
 * Every rating has a score and a weight, the weight starts at 1 so the default is the
 * plain average, and the score the ratings come to is shown as they are typed,
 * worked out the way the API works it out. What is not rated is left out of the
 * score and is not a zero.
 */

const setup = (onConfirm = vi.fn().mockResolvedValue(undefined)) => {
  const user = userEvent.setup();
  render(
    <ScorecardDialog open onClose={() => undefined} onConfirm={onConfirm} />,
  );
  return { user, onConfirm };
};

const score = (label: string) =>
  screen.getByRole("combobox", { name: `Score for ${label}` });
const weight = (label: string) =>
  screen.getByRole("textbox", { name: `Weight for ${label}` });

describe("the score so far", () => {
  it("asks for a rating before it shows a score", () => {
    setup();
    expect(
      screen.getByText("Rate something to see the score it comes to."),
    ).toBeInTheDocument();
  });

  it("is the plain average while every weight is 1", async () => {
    const { user } = setup();
    await user.selectOptions(score("Technical depth"), "5");
    await user.selectOptions(score("Communication"), "3");
    expect(
      screen.getByText(/Score so far: 4\.00 out of 5/),
    ).toBeInTheDocument();
  });

  it("counts a thing more when its weight is higher", async () => {
    const { user } = setup();
    await user.selectOptions(score("Technical depth"), "5");
    await user.selectOptions(score("Communication"), "3");
    await user.clear(weight("Technical depth"));
    await user.type(weight("Technical depth"), "2");
    /* (5 x 2 + 3 x 1) / 3 = 4.33 */
    expect(
      screen.getByText(/Score so far: 4\.33 out of 5/),
    ).toBeInTheDocument();
  });

  it("leaves out what is not rated, which is not a zero", async () => {
    const { user } = setup();
    await user.selectOptions(score("Ownership"), "4");
    expect(
      screen.getByText(/Score so far: 4\.00 out of 5/),
    ).toBeInTheDocument();
  });
});

describe("handing it in", () => {
  it("sends each rating with its weight, and the recommendation and notes as written", async () => {
    const { user, onConfirm } = setup();
    await user.selectOptions(score("Technical depth"), "5");
    await user.clear(weight("Technical depth"));
    await user.type(weight("Technical depth"), "2");
    await user.selectOptions(score("Culture fit"), "3");
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Recommendation/ }),
      "Yes",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Notes/ }),
      "  Solid  ",
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onConfirm).toHaveBeenCalledWith({
      recommendation: "YES",
      notes: "Solid",
      ratings: [
        { competency: "Technical depth", score: 5, weight: 2, comment: "" },
        { competency: "Culture fit", score: 3, weight: 1, comment: "" },
      ],
    });
  });

  it("refuses a weight of zero, which would drop the rating from the score", async () => {
    const { user, onConfirm } = setup();
    await user.selectOptions(score("Communication"), "4");
    await user.clear(weight("Communication"));
    await user.type(weight("Communication"), "0");
    expect(
      screen.getByText("Fix the weights to see the score."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(
      screen.getByText(
        "A weight of zero would drop it from the score. Use a number above 0.",
      ),
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("wants a rating or a recommendation, and says so", async () => {
    const { user, onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(
      screen.getByText("Rate at least one thing, or give a recommendation."),
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("takes a recommendation alone, and sends no ratings", async () => {
    const { user, onConfirm } = setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Recommendation/ }),
      "Strong no",
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onConfirm).toHaveBeenCalledWith({
      recommendation: "STRONG_NO",
      notes: "",
      ratings: [],
    });
  });

  it("lets a person rate something else, by name, and sends it", async () => {
    const { user, onConfirm } = setup();
    await user.click(
      screen.getByRole("button", { name: "Rate something else" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Competency" }),
      "Punctuality",
    );
    await user.selectOptions(score("Punctuality"), "2");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        ratings: [
          { competency: "Punctuality", score: 2, weight: 1, comment: "" },
        ],
      }),
    );
  });

  it("asks for a name on something rated but not named", async () => {
    const { user, onConfirm } = setup();
    await user.click(
      screen.getByRole("button", { name: "Rate something else" }),
    );
    await user.selectOptions(score("this competency"), "2");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(
      screen.getByText("Name what you are rating, or clear its score."),
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the API's refusal inside the dialog and keeps what was written", async () => {
    const refuse = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          409,
          "conflict",
          "This interview was cancelled. There is nothing to score.",
        ),
      );
    const { user } = setup(refuse);
    await user.selectOptions(score("Communication"), "4");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(
      await screen.findByText(
        "This interview was cancelled. There is nothing to score.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The scorecard was not accepted"),
    ).toBeInTheDocument();
    expect(score("Communication")).toHaveValue("4");
  });
});

describe("opening it again", () => {
  it("starts blank, so the last interview's ratings are never offered for the next", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ScorecardDialog open onClose={() => undefined} onConfirm={vi.fn()} />,
    );
    await user.selectOptions(score("Communication"), "5");
    rerender(
      <ScorecardDialog
        open={false}
        onClose={() => undefined}
        onConfirm={vi.fn()}
      />,
    );
    rerender(
      <ScorecardDialog open onClose={() => undefined} onConfirm={vi.fn()} />,
    );
    await waitFor(() => expect(score("Communication")).toHaveValue(""));
    expect(
      within(screen.getByRole("dialog")).getByText(
        "Rate something to see the score it comes to.",
      ),
    ).toBeInTheDocument();
  });
});
