import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Competencies are the company's, written once on Competency ratings. The
 * button is for whoever may change settings, and opens the dialog only when
 * pressed, so the dialog's reads are not spent on every visit.
 */

let allowed = true;
vi.mock("@/lib/permissions", () => ({ useCan: () => allowed }));
const mounted = vi.fn();
vi.mock("@/app/(app)/performance/sections-dialog", () => ({
  SectionsDialog: ({ open }: { open: boolean }) => {
    mounted(open);
    return open ? <div>Competencies dialog</div> : null;
  },
}));

import { EditCompetenciesButton } from "@/app/(app)/performance/skills/edit-competencies-button";

beforeEach(() => {
  allowed = true;
  mounted.mockClear();
});

describe("EditCompetenciesButton", () => {
  it("is not there for somebody who cannot change settings", () => {
    allowed = false;
    render(<EditCompetenciesButton />);
    expect(
      screen.queryByRole("button", { name: "Edit competencies" }),
    ).toBeNull();
  });

  it("does not mount the dialog until it is pressed", () => {
    render(<EditCompetenciesButton />);
    expect(mounted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit competencies" }));
    expect(screen.getByText("Competencies dialog")).toBeTruthy();
  });
});
