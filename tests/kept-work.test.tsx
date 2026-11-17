import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { KeptWork, KeptWorkRecord } from "@/lib/api/kept-work";
import type { WorkThisCycle } from "@/lib/projects/completions";

/**
 * The work behind a rating, on a review.
 *
 * What is proved: a final manager's rating reads the record that was kept with it, and only then
 * is a record asked for; for every answer the server could not give, the live list shows exactly as
 * it did before and nothing is said about a record; "nothing was kept" and "it has been removed" are
 * said plainly and are never an empty list or a low figure; the record shows no task title and says
 * so; and the list as it stands now is one click away and is not asked for until then.
 */

const hook = vi.hoisted(() => ({
  kept: null as unknown,
  keptArgs: [] as unknown[][],
  live: null as unknown,
  liveArgs: [] as unknown[],
  phone: false,
  projects: { enabled: true, loading: false },
}));
vi.mock("@/lib/store/kept-work", () => ({
  useKeptWork: (...args: unknown[]) => {
    hook.keptArgs.push(args);
    return hook.kept;
  },
}));
vi.mock("@/lib/store/completions", () => ({
  useWorkThisCycle: (args: unknown) => {
    hook.liveArgs.push(args);
    return hook.live;
  },
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => hook.projects,
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));
/* The panels read the person's flags through their own hook. Flags are not what this file is
   about, so the server never says they are on; tests/work-flags-panels.test.tsx covers them. */
vi.mock("@/lib/store/work-flags", () => ({
  useWorkFlags: () => ({
    on: false,
    flags: null,
    flag: vi.fn(),
    unflag: vi.fn(),
  }),
}));
vi.mock("@/app/(app)/hiring/requisitions/[id]/use-phone", () => ({
  usePhone: () => hook.phone,
}));

const { WorkBehindTheMark, keptUntilLine } =
  await import("@/components/performance/kept-work");

const item = (over: Partial<KeptWorkRecord["items"][number]> = {}) => ({
  id: "i1",
  key: "PRF-1",
  type: "TASK",
  personal: false,
  projectId: "p1",
  doneAt: "2026-10-12T10:00:00.000Z",
  finishedOn: "2026-10-12",
  dueDate: "2026-10-12",
  timing: "ON_TIME" as const,
  linked: true,
  setBy: null,
  ...over,
});

const record = (over: Partial<KeptWorkRecord> = {}): KeptWorkRecord => ({
  state: "KEPT",
  frozenAt: "2026-11-01T09:00:00.000Z",
  retainUntil: "2027-11-01T09:00:00.000Z",
  retainMonths: 12,
  period: { start: "2026-07-01", end: "2026-12-31" },
  summary: {
    finished: 3,
    withDueDate: 2,
    onTime: 1,
    late: 1,
    noDueDate: 1,
    linked: 2,
    unlinked: 1,
  },
  items: [
    item(),
    item({
      id: "i2",
      key: "PRF-2",
      timing: "LATE",
      setBy: { id: "pat", name: "Pat Projects" },
    }),
    item({
      id: "i3",
      key: "MY-3",
      personal: true,
      dueDate: null,
      timing: "NO_DUE_DATE",
      linked: false,
      projectId: "mine",
      setBy: { id: "ada", name: "Ada Okonkwo" },
    }),
  ],
  total: 3,
  truncated: false,
  ...over,
});

const read = (data: KeptWork | null, extra: Record<string, unknown> = {}) => ({
  data,
  loading: false,
  error: null,
  reload: vi.fn(),
  ...extra,
});

const liveWork = (): WorkThisCycle => ({
  summary: { finished: 1, withDueDate: 0, onTime: 0, late: 0, linked: 0 },
  byProject: [{ projectId: "p1", projectName: "Payroll v2", finished: 1 }],
  byObjective: [],
  items: [],
  total: 1,
  capped: false,
});

type Props = Parameters<typeof WorkBehindTheMark>[0];

const props: Props = {
  reviewId: "r1",
  kind: "MANAGER",
  final: true,
  disputed: false,
  subjectId: "bola",
  cycleId: "c1",
  periodStart: "2026-07-01",
  periodEnd: "2026-12-31",
  subjectName: "Bola Projects",
  own: false,
};

const mount = (over: Partial<Props> = {}) =>
  render(<WorkBehindTheMark {...props} {...over} />);

const LIVE = "Work this cycle";
const KEPT = "Work when the rating was made final";

beforeEach(() => {
  hook.kept = read(record());
  hook.keptArgs = [];
  hook.live = read(liveWork() as never);
  hook.liveArgs = [];
  hook.phone = false;
  hook.projects = { enabled: true, loading: false };
});

describe("when there is nothing kept to read", () => {
  it("shows only the live list for a rating that is not final, and does not ask for a record", () => {
    mount({ final: false });
    expect(screen.getByText(LIVE)).toBeInTheDocument();
    expect(screen.queryByText(KEPT)).not.toBeInTheDocument();
    expect(hook.keptArgs.every(([, enabled]) => enabled === false)).toBe(true);
  });

  it("does not ask for a record for a self review or for peer feedback", () => {
    mount({ kind: "SELF" });
    expect(screen.getByText(LIVE)).toBeInTheDocument();
    expect(hook.keptArgs.every(([, enabled]) => enabled === false)).toBe(true);
  });

  it("gives peer feedback no list at all, and still asks for no record", () => {
    mount({ kind: "PEER" });
    expect(hook.keptArgs.every(([, enabled]) => enabled === false)).toBe(true);
    expect(hook.liveArgs.at(-1)).toMatchObject({ enabled: false });
  });

  it("does not ask while Projects is off", () => {
    hook.projects = { enabled: false, loading: false };
    mount();
    expect(hook.keptArgs.every(([, enabled]) => enabled === false)).toBe(true);
    expect(screen.queryByText(KEPT)).not.toBeInTheDocument();
  });

  it("does not ask while the company's switches are still being read either", () => {
    hook.projects = { enabled: false, loading: true };
    mount();
    expect(hook.keptArgs.every(([, enabled]) => enabled === false)).toBe(true);
    expect(screen.queryByText(KEPT)).not.toBeInTheDocument();
  });

  it("does not ask, and says nothing about a record, for a cycle that states no dates", () => {
    mount({ periodStart: null, periodEnd: null });
    expect(hook.keptArgs.every(([, enabled]) => enabled === false)).toBe(true);
    expect(screen.queryByText(/Nothing was kept/)).not.toBeInTheDocument();
  });

  it("asks for the record of exactly this review, once the rating is final", () => {
    mount();
    expect(hook.keptArgs.at(-1)).toEqual(["r1", true]);
  });
});

describe("what the server could not say", () => {
  it("shows the live list and says nothing about a record when nothing is known: not the reader's, an older server, a failed read", () => {
    hook.kept = read(null, {
      error: new ApiError(404, "not_found", "Not found"),
    });
    mount();
    expect(screen.getByText(LIVE)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing was kept/)).not.toBeInTheDocument();
    expect(screen.queryByText(KEPT)).not.toBeInTheDocument();
    expect(screen.queryByText(/was removed on/)).not.toBeInTheDocument();
  });

  it("shows only the live list when the server says the rating is not final", () => {
    hook.kept = read({ state: "NOT_FINAL" });
    mount();
    expect(screen.getByText(LIVE)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing was kept/)).not.toBeInTheDocument();
  });
});

