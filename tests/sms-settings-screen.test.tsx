import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type {
  ApiSmsChange,
  ApiSmsStatus,
  ApiSmsSubscription,
} from "@/lib/api/sms";

/**
 * Text messages, as HR meets it.
 *
 * The overview has to say first, and in plain words, that nothing is sent while
 * no provider is connected. The people list has to show who agreed and how,
 * with the number masked, and has to keep HR from undoing a person's own opt-out
 * while still listing the action and saying why. Each of those is a rule from the
 * spec, and each is pinned here against the screen and not only against the
 * helper behind it.
 */

let connected = true;
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: connected }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/components/portal/shell", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const setFeature = vi.fn(async () => ({}));
let features = {
  flags: { smsDigest: false },
  editable: true,
  loading: false,
  saving: null as string | null,
};
vi.mock("@/lib/store/features", async (original) => ({
  ...(await original<typeof import("@/lib/store/features")>()),
  useFeatureSettings: () => ({ ...features, setFeature }),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    employees: [
      {
        id: "e9",
        employeeNo: "AHR-0009",
        firstName: "Kemi",
        lastName: "Adeyemi",
        jobTitle: "Driver",
      },
    ],
    loading: false,
  }),
}));
vi.mock("@/lib/api/sms", async (original) => ({
  ...(await original<typeof import("@/lib/api/sms")>()),
  smsApi: {
    status: vi.fn(),
    subscriptions: vi.fn(),
    recordConsent: vi.fn(),
    recordOptOut: vi.fn(),
  },
}));

const { smsApi } = await import("@/lib/api/sms");
const { SmsScreen } = await import("@/app/(app)/settings/sms/sms-screen");

const status = (over: Partial<ApiSmsStatus> = {}): ApiSmsStatus => ({
  enabled: true,
  transport: { name: "termii", sends: true, supportsReply: false },
  optOutPath: "link",
  ready: true,
  subscribers: { optedIn: 3, optedOut: 1 },
  thisWeek: {
    weekKey: "2026-W43",
    byStatus: { SENT: 1, DELIVERED: 1 },
    segments: 2,
  },
  notes: [],
  ...over,
});

const noProvider = status({
  transport: { name: "dev-log", sends: false, supportsReply: false },
  ready: false,
  notes: [
    "No text-message provider is connected. Nothing will be sent, and no digest will be planned, until one is.",
  ],
});

const person = (over: Partial<ApiSmsSubscription>): ApiSmsSubscription => ({
  employeeId: "e1",
  employeeNo: "AHR-0001",
  name: "Ada Obi",
  phoneMasked: "+234******4567",
  state: "OPTED_IN",
  optedInAt: "2026-10-12T09:00:00.000Z",
  optInChannel: "APP",
  optInActor: "EMPLOYEE",
  optedOutAt: null,
  optOutChannel: null,
  optOutActor: null,
  lastMessage: null,
  ...over,
});

const ADA = person({});
const TUNDE = person({
  employeeId: "e2",
  employeeNo: "AHR-0002",
  name: "Tunde Bakare",
  phoneMasked: "+234******1111",
  state: "OPTED_OUT",
  optedInAt: null,
  optInChannel: "APP",
  optInActor: "EMPLOYEE",
  optedOutAt: "2026-10-14T09:00:00.000Z",
  optOutChannel: "SMS",
  optOutActor: "SYSTEM",
});
const CHIDI = person({
  employeeId: "e3",
  employeeNo: "AHR-0003",
  name: "Chidi Nwosu",
  phoneMasked: "+234******2222",
  state: "OPTED_OUT",
  optedOutAt: "2026-10-15T09:00:00.000Z",
  optOutChannel: "APP",
  optOutActor: "HR",
  lastMessage: {
    kind: "WEEKLY_DIGEST",
    status: "BLOCKED",
    reason: "opted_out",
    at: "2026-10-19T09:00:00.000Z",
  },
});

const page = (rows: ApiSmsSubscription[]) => ({
  data: rows,
  meta: {
    page: 1,
    pageSize: 25,
    total: rows.length,
    totalPages: 1,
    hasMore: false,
  },
});

const change = (over: Partial<ApiSmsChange> = {}): ApiSmsChange => ({
  state: "OPTED_IN",
  changed: true,
  phoneMasked: "+234******4567",
  confirmationQueued: false,
  note: "Switched on. No text-message provider is connected yet, so nothing will be sent until one is.",
  ...over,
});

beforeEach(() => {
  connected = true;
  features = {
    flags: { smsDigest: false },
    editable: true,
    loading: false,
    saving: null,
  };
  setFeature.mockClear();
  vi.mocked(smsApi.status).mockReset().mockResolvedValue(status());
  vi.mocked(smsApi.subscriptions)
    .mockReset()
    .mockResolvedValue(page([ADA, TUNDE, CHIDI]));
  vi.mocked(smsApi.recordConsent).mockReset().mockResolvedValue(change());
  vi.mocked(smsApi.recordOptOut)
    .mockReset()
    .mockResolvedValue(change({ state: "OPTED_OUT" }));
});

