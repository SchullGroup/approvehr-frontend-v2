import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { SharedColleague } from "@/lib/api/shared-projects";
import type {
  ApiAppraiserMap,
  ApiAppraiserMapRow,
} from "@/lib/api/performance";

/**
 * Colleagues who shared a project, listed first where somebody is chosen.
 *
 * What is proved, in the three places it happens (the people in a list, "Ask colleagues", and the
 * appraiser map's row and dialog): those who shared a project come first, most shared first, each
 * labelled with how many, and everybody else follows in their own order; nobody is added, dropped or
 * chosen for the person, who still ticks or selects; and wherever the server said nothing (the setting
 * is off, not said, the request failed, or it said the list is empty) the list is exactly what it was
 * and nothing claims that anybody shared no projects. The server is asked only where the company has the
 * setting on, only while a dialog is open, and for a table row only once somebody reaches for it (or
 * rests the pointer on it for a moment, never for every row a pointer crosses).
 *
 * And **a list that is open is never rearranged under the pointer**: the answer arrives late, and for
 * a native select that is open, or a list somebody is about to tick, a group inserted at the top moves
 * every name and the click meant for one person lands on another. So what the list shows is fixed at
 * the moment it is reached for, an answer that lands after is applied the next time it is opened, and a
 * list nobody has touched still follows the answer as it arrives.
 */

const shared = vi.hoisted(() => ({
  colleagues: null as unknown,
  calls: [] as { employeeId: string | null; enabled: boolean }[],
}));
vi.mock("@/lib/store/shared-projects", () => ({
  useSharedProjects: (employeeId: string | null, enabled: boolean) => {
    shared.calls.push({ employeeId, enabled });
    return {
      colleagues: enabled
        ? (shared.colleagues as SharedColleague[] | null)
        : null,
      loading: false,
    };
  },
}));

const feature = vi.hoisted(() => ({ workInAnswers: true as boolean | null }));
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({ workInAnswers: feature.workInAnswers }),
}));

const people = [
  { id: "ada", firstName: "Ada", lastName: "Obi", jobTitle: "Engineer" },
  { id: "bola", firstName: "Bola", lastName: "Ade", jobTitle: "Analyst" },
  { id: "chidi", firstName: "Chidi", lastName: "Eze", jobTitle: "Designer" },
  { id: "dayo", firstName: "Dayo", lastName: "Ola", jobTitle: "Lead" },
  {
    id: "subject",
    firstName: "Femi",
    lastName: "Balogun",
    jobTitle: "Manager",
  },
];
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: people, people, loading: false }),
}));

const askPeers = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/performance", async (original) => ({
  ...(await original<typeof import("@/lib/api/performance")>()),
  performanceApi: {
    ...(await original<typeof import("@/lib/api/performance")>())
      .performanceApi,
    askPeers,
  },
}));

const mutations = vi.hoisted(() => ({ setAppraisers: vi.fn() }));
let currentMap: ApiAppraiserMap;
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({
    cycles: [{ id: "cy1", name: "H2 2026", stage: "SELF", stageLabel: "Self" }],
    loading: false,
  }),
  useAppraiserMap: () => ({
    map: currentMap,
    loading: false,
    error: null,
    editable: true,
    refusal: "",
    reload: vi.fn(),
  }),
  useAppraiserMutations: () => ({
    editable: true,
    refusal: "",
    autoAssign: vi.fn(),
    setAppraisers: mutations.setAppraisers,
  }),
}));

import { SharedProjectOptions } from "@/components/performance/shared-project-options";
import { AskPeersDialog } from "@/app/(app)/performance/periods/[id]/ask-peers";
import {
  AppraiserMapTab,
  AppraisersDialog,
} from "@/app/(app)/performance/appraiser-map";

const colleagues: SharedColleague[] = [
  { employeeId: "dayo", name: "Dayo Ola", sharedProjects: 3 },
  { employeeId: "bola", name: "Bola Ade", sharedProjects: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  shared.colleagues = colleagues;
  shared.calls = [];
  feature.workInAnswers = true;
});

