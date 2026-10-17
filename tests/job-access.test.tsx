import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessBook, DemoGrant } from "@/lib/hiring/access/demo-ops";
import { demoAccess } from "@/lib/hiring/access/demo-store";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * The access panel on a job: who can see it, whether it is restricted, who may see a
 * screening score, and who has been invited.
 *
 * Collaborators are given access to one job. Everything that narrows or widens who can
 * see a job's applicants asks first and says what changes; the consequence of
 * restricting is the API's sentence, shown as written; and a refusal is shown under the
 * box it is about.
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

const { JobAccessCard } = await import("@/components/hiring/access/job-access");

const grant = (id: string, over: Partial<DemoGrant> = {}): DemoGrant => ({
  id,
  name: `Person ${id}`,
  email: `${id}@example.com`,
  role: "PANELIST",
  kind: "STAFF",
  status: "ACTIVE",
  since: "2026-07-20T09:00:00.000Z",
  employeeId: `emp-${id}`,
  fixed: false,
  ...over,
});

const book = (): AccessBook => ({
  alwaysOpen: ["Olivia Owner"],
  staff: [
    {
      id: "emp-new",
      name: "Nkechi Obi",
      jobTitle: "Analyst",
      email: "nkechi.obi@example.com",
    },
    {
      id: "emp-hm",
      name: "Hannah Manager",
      jobTitle: "Head of Finance",
      email: "hannah@example.com",
    },
  ],
  jobs: {
    "job-1": {
      restricted: false,
      scoreVisibility: "HIRING_TEAM",
      grants: [
        grant("hm", {
          name: "Hannah Manager",
          email: "hannah@example.com",
          role: "HIRING_MANAGER",
          employeeId: "emp-hm",
          fixed: true,
          since: "2026-07-06T09:00:00.000Z",
        }),
        grant("rec", { name: "Rita Recruiter", role: "RECRUITER" }),
        grant("acct", {
          name: "Folasade Ige",
          email: "folasade@example.com",
          kind: "ACCOUNT",
          employeeId: null,
        }),
        grant("inv", {
          name: "Ivo Invited",
          status: "INVITED",
        }),
      ],
      invites: [
        {
          id: "invite-1",
          name: "Kunle Adebayo",
          email: "kunle@example.com",
          role: "PANELIST",
          invitedAt: "2026-08-17T09:00:00.000Z",
          expiresAt: "2026-08-24T09:00:00.000Z",
          expired: false,
          invitedBy: "Fatima Bello",
        },
        {
          id: "invite-2",
          name: "Old Invite",
          email: "old@example.com",
          role: "RECRUITER",
          invitedAt: "2026-07-01T09:00:00.000Z",
          expiresAt: "2026-07-08T09:00:00.000Z",
          expired: true,
          invitedBy: null,
        },
      ],
      events: [
        {
          id: "ev-1",
          at: "2026-08-17T09:00:00.000Z",
          by: "Fatima Bello",
          text: "Invited Kunle Adebayo as panelist.",
        },
      ],
    },
  },
});

beforeEach(() => {
  window.localStorage?.clear?.();
  demoAccess.reset();
  demoAccess.commit(book());
});

const panel = async (canManage = true) => {
  renderInToasts(<JobAccessCard requisitionId="job-1" canManage={canManage} />);
  await screen.findByRole("list", { name: "People on this job" });
};

const members = () =>
  within(screen.getByRole("list", { name: "People on this job" }));

