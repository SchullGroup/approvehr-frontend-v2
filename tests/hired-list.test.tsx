import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoHired } from "@/lib/hiring/hired/demo-store";
import { book, crowd, hire, useBook } from "./hired-helpers";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * The Hired list: everybody whose offer was accepted, and what became of them.
 *
 * Hired is not employed. Making an employee of somebody is a separate, explicit step,
 * offered only where the company has Core HR, and a company without it has a complete
 * list with no such step at all.
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/hired",
  useSearchParams: () => new URLSearchParams(),
}));
const saved = vi.hoisted(() => ({
  files: [] as { name: string; body: string }[],
}));
vi.mock("@/lib/csv", async (original) => {
  const real = await original<typeof import("@/lib/csv")>();
  return {
    ...real,
    downloadCsv: (name: string, body: string) => {
      saved.files.push({ name, body });
    },
  };
});

const { HiredList } = await import("@/components/hiring/hired/hired-list");
const { HiredScreen } = await import("@/app/(app)/hiring/hired/hired-screen");

const table = () => screen.getByRole("table");
/** The person's own cell, the row's header: name, then contact and reference. */
const namesInTable = () =>
  within(table())
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).queryAllByRole("rowheader")[0]?.textContent ?? "");

const row = (name: string): HTMLElement => {
  const found = within(table())
    .getAllByRole("row")
    .find((r) => within(r).queryByText(name));
  if (!found) throw new Error(`No row for ${name}`);
  return found;
};

beforeEach(() => {
  saved.files.length = 0;
  useBook(book());
});

describe("what the list shows", () => {
  it("lists everybody, newest hire first, with each state counted", async () => {
    renderInToasts(<HiredList />);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(namesInTable()).toHaveLength(5);
    expect(namesInTable()[0]).toMatch(/^Ada Okafor/);
    expect(namesInTable()[4]).toMatch(/^Tunde Bakare/);

    const group = screen.getByRole("radiogroup", {
      name: "Show people who are",
    });
    expect(within(group).getByRole("radio", { name: "All 5" })).toBeVisible();
    expect(within(group).getByRole("radio", { name: "Hired 3" })).toBeVisible();
    expect(
      within(group).getByRole("radio", { name: "Employee created 1" }),
    ).toBeVisible();
    expect(
      within(group).getByRole("radio", { name: "Did not join 1" }),
    ).toBeVisible();
  });

  it("draws the same people as cards on a phone", async () => {
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    const cards = document.querySelectorAll("ul.sm\\:hidden > li");
    expect(cards).toHaveLength(5);
    expect(cards[0]).toHaveTextContent("Ada Okafor");
    expect(cards[0]).toHaveTextContent("Payroll Analyst");
    expect(
      within(cards[0] as HTMLElement).getByRole("button", {
        name: "Create employee record for Ada Okafor",
      }),
    ).toBeInTheDocument();
  });

  it("says the state, with the reason somebody did not join and who an employee is", async () => {
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    expect(within(row("Tunde Bakare")).getByText("Did not join")).toBeVisible();
    expect(
      within(row("Tunde Bakare")).getByText("Took a counter-offer."),
    ).toBeVisible();
    expect(
      within(row("Kemi Sani")).getByText("Employee created"),
    ).toBeVisible();
    /* A practice list has no employee directory, so it draws no dead link. */
    expect(
      within(row("Kemi Sani")).queryByRole("link", {
        name: /employee record/,
      }),
    ).not.toBeInTheDocument();
  });

  it("is narrowed by the state buttons, the search, and the job", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("radio", { name: "Did not join 1" }));
    await waitFor(() => expect(namesInTable()).toHaveLength(1));
    expect(namesInTable()[0]).toMatch(/^Tunde Bakare/);
    await user.click(screen.getByRole("radio", { name: /^All/ }));

    await user.type(
      screen.getByRole("textbox", { name: "Find somebody on the Hired list" }),
      "ngozi",
    );
    await waitFor(() => expect(namesInTable()).toHaveLength(1));
    expect(namesInTable()[0]).toMatch(/^Ngozi Eze/);

    await user.clear(
      screen.getByRole("textbox", { name: "Find somebody on the Hired list" }),
    );
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Job" }),
      "job-b",
    );
    await waitFor(() => expect(namesInTable()).toHaveLength(2));
    expect(namesInTable().join(" ")).toMatch(/Ngozi Eze.*Kemi Sani/);
  });

  it("opens already narrowed to one job when a role's page sends you there", async () => {
    renderInToasts(<HiredList initialJob="job-a" />);
    await waitFor(() => expect(namesInTable()).toHaveLength(2));
    expect(namesInTable().join(" ")).toMatch(/Ada Okafor.*Bayo Adeyemi/);
  });

  it("says nobody matches when nobody does, and that nobody has been hired when that is true", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    await user.type(
      screen.getByRole("textbox", { name: "Find somebody on the Hired list" }),
      "zzzzzz",
    );
    expect(await screen.findByText("Nobody matches")).toBeInTheDocument();
  });

  it("is honest about an empty list", async () => {
    useBook(book({ hires: [] }));
    renderInToasts(<HiredList />);
    expect(
      await screen.findByText("Nobody has been hired yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "When an offer is recorded as accepted, the person appears here.",
      ),
    ).toBeInTheDocument();
  });

  it("sorts by name when asked", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort the Hired list" }),
      "name",
    );
    await waitFor(() => expect(namesInTable()[0]).toMatch(/^Ada Okafor/));
    expect(namesInTable()[1]).toMatch(/^Bayo Adeyemi/);
    expect(namesInTable()[4]).toMatch(/^Tunde Bakare/);
  });
});

