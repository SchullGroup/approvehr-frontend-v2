import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { PickerOption } from "@/components/ui";
import { SearchPicker } from "@/components/ui";
import {
  company,
  deferred,
  fakeDirectory,
  type Person,
} from "./employee-directory-fake";

/**
 * Finding a colleague by typing, in a company bigger than the API's page.
 *
 * The picker in Give kudos (and the one that sends a document for signature)
 * read the first two hundred people, which is the API's page ceiling, and
 * filtered those in the browser. In a company of four hundred and fifty,
 * colleague 380 could not be thanked. What is pinned here is that she can, by
 * typing her name, against a fake that answers the way the API does: `q` is
 * matched one field at a time, so a full name typed with its space matches
 * nobody unless the client does something about it.
 */

const list = vi.fn();
let connected = true;
let me: string | null = "p001";

vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/endpoints")>();
  return {
    ...actual,
    employees: {
      ...actual.employees,
      list: (...args: unknown[]) => list(...args),
    },
  };
});
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: connected,
    isLoading: false,
    employeeId: me,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const { employeeSearchPlan, useEmployeeSearch } =
  await import("@/lib/store/employees-api");

/** The two real pieces together, as the dialogs wire them. */
function Harness({ excludeId = null }: { excludeId?: string | null }) {
  const search = useEmployeeSearch({ excludeId, debounceMs: 20 });
  const [chosen, setChosen] = useState<PickerOption | null>(null);
  return (
    <>
      <SearchPicker
        selected={chosen}
        onSelect={setChosen}
        onQueryChange={search.search}
        options={search.options}
        pending={search.pending}
        failed={search.failed}
        onRetry={search.retry}
        more={search.more}
        aria-label="Who"
      />
      <output data-testid="chosen">{chosen?.value ?? "none"}</output>
    </>
  );
}

const zainab: Person = {
  id: "p380",
  firstName: "Zainab",
  lastName: "Okafor",
  jobTitle: "Auditor",
  department: "Finance",
};
/** Four hundred and fifty people; number 380 is Zainab, who sorts last. */
const BIG = company(450, { 380: zainab });

type Answer = Awaited<ReturnType<ReturnType<typeof fakeDirectory>["list"]>>;

const who = () => screen.getByRole("combobox", { name: "Who" });
const names = () => screen.queryAllByRole("option").map((o) => o.textContent);

beforeEach(() => {
  vi.resetAllMocks();
  connected = true;
  me = "p001";
});

describe("what a box of words becomes", () => {
  it("sends nothing for an empty box and the word itself for one", () => {
    expect(employeeSearchPlan("")).toEqual({ q: undefined, words: [] });
    expect(employeeSearchPlan("   ")).toEqual({ q: undefined, words: [] });
    expect(employeeSearchPlan(" Okafor ")).toEqual({
      q: "Okafor",
      words: [],
    });
  });

  it("sends the longest word of a full name, and keeps every word to check the answer", () => {
    expect(employeeSearchPlan("Zainab Okafor")).toEqual({
      q: "Zainab",
      words: ["zainab", "okafor"],
    });
    expect(employeeSearchPlan("Ngozi  Eze")).toEqual({
      q: "Ngozi",
      words: ["ngozi", "eze"],
    });
  });
});

