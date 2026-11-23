import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiQuerySettings } from "@/lib/api/queries";
import type { TemplateList } from "@/lib/api/query-ties";
import { detail } from "./queries-fixtures";

/**
 * Letter templates, starting a draft from one, and manager drafting in Settings.
 *
 * What is proved: **nothing is pre-written** (no template exists until a company writes one, and no
 * wording of ours is offered, drafted in a placeholder or shown as an example); the only line about
 * the words is the server's, and it says counsel should read them; a draft is started from a
 * template with the subject line optional and what is typed winning; a manager's button says they
 * are drafting; turning manager drafting on asks first and says what a manager cannot do, and
 * turning it off is one press; a server that did not say gets no switch; and a refusal (a name that
 * is taken, a field the server does not know) is the server's own sentence with what was typed kept.
 */

let held = new Set<string>();
vi.mock("@/lib/permissions", () => ({
  useCan: (key: string) => held.has(key),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, employeeId: "e-self" }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeSearch: () => ({
    search: vi.fn(),
    options: [{ value: "e-1", label: "Chidi Nwosu", hint: "Driver" }],
    pending: false,
    failed: false,
    retry: vi.fn(),
    more: false,
  }),
}));

const NOTE =
  "These are your company's own words. Have counsel read them before they are used.";
const templateList = (rows: TemplateList["rows"] = []): TemplateList => ({
  rows,
  mergeFields: [
    { token: "{{employee_name}}", label: "The person's full name" },
    { token: "{{employee_no}}", label: "The person's staff number" },
  ],
  note: NOTE,
});
const row = (over: Partial<TemplateList["rows"][number]> = {}) => ({
  id: "t-1",
  name: "Absence",
  subjectLine: "About {{employee_first_name}}",
  whatHappened: "",
  rulesRelied: null,
  question: "",
  archived: false,
  createdAt: null,
  updatedAt: null,
  ...over,
});

