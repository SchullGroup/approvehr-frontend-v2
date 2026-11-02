import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiRatingScale } from "@/lib/api/performance";

/**
 * "What a mark is called" in Settings, Appraisal scoring.
 *
 * Each level has a word and a sentence about what it means, and they are two
 * fields. The edit handler used to blank the other one on every keystroke, so
 * typing a level's word erased its meaning and typing the meaning erased the
 * word, which left Save off (a level with no word cannot be saved). Nothing in
 * the types or the build can see that: the state is valid after each edit, just
 * not the one the person made.
 */

const scale: ApiRatingScale = {
  source: "saved",
  max: 5,
  levels: [
    { level: 1, label: "Below", meaning: "Missed most of what was agreed." },
    { level: 2, label: "Partly", meaning: "Met some of what was agreed." },
    { level: 3, label: "Meets", meaning: "Delivered what was agreed." },
    { level: 4, label: "Exceeds", meaning: "Delivered more than agreed." },
    { level: 5, label: "Outstanding", meaning: "Set the standard." },
  ],
};

const save = vi.fn().mockResolvedValue(scale);

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/demo", () => ({ sourceNote: () => null }));
vi.mock("@/components/portal/load-failure", () => ({
  LoadFailure: () => null,
}));
vi.mock("@/lib/store/performance", () => ({
  useRatingScale: () => ({
    scale,
    loading: false,
    error: null,
    source: "api",
    editable: true,
    refusal: "",
    save,
    reload: vi.fn(),
  }),
}));

import { RatingScaleForm } from "@/app/(app)/settings/performance/scale-form";

const wordOf = (level: number) =>
  screen.getByLabelText(`What level ${String(level)} is called`);

/* One "What it means" box per level, highest level first (the form reads from
   best to worst), so level 3 is the third box from the top. */
const meaningOf = (level: number) =>
  screen.getAllByLabelText(/What it means/)[5 - level] as HTMLTextAreaElement;

describe("a level's word and its meaning are edited separately", () => {
  it("keeps the meaning when the word is changed", async () => {
    const user = userEvent.setup();
    render(<RatingScaleForm />);

    await user.type(wordOf(3), " well");

    expect(wordOf(3)).toHaveValue("Meets well");
    expect(meaningOf(3)).toHaveValue("Delivered what was agreed.");
  });

  it("keeps the word when the meaning is changed", async () => {
    const user = userEvent.setup();
    render(<RatingScaleForm />);

    await user.type(meaningOf(3), " On time.");

    expect(meaningOf(3)).toHaveValue("Delivered what was agreed. On time.");
    expect(wordOf(3)).toHaveValue("Meets");
  });

  it("leaves every other level alone", async () => {
    const user = userEvent.setup();
    render(<RatingScaleForm />);

    await user.type(wordOf(3), "!");

    expect(wordOf(2)).toHaveValue("Partly");
    expect(meaningOf(2)).toHaveValue("Met some of what was agreed.");
    expect(wordOf(4)).toHaveValue("Exceeds");
    expect(meaningOf(4)).toHaveValue("Delivered more than agreed.");
  });

  it("can be saved after renaming a level, with its meaning still on it", async () => {
    const user = userEvent.setup();
    save.mockClear();
    render(<RatingScaleForm />);

    await user.type(wordOf(3), " well");
    await user.click(screen.getByRole("button", { name: /^Save the scale/ }));

    expect(save).toHaveBeenCalledTimes(1);
    const sent = save.mock.calls[0]?.[0] as {
      level: number;
      label: string;
      meaning: string;
    }[];
    expect(sent.find((entry) => entry.level === 3)).toEqual({
      level: 3,
      label: "Meets well",
      meaning: "Delivered what was agreed.",
    });
    expect(sent).toHaveLength(5);
  });
});
