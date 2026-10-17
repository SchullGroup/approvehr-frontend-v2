import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiApplicationDetail } from "@/lib/api/recruitment";
import type { HiredSettings } from "@/lib/hiring/hired/model";

/**
 * Recording that a candidate accepted.
 *
 * It used to create their employee record in the same breath, and the API asked for
 * permission to edit people as well as to manage hiring because of it. It now puts
 * them on the Hired list and creates an employee only where the company's setting says
 * so and it has Core HR. So: the button asks first and says what will happen, in a
 * sentence driven by that setting; the permission it needs follows what it does; and
 * what is said afterwards comes from the API's answer, never from the setting.
 */

let granted = new Set<string>();
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => granted.has(permission),
  usePermissions: () => ({
    can: (p: string) => granted.has(p),
    loading: false,
  }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const setting = vi.hoisted(() => ({ current: null as HiredSettings | null }));
vi.mock("@/lib/hiring/hired/use-hired", () => ({
  useHiredSettings: () => ({
    settings: setting.current,
    loading: false,
    error: null,
    reload: () => undefined,
    save: async () => {
      throw new Error("not used");
    },
  }),
}));

const accept = vi.fn();
vi.mock("@/lib/api/recruitment", async (original) => {
  const real = await original<typeof import("@/lib/api/recruitment")>();
  return {
    ...real,
    recruitmentApi: {
      ...real.recruitmentApi,
      listStages: async () => [],
      acceptOffer: (...args: unknown[]) => accept(...args),
    },
  };
});

const { RealPipeline } =
  await import("@/app/(app)/hiring/candidates/[id]/real-pipeline");

const settings = (over: Partial<HiredSettings> = {}): HiredSettings => ({
  onOfferAccepted: "HIRED_LIST_ONLY",
  effective: "HIRED_LIST_ONLY",
  coreHr: true,
  coreHrReason: null,
  canChange: true,
  ...over,
});

const application = (offer: Record<string, unknown> = {}) =>
  ({
    id: "pa-1",
    requisitionId: "req-1",
    candidateId: "cand-1",
    candidateName: "Chioma Aduba",
    candidateEmail: "chioma@example.com",
    stageId: "s1",
    stageName: "Offer",
    outcome: "OFFER_MADE",
    requisitionReference: "REQ-1",
    requisitionJobTitle: "Payroll Analyst",
    candidate: { id: "cand-1" },
    interviews: [],
    history: [],
    offer: {
      id: "offer-1",
      applicationId: "pa-1",
      grossMonthlyKobo: 50_000_000,
      startDate: "2026-11-01",
      status: "SENT",
      outsideBand: false,
      approvedById: "u1",
      approvedAt: "2026-10-10T09:00:00.000Z",
      sentAt: "2026-10-11T09:00:00.000Z",
      respondedAt: null,
      employeeId: null,
      ...offer,
    },
  }) as unknown as ApiApplicationDetail;

const open = (offer: Record<string, unknown> = {}, onChanged = () => {}) =>
  render(
    <RealPipeline application={application(offer)} onChanged={onChanged} />,
  );

const press = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Record accepted" }));
  return screen.findByRole("dialog", {
    name: "Record that Chioma Aduba accepted?",
  });
};

beforeEach(() => {
  accept.mockReset();
  granted = new Set();
  setting.current = settings();
});

describe("recording that an offer was accepted", () => {
  it("asks first, and says what happens: on the Hired list, no employee record yet", async () => {
    granted = new Set(["MANAGE_HIRING"]);
    const user = userEvent.setup();
    open();
    const dialog = await press(user);
    expect(dialog).toHaveTextContent(
      "They are added to the Hired list. No employee record is created yet.",
    );
    expect(dialog).toHaveTextContent(
      "Create it from the Hired list when you are ready",
    );
    expect(dialog).toHaveTextContent("If this takes the last place on the job");
    /* Nothing has been sent to the API by pressing the button. */
    expect(accept).not.toHaveBeenCalled();
  });

  it("is done by the confirm, with the offer's id, and names where the person is now", async () => {
    granted = new Set(["MANAGE_HIRING"]);
    accept.mockResolvedValue({
      employeeId: null,
      rejectedOthers: 0,
      requisitionFilled: false,
      hiresSoFar: 1,
      headcount: 3,
    });
    const onChanged = vi.fn();
    const user = userEvent.setup();
    open({}, onChanged);
    const dialog = await press(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Record accepted" }),
    );
    await waitFor(() => expect(accept).toHaveBeenCalledWith("offer-1"));
    expect(
      await screen.findByText(
        /Chioma Aduba is on the Hired list\. No employee record was created\./,
      ),
    ).toBeInTheDocument();
    /* A role with room for more is not filled by the first, and the banner says
       which hire this was instead of leaving "accepted" to read as "done". */
    expect(
      screen.getByText(
        /That is hire 1 of 3 for this role, so it is still open/,
      ),
    ).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("says the role is filled, and who was rejected, when the last hire closes it", async () => {
    granted = new Set(["MANAGE_HIRING"]);
    accept.mockResolvedValue({
      employeeId: null,
      rejectedOthers: 4,
      requisitionFilled: true,
      hiresSoFar: 3,
      headcount: 3,
    });
    const user = userEvent.setup();
    open();
    const dialog = await press(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Record accepted" }),
    );
    expect(
      await screen.findByText(
        /4 other candidates still in this pipeline were automatically rejected/,
      ),
    ).toBeInTheDocument();
  });

  it("claims an employee record only when the API's answer carries one", async () => {
    granted = new Set(["MANAGE_HIRING", "EDIT_RECORDS"]);
    setting.current = settings({
      onOfferAccepted: "CREATE_EMPLOYEE",
      effective: "CREATE_EMPLOYEE",
    });
    accept.mockResolvedValue({
      employeeId: "emp-9",
      rejectedOthers: 0,
      requisitionFilled: true,
      hiresSoFar: 1,
      headcount: 1,
    });
    const user = userEvent.setup();
    open();
    const dialog = await press(user);
    expect(dialog).toHaveTextContent(
      "They are added to the Hired list and their employee record is created now.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Record accepted" }),
    );
    expect(
      await screen.findByText(
        /Chioma Aduba is on the Hired list and their employee record was created\./,
      ),
    ).toBeInTheDocument();
  });

  it("shows the API's refusal on the card and says nothing was created", async () => {
    granted = new Set(["MANAGE_HIRING"]);
    const { ApiError } = await import("@/lib/api/client");
    accept.mockRejectedValue(
      new ApiError(409, "conflict", "FIN-032 already has all 1 of its people."),
    );
    const user = userEvent.setup();
    open();
    const dialog = await press(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Record accepted" }),
    );
    expect(
      await screen.findByText("FIN-032 already has all 1 of its people."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/is on the Hired list/)).not.toBeInTheDocument();
  });
});