const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((option) => option.textContent);

describe("the options in a list", () => {
  const list = people.map((p) => ({
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    jobTitle: p.jobTitle,
  }));
  const text = (p: { name: string }) => p.name;

  it("puts those who shared a project first under one heading, most shared first, and labels each", () => {
    render(
      <select aria-label="People">
        <SharedProjectOptions
          people={list}
          colleagues={colleagues}
          text={text}
        />
      </select>,
    );
    const select = screen.getByLabelText("People");
    expect(optionTexts(select)).toEqual([
      "Dayo Ola — Shared 3 projects",
      "Bola Ade — Shared 1 project",
      "Ada Obi",
      "Chidi Eze",
      "Femi Balogun",
    ]);
    const groups = Array.from(select.querySelectorAll("optgroup")).map(
      (group) => group.label,
    );
    expect(groups).toEqual(["Shared a project", "Everybody else"]);
  });

  it("is the plain list, with no heading and no label, where the server said nothing", () => {
    for (const none of [null, []] as const) {
      const { unmount } = render(
        <select aria-label="People">
          <SharedProjectOptions people={list} colleagues={none} text={text} />
        </select>,
      );
      const select = screen.getByLabelText("People");
      expect(optionTexts(select)).toEqual([
        "Ada Obi",
        "Bola Ade",
        "Chidi Eze",
        "Dayo Ola",
        "Femi Balogun",
      ]);
      expect(select.querySelector("optgroup")).toBeNull();
      unmount();
    }
  });

  it("has no 'everybody else' heading when everybody shared a project", () => {
    render(
      <select aria-label="People">
        <SharedProjectOptions
          people={list.slice(0, 2)}
          colleagues={[
            { employeeId: "ada", name: "Ada Obi", sharedProjects: 2 },
            { employeeId: "bola", name: "Bola Ade", sharedProjects: 1 },
          ]}
          text={text}
        />
      </select>,
    );
    const groups = Array.from(
      screen.getByLabelText("People").querySelectorAll("optgroup"),
    ).map((group) => group.label);
    expect(groups).toEqual(["Shared a project"]);
  });

  it("neither adds nor drops anybody", () => {
    render(
      <select aria-label="People">
        <SharedProjectOptions
          people={list}
          colleagues={[
            ...colleagues,
            {
              employeeId: "nobody-here",
              name: "Not On The List",
              sharedProjects: 9,
            },
          ]}
          text={text}
        />
      </select>,
    );
    const texts = optionTexts(screen.getByLabelText("People"));
    expect(texts).toHaveLength(5);
    expect(texts.join("|")).not.toContain("Not On The List");
  });
});