async function openPeople() {
  const user = userEvent.setup();
  render(<SmsScreen />);
  await user.click(await screen.findByRole("tab", { name: "People" }));
  await screen.findByText("Ada Obi");
  return user;
}

async function openMenu(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(
    screen.getByRole("button", { name: `More actions for ${name}` }),
  );
  return screen.getByRole("menu");
}

describe("the overview", () => {
  it("says first, in plain words, that nothing is sent while no provider is connected", async () => {
    vi.mocked(smsApi.status).mockResolvedValue(noProvider);
    render(<SmsScreen />);

    expect(
      await screen.findByText(
        "Nothing is sent until a text provider is connected.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("says that whether or not the weekly text is switched on", async () => {
    features.flags.smsDigest = true;
    vi.mocked(smsApi.status).mockResolvedValue({
      ...noProvider,
      enabled: true,
    });
    render(<SmsScreen />);
    expect(
      await screen.findByText(
        "Nothing is sent until a text provider is connected.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the figures and says nothing when a provider is connected and all is in order", async () => {
    render(<SmsScreen />);

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Termii")).toBeInTheDocument();
    expect(screen.getByText("1 opted out")).toBeInTheDocument();
    expect(screen.getByText("2 segments used")).toBeInTheDocument();
    expect(
      screen.queryByText(/nothing is sent until/i),
    ).not.toBeInTheDocument();
  });

  it("keeps the rules behind a click, and they say what the text carries and what HR cannot undo", async () => {
    const user = userEvent.setup();
    render(<SmsScreen />);
    await screen.findByText("Connected");

    const rules = screen.getByRole("button", {
      name: /what gets sent, and to whom/i,
    });
    expect(rules).toHaveAttribute("aria-expanded", "false");
    await user.click(rules);

    expect(
      screen.getByText(
        "The text has counts and a link, never pay or health details.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/HR cannot undo that/)).toBeInTheDocument();
    expect(
      screen.getByText("Only people who opted in are texted, one by one."),
    ).toBeInTheDocument();
  });

  it("is not a failure to be told nothing has opted in: that is a quiet line, not an alarm", async () => {
    vi.mocked(smsApi.status).mockResolvedValue(
      status({ subscribers: { optedIn: 0, optedOut: 0 } }),
    );
    render(<SmsScreen />);
    expect(
      await screen.findByText("Nobody has opted in yet."),
    ).toBeInTheDocument();
  });

  it("says it did not load, and shows no figures, when the status read fails", async () => {
    vi.mocked(smsApi.status).mockRejectedValue(
      new ApiError(500, "internal", "Something went wrong on our side."),
    );
    render(<SmsScreen />);
    expect(
      await screen.findByText("The text message status did not load"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });
});

describe("the switch", () => {
  it("writes the flag the way every other feature switch does, and asks for the status again", async () => {
    const user = userEvent.setup();
    render(<SmsScreen />);
    await screen.findByText("Connected");

    await user.click(
      screen.getByRole("switch", { name: "Weekly text message" }),
    );

    expect(setFeature).toHaveBeenCalledWith("smsDigest", true);
    await waitFor(() => expect(smsApi.status).toHaveBeenCalledTimes(2));
  });

  it("is off for somebody who cannot change settings, and says why", async () => {
    features.editable = false;
    render(<SmsScreen />);
    await screen.findByText("Connected");

    expect(
      screen.getByRole("switch", { name: "Weekly text message" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/needs the Manage settings permission/),
    ).toBeInTheDocument();
  });
});

describe("offline", () => {
  it("says it needs a signed-in company, and does not ask the API for anything", async () => {
    connected = false;
    render(<SmsScreen />);

    expect(screen.getByText("Not available offline")).toBeInTheDocument();
    expect(smsApi.status).not.toHaveBeenCalled();
    expect(smsApi.subscriptions).not.toHaveBeenCalled();
  });
});

describe("the people list", () => {
  it("shows who, the state, a masked number and how consent was given, and never a full number", async () => {
    await openPeople();

    expect(screen.getByText("+234******4567")).toBeInTheDocument();
    expect(screen.getByText("In the app")).toBeInTheDocument();
    expect(screen.getByText("Replied STOP")).toBeInTheDocument();
    expect(screen.getByText("Opted out by HR")).toBeInTheDocument();
    expect(screen.queryByText(/\+2348\d{9}/)).not.toBeInTheDocument();
    /* What happened to the last text, in a few words and not the API's code. */
    expect(screen.getByText("They opted out")).toBeInTheDocument();
    expect(smsApi.subscriptions).toHaveBeenCalledWith(
      { page: 1, pageSize: 25 },
      expect.anything(),
    );
  });

  it("says it did not load, and is not 'nobody yet', when the list read fails", async () => {
    vi.mocked(smsApi.subscriptions).mockRejectedValue(
      new ApiError(500, "internal", "Something went wrong on our side."),
    );
    const user = userEvent.setup();
    render(<SmsScreen />);
    await user.click(await screen.findByRole("tab", { name: "People" }));

    expect(
      await screen.findByText("The people who have opted in did not load"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nobody yet")).not.toBeInTheDocument();
  });

  it("says nobody yet when the list is empty and nothing is filtered", async () => {
    vi.mocked(smsApi.subscriptions).mockResolvedValue(page([]));
    const user = userEvent.setup();
    render(<SmsScreen />);
    await user.click(await screen.findByRole("tab", { name: "People" }));
    expect(await screen.findByText("Nobody yet")).toBeInTheDocument();
  });

  it("filters by state behind the filter icon, and the chip says so outside it", async () => {
    const user = await openPeople();

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.selectOptions(screen.getByLabelText("State"), "Opted out");

    await waitFor(() =>
      expect(smsApi.subscriptions).toHaveBeenLastCalledWith(
        { page: 1, pageSize: 25, state: "OPTED_OUT" },
        expect.anything(),
      ),
    );
    expect(
      screen.getByRole("button", { name: /State:.*Opted out/ }),
    ).toBeInTheDocument();
  });
});

describe("what HR may do to a row", () => {
  it("lists recording consent for somebody who opted out themselves, dimmed, with the reason", async () => {
    const user = await openPeople();
    const menu = await openMenu(user, "Tunde Bakare");

    const consent = within(menu).getByRole("menuitem", {
      name: /Record written consent/,
    });
    expect(consent).toHaveAttribute("aria-disabled", "true");
    expect(consent).toHaveTextContent(
      "They opted out themselves. Only they can opt back in, from the app.",
    );
    await user.click(consent);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers it for an opt-out HR recorded, and asks where the signed form is filed", async () => {
    const user = await openPeople();
    const menu = await openMenu(user, "Chidi Nwosu");
    await user.click(
      within(menu).getByRole("menuitem", { name: /Record written consent/ }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Record written consent for Chidi Nwosu"),
    ).toBeInTheDocument();
    const submit = within(dialog).getByRole("button", {
      name: "Record consent",
    });
    expect(submit).toBeDisabled();

    const evidence = within(dialog).getByLabelText(/where the signed form/i);
    await user.type(evidence, "HR/1");
    expect(
      within(dialog).getByText(/at least 5 characters/i),
    ).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await user.clear(evidence);
    await user.type(evidence, "HR/TEXT/0042");
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(smsApi.recordConsent).toHaveBeenCalledWith("e3", {
      evidence: "HR/TEXT/0042",
    });
  });

  it("puts the API's refusal in the dialog when a person who opted out themselves is recorded from the page", async () => {
    vi.mocked(smsApi.recordConsent).mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "This employee opted out themselves. Only they can opt back in, from the app.",
      ),
    );
    const user = await openPeople();
    const menu = await openMenu(user, "Chidi Nwosu");
    await user.click(
      within(menu).getByRole("menuitem", { name: /Record written consent/ }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText(/where the signed form/i),
      "HR/TEXT/0042",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Record consent" }),
    );

    expect(
      await within(dialog).findByText(/Only they can opt back in/),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("records a first consent for somebody with no row yet, from the page, after choosing them", async () => {
    const user = await openPeople();
    await user.click(
      screen.getByRole("button", { name: /Record written consent/ }),
    );

    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", {
      name: "Record consent",
    });
    await user.type(
      within(dialog).getByLabelText(/where the signed form/i),
      "Box file 7, form 12",
    );
    /* Evidence alone is not enough: there is nobody to record it for. */
    expect(submit).toBeDisabled();

    await user.click(within(dialog).getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: /Kemi Adeyemi/ }),
    );
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(smsApi.recordConsent).toHaveBeenCalledWith("e9", {
      evidence: "Box file 7, form 12",
    });
  });

  it("asks before recording an opt-out, then records it against the employee", async () => {
    const user = await openPeople();
    const menu = await openMenu(user, "Ada Obi");
    await user.click(
      within(menu).getByRole("menuitem", { name: /Record opt-out/ }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(smsApi.recordOptOut).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Record opt-out" }),
    );

    expect(smsApi.recordOptOut).toHaveBeenCalledWith("e1");
  });

  it("has no opt-out to record for somebody who is already out, and says so", async () => {
    const user = await openPeople();
    const menu = await openMenu(user, "Tunde Bakare");
    const item = within(menu).getByRole("menuitem", {
      name: /Record opt-out/,
    });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveTextContent("Already opted out.");
  });
});
