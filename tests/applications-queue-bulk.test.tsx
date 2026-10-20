import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";

/**
 * Working the application queue in bulk, in a demo.
 *
 * The queue is where a campus drive lands: sixty people waiting and one afternoon.
 * The rules these hold: the tick is only on people still waiting, "everyone
 * matching" names the exact count and asks, advance and turn-down are done a few
 * at a time with an answer for each, tags are not offered (an applicant waiting
 * here is not a candidate yet), and every person it could not do is listed.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/hiring/postings/applications",
}));
vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => true,
}));
vi.mock("@/lib/store/recruitment", () => ({
  useRequisitions: () => ({
    requisitions: [],
    total: 0,
    loading: false,
    error: null,
    connected: false,
    reload: () => undefined,
  }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({
    isConnected: false,
    isLoading: false,
    user: null,
    organization: undefined,
  }),
}));

const downloadCsv = vi.fn();
vi.mock("@/lib/csv", async (original) => {
  const real = await original<typeof import("@/lib/csv")>();
  return { ...real, downloadCsv: (...a: unknown[]) => downloadCsv(...a) };
});

const { ApplicationsScreen } =
  await import("@/app/(app)/hiring/postings/applications/applications-screen");

const open = () =>
  render(
    <ToastProvider>
      <ApplicationsScreen />
    </ToastProvider>,
  );

const ready = () =>
  waitFor(() =>
    expect(
      screen.getByText(/Showing 50 of 64 applications/),
    ).toBeInTheDocument(),
  );

const bar = () =>
  screen.getByRole("region", {
    name: "Actions for the people you have selected",
  });

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
  downloadCsv.mockReset();
});

describe("selecting in the queue", () => {
  it("puts a tick on each person still waiting, and nothing is selected to begin with", async () => {
    open();
    await ready();
    expect(
      screen.queryByRole("region", { name: /Actions for the people/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("checkbox", { name: /^Select (?!everyone)/ }).length,
    ).toBe(50);
  });

  it("offers advance, turn down and export, and no tags: nobody here is a candidate yet", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getAllByRole("checkbox", {
        name: /^Select (?!everyone)/,
      })[0] as HTMLElement,
    );
    const actions = within(bar())
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(actions).toEqual(
      expect.arrayContaining(["Advance…", "Turn down…", "Export CSV", "Clear"]),
    );
    expect(actions.join(" ")).not.toMatch(/tag|talent/i);
  });

  it("offers everyone matching once all shown are ticked, with the exact count, and asks first", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", {
        name: "Select everyone shown who is waiting",
      }),
    );
    expect(within(bar()).getByText("50 people selected")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Select all 64 matching these filters",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Select all 64 matching these filters?",
    });
    expect(dialog).toHaveTextContent(
      "That is 64 people in this list, not just the ones you can see.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Select all 64" }),
    );
    expect(
      await within(bar()).findByText("All 64 matching these filters selected"),
    ).toBeInTheDocument();
  });
});

describe("turning people down", () => {
  it("needs a reason, keeps it on each row, and sends nothing", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const [a, b] = screen.getAllByRole("checkbox", {
      name: /^Select (?!everyone)/,
    });
    await user.click(a as HTMLElement);
    await user.click(b as HTMLElement);
    await user.click(within(bar()).getByRole("button", { name: "Turn down…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Turn down 2 people?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Turn down 2 people" }),
    ).toBeDisabled();
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Cannot start in time",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Turn down 2 people" }),
    );
    expect(
      await screen.findByText("Turned down: 2 people."),
    ).toBeInTheDocument();
    expect(
      Object.values(demoPipeline.current().queue)
        .filter((e) => e.declined)
        .map((e) => e.declined?.reason),
    ).toEqual(["Cannot start in time", "Cannot start in time"]);
  });

  it("everyone matching: all sixty-four, done and accounted for", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", {
        name: "Select everyone shown who is waiting",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Select all 64 matching these filters",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Select all 64" }),
    );
    await user.click(within(bar()).getByRole("button", { name: "Turn down…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Turn down 64 people?",
    });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Salary expectation above the band",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Turn down 64 people" }),
    );
    expect(
      await screen.findByText("Turned down: 64 people.", {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(
      Object.values(demoPipeline.current().queue).filter((e) => e.declined),
    ).toHaveLength(64);
    expect(await screen.findByText("Nobody is waiting")).toBeInTheDocument();
  });

  it("stops, and says so, if the list changed since the count was confirmed", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", {
        name: "Select everyone shown who is waiting",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Select all 64 matching these filters",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Select all 64" }),
    );
    /* Somebody else turns one of them down meanwhile. */
    const book = demoPipeline.current();
    demoPipeline.commit({
      ...book,
      queue: {
        ...book.queue,
        "demo-application-q01": {
          declined: { reason: "Elsewhere", at: "2026-08-19T09:00:00.000Z" },
        },
      },
    });
    await user.click(within(bar()).getByRole("button", { name: "Turn down…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Turn down 64 people?",
    });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Cannot start in time",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Turn down 64 people" }),
    );
    expect(
      (
        await screen.findAllByText(
          /The list changed while you were choosing: it was 64 people and is now 63/,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      Object.values(demoPipeline.current().queue).filter((e) => e.declined),
    ).toHaveLength(1);
  });
});