describe("Ask colleagues", () => {
  const mount = (open = true) =>
    render(
      <ToastProvider>
        <AskPeersDialog
          open={open}
          cycleId="cy1"
          subjectId="subject"
          subjectName="Femi Balogun"
          onClose={vi.fn()}
          onAsked={vi.fn()}
        />
      </ToastProvider>,
    );

  const names = () =>
    screen
      .getAllByRole("checkbox")
      .map((box) => box.closest("li")?.textContent ?? "");

  it("lists those who shared a project first, each saying how many, and says so", () => {
    mount();
    const rows = names();
    expect(rows[0]).toContain("Dayo Ola");
    expect(rows[0]).toContain("Lead · Shared 3 projects");
    expect(rows[1]).toContain("Bola Ade");
    expect(rows[1]).toContain("Analyst · Shared 1 project");
    expect(rows[2]).toContain("Ada Obi");
    expect(rows[2]).not.toContain("Shared");
    expect(
      screen.getByText(
        "People who shared a project with Femi Balogun are listed first. You still choose who to ask.",
      ),
    ).toBeInTheDocument();
  });

  it("never lists the person themselves", () => {
    mount();
    expect(names().join("|")).not.toContain("Femi Balogun");
  });

  it("chooses nobody for the person", () => {
    mount();
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
    expect(screen.getByText("Nobody chosen yet")).toBeInTheDocument();
  });

  it.each([
    ["the request failed or the reader is not one it answers", null],
    ["it says nobody shared a project", []],
  ])("is the list as it was, with no claim, when %s", (_why, answer) => {
    shared.colleagues = answer;
    mount();
    expect(
      names().map((row) => row.split("·")[0]?.trim().split(" Engineer")[0]),
    ).toBeDefined();
    expect(screen.queryByText(/Shared \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/listed first/)).not.toBeInTheDocument();
    const rows = names();
    expect(rows[0]).toContain("Ada Obi");
    expect(rows[1]).toContain("Bola Ade");
    expect(rows[2]).toContain("Chidi Eze");
    expect(rows[3]).toContain("Dayo Ola");
  });

  it("keeps the order when the list is searched", async () => {
    mount();
    await userEvent.type(
      screen.getByPlaceholderText("Search by name or job title"),
      "a",
    );
    const rows = names();
    expect(rows[0]).toContain("Dayo Ola");
    expect(rows[1]).toContain("Bola Ade");
  });

  describe("an answer that lands late", () => {
    const element = (open: boolean) => (
      <ToastProvider>
        <AskPeersDialog
          open={open}
          cycleId="cy1"
          subjectId="subject"
          subjectName="Femi Balogun"
          onClose={vi.fn()}
          onAsked={vi.fn()}
        />
      </ToastProvider>
    );
    const firstNames = () =>
      names().map(
        (row) =>
          ["Ada Obi", "Bola Ade", "Chidi Eze", "Dayo Ola"].find((name) =>
            row.startsWith(name),
          ) ?? row,
      );

    it("follows the answer for a list nobody has reached into", () => {
      shared.colleagues = null;
      const view = render(element(true));
      expect(firstNames()).toEqual([
        "Ada Obi",
        "Bola Ade",
        "Chidi Eze",
        "Dayo Ola",
      ]);
      shared.colleagues = colleagues;
      view.rerender(element(true));
      expect(firstNames().slice(0, 2)).toEqual(["Dayo Ola", "Bola Ade"]);
    });

    it("keeps the names where they were once somebody has reached into the list, and applies the answer when the dialog is opened again", async () => {
      shared.colleagues = null;
      const view = render(element(true));
      await userEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
      shared.colleagues = colleagues;
      view.rerender(element(true));
      expect(firstNames()).toEqual([
        "Ada Obi",
        "Bola Ade",
        "Chidi Eze",
        "Dayo Ola",
      ]);
      view.rerender(element(false));
      view.rerender(element(true));
      expect(firstNames().slice(0, 2)).toEqual(["Dayo Ola", "Bola Ade"]);
    });

    it("holds for a key pressed in the list as well as a press", async () => {
      shared.colleagues = null;
      const view = render(element(true));
      const box = screen.getAllByRole("checkbox")[0] as HTMLElement;
      box.focus();
      await userEvent.keyboard(" ");
      shared.colleagues = colleagues;
      view.rerender(element(true));
      expect(firstNames()[0]).toBe("Ada Obi");
    });

    it("does not hold for a search typed above the list, which is not a list being picked from", async () => {
      shared.colleagues = null;
      const view = render(element(true));
      await userEvent.type(
        screen.getByPlaceholderText("Search by name or job title"),
        "a",
      );
      shared.colleagues = colleagues;
      view.rerender(element(true));
      expect(firstNames()[0]).toBe("Dayo Ola");
    });
  });

  it("asks only while the dialog is open and the company has the setting on", () => {
    mount(false);
    expect(shared.calls.every((call) => call.enabled === false)).toBe(true);
    shared.calls = [];
    mount(true);
    expect(shared.calls.at(-1)).toEqual({
      employeeId: "subject",
      enabled: true,
    });
  });

  it.each([false, null])("does not ask when the setting is %s", (setting) => {
    feature.workInAnswers = setting;
    mount();
    expect(shared.calls.every((call) => call.enabled === false)).toBe(true);
    expect(screen.queryByText(/Shared \d/)).not.toBeInTheDocument();
  });
});

