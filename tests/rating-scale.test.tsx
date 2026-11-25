import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RatingScale, legendOf } from "@/components/ui/rating-scale";

const LEVELS = [
  { level: 1, label: "Unsatisfactory" },
  { level: 2, label: "Below Expectations" },
  { level: 3, label: "Meets Expectations" },
];

describe("RatingScale", () => {
  it("is a radiogroup of numbered buttons, each named with its number and word", () => {
    render(
      <RatingScale
        name="r"
        label="Teamwork"
        levels={LEVELS}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Teamwork" })).toBeVisible();
    expect(
      screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label")),
    ).toEqual([
      "Rating 1, Unsatisfactory",
      "Rating 2, Below Expectations",
      "Rating 3, Meets Expectations",
    ]);
  });

  it("puts the names in one legend, from the company's own levels", () => {
    render(
      <RatingScale name="r" levels={LEVELS} value={null} onChange={() => {}} />,
    );
    expect(
      screen.getByText(
        "1 Unsatisfactory · 2 Below Expectations · 3 Meets Expectations",
      ),
    ).toBeVisible();
    expect(legendOf([{ level: 4, label: "Renamed" }])).toBe("4 Renamed");
  });

  it("can leave the legend out where one already sits at the top", () => {
    render(
      <RatingScale
        name="r"
        legend={false}
        levels={LEVELS}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/1 Unsatisfactory/)).toBeNull();
  });

  it("is one row of equal columns that never wraps", () => {
    render(
      <RatingScale name="r" levels={LEVELS} value={null} onChange={() => {}} />,
    );
    expect(screen.getByRole("radiogroup").style.gridTemplateColumns).toBe(
      "repeat(3, minmax(0, 1fr))",
    );
  });

  it("marks the chosen number and reports a pick", async () => {
    const onChange = vi.fn();
    render(
      <RatingScale name="r" levels={LEVELS} value={2} onChange={onChange} />,
    );
    expect(screen.getByRole("radio", { name: /Rating 2/ })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: /Rating 3/ }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("moves with the arrow keys, as native radios do", async () => {
    const onChange = vi.fn();
    render(
      <RatingScale name="r" levels={LEVELS} value={1} onChange={onChange} />,
    );
    screen.getByRole("radio", { name: /Rating 1/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