describe("Create employee", () => {
  it("asks first, says what will and will not happen, then makes the record", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");

    await user.click(
      within(row("Ngozi Eze")).getByRole("button", {
        name: "Create employee record for Ngozi Eze",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "An employee record is created for Ngozi Eze",
    );
    expect(dialog).toHaveTextContent("No invitation to sign in is sent");
    expect(dialog).not.toHaveTextContent("Onboarding starts");
    expect(dialog).toHaveTextContent("sends no email of its own");

    await user.click(
      within(dialog).getByRole("button", { name: "Create employee record" }),
    );
    expect(
      await screen.findByText("Employee record created for Ngozi Eze"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(row("Ngozi Eze")).getByText("Employee created"),
      ).toBeVisible(),
    );
    expect(
      demoHired.current().hires.find((h) => h.id === "ngozi")?.employeeId,
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Employee created 2" }),
    ).toBeVisible();
  });

  it("shows the API's own refusal in the dialog when somebody else got there first, and leaves the list truthful", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    await user.click(
      within(row("Ada Okafor")).getByRole("button", {
        name: "Create employee record for Ada Okafor",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    /* A colleague made the record while the dialog was open. */
    demoHired.commit({
      ...demoHired.current(),
      employees: [
        ...demoHired.current().employees,
        {
          id: "emp-2",
          employeeNo: "EMP-0002",
          name: "Ada Okafor",
          email: "other@mail.com",
        },
      ],
      hires: demoHired
        .current()
        .hires.map((h) =>
          h.id === "ada"
            ? { ...h, employeeId: "emp-2", employeeVia: "CREATED" as const }
            : h,
        ),
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Create employee record" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "An employee record already exists for them.",
    );
    expect(
      demoHired
        .current()
        .employees.filter((e) => e.email === "ada.okafor@mail.com"),
    ).toHaveLength(0);
  });
});

describe("Link to an existing employee", () => {
  beforeEach(() => {
    useBook(
      book({
        employees: [
          {
            id: "emp-1",
            employeeNo: "EMP-0001",
            name: "Kemi Sani",
            email: "kemi.sani@mail.com",
          },
          {
            id: "emp-9",
            employeeNo: "EMP-0457",
            name: "N. Eze (Finance)",
            email: "ngozi.eze@mail.com",
          },
        ],
      }),
    );
  });

  async function refused(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      within(row("Ngozi Eze")).getByRole("button", {
        name: "Create employee record for Ngozi Eze",
      }),
    );
    const ask = await screen.findByRole("dialog");
    await user.click(
      within(ask).getByRole("button", { name: "Create employee record" }),
    );
    return screen.findByRole("dialog", {
      name: "Link Ngozi Eze to an employee who is already here?",
    });
  }

  it("is found by trying: the refusal says who, offers to link, and never merges silently", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    const dialog = await refused(user);
    /* The API's own sentence, then who it is. */
    expect(dialog).toHaveTextContent(
      "ngozi.eze@mail.com is already on N. Eze (Finance)'s record (EMP-0457)",
    );
    expect(dialog).toHaveTextContent("EMP-0457");
    expect(dialog).toHaveTextContent("Nothing is merged");
    expect(dialog).toHaveTextContent("no new employee record is created");
    expect(demoHired.current().employees).toHaveLength(2);
    expect(
      demoHired.current().hires.find((h) => h.id === "ngozi")?.employeeId,
    ).toBeNull();
    /* It was a question, not a failure: nothing red was shown. */
    expect(
      screen.queryByText(/No employee record was created/),
    ).not.toBeInTheDocument();
  });

  it("links on an explicit press, creating nobody", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    const dialog = await refused(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Link to N. Eze (Finance)" }),
    );
    expect(
      await screen.findByText("Ngozi Eze is linked to N. Eze (Finance)"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(row("Ngozi Eze")).getByText(
          "Linked to an employee who was already here.",
        ),
      ).toBeVisible(),
    );
    expect(demoHired.current().employees).toHaveLength(2);
    expect(
      demoHired.current().hires.find((h) => h.id === "ngozi")?.employeeId,
    ).toBe("emp-9");
  });

  it("is offered on the row from then on, instead of Create employee", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    const dialog = await refused(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      within(row("Ngozi Eze")).queryByRole("button", {
        name: "Create employee record for Ngozi Eze",
      }),
    ).not.toBeInTheDocument();
    await user.click(
      within(row("Ngozi Eze")).getByRole("button", {
        name: "Link to existing employee",
      }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "Link Ngozi Eze to an employee who is already here?",
      }),
    ).toHaveTextContent("EMP-0457");
  });
});