describe("who is on the job", () => {
  it("lists each person with what they are, whether they have signed in, whether they are staff, and since when", async () => {
    await panel();
    const all = members().getAllByRole("listitem");
    expect(all).toHaveLength(4);
    expect(all[0]).toHaveTextContent("Hannah Manager");
    expect(all[0]).toHaveTextContent("Hiring manager");
    expect(all[0]).toHaveTextContent("Since 6 Jul 2026");
    expect(all[1]).toHaveTextContent("Rita Recruiter");
    expect(all[1]).toHaveTextContent("Recruiter");
    /* Somebody invited to hire with the company, with no employee record. */
    expect(all[2]).toHaveTextContent("Folasade Ige");
    expect(all[2]).toHaveTextContent("Not on staff");
    expect(all[3]).toHaveTextContent("Invited, not signed in");
  });

  it("does not offer to take the hiring manager off, and says where that is changed", async () => {
    await panel();
    const manager = members().getAllByRole("listitem")[0] as HTMLElement;
    expect(
      within(manager).queryByRole("button", {
        name: /Take Hannah Manager off/,
      }),
    ).not.toBeInTheDocument();
    expect(manager).toHaveTextContent(
      "They are the hiring manager on the role itself. Change the hiring manager there.",
    );
  });

  it("takes somebody off after saying what that does and does not do, and records it", async () => {
    const user = userEvent.setup();
    await panel();
    await user.click(
      screen.getByRole("button", { name: "Take Rita Recruiter off this job" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Take Rita Recruiter off this job?");
    expect(dialog).toHaveTextContent(
      "They can no longer see this job, its applicants or its interviews.",
    );
    expect(dialog).toHaveTextContent("Anything they have already done on it");
    /* Nothing has been done by asking. */
    expect(demoAccess.current().jobs["job-1"]?.grants).toHaveLength(4);

    await user.click(within(dialog).getByRole("button", { name: "Take off" }));
    expect(
      await screen.findByText("Rita Recruiter is off this job"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(members().getAllByRole("listitem")).toHaveLength(3),
    );
    expect(
      screen.queryByText("Rita Recruiter", { selector: "p" }),
    ).not.toBeInTheDocument();
    expect(demoAccess.current().jobs["job-1"]?.events[0]?.text).toMatch(
      /Took Rita Recruiter off the job/,
    );
  });
});

describe("restricting the job", () => {
  it("asks first, with the API's own sentence about who keeps sight of it, then restricts", async () => {
    const user = userEvent.setup();
    await panel();
    const toggle = screen.getByRole("switch", { name: /Restricted job/ });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Restrict this job to the people listed?");
    /* What restricting does, said truthfully: company-wide hiring permission does NOT
       open a restricted job. */
    expect(dialog).toHaveTextContent(
      "Everybody else, including people who manage hiring for the whole company, will no longer be told it exists.",
    );
    expect(dialog).toHaveTextContent(
      "whoever holds the Restricted jobs permission",
    );
    expect(dialog).not.toHaveTextContent(
      /and the people who manage hiring for the whole company, can see/,
    );
    expect(demoAccess.current().jobs["job-1"]?.restricted).toBe(false);

    await user.click(
      within(dialog).getByRole("button", { name: "Restrict the job" }),
    );
    expect(
      await screen.findByText("The job is restricted"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: /Restricted job/ }),
      ).toBeChecked(),
    );
    expect(screen.getByText("This job is restricted")).toBeInTheDocument();
    /* And says who can open it whether or not they are listed. */
    expect(
      screen.getByText(
        /These people can open it whether or not they are listed/,
      ),
    ).toHaveTextContent("Olivia Owner");
    expect(demoAccess.current().jobs["job-1"]?.restricted).toBe(true);
  });

  it("says what widening does before it opens the job again", async () => {
    const user = userEvent.setup();
    const next = book();
    const job = next.jobs["job-1"];
    if (job) next.jobs["job-1"] = { ...job, restricted: true };
    demoAccess.commit(next);
    await panel();
    await user.click(screen.getByRole("switch", { name: /Restricted job/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Open this job to everybody who can see applicants?",
    );
    expect(dialog).toHaveTextContent(
      "Everybody who can see applicants in Hiring will see this job's applicants again",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Open the job" }),
    );
    expect(await screen.findByText("The job is open")).toBeInTheDocument();
    expect(demoAccess.current().jobs["job-1"]?.restricted).toBe(false);
  });

  it("shows the trail of changes, newest first", async () => {
    const user = userEvent.setup();
    await panel();
    await user.click(screen.getByRole("switch", { name: /Restricted job/ }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Restrict the job",
      }),
    );
    await screen.findByText("The job is restricted");
    await user.click(screen.getByRole("button", { name: /Who changed this/ }));
    const trail = await screen.findByRole("list", {
      name: "Changes to who can see this job",
    });
    const lines = within(trail).getAllByRole("listitem");
    expect(lines[0]).toHaveTextContent(
      "Restricted the job to the people listed.",
    );
    expect(lines[1]).toHaveTextContent("Invited Kunle Adebayo as panelist.");
  });
});

describe("who may see a screening score", () => {
  it("defaults to the recruiters and the hiring manager, says scores are advice, and saves a change", async () => {
    const user = userEvent.setup();
    await panel();
    const select = screen.getByRole("combobox", {
      name: "Who can see screening scores on this job",
    });
    expect(select).toHaveValue("HIRING_TEAM");
    expect(
      screen.getByText(/A score is advice for a person, not a verdict/),
    ).toBeInTheDocument();
    await user.selectOptions(select, "ALSO_PANELISTS");
    expect(
      await screen.findByText("Score visibility saved"),
    ).toBeInTheDocument();
    expect(demoAccess.current().jobs["job-1"]?.scoreVisibility).toBe(
      "ALSO_PANELISTS",
    );
  });
});

describe("inviting somebody", () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: /Invite somebody/ }));
    return screen.findByRole("dialog", { name: "Invite somebody to this job" });
  };

  it("says exactly what the chosen role can see, in the API's words, and what the email says", async () => {
    const user = userEvent.setup();
    await panel();
    const dialog = await open(user);
    expect(dialog).toHaveTextContent(
      "Subject: You have been invited to ApproveHR",
    );
    /* The email is the company's standard one: it does not name the job or who asked. */
    expect(dialog).toHaveTextContent(
      "The email does not name the job or who invited them",
    );
    expect(dialog).not.toHaveTextContent(/nothing about any applicant/);
    expect(screen.queryByTestId("what-they-see")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("radio", { name: /Panelist/ }));
    const sees = screen.getByTestId("what-they-see");
    expect(sees).toHaveTextContent("As panelist, they can see");
    expect(sees).toHaveTextContent(
      "The candidates whose interviews they are invited to",
    );
    expect(sees).toHaveTextContent("Their own scorecard, and nobody else's");
    expect(sees).toHaveTextContent(
      "only if this job lets panelists see scores",
    );
    expect(sees).not.toHaveTextContent("every scorecard handed in");
    /* What no role ever gets, said once under the list. */
    expect(sees).toHaveTextContent(
      "They never see contact details, pay, answers to questions, history or offers",
    );

    await user.click(within(dialog).getByRole("radio", { name: /Recruiter/ }));
    expect(screen.getByTestId("what-they-see")).toHaveTextContent(
      "every scorecard handed in",
    );

    /* The hiring manager of a company with no staff to name on the role is invited as one. */
    await user.click(
      within(dialog).getByRole("radio", { name: /Hiring manager/ }),
    );
    expect(screen.getByTestId("what-they-see")).toHaveTextContent(
      "As hiring manager, they can see",
    );
  });

  it("sends an invitation to somebody new, and shows it among those waiting", async () => {
    const user = userEvent.setup();
    await panel();
    const dialog = await open(user);
    await user.type(within(dialog).getByLabelText(/First name/), "Tola");
    await user.type(within(dialog).getByLabelText(/Last name/), "Bello");
    await user.type(
      within(dialog).getByLabelText(/Email address/),
      "tola.bello@example.com",
    );
    const send = within(dialog).getByRole("button", {
      name: "Send invitation",
    });
    expect(send).toBeDisabled();
    await user.click(within(dialog).getByRole("radio", { name: /Panelist/ }));
    await user.click(send);

    expect(
      await screen.findByText(
        /tola.bello@example.com is invited\. Nothing leaves a practice copy/,
      ),
    ).toBeInTheDocument();
    const waiting = await screen.findByRole("list", {
      name: "Invitations waiting",
    });
    expect(within(waiting).getByText("Tola Bello")).toBeInTheDocument();
    /* Until accepted, they are an invitation, not a member of the job. */
    expect(members().queryByText("Tola Bello")).not.toBeInTheDocument();
  });

  it("puts each refusal under the box it is about, in the API's words", async () => {
    const user = userEvent.setup();
    await panel();
    const dialog = await open(user);
    await user.type(within(dialog).getByLabelText(/First name/), "Tola");
    await user.type(within(dialog).getByLabelText(/Last name/), "Bello");
    await user.type(
      within(dialog).getByLabelText(/Email address/),
      "not-an-email",
    );
    await user.click(within(dialog).getByRole("radio", { name: /Panelist/ }));
    await user.click(
      within(dialog).getByRole("button", { name: "Send invitation" }),
    );
    const email = await within(dialog).findByLabelText(/Email address/);
    await waitFor(() => expect(email).toBeInvalid());
    expect(
      within(dialog).getByText("Enter a valid email address."),
    ).toBeInTheDocument();
    /* Nothing was sent, and the form is as it was typed. */
    expect(demoAccess.current().jobs["job-1"]?.invites).toHaveLength(2);
    expect(within(dialog).getByLabelText(/First name/)).toHaveValue("Tola");

    await user.clear(email);
    await user.type(email, "kunle@example.com");
    await user.click(
      within(dialog).getByRole("button", { name: "Send invitation" }),
    );
    expect(
      await within(dialog).findByText(
        "That person already has access, or an invitation, for this job.",
      ),
    ).toBeInTheDocument();
  });

  it("gives access to a member of staff at once, with no email, and says so", async () => {
    const user = userEvent.setup();
    await panel();
    const dialog = await open(user);
    await user.click(
      within(dialog).getByRole("radio", { name: "A member of staff" }),
    );
    expect(dialog).toHaveTextContent(
      "can already sign in is given access at once",
    );
    await user.click(
      within(dialog).getByRole("combobox", { name: /Member of staff/ }),
    );
    await user.click(await screen.findByRole("option", { name: /Nkechi Obi/ }));
    await user.click(within(dialog).getByRole("radio", { name: /Recruiter/ }));
    await user.click(
      within(dialog).getByRole("button", { name: "Give access" }),
    );

    expect(
      await screen.findByText(/Nkechi Obi has access now\. No email was sent/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(members().getAllByRole("listitem")).toHaveLength(5),
    );
    expect(members().getByText("Nkechi Obi")).toBeInTheDocument();
  });

  it("starts blank each time it opens", async () => {
    const user = userEvent.setup();
    await panel();
    let dialog = await open(user);
    await user.type(within(dialog).getByLabelText(/First name/), "Tola");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    dialog = await open(user);
    expect(within(dialog).getByLabelText(/First name/)).toHaveValue("");
  });
});

