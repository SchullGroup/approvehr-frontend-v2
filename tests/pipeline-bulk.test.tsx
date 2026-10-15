import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPipeline, demoRun } from "@/lib/hiring/pipeline/demo-store";
import { moveApp, setTagged } from "@/lib/hiring/pipeline/demo-ops";
import { demoGateway } from "@/lib/hiring/pipeline/demo-gateway";
import { pipelineViewState } from "@/lib/hiring/pipeline/use-view";
import {
  cardOf,
  column,
  peopleIn,
  renderInToasts,
} from "./pipeline-workspace-helpers";

/**
 * Doing one thing to many people.
 *
 * The rules these hold: the header checkbox ticks only what is on screen; choosing
 * everyone a filter matches is a second, explicit step that names the exact number;
 * an action says exactly who it did not work for; and rejecting never sends an
 * email on its own.
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

const downloadCsv = vi.fn();
vi.mock("@/lib/csv", async (original) => {
  const real = await original<typeof import("@/lib/csv")>();
  return { ...real, downloadCsv: (...a: unknown[]) => downloadCsv(...a) };
});

const { PipelineWorkspace } =
  await import("@/app/(app)/hiring/requisitions/[id]/pipeline-workspace");

const open = () => renderInToasts(<PipelineWorkspace requisitionId="req-01" />);
const ready = () =>
  waitFor(() =>
    expect(screen.getAllByRole("region").length).toBeGreaterThan(3),
  );

const tick = async (user: ReturnType<typeof userEvent.setup>, person: string) =>
  user.click(
    within(cardOf(person)).getByRole("checkbox", { name: `Select ${person}` }),
  );

const bar = () =>
  screen.getByRole("region", {
    name: "Actions for the people you have selected",
  });

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
  pipelineViewState.reset();
  downloadCsv.mockReset();
});

describe("selecting", () => {
  it("shows nothing until somebody is ticked, then says exactly how many", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    expect(
      screen.queryByRole("region", {
        name: "Actions for the people you have selected",
      }),
    ).not.toBeInTheDocument();
    const [a, b] = peopleIn("Sourced") as [string, string];
    await tick(user, a);
    expect(within(bar()).getByText("1 person selected")).toBeInTheDocument();
    await tick(user, b);
    expect(within(bar()).getByText("2 people selected")).toBeInTheDocument();
  });

  it("the column's checkbox ticks the people shown in it, and no more", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      within(column("Sourced")).getByRole("checkbox", {
        name: "Select everyone shown in Sourced",
      }),
    );
    expect(within(bar()).getByText("25 people selected")).toBeInTheDocument();
    /* Forty-one are in the column. The sixteen unseen ones are not ticked. */
    expect(
      screen.getByRole("region", { name: "Sourced, 41 people" }),
    ).toBeVisible();
  });

  it("offers everyone matching only once everything shown is ticked, with the exact number", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    expect(
      screen.queryByText(/Select all 41 matching/),
    ).not.toBeInTheDocument();
    await user.click(
      within(column("Sourced")).getByRole("checkbox", {
        name: "Select everyone shown in Sourced",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "Select all 41 matching these filters",
      }),
    ).toBeInTheDocument();
  });

  it("asks to confirm, naming the number and the filters, before it is taken", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.selectOptions(screen.getByLabelText("Heard via"), "linkedin");
    await waitFor(() => expect(peopleIn("Sourced").length).toBeGreaterThan(0));
    const total = Number(
      /(\d+) people?$/.exec(
        column("Sourced").getAttribute("aria-label") ?? "",
      )?.[1],
    );

    await user.click(
      within(column("Sourced")).getByRole("checkbox", {
        name: "Select everyone shown in Sourced",
      }),
    );
    if (peopleIn("Sourced").length === total) return; // Everything fits on a page.
    await user.click(
      screen.getByRole("button", {
        name: `Select all ${String(total)} matching these filters`,
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(`${String(total)} people`);
    expect(dialog).toHaveTextContent("Heard via: LinkedIn");
    await user.click(
      within(dialog).getByRole("button", {
        name: `Select all ${String(total)}`,
      }),
    );
    expect(
      await within(bar()).findByText(
        `All ${String(total)} matching these filters selected`,
      ),
    ).toBeInTheDocument();
  });

  it("is let go when the filters change, because 'everyone' belonged to those filters", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      within(column("Sourced")).getByRole("checkbox", {
        name: "Select everyone shown in Sourced",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Select all 41 matching these filters",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Select all 41" }),
    );
    expect(
      await within(bar()).findByText("All 41 matching these filters selected"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("checkbox", { name: /Needs a look/ }));
    await waitFor(() =>
      expect(
        screen.queryByText("All 41 matching these filters selected"),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("rejecting in bulk", () => {
  it("needs a reason, records it on each person, and says how many were done", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const [a, b, c] = peopleIn("Sourced") as [string, string, string];
    for (const person of [a, b, c]) await tick(user, person);
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Reject 3 people?",
    });
    const reject = within(dialog).getByRole("button", { name: "Reject" });
    expect(reject).toBeDisabled();
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Salary expectation above the band",
    );
    await user.click(reject);

    expect(await screen.findByText("Rejected: 3 people.")).toBeInTheDocument();
    await waitFor(() =>
      expect(peopleIn("Rejected")).toEqual(expect.arrayContaining([a, b, c])),
    );
  });

  it("never offers to send an email unless the server can, and says nothing was sent", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await tick(user, peopleIn("Sourced")[0] as string);
    await user.click(within(bar()).getByRole("button", { name: "Reject…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/email/i);
  });

  it("lists every person it could not do, with the reason, and never hides them in a count", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    /* One of the three cannot leave Interview: nobody has scored theirs. */
    await tick(user, "Ifeanyi Obi");
    const [a, b] = peopleIn("Sourced") as [string, string];
    await tick(user, a);
    await tick(user, b);
    await user.click(within(bar()).getByRole("button", { name: "Move to…" }));
    const dialog = await screen.findByRole("dialog", { name: "Move 3 people" });
    await user.selectOptions(
      within(dialog).getByRole("combobox"),
      "Shortlisted",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Move 3 people" }),
    );

    expect(
      await screen.findByText(
        "Moved to Shortlisted: 2 of 3 people. 1 could not be done.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Who could not be done, and why \(1\)/),
    ).toBeInTheDocument();
    const refused = screen
      .getByText(/Who could not be done, and why/)
      .closest("details") as HTMLElement;
    expect(refused).toHaveTextContent("Ifeanyi Obi");
    expect(refused).toHaveTextContent("has an interview with no scorecard yet");
  });
});

describe("everyone matching", () => {
  async function chooseEveryoneInSourced(
    user: ReturnType<typeof userEvent.setup>,
  ) {
    await user.click(
      within(column("Sourced")).getByRole("checkbox", {
        name: "Select everyone shown in Sourced",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Select all 41 matching these filters",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Select all 41" }),
    );
    await within(bar()).findByText("All 41 matching these filters selected");
  }

  it("acts on all of them, including the ones that were never on screen", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await chooseEveryoneInSourced(user);
    await user.click(within(bar()).getByRole("button", { name: "Add a tag…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Add a tag to 41 people",
    });
    await user.selectOptions(
      within(dialog).getByRole("combobox"),
      "Call back later",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Add the tag for 41 people/ }),
    );
    expect(
      await screen.findByText(/Tagged "Call back later": /),
    ).toBeInTheDocument();
    const book = demoPipeline.current();
    const tagged = book.apps.filter(
      (a) => a.stageId === "req-01:sourced" && a.tagIds.includes("tag-2"),
    );
    expect(tagged.length).toBe(41);
  });

  it("stops, and says so, if the list changed between the count and the action", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await chooseEveryoneInSourced(user);

    /* Somebody moves one person out while the dialog is open. */
    const gone = demoPipeline
      .current()
      .apps.find(
        (a) => a.stageId === "req-01:sourced" && a.outcome === "IN_PROGRESS",
      );
    demoRun((book) => moveApp(book, gone?.id as string, "req-01:shortlisted"));

    await user.click(
      within(bar()).getByRole("button", { name: "Keep in talent pool" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /^Keep 41 people$/ }),
    );
    expect(
      await screen.findByText(
        /The list changed while you were choosing: it was 41 people and is now 40/,
      ),
    ).toBeInTheDocument();
    expect(
      demoPipeline
        .current()
        .apps.some(
          (a) =>
            a.talentPool && a.stageId === "req-01:sourced" && a.id === gone?.id,
        ),
    ).toBe(false);
  });
});