describe("Did not join", () => {
  it("needs a reason, explains that it frees the place, and reopens a job that was filled", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    await user.click(
      within(row("Ada Okafor")).getByRole("button", {
        name: "Mark Ada Okafor as did not join",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("It frees their place on Payroll Analyst");
    expect(dialog).toHaveTextContent(
      "If the job had been filled, it opens again",
    );

    const confirm = within(dialog).getByRole("button", {
      name: "Mark as did not join",
    });
    expect(confirm).toBeDisabled();
    await user.type(
      within(dialog).getByRole("textbox", { name: /Why did they not join/ }),
      "Moved to Abuja",
    );
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(
      await screen.findByText("Ada Okafor is marked as not joining"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Payroll Analyst is open again."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(row("Ada Okafor")).getByText("Did not join")).toBeVisible(),
    );
    expect(within(row("Ada Okafor")).getByText("Moved to Abuja")).toBeVisible();
    expect(
      demoHired.current().jobs.find((job) => job.id === "job-a")?.status,
    ).toBe("OPEN");
  });

  it("starts blank each time, so one person's reason is not offered for the next", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    await user.click(
      within(row("Ada Okafor")).getByRole("button", {
        name: "Mark Ada Okafor as did not join",
      }),
    );
    let dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: /Why did they not join/ }),
      "A reason that is not saved",
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(
      within(row("Bayo Adeyemi")).getByRole("button", {
        name: "Mark Bayo Adeyemi as did not join",
      }),
    );
    dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("textbox", { name: /Why did they not join/ }),
    ).toHaveValue("");
  });
});