describe("a company of 450, where colleague 380 is past the page", () => {
  it("is a real gap: the old call never held her", async () => {
    const fake = fakeDirectory(BIG);
    const old = await fake.list({ pageSize: 200 });
    expect(old.data).toHaveLength(200);
    expect(old.data.map((row) => row.id)).not.toContain("p380");
    expect(old.meta.total).toBe(450);
  });

  it("opens on a short first page, and says there are more", async () => {
    list.mockImplementation(fakeDirectory(BIG).list);
    render(<Harness />);
    await userEvent.click(who());

    await waitFor(() => expect(names()).toHaveLength(8));
    expect(names()[0]).toContain("Staff000 Member000");
    expect(screen.getByText("Keep typing to narrow the list.")).toBeVisible();
    /* One short request, not two hundred rows. */
    expect(list).toHaveBeenCalledWith({ pageSize: 10 }, expect.anything());
  });

  it("finds her by her full name, with its space", async () => {
    const fake = fakeDirectory(BIG);
    list.mockImplementation(fake.list);
    render(<Harness />);
    await userEvent.click(who());
    await userEvent.type(who(), "Zainab Okafor");

    const row = await screen.findByRole("option", { name: /Zainab Okafor/ });
    expect(row).toHaveTextContent("Auditor · Finance");
    expect(names()).toHaveLength(1);
    /* The server was asked for one word, because the API cannot match two. */
    expect(fake.calls.at(-1)).toMatchObject({ q: "Zainab" });

    await userEvent.click(row);
    expect(screen.getByTestId("chosen")).toHaveTextContent("p380");
    expect(who()).toHaveValue("Zainab Okafor");
  });

  it("finds her by surname alone, or by the first letters of her first name", async () => {
    list.mockImplementation(fakeDirectory(BIG).list);
    render(<Harness />);
    await userEvent.click(who());
    await userEvent.type(who(), "okaf");
    expect(
      await screen.findByRole("option", { name: /Zainab Okafor/ }),
    ).toBeInTheDocument();
  });

  it("checks every word, so a second word narrows the answer", async () => {
    const twins: Person[] = [
      { id: "t1", firstName: "Ada", lastName: "Obi" },
      { id: "t2", firstName: "Ada", lastName: "Eze" },
    ];
    list.mockImplementation(fakeDirectory([...BIG, ...twins]).list);
    render(<Harness />);
    await userEvent.click(who());
    await userEvent.type(who(), "Ada Eze");

    await screen.findByRole("option", { name: /Ada Eze/ });
    await waitFor(() => expect(names()).toHaveLength(1));
    expect(names()[0]).not.toContain("Ada Obi");
  });

  it("says nobody matches, and does not say it was an error", async () => {
    list.mockImplementation(fakeDirectory(BIG).list);
    render(<Harness />);
    await userEvent.click(who());
    await userEvent.type(who(), "Nobodyhere");

    expect(
      await screen.findByText("Nobody matches “Nobodyhere”."),
    ).toBeVisible();
    expect(screen.queryByText("The search did not work.")).toBeNull();
  });

  it("leaves yourself out, even when you are what was typed", async () => {
    list.mockImplementation(fakeDirectory(BIG).list);
    render(<Harness excludeId="p001" />);
    await userEvent.click(who());
    await userEvent.type(who(), "Member001");

    expect(
      await screen.findByText("Nobody matches “Member001”."),
    ).toBeVisible();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("works for a caller who is sent lookup rows, and for one who is sent full rows", async () => {
    for (const as of ["lookup", "full"] as const) {
      list.mockImplementation(fakeDirectory(BIG, { as }).list);
      const { unmount } = render(<Harness />);
      await userEvent.click(who());
      await userEvent.type(who(), "Zainab Okafor");
      expect(
        await screen.findByRole("option", { name: /Zainab Okafor/ }),
      ).toBeInTheDocument();
      unmount();
    }
  });
});

describe("the race between two searches", () => {
  const start = async () => {
    const first = deferred<Answer>();
    const second = deferred<Answer>();
    const fake = fakeDirectory(BIG);
    list.mockImplementation(async (params: { q?: string }) => {
      if (params.q === "Sta") return first.promise;
      if (params.q === "Zain") return second.promise;
      return fake.list(params);
    });
    render(<Harness />);
    await userEvent.click(who());
    await waitFor(() => expect(names()).toHaveLength(8));

    await userEvent.type(who(), "Sta");
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ q: "Sta" }),
        expect.anything(),
      ),
    );
    /* One call, so no pause long enough for the empty box in between to be sent. */
    await userEvent.type(who(), "{Backspace}{Backspace}{Backspace}Zain");
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ q: "Zain" }),
        expect.anything(),
      ),
    );
    return {
      sta: async () =>
        first.resolve(
          await fakeDirectory(BIG).list({ q: "Sta", pageSize: 10 }),
        ),
      zain: async () =>
        second.resolve(
          await fakeDirectory(BIG).list({ q: "Zain", pageSize: 10 }),
        ),
    };
  };

  it("keeps the newer answer when the older one lands last", async () => {
    const answers = await start();

    await answers.zain();
    await screen.findByRole("option", { name: /Zainab Okafor/ });
    await answers.sta();
    /* Give a late render the chance to show the wrong list. */
    await new Promise((r) => setTimeout(r, 30));

    expect(names()).toHaveLength(1);
    expect(names()[0]).toContain("Zainab Okafor");
    expect(screen.queryByText(/Staff000/)).toBeNull();
  });

  it("does not show the older answer as the newer one when it lands first", async () => {
    const answers = await start();

    await answers.sta();
    await new Promise((r) => setTimeout(r, 30));
    /* Still waiting on "Zain": nothing from "Sta" may pass for it, and Enter
       must not take a row from it. */
    expect(screen.getByText("Searching…")).toBeVisible();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("chosen")).toHaveTextContent("none");

    await answers.zain();
    expect(
      await screen.findByRole("option", { name: /Zainab Okafor/ }),
    ).toBeInTheDocument();
    expect(names()).toHaveLength(1);
  });
});