describe("invitations waiting", () => {
  it("can be sent again, naming who, and says when one has expired", async () => {
    const user = userEvent.setup();
    await panel();
    const waiting = screen.getByRole("list", { name: "Invitations waiting" });
    const items = within(waiting).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Kunle Adebayo");
    expect(items[0]).toHaveTextContent("Sent 17 Aug 2026 by Fatima Bello");
    expect(items[0]).toHaveTextContent("Works until 24 Aug 2026");
    expect(items[1]).toHaveTextContent("Expired");

    await user.click(
      screen.getByRole("button", {
        name: "Send Kunle Adebayo the invitation again",
      }),
    );
    /* A practice copy sends nothing, and says so rather than claiming it did. */
    expect(
      await screen.findByText("No email was sent to kunle@example.com"),
    ).toBeInTheDocument();
    expect(
      demoAccess
        .current()
        .jobs["job-1"]?.invites.find((i) => i.id === "invite-1")?.invitedAt,
    ).toBe("2026-08-19T09:00:00.000Z");
  });

  it("can be cancelled, after saying the link stops working", async () => {
    const user = userEvent.setup();
    await panel();
    await user.click(
      screen.getByRole("button", {
        name: "Cancel the invitation to Kunle Adebayo",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("The link in their email stops working.");
    await user.click(
      within(dialog).getByRole("button", { name: "Cancel invitation" }),
    );
    expect(
      await screen.findByText("The invitation to Kunle Adebayo is cancelled"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("list", { name: "Invitations waiting" }),
        ).queryByText("Kunle Adebayo"),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("somebody who may look but not change", () => {
  it("sees who is on the job and nothing to press", async () => {
    await panel(false);
    expect(members().getAllByRole("listitem")).toHaveLength(4);
    expect(
      screen.queryByRole("button", { name: /Invite somebody/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /off this job/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /Restricted job/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", {
        name: "Who can see screening scores on this job",
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /Send .* the invitation again/ }),
    ).not.toBeInTheDocument();
  });
});
