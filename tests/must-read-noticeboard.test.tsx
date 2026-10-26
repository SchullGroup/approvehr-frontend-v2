import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiBoard } from "@/lib/api/announcements";

/**
 * The dashboard's noticeboard, with a notice staff must read on it.
 *
 * The one rule worth pinning: the badge is on the must-read notice and on nothing
 * else, it is a word and not a colour, and it is not the red this product keeps
 * for a failed request and a destructive act.
 */

vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));

const { AnnouncementsPanel } =
  await import("@/app/(app)/dashboard/announcements-panel");

const notice = (id: string, mandatory: boolean) => ({
  id,
  title: `Notice ${id}`,
  body: `Body ${id}`,
  pinned: false,
  mandatory,
  publishedAt: "2026-10-19T09:00:00.000Z",
  departmentNames: [],
  postedByName: "Ada Obi",
});

const board: ApiBoard = {
  notices: [notice("a", true), notice("b", false)],
  total: 2,
};

describe("the dashboard noticeboard", () => {
  it("badges the notice staff must read, and only that one", async () => {
    render(<AnnouncementsPanel board={board} />);
    await userEvent.click(screen.getByRole("button", { name: /Noticeboard/ }));

    const article = (title: string) =>
      screen.getByText(title).closest("article") as HTMLElement;
    expect(
      within(article("Notice a")).getByText("Must read"),
    ).toBeInTheDocument();
    expect(within(article("Notice b")).queryByText("Must read")).toBeNull();
  });

  it("does not draw the badge in red", async () => {
    render(<AnnouncementsPanel board={board} />);
    await userEvent.click(screen.getByRole("button", { name: /Noticeboard/ }));
    const badge = screen.getByText("Must read");
    expect(badge.className).not.toMatch(/danger|red/);
  });
});
