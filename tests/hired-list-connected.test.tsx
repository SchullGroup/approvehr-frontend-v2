import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "@/lib/api/client";
import { EmployeeExistsError } from "@/lib/hiring/hired/errors";
import type {
  HiredPage,
  HiredPerson,
  HiredSettings,
} from "@/lib/hiring/hired/model";
import { person } from "./hired-person";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * The Hired list against a connected API, as far as what the API says decides what is
 * drawn: a reason it gives for refusing Create employee is shown beside the disabled
 * button in its own words, an employee link exists only where there is Core HR, and a
 * refusal that is really a question (an employee already has this email) becomes the
 * question, with who it is.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false, user: null }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/hired",
  useSearchParams: () => new URLSearchParams(),
}));

type Fn = Mock<(...args: unknown[]) => unknown>;
const fake = vi.hoisted(() => ({
  settings: null as unknown,
  createEmployee: null as unknown as Fn,
  linkEmployee: null as unknown as Fn,
  list: null as unknown as Fn,
}));

vi.mock("@/lib/hiring/hired/use-hired", () => {
  const gateway = {
    mode: "api" as const,
    facets: async () => ({ jobs: [], departments: [], sources: [] }),
    list: (...args: unknown[]) => fake.list(...args),
    createEmployee: (...args: unknown[]) => fake.createEmployee(...args),
    linkEmployee: (...args: unknown[]) => fake.linkEmployee(...args),
    didNotJoin: async () => ({ jobReopened: false, othersTurnedAway: 0 }),
    bulkCreateEmployees: async () => ({
      requested: 0,
      done: 0,
      skipped: 0,
      refused: [],
      emailed: null,
    }),
    exportOptions: async () => ({
      fixed: ["First name"],
      extras: [],
      maxRows: 10,
      capMessage: "That is more than one file holds. Narrow the list.",
    }),
    exportFile: async () => ({ filename: "x.csv", body: "x" }),
    settings: {
      get: async () => fake.settings,
      set: async () => fake.settings,
    },
  };
  return {
    useHiredGateway: () => gateway,
    useHiredSettings: () => ({
      settings: fake.settings as HiredSettings,
      loading: false,
      error: null,
      reload: () => undefined,
      save: async () => fake.settings as HiredSettings,
    }),
  };
});

const { HiredList } = await import("@/components/hiring/hired/hired-list");

const settings = (coreHr = true): HiredSettings => ({
  onOfferAccepted: "HIRED_LIST_ONLY",
  effective: "HIRED_LIST_ONLY",
  coreHr,
  coreHrReason: coreHr ? null : "Your plan does not include Core HR.",
  canChange: true,
});

const page = (rows: HiredPerson[]): HiredPage => ({
  rows,
  total: rows.length,
  next: null,
  counts: {
    all: rows.length,
    HIRED: rows.filter((r) => r.state === "HIRED").length,
    EMPLOYEE_CREATED: rows.filter((r) => r.state === "EMPLOYEE_CREATED").length,
    DID_NOT_JOIN: rows.filter((r) => r.state === "DID_NOT_JOIN").length,
  },
});

const row = (name: string) => {
  const found = within(screen.getByRole("table"))
    .getAllByRole("row")
    .find((r) => within(r).queryByText(name));
  if (!found) throw new Error(`No row for ${name}`);
  return found;
};

beforeEach(() => {
  fake.settings = settings();
  fake.createEmployee = vi.fn() as Fn;
  fake.linkEmployee = vi.fn() as Fn;
  fake.list = vi.fn() as Fn;
});