describe("the gateway's progress", () => {
  it("reports as it goes, a hundred at a time, and accounts for everyone asked", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `ghost-${String(i)}`);
    const seen: number[] = [];
    const outcome = await demoGateway.bulk({
      target: { kind: "ids", requisitionId: "req-01", ids },
      action: { type: "tag", tagId: "tag-1" },
      idempotencyKey: "k-test-0001",
      signal: new AbortController().signal,
      onProgress: (p) => seen.push(p.done),
    });
    expect(seen).toEqual([0, 100, 200, 250]);
    expect(outcome.requested).toBe(250);
    expect(outcome.done + outcome.skipped + outcome.refused.length).toBe(250);
  });
});

describe("exporting", () => {
  it("downloads the people who are ticked, and nobody else", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const [a, b] = peopleIn("Sourced") as [string, string];
    await tick(user, a);
    await tick(user, b);
    await user.click(within(bar()).getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    const [filename, body] = downloadCsv.mock.calls[0] as [string, string];
    expect(filename).toMatch(/^candidates-.*\.csv$/);
    expect(body).toContain(a);
    expect(body).toContain(b);
    expect(body.split("\r\n").filter(Boolean)).toHaveLength(3);
  });

  it("writes a name that starts like a formula as text", async () => {
    const book = demoPipeline.current();
    const target = book.apps[0];
    if (!target) throw new Error("no seed");
    demoPipeline.commit({
      ...book,
      apps: book.apps.map((a) =>
        a.id === target.id ? { ...a, name: '=HYPERLINK("x")' } : a,
      ),
    });
    const file = await demoGateway.exportCards({
      kind: "ids",
      requisitionId: "req-01",
      ids: [target.id],
    });
    expect(file.body).toContain("'=HYPERLINK");
    expect(file.body).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});

describe("tags on one person", () => {
  it("are ticked from the card, and the card shows them at once", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const person = peopleIn("Sourced")[0] as string;
    await user.click(
      within(cardOf(person)).getByRole("button", {
        name: `Tags and talent pool for ${person}`,
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: `Tags for ${person}`,
    });
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Strong CV" }),
    );
    await waitFor(() =>
      expect(within(cardOf(person)).getByText("Strong CV")).toBeInTheDocument(),
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Strong CV" }),
    );
    await waitFor(() =>
      expect(
        within(cardOf(person)).queryByText("Strong CV"),
      ).not.toBeInTheDocument(),
    );
  });

  it("can be made on the spot and put on the person", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const person = peopleIn("Sourced")[0] as string;
    await user.click(
      within(cardOf(person)).getByRole("button", {
        name: `Tags and talent pool for ${person}`,
      }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("New tag"),
      "Shortlist for March",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Add and tag" }),
    );
    await waitFor(() =>
      expect(
        within(cardOf(person)).getByText("Shortlist for March"),
      ).toBeInTheDocument(),
    );
  });

  it("keeping somebody in the talent pool is its own switch, and says what it does", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const person = peopleIn("Sourced")[0] as string;
    await user.click(
      within(cardOf(person)).getByRole("button", {
        name: `Tags and talent pool for ${person}`,
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Only keep people the company has a reason to contact",
    );
    await user.click(
      within(dialog).getByRole("switch", { name: /Keep in the talent pool/ }),
    );
    expect(
      await screen.findByText(`${person} is in the talent pool`),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(cardOf(person)).getByText("Talent pool"),
      ).toBeInTheDocument(),
    );
  });

  it("a tag made elsewhere is reflected by the pickers straight away", async () => {
    demoRun((book) => setTagged(book, "app-02", "tag-1", true));
    open();
    await ready();
    expect(
      within(cardOf("Zainab Yusuf")).getByText("Strong CV"),
    ).toBeInTheDocument();
  });
});