describe("while it is being read", () => {
  it("shows a placeholder and neither list nor note, so nothing flashes up and goes", () => {
    hook.kept = read(null, { loading: true });
    mount();
    expect(
      screen.getByLabelText("Loading the work behind this rating"),
    ).toBeInTheDocument();
    expect(screen.queryByText(LIVE)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing was kept/)).not.toBeInTheDocument();
    expect(hook.liveArgs).toHaveLength(0);
  });
});

describe("nothing was kept, or it has been removed", () => {
  it("says nothing was kept from the day the rating was made final, then shows the live list", () => {
    hook.kept = read({ state: "NOT_KEPT" });
    mount();
    expect(
      screen.getByText(
        /Nothing was kept of this list when the rating was made final, so the list below is read as it stands now and may differ from what the appraiser read/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(LIVE)).toBeInTheDocument();
    expect(screen.queryByText(KEPT)).not.toBeInTheDocument();
  });

  it("says a record was kept and when it ended, then shows the live list", () => {
    hook.kept = read({
      state: "REMOVED",
      frozenAt: "2026-11-01T09:00:00.000Z",
      endedAt: "2027-11-01T09:00:00.000Z",
    });
    mount();
    expect(
      screen.getByText(
        /The work behind this rating was kept when it was made final, and was removed on 1 Nov 2027, when its retention period ended/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(LIVE)).toBeInTheDocument();
    expect(screen.queryByText(KEPT)).not.toBeInTheDocument();
  });
});

describe("the record", () => {
  it("leads with what was kept, says when it was taken and what it is for, and does not draw the live list", () => {
    mount();
    expect(screen.getByText(KEPT)).toBeInTheDocument();
    expect(screen.getByText("3 tasks finished")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Finished on the project boards, 1 Jul 2026 to 31 Dec 2026, as it stood on 1 Nov 2026, when the rating was made final\. It does not change if tasks are reopened or removed later, and it does not change the mark/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(LIVE)).not.toBeInTheDocument();
  });

  it("reads as counts: finished, by the due date, linked to an objective", () => {
    mount();
    const dl = screen.getByText("Finished").closest("dl")!;
    expect(within(dl).getByText("3")).toBeInTheDocument();
    expect(within(dl).getByText("1 of 2")).toBeInTheDocument();
    expect(within(dl).getByText("2 of 3")).toBeInTheDocument();
  });

  it("says none had a due date rather than a count of nought", () => {
    hook.kept = read(
      record({
        summary: { ...record().summary, withDueDate: 0, onTime: 0, late: 0 },
      }),
    );
    mount();
    expect(screen.getByText("None had one")).toBeInTheDocument();
  });

  it("lists each task by its key, as a link that opens the task, with the day, on time or late and who set it", () => {
    mount();
    const list = screen
      .getByRole("heading", { name: "Finished tasks" })
      .closest("section")!;
    const one = within(list).getByRole("link", { name: "PRF-1" });
    expect(one).toHaveAttribute("href", "/projects/p1?issue=PRF-1");
    /* A task on somebody's own list opens on its own page, by its id. */
    expect(within(list).getByRole("link", { name: "MY-3" })).toHaveAttribute(
      "href",
      "/projects/tasks/i3",
    );
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(
      within(rows[0]!).getByText("Finished 12 Oct 2026"),
    ).toBeInTheDocument();
    expect(within(rows[0]!).getByText("On time")).toBeInTheDocument();
    expect(
      within(rows[0]!).getByText("Under an objective"),
    ).toBeInTheDocument();
    expect(within(rows[0]!).queryByText(/Set by/)).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText("Late")).toBeInTheDocument();
    expect(
      within(rows[1]!).getByText("Set by Pat Projects"),
    ).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Personal")).toBeInTheDocument();
    expect(
      within(rows[2]!).getByText("Set by Ada Okonkwo"),
    ).toBeInTheDocument();
    /* A task with no due date is neither on time nor late. */
    expect(within(rows[2]!).queryByText("On time")).not.toBeInTheDocument();
    expect(within(rows[2]!).queryByText("Late")).not.toBeInTheDocument();
  });

  it("shows no task title, and says that titles are not kept", () => {
    mount();
    expect(
      screen.getByText(
        /Task titles are not kept in this record\. Open a task to read it as it is now/,
      ),
    ).toBeInTheDocument();
  });

  it("says when it is removed", () => {
    mount();
    expect(
      screen.getByText("Kept until 1 Nov 2027, then removed."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/disputed/)).not.toBeInTheDocument();
  });

  it("says a dispute keeps it a full period longer, only when the rating was disputed", () => {
    mount({ disputed: true });
    expect(
      screen.getByText(
        "Kept until 1 Nov 2027, then removed. The rating was disputed, so it is kept for a full period from then.",
      ),
    ).toBeInTheDocument();
  });

  it("says plainly that it holds fewer than matched, with the true total", () => {
    hook.kept = read(record({ truncated: true, total: 1432 }));
    mount();
    expect(
      screen.getByText(/This record holds the newest 3 of 1432 tasks/),
    ).toBeInTheDocument();
  });

  it("an empty record says nothing was recorded, which is not a count of nought", () => {
    hook.kept = read(
      record({
        summary: {
          finished: 0,
          withDueDate: 0,
          onTime: 0,
          late: 0,
          noDueDate: 0,
          linked: 0,
          unlinked: 0,
        },
        items: [],
        total: 0,
      }),
    );
    mount();
    expect(
      screen.getByText(
        "No finished tasks were recorded for Bola Projects on the project boards in this period when the rating was made final.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("0 tasks finished")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Finished tasks" }),
    ).not.toBeInTheDocument();
    /* Said where it is read, so a short or empty list is never a short record of work. */
    expect(
      screen.getByText(/This is only what was tracked in Projects/),
    ).toBeInTheDocument();
  });

  it("speaks to you when the review is about the reader", () => {
    hook.kept = read(
      record({
        summary: {
          finished: 0,
          withDueDate: 0,
          onTime: 0,
          late: 0,
          noDueDate: 0,
          linked: 0,
          unlinked: 0,
        },
        items: [],
        total: 0,
      }),
    );
    mount({ own: true });
    expect(
      screen.getByText(
        "No finished tasks were recorded for you on the project boards in this period when the rating was made final.",
      ),
    ).toBeInTheDocument();
  });

  it("shows ten and then all of them", async () => {
    const many = Array.from({ length: 14 }, (_, n) =>
      item({ id: `m${String(n)}`, key: `PRF-${String(100 + n)}` }),
    );
    hook.kept = read(
      record({
        items: many,
        total: 14,
        summary: { ...record().summary, finished: 14 },
      }),
    );
    mount();
    const list = screen
      .getByRole("heading", { name: "Finished tasks" })
      .closest("section")!;
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    await userEvent.click(screen.getByRole("button", { name: "Show all 14" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(14);
    await userEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
  });

  it("is open on a wide screen and closed on a phone", () => {
    hook.phone = true;
    mount();
    expect(screen.getByText(KEPT)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Finished tasks" }),
    ).not.toBeInTheDocument();
  });
});

describe("the list as it stands now", () => {
  it("is one click away, and is not asked for until somebody wants it", async () => {
    mount();
    expect(hook.liveArgs).toHaveLength(0);
    await userEvent.click(
      screen.getByRole("button", { name: "Show the list as it stands now" }),
    );
    expect(screen.getByText(LIVE)).toBeInTheDocument();
    expect(hook.liveArgs.length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Show the list as it stands now" }),
    ).not.toBeInTheDocument();
    /* Both are there, and each says what it is. */
    expect(screen.getByText(KEPT)).toBeInTheDocument();
  });
});

describe("how long it is kept, in one sentence", () => {
  it("names the day it is removed", () => {
    expect(
      keptUntilLine("2027-11-01T09:00:00.000Z", "Africa/Lagos", false),
    ).toBe("Kept until 1 Nov 2027, then removed.");
  });

  it("names the dispute only when there is one", () => {
    expect(
      keptUntilLine("2027-11-01T09:00:00.000Z", "Africa/Lagos", true),
    ).toContain("The rating was disputed");
  });

  it("reads the day in the company's own zone, so a record kept late in the evening is not a day out", () => {
    /* 23:30 in Lagos on 31 October is 22:30 UTC the same day, and 00:30 on 1 November in Lagos
       is 23:30 UTC the day before. */
    expect(
      keptUntilLine("2027-10-31T23:30:00.000Z", "Africa/Lagos", false),
    ).toBe("Kept until 1 Nov 2027, then removed.");
  });
});