let templates: {
  data: TemplateList | null;
  loading: boolean;
  error: unknown;
  unavailable: boolean;
};
const reloadTemplates = vi.fn();
const actions = {
  create: vi.fn(),
  updateSettings: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  archiveTemplate: vi.fn(),
  restoreTemplate: vi.fn(),
};
let settings: ApiQuerySettings;
let queriesOn = true;
let editable = true;
vi.mock("@/lib/store/queries", async (original) => ({
  ...(await original<typeof import("@/lib/store/queries")>()),
  useQueriesSwitch: () => ({
    on: queriesOn,
    known: true,
    said: true,
    editable,
    error: null,
  }),
  useQueryActions: () => actions,
  useQueryTemplates: () => ({ ...templates, reload: reloadTemplates }),
  useQuerySettings: () => ({
    data: settings,
    loading: false,
    error: null,
    unavailable: false,
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({
    flags: { queries: true },
    queriesSaid: true,
    editable,
    loading: false,
    saving: null,
    error: null,
    source: "api",
    setFeature: vi.fn(),
  }),
}));

const { StartQueryButton } =
  await import("@/app/(app)/people/queries/start-dialog");
const { QueriesSettingsScreen } =
  await import("@/app/(app)/settings/queries/queries-settings-screen");

const wrap = (node: React.ReactNode) =>
  render(<ToastProvider>{node}</ToastProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  held = new Set(["ISSUE_QUERIES", "MANAGE_SETTINGS"]);
  queriesOn = true;
  editable = true;
  templates = {
    data: templateList(),
    loading: false,
    error: null,
    unavailable: false,
  };
  settings = {
    replyHours: 48,
    warnHours: 24,
    issuerMayDecideIfSole: true,
    managersMayDraft: false,
    retention: "archive_only",
  };
});

describe("starting a draft", () => {
  const open = async (label = "Issue a query") => {
    wrap(<StartQueryButton />);
    await userEvent.click(screen.getByRole("button", { name: label }));
    await userEvent.click(
      screen.getByRole("combobox", { name: "Who is it for" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Chidi Nwosu/ }),
    );
  };

  it("offers no template picker, not even an empty one, to a company with none", async () => {
    await open();
    expect(screen.queryByLabelText(/Start from a template/)).toBeNull();
    expect(
      screen.getByRole("textbox", { name: /Subject line/ }),
    ).toBeInTheDocument();
  });

  it("starts blank by default, with a required subject line", async () => {
    templates = { ...templates, data: templateList([row()]) };
    actions.create.mockResolvedValue(detail());
    await open();
    expect(
      screen.getByRole("button", { name: "Start the letter" }),
    ).toBeDisabled();
    await userEvent.type(
      screen.getByRole("textbox", { name: /Subject line/ }),
      "A subject",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start the letter" }),
    );
    await waitFor(() =>
      expect(actions.create).toHaveBeenCalledWith({
        subjectId: "e-1",
        subjectLine: "A subject",
      }),
    );
  });

  it("lists the company's own templates by name and says the server's line about counsel", async () => {
    templates = {
      ...templates,
      data: templateList([row(), row({ id: "t-2", name: "Lateness" })]),
    };
    await open();
    const picker = screen.getByLabelText(/Start from a template/);
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["A blank draft", "Absence", "Lateness"]);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it("makes the subject line optional once a template is chosen, and sends the template's id", async () => {
    templates = { ...templates, data: templateList([row()]) };
    actions.create.mockResolvedValue(detail());
    await open();
    await userEvent.selectOptions(
      screen.getByLabelText(/Start from a template/),
      "t-1",
    );
    expect(
      screen.getByText(/Leave it blank to use the template's own/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Start the letter" }),
    );
    await waitFor(() =>
      expect(actions.create).toHaveBeenCalledWith({
        subjectId: "e-1",
        templateId: "t-1",
      }),
    );
  });

  it("lets what is typed win over the template's own subject line", async () => {
    templates = { ...templates, data: templateList([row()]) };
    actions.create.mockResolvedValue(detail());
    await open();
    await userEvent.selectOptions(
      screen.getByLabelText(/Start from a template/),
      "t-1",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Subject line/ }),
      "Mine instead",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start the letter" }),
    );
    await waitFor(() =>
      expect(actions.create).toHaveBeenCalledWith({
        subjectId: "e-1",
        templateId: "t-1",
        subjectLine: "Mine instead",
      }),
    );
  });

  it("refuses a one-character subject line even with a template, and starts blank when opened again", async () => {
    templates = { ...templates, data: templateList([row()]) };
    await open();
    await userEvent.selectOptions(
      screen.getByLabelText(/Start from a template/),
      "t-1",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Subject line/ }),
      "x",
    );
    expect(
      screen.getByRole("button", { name: "Start the letter" }),
    ).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      screen.getByRole("button", { name: "Issue a query" }),
    );
    expect(
      (screen.getByLabelText(/Start from a template/) as HTMLSelectElement)
        .value,
    ).toBe("");
  });

  it("is for a manager who drafts, and says so: Draft a query, written for HR to issue", async () => {
    held = new Set(["DRAFT_QUERIES"]);
    await open("Draft a query");
    expect(
      screen.getByText(/You write the letter and HR reviews and issues it/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Issue a query" })).toBeNull();
  });

  it("is not offered to somebody who may neither issue nor draft", () => {
    held = new Set();
    const { container } = wrap(<StartQueryButton />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the templates card", () => {
  const mount = () => wrap(<QueriesSettingsScreen />);

  it("starts empty with no wording of ours, and says nothing is pre-written", () => {
    mount();
    expect(screen.getByText("No templates yet")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is pre-written/)).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("opens a blank form, with no example text anywhere in it, and lists the server's merge fields", async () => {
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: /Add a template/ }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        /Have counsel read it before it is used with real staff/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /\{\{employee_name\}\} \(The person's full name\)/,
      ),
    ).toBeInTheDocument();
    for (const box of within(dialog).getAllByRole("textbox")) {
      expect(box).toHaveValue("");
      expect(box).not.toHaveAttribute("placeholder");
    }
  });

  it("adds a template with the words trimmed, and a blank rules box as null", async () => {
    actions.createTemplate.mockResolvedValue(row());
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: /Add a template/ }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText(/Template name/),
      "  Absence  ",
    );
    /* Pasted: `type` reads a brace as the start of a key name. */
    await userEvent.click(within(dialog).getByLabelText(/Subject line/));
    await userEvent.paste("About {{employee_first_name}}");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add the template" }),
    );
    await waitFor(() =>
      expect(actions.createTemplate).toHaveBeenCalledWith({
        name: "Absence",
        subjectLine: "About {{employee_first_name}}",
        whatHappened: "",
        rulesRelied: null,
        question: "",
      }),
    );
    expect(reloadTemplates).toHaveBeenCalled();
  });

  it("keeps the server's refusal and what was typed when a field is unknown", async () => {
    actions.createTemplate.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "That template uses a field we do not know: {{salary}}. The fields it can use are: {{employee_name}}.",
      ),
    );
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: /Add a template/ }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Template name/), "Pay");
    await userEvent.click(within(dialog).getByLabelText(/Subject line/));
    await userEvent.paste("About {{salary}}");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add the template" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That template uses a field we do not know: {{salary}}.",
    );
    expect(within(dialog).getByLabelText(/Subject line/)).toHaveValue(
      "About {{salary}}",
    );
  });

  it("archives and restores, says nothing was deleted, and never shows the wording in the list", async () => {
    templates = {
      ...templates,
      data: templateList([
        row({ whatHappened: "A SECRET BODY", question: "A SECRET QUESTION" }),
        row({ id: "t-2", name: "Old", archived: true }),
      ]),
    };
    actions.archiveTemplate.mockResolvedValue(row({ archived: true }));
    actions.restoreTemplate.mockResolvedValue(row({ id: "t-2" }));
    const { container } = mount();
    expect(container.textContent).not.toMatch(/SECRET/);
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() =>
      expect(actions.archiveTemplate).toHaveBeenCalledWith("t-1"),
    );
    expect(await screen.findByText(/Nothing was deleted/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(actions.restoreTemplate).toHaveBeenCalledWith("t-2"),
    );
  });

  it("is read-only without the permission to change settings", () => {
    editable = false;
    templates = { ...templates, data: templateList([row()]) };
    mount();
    expect(screen.queryByRole("button", { name: /Add a template/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(
      screen.getByText(
        /changing templates needs the Manage settings permission/,
      ),
    ).toBeInTheDocument();
  });
});

describe("managers drafting", () => {
  const SWITCH = /Let managers draft queries/;
  const mount = () => wrap(<QueriesSettingsScreen />);

  it("is off for a company that has not chosen, and turning it on asks first and says what a manager cannot do", async () => {
    mount();
    expect(screen.getByRole("switch", { name: SWITCH })).not.toBeChecked();
    await userEvent.click(screen.getByRole("switch", { name: SWITCH }));
    expect(actions.updateSettings).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        /cannot issue, extend, decide or withdraw one, cite a record,/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /never a query once it has been issued or withdrawn/,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/have your counsel review it/),
    ).toBeInTheDocument();
    actions.updateSettings.mockResolvedValue(null);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Switch it on" }),
    );
    await waitFor(() =>
      expect(actions.updateSettings).toHaveBeenCalledWith({
        managersMayDraft: true,
      }),
    );
  });

  it("is turned off in one press, with nothing deleted", async () => {
    settings = { ...settings, managersMayDraft: true };
    actions.updateSettings.mockResolvedValue(null);
    mount();
    await userEvent.click(screen.getByRole("switch", { name: SWITCH }));
    await waitFor(() =>
      expect(actions.updateSettings).toHaveBeenCalledWith({
        managersMayDraft: false,
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers no switch for a server that did not say, and does not call that off", () => {
    settings = { ...settings, managersMayDraft: null };
    mount();
    expect(screen.queryByRole("switch", { name: SWITCH })).toBeNull();
    expect(
      screen.getByText(/has not been updated to offer manager drafting/),
    ).toBeInTheDocument();
  });

  it("can be read and not changed without the permission", () => {
    editable = false;
    mount();
    expect(screen.getByRole("switch", { name: SWITCH })).toBeDisabled();
  });

  it("says nobody holds the permission until it is given on Roles", () => {
    mount();
    expect(
      screen.getByText(/Nobody holds it until you give it to them/),
    ).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Roles" }))
      expect(link).toHaveAttribute("href", "/settings/roles");
  });

  it("shows the server's refusal, in its words", async () => {
    actions.updateSettings.mockRejectedValue(
      new ApiError(403, "forbidden", "You cannot change this."),
    );
    settings = { ...settings, managersMayDraft: true };
    mount();
    await userEvent.click(screen.getByRole("switch", { name: SWITCH }));
    expect(
      await screen.findByText("You cannot change this."),
    ).toBeInTheDocument();
  });
});