describe("Creating employees for many", () => {
  it("offers 'select all matching' only when there is more than a page, with the exact count", async () => {
    const user = userEvent.setup();
    useBook(book({ hires: crowd(40) }));
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    expect(
      screen.queryByText(/Select all 40 matching/),
    ).not.toBeInTheDocument();

    await user.click(
      within(table()).getByRole("checkbox", { name: "Select everyone shown" }),
    );
    const bar = screen.getByRole("region", {
      name: "Actions for the people you have selected",
    });
    expect(bar).toHaveTextContent("25 people selected");
    await user.click(
      within(bar).getByRole("button", {
        name: /Select all 40 matching these filters/,
      }),
    );
    const everyone = await screen.findByRole("dialog");
    expect(everyone).toHaveTextContent("That is 40 people on the Hired list");
    expect(everyone).toHaveTextContent(
      "If the list changes before you act, nothing is done and you are told.",
    );
    await user.click(
      within(everyone).getByRole("button", { name: "Select all 40" }),
    );
    expect(bar).toHaveTextContent("All 40 matching these filters selected");
  });

  it("makes the records, shows progress and lists everyone who could not be done, by name, with the reason", async () => {
    const user = userEvent.setup();
    useBook(
      book({
        hires: [
          hire("p", { jobId: "job-b", name: "Pat One" }),
          hire("q", { jobId: "job-b", name: "Quin Two" }),
          hire("r", {
            jobId: "job-b",
            name: "Rae Three",
            email: "rae@mail.com",
          }),
          hire("s", {
            jobId: "job-c",
            name: "Sam Four",
            didNotJoin: { reason: "Left", at: "x", by: "You" },
          }),
        ],
        employees: [
          {
            id: "emp-7",
            employeeNo: "EMP-0007",
            name: "Rae Threlfall",
            email: "rae@mail.com",
          },
        ],
      }),
    );
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    await user.click(
      within(table()).getByRole("checkbox", { name: "Select everyone shown" }),
    );
    const bar = screen.getByRole("region", {
      name: "Actions for the people you have selected",
    });
    await user.click(
      within(bar).getByRole("button", { name: "Create employees…" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Create employee records for 4 people?");
    expect(dialog).toHaveTextContent("listed afterwards with the reason");
    await user.click(
      within(dialog).getByRole("button", { name: "Create 4 employee records" }),
    );

    const results = await screen.findByText(
      /Employee records created: 2 of 4 people/,
    );
    expect(results).toBeInTheDocument();
    const panel = results.closest("div") as HTMLElement;
    expect(panel.parentElement).toHaveTextContent(
      "Who could not be done, and why (2)",
    );
    expect(panel.parentElement).toHaveTextContent(
      "Rae Three: rae@mail.com is already on Rae Threlfall's record (EMP-0007)",
    );
    expect(panel.parentElement).toHaveTextContent(
      "Sam Four: They did not join, so there is no employee record to make.",
    );
    expect(demoHired.current().hires.filter((h) => h.employeeId)).toHaveLength(
      2,
    );
  });
});

describe("a company without Core HR", () => {
  beforeEach(() => {
    useBook(
      book({
        settings: { onOfferAccepted: "HIRED_LIST_ONLY", coreHr: false },
        employees: [],
        hires: book().hires.map((h) => ({
          ...h,
          employeeId: null,
          employeeVia: null,
        })),
      }),
    );
  });

  it("says so once, and offers no way to create, link or open an employee, anywhere", async () => {
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    expect(
      screen.getByText("Your company does not use Core HR"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Create employee/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Link to existing employee/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /employee record/ }),
    ).not.toBeInTheDocument();
  });

  it("is still complete: people can be marked as not joining, selected and exported", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    expect(
      within(row("Ada Okafor")).getByRole("button", {
        name: "Mark Ada Okafor as did not join",
      }),
    ).toBeEnabled();

    await user.click(
      within(table()).getByRole("checkbox", { name: "Select everyone shown" }),
    );
    const bar = screen.getByRole("region", {
      name: "Actions for the people you have selected",
    });
    expect(
      within(bar).queryByRole("button", { name: "Create employees…" }),
    ).not.toBeInTheDocument();
    expect(
      within(bar).getByRole("button", { name: "Export CSV" }),
    ).toBeEnabled();
  });
});

describe("the export", () => {
  it("opens from the list, says the file is personal data and logged, lists the fixed columns, and adds what was ticked", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: /Export…/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("This file holds personal data");
    expect(dialog).toHaveTextContent("Each export is logged");
    expect(dialog).toHaveTextContent("Every file has these columns");
    expect(dialog).toHaveTextContent("First name, Last name, Email, Phone");

    await user.click(
      within(dialog).getByRole("checkbox", { name: /Screening score/ }),
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: /Pay on the offer/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Download CSV" }),
    );
    await waitFor(() => expect(saved.files).toHaveLength(1));
    const [note, header, first] = (saved.files[0]?.body ?? "")
      .replace("\uFEFF", "")
      .trim()
      .split("\r\n");
    expect(note).toMatch(/contains personal data/);
    expect(header).toMatch(/Fit score/);
    expect(header).toMatch(/Gross monthly pay \(NGN\)/);
    expect(header).not.toMatch(/Q1:/);
    expect(first).toMatch(/^Ada,Okafor/);
    expect(
      await screen.findByText(/Downloaded hired\.csv/),
    ).toBeInTheDocument();
  });

  it("starts with nothing added each time it opens", async () => {
    const user = userEvent.setup();
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: /Export…/ }));
    let dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("checkbox", { name: /Pay on the offer/ }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /Export…/ }));
    dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("checkbox", { name: /Pay on the offer/ }),
    ).not.toBeChecked();
  });
});

describe("who may open it", () => {
  it("says what accepting an offer does for this company, under the heading, with the way to change it", async () => {
    renderInToasts(<HiredScreen />);
    expect(
      await screen.findByText(
        /They are added to the Hired list\. No employee record is created yet\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Change this in Hiring settings" }),
    ).toHaveAttribute("href", "/hiring/settings/accepted-offers");
  });
});