const mapRow = (id: string, name: string): ApiAppraiserMapRow => ({
  employeeId: id,
  employeeName: name,
  jobTitle: "Analyst",
  departmentId: null,
  departmentName: null,
  lineManagerId: null,
  lineManagerName: null,
  appraisers: [],
  totalWeightBp: 0,
  submittedWeightBp: 0,
  weightedRating: null,
  exceptions: [],
});

describe("the appraiser map", () => {
  beforeEach(() => {
    currentMap = {
      cycleId: "cy1",
      cycleName: "H2 2026",
      stage: "SELF",
      started: true,
      rows: [mapRow("subject", "Femi Balogun")],
      counts: {
        people: 1,
        simple: 0,
        multiAppraiser: 0,
        unassigned: 1,
        blockers: 1,
        warnings: 0,
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const tree = () => (
    <ToastProvider>
      <AppraiserMapTab />
    </ToastProvider>
  );
  const select = () =>
    screen.getByRole("combobox", { name: "Appraiser for Femi Balogun" });
  const groupsOf = (element: HTMLElement) =>
    Array.from(element.querySelectorAll("optgroup")).map(
      (group) => group.label,
    );
  const askedFor = (employeeId: string) =>
    shared.calls.some(
      (call) => call.employeeId === employeeId && call.enabled === true,
    );

  it("does not ask for a row until somebody reaches for its list", () => {
    render(tree());
    const mine = shared.calls.filter((call) => call.employeeId === "subject");
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((call) => call.enabled === false)).toBe(true);
    expect(optionTexts(select()).join("|")).not.toContain("Shared");
  });

  describe("reaching for a list that has not been asked about yet", () => {
    it("asks at once, and the list that opens is the list as it was drawn, with nothing moved under the pointer", async () => {
      render(tree());
      await userEvent.click(select());
      expect(shared.calls.at(-1)).toEqual({
        employeeId: "subject",
        enabled: true,
      });
      /* The answer is there by now, and is not applied to a list that is already open. */
      expect(optionTexts(select()).join("|")).not.toContain("Shared");
      expect(groupsOf(select())).toEqual([]);
    });

    it("applies it the next time the list is opened, when the person has left it", async () => {
      render(tree());
      await userEvent.click(select());
      await userEvent.tab();
      const texts = optionTexts(select());
      expect(texts).toContain("Dayo Ola — Shared 3 projects");
      expect(texts.indexOf("Dayo Ola — Shared 3 projects")).toBeLessThan(
        texts.indexOf("Ada Obi"),
      );
      /* The person themselves is never offered as their own appraiser. */
      expect(texts.join("|")).not.toContain("Femi Balogun");
    });

    it("keeps the list as it was while it is open even when the answer lands after, and applies it once it is left", async () => {
      shared.colleagues = null;
      const view = render(tree());
      await userEvent.click(select());
      expect(groupsOf(select())).toEqual([]);
      /* The answer lands while the list is open. */
      shared.colleagues = colleagues;
      view.rerender(tree());
      expect(groupsOf(select())).toEqual([]);
      expect(optionTexts(select()).join("|")).not.toContain("Shared");
      /* Left alone: now it is applied. */
      await userEvent.tab();
      expect(groupsOf(select())).toEqual([
        "Shared a project",
        "Everybody else",
      ]);
    });

    it("takes what has arrived when the list is pressed again after being dismissed with the focus left on it", async () => {
      shared.colleagues = null;
      const view = render(tree());
      await userEvent.click(select());
      shared.colleagues = colleagues;
      view.rerender(tree());
      expect(groupsOf(select())).toEqual([]);
      /* Escape closes a native list and leaves the focus where it was: no blur, no change. The next press
         opens it again, and the list that opens is the one with the answer in it. */
      await userEvent.keyboard("{Escape}");
      expect(groupsOf(select())).toEqual([]);
      fireEvent.mouseDown(select());
      expect(groupsOf(select())).toEqual([
        "Shared a project",
        "Everybody else",
      ]);
    });

    it("lets go of the held list when a choice is made, so the next opening has the answer", async () => {
      shared.colleagues = null;
      const view = render(tree());
      await userEvent.click(select());
      shared.colleagues = colleagues;
      view.rerender(tree());
      expect(groupsOf(select())).toEqual([]);
      /* The browser reports the choice; no press is involved, so only the choice itself can let go. */
      fireEvent.change(select(), { target: { value: "dayo" } });
      expect(groupsOf(select())).toEqual([
        "Shared a project",
        "Everybody else",
      ]);
    });

    it("holds when the list is reached by the keyboard too", async () => {
      shared.colleagues = null;
      const view = render(tree());
      act(() => select().focus());
      expect(select()).toHaveFocus();
      shared.colleagues = colleagues;
      view.rerender(tree());
      expect(groupsOf(select())).toEqual([]);
      await userEvent.tab();
      expect(groupsOf(select())).toEqual([
        "Shared a project",
        "Everybody else",
      ]);
    });

    it("still follows the answer as it arrives for a list nobody has touched", () => {
      shared.colleagues = null;
      const view = render(tree());
      expect(groupsOf(select())).toEqual([]);
      shared.colleagues = colleagues;
      view.rerender(tree());
      /* Nobody has reached for it, so it was not asked and there is nothing to apply: the plain list. */
      expect(groupsOf(select())).toEqual([]);
    });
  });

  describe("resting the pointer on a row", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("asks once the pointer has rested for a moment, so the answer is there by the time the list is opened, and the list that opens has it", () => {
      render(tree());
      fireEvent.pointerEnter(select());
      expect(askedFor("subject")).toBe(false);
      act(() => {
        vi.advanceTimersByTime(249);
      });
      expect(askedFor("subject")).toBe(false);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(askedFor("subject")).toBe(true);
      /* Reached for now: the answer is already there, so the list that opens has it. */
      fireEvent.mouseDown(select());
      expect(groupsOf(select())).toEqual([
        "Shared a project",
        "Everybody else",
      ]);
      expect(optionTexts(select())[1]).toBe("Dayo Ola — Shared 3 projects");
    });

    it("asks nothing for a pointer that only crosses the row on its way down the column", () => {
      currentMap = {
        ...currentMap,
        rows: [mapRow("subject", "Femi Balogun"), mapRow("other", "Kemi Ojo")],
      };
      render(tree());
      const first = select();
      const second = screen.getByRole("combobox", {
        name: "Appraiser for Kemi Ojo",
      });
      fireEvent.pointerEnter(first);
      act(() => {
        vi.advanceTimersByTime(100);
      });
      fireEvent.pointerLeave(first);
      fireEvent.pointerEnter(second);
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(askedFor("subject")).toBe(false);
      expect(askedFor("other")).toBe(true);
      /* And the one it left never asks later: the wait was cancelled, not just outlived. */
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(askedFor("subject")).toBe(false);
    });

    it("does not ask where the company has the setting off, however long the pointer rests", () => {
      feature.workInAnswers = false;
      render(tree());
      fireEvent.pointerEnter(select());
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(shared.calls.every((call) => call.enabled === false)).toBe(true);
    });

    it("stops waiting when the row goes away", () => {
      const view = render(tree());
      const cleared = vi.spyOn(window, "clearTimeout");
      fireEvent.pointerEnter(select());
      view.unmount();
      expect(cleared).toHaveBeenCalled();
      cleared.mockRestore();
    });
  });

  it("never asks where the company has the setting off", async () => {
    feature.workInAnswers = false;
    render(tree());
    await userEvent.click(select());
    expect(shared.calls.every((call) => call.enabled === false)).toBe(true);
    expect(optionTexts(select()).join("|")).not.toContain("Shared");
  });

  it("changes nothing about a pick: choosing a person still saves that person", async () => {
    const quick = vi.fn();
    mutations.setAppraisers.mockImplementation(quick);
    render(tree());
    await userEvent.click(select());
    /* What a browser does when an option in its open list is clicked: the list is not touched, the
       select reports the choice. */
    fireEvent.change(select(), { target: { value: "dayo" } });
    expect(quick).toHaveBeenCalled();
    const [, , entries] = quick.mock.calls[0] as unknown as [
      string,
      string,
      { appraiserId: string }[],
    ];
    expect(entries[0]?.appraiserId).toBe("dayo");
  });
});

describe("the dialog that shares the mark between several", () => {
  const open = () =>
    render(
      <ToastProvider>
        <AppraisersDialog
          cycleId="cy1"
          row={mapRow("subject", "Femi Balogun")}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ToastProvider>,
    );

  it("lists those who shared a project first, in the appraiser list", () => {
    open();
    const appraiser = screen.getAllByRole("combobox")[0] as HTMLElement;
    const texts = optionTexts(appraiser);
    expect(texts).toContain("Dayo Ola — Lead — Shared 3 projects");
    expect(texts.indexOf("Dayo Ola — Lead — Shared 3 projects")).toBeLessThan(
      texts.indexOf("Ada Obi — Engineer"),
    );
    expect(shared.calls.at(-1)).toEqual({
      employeeId: "subject",
      enabled: true,
    });
  });

  it("is the list as it was where the server said nothing", () => {
    shared.colleagues = null;
    open();
    const appraiser = screen.getAllByRole("combobox")[0] as HTMLElement;
    expect(optionTexts(appraiser).join("|")).not.toContain("Shared");
    expect(appraiser.querySelector("optgroup")).toBeNull();
  });

  describe("an answer that lands late", () => {
    /* A fresh element each time: React does not re-render an element it has already rendered. */
    const element = () => (
      <ToastProvider>
        <AppraisersDialog
          cycleId="cy1"
          row={mapRow("subject", "Femi Balogun")}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ToastProvider>
    );
    const groups = (select: HTMLElement) =>
      Array.from(select.querySelectorAll("optgroup")).map((g) => g.label);

    it("follows the answer for a list nobody has touched", () => {
      shared.colleagues = null;
      const view = render(element());
      expect(groups(screen.getAllByRole("combobox")[0] as HTMLElement)).toEqual(
        [],
      );
      shared.colleagues = colleagues;
      view.rerender(element());
      expect(groups(screen.getAllByRole("combobox")[0] as HTMLElement)).toEqual(
        ["Shared a project", "Everybody else"],
      );
    });

    it("does not rearrange a list that is open, and applies the answer once the person has left it", async () => {
      shared.colleagues = null;
      const view = render(element());
      const appraiser = () => screen.getAllByRole("combobox")[0] as HTMLElement;
      await userEvent.click(appraiser());
      shared.colleagues = colleagues;
      view.rerender(element());
      expect(groups(appraiser())).toEqual([]);
      expect(optionTexts(appraiser()).join("|")).not.toContain("Shared");
      /* The dialog's own focus trap keeps a Tab inside it, so the list is left by a real blur. */
      act(() => appraiser().blur());
      expect(groups(appraiser())).toEqual([
        "Shared a project",
        "Everybody else",
      ]);
    });

    it("lets go when a choice is made, and the choice is the one that was clicked", async () => {
      shared.colleagues = null;
      const view = render(element());
      const appraiser = () => screen.getAllByRole("combobox")[0] as HTMLElement;
      await userEvent.click(appraiser());
      shared.colleagues = colleagues;
      view.rerender(element());
      fireEvent.change(appraiser(), { target: { value: "chidi" } });
      expect(appraiser()).toHaveValue("chidi");
      expect(groups(appraiser())).toEqual([
        "Shared a project",
        "Everybody else",
      ]);
    });
  });

  it("does not ask where the company has the setting off", () => {
    feature.workInAnswers = null;
    open();
    expect(shared.calls.every((call) => call.enabled === false)).toBe(true);
  });
});
