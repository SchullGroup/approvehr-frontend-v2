import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * The narrow door: what an employee on an interview panel sees, in a demo.
 *
 * A panelist holds no hiring permission, and that is the point of the page. They see
 * the interviews they were invited to and the candidates behind them: a name, the
 * role, the stage and a CV. They do not see contact details, and they score blind: a
 * panelist reads their own scorecard and nobody else's. A candidate outside their
 * reach is not a candidate they are told exists.
 *
 * In the seeded demo the employee is on two interviews: one coming up, which owes a
 * scorecard, and one that took place, which has theirs in.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: false,
    isLoading: false,
    user: null,
    organization: undefined,
    employeeId: null,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => false,
  usePermissions: () => ({ can: () => false, loading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/my-interviews",
  useSearchParams: () => new URLSearchParams(),
}));

const { MyInterviewsScreen } =
  await import("@/app/(app)/hiring/my-interviews/my-interviews-screen");
const { MyApplicationScreen } =
  await import("@/app/(app)/hiring/my-interviews/[id]/my-application-screen");

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
});

describe("my interviews", () => {
  it("says what the page shows and what it does not", async () => {
    renderInToasts(<MyInterviewsScreen />);
    expect(
      await screen.findByText(
        /You see each candidate's name, the role and their CV, and nothing else about hiring/,
      ),
    ).toBeInTheDocument();
  });

  it("starts with the interviews that are waiting for the person's scorecard", async () => {
    renderInToasts(<MyInterviewsScreen />);
    const owed = await screen.findByText("Your scorecard is owed");
    expect(owed).toBeInTheDocument();
    expect(screen.queryByText("Your scorecard is in")).not.toBeInTheDocument();
    const row = owed.closest("li") as HTMLElement;
    expect(within(row).getByText("Coming up")).toBeInTheDocument();
    /* The candidate's name, not the link to join the call that is beside it. */
    expect(
      within(row).getByRole("link", { name: /^(?!Join)\w+ \w+$/ }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/hiring\/my-interviews\/app-/),
    );
  });

  it("shows all of them on request, with the ones already scored marked", async () => {
    const user = userEvent.setup();
    renderInToasts(<MyInterviewsScreen />);
    await screen.findByText("Your scorecard is owed");
    await user.click(screen.getByRole("radio", { name: "All of mine" }));
    expect(await screen.findByText("Your scorecard is in")).toBeInTheDocument();
    expect(screen.getByText("Your scorecard is owed")).toBeInTheDocument();
  });

  it("lists the candidates they can see, with why, and how many scorecards are owed", async () => {
    renderInToasts(<MyInterviewsScreen />);
    expect(
      await screen.findByText("Candidates you can see"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Invited to interview").length).toBeGreaterThan(
      0,
    );
    /* One candidate for the interview still to come, one for the one that took place. */
    expect(screen.getAllByText("1 scorecard owed")).toHaveLength(2);
  });
});

describe("one candidate", () => {
  const open = (id: string) => renderInToasts(<MyApplicationScreen id={id} />);

  it("shows a name, the role, the stage and the interviews, and no contact details", async () => {
    open("app-01");
    expect(
      await screen.findByRole("heading", { level: 1 }),
    ).toBeInTheDocument();
    const page = document.body.textContent ?? "";
    expect(page).toContain("Technical");
    /* Name, never an address or a number. */
    expect(page).not.toMatch(/@mail\.com/);
    expect(page).not.toMatch(/\+234/);
    expect(page).not.toMatch(/salary/i);
  });

  it("says a scorecard is owed, and that scoring is blind", async () => {
    open("app-01");
    expect(
      await screen.findByText("One scorecard is waiting for you"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /you see only your own, and what everybody wrote is for the hiring manager/,
      ),
    ).toBeInTheDocument();
  });

  it("shows who else was invited and whether theirs is in, but never what they wrote", async () => {
    open("app-01");
    await screen.findByText("One scorecard is waiting for you");
    expect(screen.getByText(/Invited to score it:/)).toBeInTheDocument();
    expect(screen.queryByText("Everyone's scorecards")).not.toBeInTheDocument();
  });

  it("takes the person's scorecard, shows it back, and stops saying it is owed", async () => {
    const user = userEvent.setup();
    open("app-01");
    await user.click(
      await screen.findByRole("button", { name: "Hand in my scorecard" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Submit a scorecard",
    });
    await user.selectOptions(
      within(dialog).getByRole("combobox", {
        name: "Score for Technical depth",
      }),
      "5",
    );
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Recommendation/ }),
      "Yes",
    );
    await user.click(within(dialog).getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Your scorecard is in")).toBeInTheDocument();
    expect(await screen.findByText("Your scorecard")).toBeInTheDocument();
    expect(
      screen.getByText(/^Technical depth:/).closest("li"),
    ).toHaveTextContent("Technical depth: 5 / 5");
    expect(screen.getByText("Score 5.00")).toBeInTheDocument();
    expect(
      screen.queryByText("One scorecard is waiting for you"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hand in my scorecard" }),
    ).not.toBeInTheDocument();
    expect(demoPipeline.current().scorecards).toHaveLength(1);
  });

  it("shows one they have already handed in, with the weight where it is not 1", async () => {
    const user = userEvent.setup();
    open("app-01");
    await user.click(
      await screen.findByRole("button", { name: "Hand in my scorecard" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Score for Communication" }),
      "4",
    );
    await user.clear(
      within(dialog).getByRole("textbox", { name: "Weight for Communication" }),
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Weight for Communication" }),
      "2",
    );
    await user.click(within(dialog).getByRole("button", { name: "Submit" }));
    const line = (await screen.findByText(/^Communication:/)).closest("li");
    expect(line).toHaveTextContent("Communication: 4 / 5");
    expect(line).toHaveTextContent("counts 2 times");
  });

  it("says it is not a candidate they can see, the same way for one that does not exist", async () => {
    for (const id of ["app-07", "no-such-application"]) {
      const { unmount } = open(id);
      expect(
        await screen.findByText("That is not a candidate you can see"),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("has no CV link in a place that has no files, and says so", async () => {
    open("app-02");
    await waitFor(() =>
      expect(screen.getByText("There is no CV on file.")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Open CV" }),
    ).not.toBeInTheDocument();
  });
});