describe("when the search does not work", () => {
  it("says so, offers a retry, and is not mistaken for an empty company", async () => {
    const fake = fakeDirectory(BIG);
    list
      .mockResolvedValueOnce(await fake.list({ pageSize: 10 }))
      .mockRejectedValueOnce(
        new ApiError(500, "internal", "The server had a problem."),
      );
    render(<Harness />);
    await userEvent.click(who());
    await waitFor(() => expect(names()).toHaveLength(8));

    await userEvent.type(who(), "Zainab");
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeVisible();
    /* Once on screen and once for a screen reader. */
    expect(screen.getAllByText("The search did not work.")).toHaveLength(2);
    expect(screen.queryByText(/Nobody matches/)).toBeNull();

    list.mockImplementation(fake.list);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("option", { name: /Zainab Okafor/ }),
    ).toBeInTheDocument();
  });
});

describe("the chosen person", () => {
  it("stays in the box while the list changes under it, and comes back after a half-typed search", async () => {
    list.mockImplementation(fakeDirectory(BIG).list);
    render(<Harness />);
    await userEvent.click(who());
    await userEvent.type(who(), "Zainab Okafor");
    await userEvent.click(
      await screen.findByRole("option", { name: /Zainab/ }),
    );
    expect(who()).toHaveValue("Zainab Okafor");

    /* Search for somebody else, and think better of it. */
    await userEvent.click(who());
    await userEvent.type(who(), "Staff200");
    await screen.findByRole("option", { name: /Staff200/ });
    await userEvent.keyboard("{Escape}");

    expect(who()).toHaveValue("Zainab Okafor");
    expect(screen.getByTestId("chosen")).toHaveTextContent("p380");
  });
});

describe("in the demo, where there is no API", () => {
  it("searches the local directory with the same hook, and asks the server nothing", async () => {
    connected = false;
    me = null;
    const { result } = renderHook(() =>
      useEmployeeSearch({ debounceMs: 0, limit: 50 }),
    );
    await waitFor(() => expect(result.current.pending).toBe(false));
    const everybody = result.current.people;
    expect(everybody.length).toBeGreaterThan(3);

    const target = everybody[2]!;
    const [firstName, ...rest] = target.fullName.split(" ");
    const lastName = rest.join(" ");
    act(() => result.current.search(`${firstName} ${lastName}`));
    /* Settled, and narrowed to the person: not merely still holding everybody. */
    await waitFor(() => {
      expect(result.current.pending).toBe(false);
      expect(result.current.people.length).toBeLessThan(everybody.length);
    });
    expect(result.current.people.map((p) => p.id)).toContain(target.id);
    expect(list).not.toHaveBeenCalled();
  });
});
