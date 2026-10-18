import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * The emails about an interview, in the template editor: the invitation, the change, the
 * cancellation, and the three notes to the panel.
 *
 * They are kinds like the others, and the editor draws what it is given: each kind offers
 * only the details that exist when it is sent, a detail that does not belong is refused
 * under its box before Save is pressed, and the join link, which is empty for an interview
 * in person, cannot be put in a subject.
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
  usePathname: () => "/hiring/settings/emails",
  useSearchParams: () => new URLSearchParams(),
}));

const { EmailsScreen } =
  await import("@/app/(app)/hiring/settings/emails/emails-screen");

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
});

const SLOW = { timeout: 4000 };

const open = async () => {
  renderInToasts(<EmailsScreen />);
  await screen.findByText("Emails to candidates", { selector: "h2" });
  await screen.findByText("Kind decline");
};

const KINDS = [
  "Invitation to interview",
  "Interview changed",
  "Interview cancelled",
  "Invitation to the panel",
  "Interview changed (panel)",
  "Interview cancelled (panel)",
];

describe("the page lists the interview emails", () => {
  it("has a section for each, saying when it goes and what the built-in wording is", async () => {
    await open();
    for (const kind of KINDS) {
      expect(
        screen.getByRole("heading", { name: kind, level: 3 }),
        kind,
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText(
        /Sent to each person on the panel when an interview is arranged/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A calendar file with the new details is attached/),
    ).toBeInTheDocument();
  });
});

describe("writing an email about an interview", () => {
  const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
    await open();
    await user.click(screen.getByRole("button", { name: "New email" }));
    return screen.findByRole("dialog", { name: "New email" });
  };
  const kind = (dialog: HTMLElement) =>
    within(dialog).getByRole("combobox", { name: /Kind of email/ });
  const message = (dialog: HTMLElement) =>
    within(dialog).getByRole("textbox", { name: /Message/ });
  const subject = (dialog: HTMLElement) =>
    within(dialog).getByRole("textbox", { name: /Subject/ });

  it("offers every interview kind in the list of kinds", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    const options = within(kind(dialog))
      .getAllByRole("option")
      .map((o) => o.textContent);
    for (const label of KINDS) expect(options).toContain(label);
  });

  it("offers the join link, the day, the zone and the calendar links to the candidate's invitation", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.selectOptions(kind(dialog), "Invitation to interview");
    for (const label of [
      "The day of their interview",
      "The time zone its time is in",
      "A link that adds the interview to Google Calendar",
      "A link that adds the interview to Outlook",
    ]) {
      expect(
        within(dialog).getByRole("button", { name: `Insert ${label}` }),
        label,
      ).toBeInTheDocument();
    }
    expect(
      within(dialog).getByRole("button", {
        name: /Insert The link to join an online interview/,
      }),
    ).toBeInTheDocument();
  });

  it("offers the candidate's name and the scorecard link to the panel, and not to the candidate", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.selectOptions(kind(dialog), "Invitation to the panel");
    expect(
      within(dialog).getByRole("button", {
        name: /Insert The candidate's full name/,
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: /Insert Where the panelist hands in/,
      }),
    ).toBeInTheDocument();

    await user.selectOptions(kind(dialog), "Invitation to interview");
    expect(
      within(dialog).queryByRole("button", {
        name: /Insert The candidate's full name/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", {
        name: /Insert Where the panelist hands in/,
      }),
    ).not.toBeInTheDocument();
  });

  it("follows the kind's built-in wording until the person writes their own", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.selectOptions(kind(dialog), "Interview cancelled");
    expect((subject(dialog) as HTMLInputElement).value).toBe(
      "{company_name}: your interview for {job_title} has been cancelled",
    );
    await user.selectOptions(kind(dialog), "Interview changed");
    expect((subject(dialog) as HTMLInputElement).value).toBe(
      "{company_name}: your interview for {job_title} has changed",
    );
  });

  it("refuses a panel detail in a candidate's email, under the box, in the API's words", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.selectOptions(kind(dialog), "Invitation to interview");
    fireEvent.change(message(dialog), {
      target: {
        value: "Hello {candidate_first_name}, score it at {scorecard_link}.",
      },
    });
    const refused = await within(dialog).findByText(
      /\{scorecard_link\} cannot be used in a "Invitation to interview" email/,
      {},
      SLOW,
    );
    expect(refused).toBeInTheDocument();
    expect(refused.textContent).toContain('"Invitation to the panel"');
    expect(
      within(dialog).getByText(/There is no preview yet/),
    ).toBeInTheDocument();
  });

  it("refuses the join link in a subject, which is one line and cannot lose it", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.selectOptions(kind(dialog), "Invitation to interview");
    fireEvent.change(subject(dialog), {
      target: { value: "Join at {join_link}" },
    });
    expect(
      await within(dialog).findByText(
        /\{join_link\} cannot be used in a subject/,
        {},
        SLOW,
      ),
    ).toBeInTheDocument();
  });

  it("refuses a field that does not exist, naming the ones that do for this kind", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.selectOptions(kind(dialog), "Interview changed");
    fireEvent.change(message(dialog), {
      target: { value: "Your pay will be {salary}." },
    });
    const refused = await within(dialog).findByText(
      /\{salary\} is not a field you can use/,
      {},
      SLOW,
    );
    expect(refused.textContent).toContain("{join_link}");
  });

  it("previews a note to the panel with the panelist's name, in the same words they would get", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.selectOptions(kind(dialog), "Invitation to the panel");
    expect(
      await within(dialog).findByText(/Hello Chidi,/, {}, SLOW),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Candidate: Ada Okafor/),
    ).toBeInTheDocument();
  });

  it("leaves out the line an empty join link was on, in the preview of what would be sent", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.selectOptions(kind(dialog), "Invitation to interview");
    fireEvent.change(message(dialog), {
      target: {
        value:
          "Hello {candidate_first_name},\n\nJoin online: {join_link}\nWhere: {interview_location}",
      },
    });
    expect(
      await within(dialog).findByText(
        /Join online: https:\/\/meet\.google\.com/,
        {},
        SLOW,
      ),
    ).toBeInTheDocument();
  });
});
