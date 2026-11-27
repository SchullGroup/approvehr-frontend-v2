import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppraisalPreview } from "@/app/(app)/performance/appraisal-preview/appraisal-preview";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {},
}));

const cont = () =>
  userEvent.click(screen.getByRole("button", { name: "Continue" }));

describe("the employee appraisal steps (mock-up)", () => {
  it("says nothing is saved, because its answers live in this tab and nowhere else", () => {
    /* It said "saved as you go, so you can leave and come back", under a page
       whose own description and file header say nothing is saved. */
    render(<AppraisalPreview />);
    expect(screen.getByText(/Nothing is saved or sent/)).toBeInTheDocument();
    expect(screen.queryByText(/saved as you go/i)).toBeNull();
    expect(screen.queryByText(/come back/i)).toBeNull();
  });

  it("walks questions, Core, Behavioural, then review, with a progress bar", async () => {
    render(<AppraisalPreview />);
    expect(
      screen.getByRole("heading", { name: "Answer the questions" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    await cont();
    expect(
      screen.getByRole("heading", { name: "Core competencies" }),
    ).toBeInTheDocument();
  });

  it("holds Continue until every competency on the step is rated", async () => {
    render(<AppraisalPreview />);
    await cont();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    const groups = screen.getAllByRole("radiogroup");
    for (const group of groups) {
      await userEvent.click(
        within(group).getByRole("radio", { name: /^Rating 3,/ }),
      );
    }
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("adds the Leadership step only for somebody who manages people", async () => {
    render(<AppraisalPreview />);
    await userEvent.click(screen.getByLabelText(/I manage people/));
    await cont();
    for (const title of ["Core competencies", "Behavioural competencies"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      for (const group of screen.getAllByRole("radiogroup")) {
        await userEvent.click(
          within(group).getByRole("radio", { name: /^Rating 4,/ }),
        );
      }
      await cont();
    }
    expect(
      screen.getByRole("heading", { name: "Leadership" }),
    ).toBeInTheDocument();
  });
});

describe("the rating buttons", () => {
  it("are numbers on one line, with the names in a legend once", async () => {
    render(<AppraisalPreview />);
    await cont();
    expect(
      screen.getByText(
        "1 Unsatisfactory · 2 Below Expectations · 3 Meets Expectations · 4 Exceeds Expectations · 5 Exceptional",
      ),
    ).toBeVisible();
    const first = screen.getAllByRole("radiogroup")[0] as HTMLElement;
    const radios = within(first).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Rating 1, Unsatisfactory",
      "Rating 2, Below Expectations",
      "Rating 3, Meets Expectations",
      "Rating 4, Exceeds Expectations",
      "Rating 5, Exceptional",
    ]);
    expect(first.style.gridTemplateColumns).toBe("repeat(5, minmax(0, 1fr))");
  });
});
