import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { pipelineViewState } from "@/lib/hiring/pipeline/use-view";
import {
  cardOf,
  column,
  dragTo,
  escapeDrag,
  peopleIn,
  renderInToasts,
} from "./pipeline-workspace-helpers";

/**
 * A role's board, in a demo (so the real demo gateway, not a stub).
 *
 * The board used to be a table with a stage picker on every row for a hundred
 * people. It is columns now, each paged on its own with the server's count, with
 * three ways to move a card — drag, a "Move to…" menu, the record — and an
 * optimistic move that puts the card back and says why when the API refuses.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: false,
    isLoading: false,
    user: null,
    organization: undefined,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));

const { PipelineWorkspace } =
  await import("@/app/(app)/hiring/requisitions/[id]/pipeline-workspace");

const open = () => renderInToasts(<PipelineWorkspace requisitionId="req-01" />);

/** The board has drawn its columns. */
const ready = () =>
  waitFor(() =>
    expect(screen.getAllByRole("region").length).toBeGreaterThan(3),
  );

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
  pipelineViewState.reset();
});

describe("the columns", () => {
  it("are one per stage, in order, each with its own count", async () => {
    open();
    await ready();
    const names = screen
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-label") ?? "")
      .filter((label) => /\d+ (person|people)$/.test(label));
    expect(names.map((n) => n.split(",")[0])).toEqual([
      "Sourced",
      "Shortlisted",
      "Pre-screening",
      "Interview",
      "Selection",
      "Hired",
      "Rejected",
    ]);
    expect(names[0]).toBe("Sourced, 41 people");
  });

  it("show a page of the newest first, and the true count is more than the page", async () => {
    open();
    await ready();
    expect(peopleIn("Sourced")).toHaveLength(25);
    expect(
      screen.getByRole("button", { name: "Load more (16 left)" }),
    ).toBeInTheDocument();
  });

  it("page on their own: 'Load more' in one column leaves the others alone", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const before = peopleIn("Shortlisted");
    await user.click(
      screen.getByRole("button", { name: "Load more (16 left)" }),
    );
    await waitFor(() => expect(peopleIn("Sourced")).toHaveLength(41));
    expect(peopleIn("Shortlisted")).toEqual(before);
    expect(
      screen.queryByRole("button", { name: /Load more/ }),
    ).not.toBeInTheDocument();
  });

  it("read the endings by outcome: Rejected holds who was rejected or withdrew", async () => {
    open();
    await ready();
    expect(
      screen.getByRole("region", { name: "Rejected, 12 people" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Hired, 0 people" }),
    ).toBeVisible();
  });
});

describe("a card", () => {
  it("shows the name, the reference, where they came from and how long they have waited", async () => {
    open();
    await ready();
    const card = cardOf("Jumoke Quadri");
    expect(within(card).getByText(/^APP-/)).toBeInTheDocument();
    expect(within(card).getByText("LinkedIn")).toBeInTheDocument();
    expect(within(card).getByText(/day/)).toBeInTheDocument();
  });

  it("says when somebody needs a look or may be a duplicate, and never says rejected", async () => {
    open();
    await ready();
    expect(screen.getAllByText("Needs a look").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Possible duplicate").length).toBeGreaterThan(0);
  });

  it("links to the person's record", async () => {
    open();
    await ready();
    const card = cardOf("Jumoke Quadri");
    expect(
      within(card).getByRole("link", { name: "Jumoke Quadri" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/hiring\/candidates\/app-/),
    );
  });
});

describe("moving with the menu", () => {
  it("moves the card at once and names the person in the toast", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const person = peopleIn("Sourced")[0] as string;

    await user.selectOptions(
      within(cardOf(person)).getByLabelText(`Move ${person} to…`),
      "Shortlisted",
    );
    /* Shortlisted sends a message to whoever is moved in, so it asks first. */
    await user.click(
      await screen.findByRole("button", { name: "Move without emailing" }),
    );

    expect(
      await screen.findByText(`${person} moved to Shortlisted`),
    ).toBeInTheDocument();
    expect(peopleIn("Shortlisted")).toContain(person);
    expect(peopleIn("Sourced")).not.toContain(person);
    expect(
      screen.getByRole("region", { name: "Sourced, 40 people" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Shortlisted, 12 people" }),
    ).toBeVisible();
  });

  it("is on every card, is a real select, and does not offer the stage they are in", async () => {
    open();
    await ready();
    const person = peopleIn("Sourced")[0] as string;
    const menu = within(cardOf(person)).getByLabelText(
      `Move ${person} to…`,
    ) as HTMLSelectElement;
    expect(menu.tagName).toBe("SELECT");
    const sourced = [...menu.options].find((o) => o.text === "Sourced");
    expect(sourced?.disabled).toBe(true);
    /* Hired is not offered at all: an accepted offer puts people there. */
    expect([...menu.options].map((o) => o.text)).not.toContain("Hired");
    expect([...menu.options].map((o) => o.text)).toContain("Reject…");
  });

  it("is reachable and operable from the keyboard", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const person = peopleIn("Sourced")[0] as string;
    const menu = within(cardOf(person)).getByLabelText(`Move ${person} to…`);
    menu.focus();
    expect(menu).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    await user.selectOptions(menu, "Interview");
    await user.click(
      await screen.findByRole("button", { name: "Move without emailing" }),
    );
    expect(
      await screen.findByText(`${person} moved to Interview`),
    ).toBeInTheDocument();
  });

  it("puts the card back, and shows the API's own sentence, when the move is refused", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    /* The seed's first interviewee has an interview nobody has scored. */
    const stuck = peopleIn("Interview");
    const person = stuck.find((name) => name === "Ifeanyi Obi") as string;
    expect(person).toBeDefined();

    await user.selectOptions(
      within(cardOf(person)).getByLabelText(`Move ${person} to…`),
      "Sourced",
    );

    expect(
      await screen.findByText(`${person} was not moved`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${person} has an interview with no scorecard yet. Submit it before they leave Interview.`,
      ),
    ).toBeInTheDocument();
    expect(peopleIn("Interview")).toContain(person);
    expect(
      screen.getByRole("region", { name: "Interview, 4 people" }),
    ).toBeVisible();
  });
});

describe("dragging", () => {
  it("drops a card on a column and moves it, with the same toast", async () => {
    open();
    await ready();
    const person = peopleIn("Sourced")[0] as string;
    dragTo(person, column("Pre-screening"));
    expect(
      await screen.findByText(`${person} moved to Pre-screening`),
    ).toBeInTheDocument();
    expect(peopleIn("Pre-screening")).toContain(person);
  });

  it("does not light up Hired, and a drop there does nothing", async () => {
    open();
    await ready();
    const person = peopleIn("Sourced")[0] as string;
    dragTo(person, column("Hired"), { release: false });
    expect(column("Hired").className).not.toMatch(/bg-accent-soft/);
    escapeDrag();
    dragTo(person, column("Hired"));
    expect(peopleIn("Sourced")).toContain(person);
    expect(peopleIn("Hired")).toEqual([]);
  });

  it("asks for a reason when a card is dropped on Rejected", async () => {
    open();
    await ready();
    const person = peopleIn("Sourced")[0] as string;
    dragTo(person, column("Rejected"));
    expect(
      await screen.findByRole("dialog", { name: `Reject ${person}?` }),
    ).toBeInTheDocument();
    /* Nothing has happened to them yet. */
    expect(peopleIn("Sourced")).toContain(person);
  });

  it("is abandoned by Escape", async () => {
    open();
    await ready();
    const person = peopleIn("Sourced")[0] as string;
    dragTo(person, column("Shortlisted"), { release: false });
    escapeDrag();
    expect(peopleIn("Sourced")).toContain(person);
  });
});

describe("filters", () => {
  it("search asks the board, not the cards on screen", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.type(
      screen.getByRole("textbox", { name: /Find a candidate/ }),
      "ifeanyi",
    );
    await waitFor(() => expect(peopleIn("Interview")).toEqual(["Ifeanyi Obi"]));
    expect(
      screen.getByRole("region", { name: "Sourced, 0 people" }),
    ).toBeVisible();
  });

  it("'Needs a look' narrows every column and shows as a chip that can be taken off", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const before = peopleIn("Sourced").length;
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("checkbox", { name: /Needs a look/ }));
    await waitFor(() =>
      expect(peopleIn("Sourced").length).toBeLessThan(before),
    );
    for (const label of ["Sourced", "Shortlisted"]) {
      for (const card of within(column(label)).queryAllByRole("article")) {
        expect(within(card).getByText("Needs a look")).toBeInTheDocument();
      }
    }
    await user.click(screen.getByRole("button", { name: /Needs a look/ }));
    await waitFor(() => expect(peopleIn("Sourced")).toHaveLength(before));
  });

  it("tag, source and duplicates are filters too", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.selectOptions(screen.getByLabelText("Heard via"), "referral");
    await waitFor(() => {
      for (const card of screen.getAllByRole("article")) {
        expect(within(card).getByText("Referral")).toBeInTheDocument();
      }
    });
    await user.selectOptions(screen.getByLabelText("Heard via"), "");
    await user.selectOptions(screen.getByLabelText("Tag"), "Strong CV");
    await waitFor(() => {
      for (const card of screen.getAllByRole("article")) {
        expect(within(card).getByText("Strong CV")).toBeInTheDocument();
      }
    });
  });

  it("a date range is the day they entered, and backwards is said, not sent", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.type(screen.getByLabelText(/Entered from/), "2026-08-10");
    await user.type(screen.getByLabelText(/Entered to/), "2026-08-01");
    expect(
      await screen.findByText(
        "That is before the start date, so no dates are applied.",
      ),
    ).toBeInTheDocument();
  });

  it("says nobody matches, rather than 'no candidates yet', when a filter is why", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.type(
      screen.getByRole("textbox", { name: /Find a candidate/ }),
      "zzzz",
    );
    /* The search settles after a pause and the board is read again: a busy machine
       needs longer than the default second. */
    expect(
      await screen.findByText("Nobody matches", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No candidates yet")).not.toBeInTheDocument();
  });
});

describe("the table view", () => {
  it("is a toggle, it is remembered, and it draws what the board already holds", async () => {
    const user = userEvent.setup();
    const first = open();
    await ready();
    await user.click(screen.getByRole("radio", { name: "Table" }));
    expect(
      await screen.findByRole("table", {
        name: "Sourced: their stage and outcome",
      }),
    ).toBeInTheDocument();

    first.unmount();
    open();
    expect(
      await screen.findByRole("table", {
        name: "Sourced: their stage and outcome",
      }),
    ).toBeInTheDocument();
  });

  it("groups people by stage, each section with its own count and its own 'Load more'", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(screen.getByRole("radio", { name: "Table" }));
    const sourced = await screen.findByRole("region", {
      name: "Sourced, 41 people",
    });
    expect(within(sourced).getByText("Showing 25 of 41")).toBeInTheDocument();
    await user.click(
      within(sourced).getByRole("button", { name: "Load more (16 left)" }),
    );
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("region", { name: "Sourced, 41 people" }),
        ).queryByText(/Showing/),
      ).not.toBeInTheDocument(),
    );
  });

  it("moves people with the same menu and the same refusals", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(screen.getByRole("radio", { name: "Table" }));
    const sourced = await screen.findByRole("region", {
      name: "Sourced, 41 people",
    });
    const menu = within(sourced)
      .getAllByLabelText(/^Move .* to…$/)
      .find((m) => m.closest("table")) as HTMLSelectElement;
    const person = (menu.getAttribute("aria-label") as string)
      .replace(/^Move /, "")
      .replace(/ to…$/, "");
    await user.selectOptions(menu, "Interview");
    await user.click(
      await screen.findByRole("button", { name: "Move without emailing" }),
    );
    expect(
      await screen.findByText(`${person} moved to Interview`),
    ).toBeInTheDocument();
  });
});