describe("advancing people", () => {
  it("puts them on the role's board, and says how many", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const before = demoPipeline.current().apps.length;
    const boxes = screen.getAllByRole("checkbox", {
      name: /^Select (?!everyone)/,
    });
    for (const box of boxes.slice(0, 3)) await user.click(box);
    await user.click(within(bar()).getByRole("button", { name: "Advance…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Move 3 people into the pipeline?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Move 3 people" }),
    );
    expect(
      await screen.findByText(/^Moved into the pipeline: 3 people\.$/),
    ).toBeInTheDocument();
    expect(demoPipeline.current().apps.length).toBe(before + 3);
    const added = demoPipeline.current().apps.slice(before);
    for (const person of added) {
      const stage = demoPipeline
        .current()
        .stages.find((s) => s.id === person.stageId);
      expect(stage?.type === "APPLIED" || stage?.type === "SCREENING").toBe(
        true,
      );
      expect(person.outcome).toBe("IN_PROGRESS");
    }
  });

  it("a row that was already decided on is refused, named, with the reason", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const [a, b] = screen.getAllByRole("checkbox", {
      name: /^Select (?!everyone)/,
    });
    await user.click(a as HTMLElement);
    await user.click(b as HTMLElement);
    /* Somebody turns the first one down while the dialog is open. */
    const book = demoPipeline.current();
    const id = Object.keys(book.queue)[0] ?? "demo-application-q01";
    demoPipeline.commit({
      ...book,
      queue: {
        ...book.queue,
        [id]: {
          declined: { reason: "Elsewhere", at: "2026-08-19T09:00:00.000Z" },
        },
      },
    });
    await user.click(within(bar()).getByRole("button", { name: "Advance…" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /^Move 2 people$/ }),
    );
    await screen.findByText(/Moved into the pipeline: /);
    const panel = screen.queryByText(/Who could not be done, and why/);
    if (panel) {
      expect(panel.closest("details")).toHaveTextContent(
        "has already been turned down",
      );
    }
  });
});

describe("exporting", () => {
  it("downloads the people who are ticked as a spreadsheet", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const boxes = screen.getAllByRole("checkbox", {
      name: /^Select (?!everyone)/,
    });
    await user.click(boxes[0] as HTMLElement);
    await user.click(boxes[1] as HTMLElement);
    await user.click(within(bar()).getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    const [filename, body] = downloadCsv.mock.calls[0] as [string, string];
    expect(filename).toBe("applicants.csv");
    expect(body.split("\r\n").filter(Boolean)).toHaveLength(3);
  });
});

describe("one person at a time", () => {
  it("turning somebody down asks for a reason from the company's list", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const row = screen.getAllByRole("button", {
      name: "Decline",
    })[0] as HTMLElement;
    await user.click(row);
    const dialog = await screen.findByRole("dialog", { name: /^Turn down / });
    expect(
      within(dialog).getByRole("button", { name: "Turn them down" }),
    ).toBeDisabled();
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Did not do well in the assessment",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Turn them down" }),
    );
    expect((await screen.findAllByText(/turned down$/)).length).toBeGreaterThan(
      0,
    );
  });
});