describe("the sentence, by the company's setting and Core HR", () => {
  const cases: {
    name: string;
    setting: HiredSettings | null;
    says: RegExp;
    saysNot?: RegExp;
  }[] = [
    {
      name: "default, with Core HR",
      setting: settings(),
      says: /No employee record is created yet\./,
      saysNot: /created now/,
    },
    {
      name: "default, without Core HR",
      setting: settings({ coreHr: false, coreHrReason: "No Core HR." }),
      says: /does not use Core HR[\s\S]*Hired list is where they stay/,
    },
    {
      name: "old behaviour, with Core HR",
      setting: settings({
        onOfferAccepted: "CREATE_EMPLOYEE",
        effective: "CREATE_EMPLOYEE",
      }),
      says: /their employee record is created now/,
    },
    {
      name: "old behaviour chosen, Core HR since lost",
      setting: settings({
        onOfferAccepted: "CREATE_EMPLOYEE",
        effective: "HIRED_LIST_ONLY",
        coreHr: false,
      }),
      says: /No employee record is created, because your company does not use Core HR/,
      saysNot: /created now/,
    },
    {
      name: "not read yet",
      setting: null,
      says: /Whether an employee record is made as well depends on Hiring settings/,
      saysNot: /created now|No employee record is created yet/,
    },
  ];

  for (const entry of cases) {
    it(`says it truthfully: ${entry.name}`, async () => {
      granted = new Set(["MANAGE_HIRING", "EDIT_RECORDS"]);
      setting.current = entry.setting;
      const user = userEvent.setup();
      open();
      const dialog = await press(user);
      expect(dialog).toHaveTextContent(entry.says);
      if (entry.saysNot) expect(dialog).not.toHaveTextContent(entry.saysNot);
      expect(dialog.textContent).not.toMatch(/!/);
    });
  }

  it("sends a person to Hiring settings when the setting could not be read", async () => {
    granted = new Set(["MANAGE_HIRING", "EDIT_RECORDS"]);
    setting.current = null;
    const user = userEvent.setup();
    open();
    const dialog = await press(user);
    expect(
      within(dialog).getByRole("link", {
        name: "Check Accepted offers in Hiring settings",
      }),
    ).toHaveAttribute("href", "/hiring/settings/accepted-offers");
  });
});

describe("who is offered the button", () => {
  it("is anybody who may manage hiring when it only adds to the Hired list", () => {
    granted = new Set(["MANAGE_HIRING"]);
    open();
    expect(
      screen.getByRole("button", { name: "Record accepted" }),
    ).toBeInTheDocument();
  });

  it("needs permission to edit people as well where it makes the employee record, and says why", () => {
    granted = new Set(["MANAGE_HIRING"]);
    setting.current = settings({
      onOfferAccepted: "CREATE_EMPLOYEE",
      effective: "CREATE_EMPLOYEE",
    });
    open();
    expect(
      screen.queryByRole("button", { name: "Record accepted" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/also creates their employee record here/),
    ).toBeInTheDocument();
    /* Declining creates nobody, so it is still theirs to press. */
    expect(
      screen.getByRole("button", { name: "Record declined" }),
    ).toBeInTheDocument();
  });

  it("keeps the stricter rule while the setting is not known", () => {
    granted = new Set(["MANAGE_HIRING"]);
    setting.current = null;
    open();
    expect(
      screen.queryByRole("button", { name: "Record accepted" }),
    ).not.toBeInTheDocument();
  });

  it("is not offered to an approver who cannot manage hiring", () => {
    granted = new Set(["APPROVE_HIRING", "EDIT_RECORDS"]);
    open();
    expect(
      screen.queryByRole("button", { name: "Record accepted" }),
    ).not.toBeInTheDocument();
  });
});

describe("an accepted offer", () => {
  it("links to the employee record when there is one, and to the Hired list when there is not", () => {
    granted = new Set(["MANAGE_HIRING"]);
    const { unmount } = open({ status: "ACCEPTED", employeeId: "emp-9" });
    expect(
      screen.getByRole("link", { name: "Employee record created." }),
    ).toHaveAttribute("href", "/people/emp-9");
    unmount();

    open({ status: "ACCEPTED", employeeId: null });
    expect(
      screen.getByText(/On the Hired list\. No employee record yet\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open the Hired list" }),
    ).toHaveAttribute("href", "/hiring/hired?job=req-1");
    expect(
      screen.queryByText(/Became an employee record/),
    ).not.toBeInTheDocument();
  });
});
