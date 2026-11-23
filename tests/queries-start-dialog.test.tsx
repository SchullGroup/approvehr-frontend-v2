import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { detail, SUBJECT_LINE } from "./queries-fixtures";

/**
 * Starting a letter: a person and a subject line, and nothing is sent to anybody.
 *
 * What is proved: the button is for somebody who may issue, with queries on and a server; the
 * person is found by typing and yourself is left out; the draft is made from the two fields and
 * the person is taken to its page; **the toast says an act was done and never the subject line**;
 * a refusal is the server's sentence and keeps what was typed; the dialog starts blank each time.
 */

let held = new Set<string>();
vi.mock("@/lib/permissions", () => ({
  useCan: (key: string) => held.has(key),
}));
let on = true;
let connected = true;
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: connected, employeeId: "e-self" }),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const search = vi.fn();
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeSearch: (options: unknown) => {
    search(options);
    return {
      search: vi.fn(),
      options: [{ value: "e-1", label: "Chidi Nwosu", hint: "Driver" }],
      pending: false,
      failed: false,
      retry: vi.fn(),
      more: false,
    };
  },
}));

const create = vi.fn();
vi.mock("@/lib/store/queries", async (original) => ({
  ...(await original<typeof import("@/lib/store/queries")>()),
  useQueriesSwitch: () => ({
    on,
    known: true,
    said: true,
    editable: true,
    error: null,
  }),
  useQueryActions: () => ({ create }),
}));

const { StartQueryButton } =
  await import("@/app/(app)/people/queries/start-dialog");

const mount = () =>
  render(
    <ToastProvider>
      <StartQueryButton />
    </ToastProvider>,
  );

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Issue a query" }));
  await user.click(screen.getByRole("combobox", { name: "Who is it for" }));
  await user.click(await screen.findByRole("option", { name: /Chidi Nwosu/ }));
  await user.type(
    screen.getByRole("textbox", { name: /Subject line/ }),
    SUBJECT_LINE,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  held = new Set(["ISSUE_QUERIES"]);
  on = true;
  connected = true;
});

describe("the button", () => {
  it("is for somebody who may issue queries, in a company that runs them", () => {
    mount();
    expect(
      screen.getByRole("button", { name: "Issue a query" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["without the permission", () => (held = new Set())],
    ["with queries off", () => (on = false)],
    ["with no server", () => (connected = false)],
  ])("is absent %s", (_name, arrange) => {
    arrange();
    mount();
    expect(
      screen.queryByRole("button", { name: "Issue a query" }),
    ).not.toBeInTheDocument();
  });
});

describe("starting the draft", () => {
  it("leaves yourself out of the people it offers", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Issue a query" }));
    expect(search).toHaveBeenLastCalledWith({ excludeId: "e-self" });
  });

  it("will not start without a person and a subject line", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Issue a query" }));
    expect(
      screen.getByRole("button", { name: "Start the letter" }),
    ).toBeDisabled();
  });

  it("makes the draft from the two fields and takes the person to it, with a toast that is not about the letter", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue(detail({ id: "q-new", status: "DRAFT" }));
    mount();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Start the letter" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        subjectId: "e-1",
        subjectLine: SUBJECT_LINE,
      }),
    );
    expect(push).toHaveBeenCalledWith("/people/queries/q-new");
    const toast = await screen.findByText("Draft started");
    expect(toast).toBeInTheDocument();
    /* The act, never the subject: nothing shown outside the letter says what it is about. */
    expect(document.body.textContent ?? "").not.toContain("absence");
  });

  it("keeps what was typed and shows the server's sentence when it refuses", async () => {
    const user = userEvent.setup();
    create.mockRejectedValue(
      new ApiError(
        403,
        "forbidden",
        "You cannot start a query about yourself.",
      ),
    );
    mount();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Start the letter" }));
    expect(
      await screen.findByText("You cannot start a query about yourself."),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Subject line/ })).toHaveValue(
      SUBJECT_LINE,
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("starts blank the next time it is opened", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Issue a query" }));
    await user.type(
      screen.getByRole("textbox", { name: /Subject line/ }),
      "Half a thought",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Issue a query" }));
    expect(screen.getByRole("textbox", { name: /Subject line/ })).toHaveValue(
      "",
    );
  });
});
