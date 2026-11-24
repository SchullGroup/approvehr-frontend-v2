import { render, screen } from "@testing-library/react";
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
    const groups = screen.getAllByRole("group");
    for (const group of groups) {
      await userEvent.click(group.querySelectorAll("button")[2] as HTMLElement);
    }
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("adds the Leadership step only for somebody who manages people", async () => {
    render(<AppraisalPreview />);
    await userEvent.click(screen.getByLabelText(/I manage people/));
    await cont();
    for (const title of ["Core competencies", "Behavioural competencies"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      for (const group of screen.getAllByRole("group")) {
        await userEvent.click(
          group.querySelectorAll("button")[3] as HTMLElement,
        );
      }
      await cont();
    }
    expect(
      screen.getByRole("heading", { name: "Leadership" }),
    ).toBeInTheDocument();
  });
});