describe("what the API says about each row", () => {
  it("shows its reason, word for word, beside a Create employee it will not allow", async () => {
    fake.list.mockResolvedValue(
      page([
        person("a", {
          name: "Rae Three",
          createEmployee: {
            allowed: false,
            reason:
              "FIN-032 already has all 1 of its people as employees. Raise its headcount first.",
          },
        }),
      ]),
    );
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    const button = within(row("Rae Three")).getByRole("button", {
      name: "Create employee record for Rae Three",
    });
    expect(button).toBeDisabled();
    expect(row("Rae Three")).toHaveTextContent(
      "FIN-032 already has all 1 of its people as employees. Raise its headcount first.",
    );
  });

  it("links to the employee record in People, by the id the API gave, and links to the hiring record too", async () => {
    fake.list.mockResolvedValue(
      page([
        person("a", {
          name: "Kemi Sani",
          state: "EMPLOYEE_CREATED",
          employee: { id: "emp-1", name: "Kemi Sani", employeeNo: "EMP-0001" },
          employeeVia: "CREATED",
          createEmployee: { allowed: false, reason: "Already one." },
        }),
      ]),
    );
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    expect(
      within(row("Kemi Sani")).getByRole("link", {
        name: "Open their employee record",
      }),
    ).toHaveAttribute("href", "/people/emp-1");
    expect(
      within(row("Kemi Sani")).getByRole("link", { name: "Kemi Sani" }),
    ).toHaveAttribute("href", "/hiring/candidates/pa-a");
  });

  it("draws no employee link and no Create button for a company without Core HR, even where the API gave an id", async () => {
    fake.settings = settings(false);
    fake.list.mockResolvedValue(
      page([
        person("a", {
          name: "Kemi Sani",
          state: "EMPLOYEE_CREATED",
          employee: { id: "emp-1", name: "Kemi Sani", employeeNo: null },
          createEmployee: { allowed: false, reason: "Already one." },
        }),
        person("b", { name: "Ada Okafor" }),
      ]),
    );
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    expect(
      screen.queryByRole("link", { name: /employee record/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Create employee/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Your company does not use Core HR"),
    ).toBeInTheDocument();
  });
});

describe("a refusal that is really a question", () => {
  it("opens the link offer with the API's own sentence and who it is, and links on an explicit press", async () => {
    const user = userEvent.setup();
    fake.list.mockResolvedValue(page([person("a", { name: "Ngozi Eze" })]));
    fake.createEmployee.mockRejectedValue(
      new EmployeeExistsError(
        "ngozi.eze@example.com is already on N. Eze's record (EMP-0457). Link this hire to that record if it is the same person.",
        {
          employeeId: "emp-9",
          name: "N. Eze",
          employeeNo: "EMP-0457",
          email: "ngozi.eze@example.com",
          archived: false,
        },
      ),
    );
    fake.linkEmployee.mockResolvedValue(undefined);
    renderInToasts(<HiredList />);
    await screen.findByRole("table");

    await user.click(
      within(row("Ngozi Eze")).getByRole("button", {
        name: "Create employee record for Ngozi Eze",
      }),
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Create employee record",
      }),
    );
    const link = await screen.findByRole("dialog", {
      name: "Link Ngozi Eze to an employee who is already here?",
    });
    expect(link).toHaveTextContent("is already on N. Eze's record (EMP-0457)");
    expect(fake.linkEmployee).not.toHaveBeenCalled();

    await user.click(
      within(link).getByRole("button", { name: "Link to N. Eze" }),
    );
    await waitFor(() =>
      expect(fake.linkEmployee).toHaveBeenCalledWith(
        expect.objectContaining({ id: "a" }),
        "emp-9",
      ),
    );
    expect(
      await screen.findByText("Ngozi Eze is linked to N. Eze"),
    ).toBeInTheDocument();
  });

  it("will not link to an archived record, and says to restore it first", async () => {
    const user = userEvent.setup();
    fake.list.mockResolvedValue(page([person("a", { name: "Ngozi Eze" })]));
    fake.createEmployee.mockRejectedValue(
      new EmployeeExistsError("It is taken.", {
        employeeId: "emp-9",
        name: "N. Eze",
        employeeNo: "EMP-0457",
        email: null,
        archived: true,
      }),
    );
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    await user.click(
      within(row("Ngozi Eze")).getByRole("button", {
        name: "Create employee record for Ngozi Eze",
      }),
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Create employee record",
      }),
    );
    const link = await screen.findByRole("dialog", {
      name: /Link Ngozi Eze/,
    });
    expect(link).toHaveTextContent("That record has been archived");
    expect(
      within(link).getByRole("button", { name: "Link to N. Eze" }),
    ).toBeDisabled();
  });

  it("shows any other refusal as a refusal, in the API's words, and asks the list again", async () => {
    const user = userEvent.setup();
    fake.list.mockResolvedValue(page([person("a", { name: "Ada Okafor" })]));
    fake.createEmployee.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "Somebody changed this hire while it was being made, so it was left alone.",
        { reason: "changed_meanwhile" },
      ),
    );
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    await user.click(
      within(row("Ada Okafor")).getByRole("button", {
        name: "Create employee record for Ada Okafor",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Create employee record" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Somebody changed this hire while it was being made, so it was left alone.",
    );
    expect(
      screen.getByText("No employee record was created for Ada Okafor"),
    ).toBeInTheDocument();
    await waitFor(() => expect(fake.list.mock.calls.length).toBeGreaterThan(1));
  });
});

describe("the export's cap", () => {
  it("is the API's message, and the button is off while the list is longer than a file holds", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) =>
      person(`p${String(i)}`, { name: `Person ${String(i).padStart(2, "0")}` }),
    );
    fake.list.mockResolvedValue({ ...page(many), total: 12 });
    renderInToasts(<HiredList />);
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: /Export…/ }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That is more than one file holds. Narrow the list.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Download CSV" }),
    ).toBeDisabled();
  });
});
