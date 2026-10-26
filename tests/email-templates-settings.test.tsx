import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * The company's emails to candidates, in a demo, so the real demo gateway answers.
 *
 * What matters on this page: it says nothing here sends anything on its own, it shows
 * who emails come from without letting it be typed, a field that is not allowed is
 * refused under the box it is in before Save is pressed, and an email a stage sends
 * cannot be archived out from under the stage.
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

describe("the page", () => {
  it("says nothing here sends anything on its own", async () => {
    await open();
    expect(
      screen.getByText(
        /Nothing here sends anything on its own: an email goes only when somebody on your team asks for it/,
      ),
    ).toBeInTheDocument();
  });

  it("shows whose name emails go in and where replies go, as words and not as a box", async () => {
    await open();
    expect(screen.getByText(/Emails are sent as/).textContent).toContain(
      "Schull Technologies",
    );
    expect(
      screen.getByText(/Replies go to people@schull.io/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Change the reply-to address in Careers settings",
      }),
    ).toHaveAttribute("href", "/hiring/postings/settings");
    /* The only boxes on the page are the switch: nobody types the sender. */
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("lists each kind with its emails, the default marked, and the built-in wording where there is none", async () => {
    await open();
    expect(screen.getByText("Application received")).toBeInTheDocument();
    const decline = screen
      .getByText("Kind decline")
      .closest("li") as HTMLElement;
    expect(within(decline).getByText("Used by default")).toBeInTheDocument();
    expect(screen.getAllByText("Built-in wording").length).toBeGreaterThan(0);
  });

  it("says an email asked for now would not be sent, and why, in a practice board", async () => {
    await open();
    expect(
      await screen.findByText("An email asked for now would not be sent"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/practice workspace with no email/),
    ).toBeInTheDocument();
  });

  it("has a switch for the company, and turning it off says why emails would not go", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(
      screen.getByRole("switch", { name: "Send emails to candidates" }),
    );
    expect(
      await screen.findByText("Emails to candidates are off"),
    ).toBeInTheDocument();
    /* The reason sits behind the mark beside the title; its words are in the
       page for anybody who cannot hover. */
    expect(
      await screen.findByText(
        /Emails to candidates are switched off for your company\./,
      ),
    ).toBeInTheDocument();
    expect(demoPipeline.current().mail.enabled).toBe(false);
  });
});

describe("writing an email", () => {
  const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
    await open();
    await user.click(screen.getByRole("button", { name: "New email" }));
    return screen.findByRole("dialog", { name: "New email" });
  };

  const message = (dialog: HTMLElement) =>
    within(dialog).getByRole("textbox", { name: /Message/ });

  it("offers only the fields that exist when this kind is sent", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Kind of email/ }),
      "Application received",
    );
    expect(
      within(dialog).getByRole("button", { name: "Insert The job's title" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", {
        name: "Insert When their interview is",
      }),
    ).not.toBeInTheDocument();

    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Kind of email/ }),
      "Invitation to interview",
    );
    expect(
      within(dialog).getByRole("button", {
        name: "Insert When their interview is",
      }),
    ).toBeInTheDocument();
  });

  it("puts a field where the cursor is", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    const box = message(dialog) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Hello , welcome." } });
    box.focus();
    box.setSelectionRange(6, 6);
    await user.click(
      within(dialog).getByRole("button", {
        name: "Insert The candidate's first name",
      }),
    );
    expect(box.value).toBe("Hello {candidate_first_name}, welcome.");
  });

  it("refuses a field that is not allowed under the box it is in, before Save is pressed", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    const box = message(dialog);
    fireEvent.change(box, {
      target: {
        value: "Hello {candidate_first_name}, your salary is {salary}.",
      },
    });
    expect(
      await within(dialog).findByText(
        /\{salary\} is not a field you can use/,
        {},
        SLOW,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/There is no preview yet/),
    ).toBeInTheDocument();
  });

  it("does not save an email that cannot be saved, and saves it once it can", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.type(
      within(dialog).getByRole("textbox", { name: /Name/ }),
      "Warm decline",
    );
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Kind of email/ }),
      "Not taking them forward",
    );
    fireEvent.change(message(dialog), {
      target: { value: "Hello {salary}" },
    });
    await within(dialog).findByText(/There is no preview yet/, {}, SLOW);
    await user.click(
      within(dialog).getByRole("button", { name: "Save email" }),
    );
    expect(
      await within(dialog).findByText(/\{salary\} is not a field you can use/),
    ).toBeInTheDocument();
    expect(
      demoPipeline
        .current()
        .emailTemplates.some((t) => t.name === "Warm decline"),
    ).toBe(false);

    fireEvent.change(message(dialog), {
      target: { value: "Hello {candidate_first_name}, thank you." },
    });
    await within(dialog).findByText(
      "Made with made-up details, so you can see the shape.",
      {},
      SLOW,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save email" }),
    );
    expect(await screen.findByText("Warm decline saved")).toBeInTheDocument();
    expect(
      demoPipeline
        .current()
        .emailTemplates.some((t) => t.name === "Warm decline"),
    ).toBe(true);
  });

  it("shows a preview with made-up details, and says so", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    expect(
      await within(dialog).findByText(
        "Made with made-up details, so you can see the shape.",
        {},
        SLOW,
      ),
    ).toBeInTheDocument();
    /* The built-in wording of the starting kind, merged with the sample name. */
    expect(within(dialog).getByText(/Hello Ada,/)).toBeInTheDocument();
  });

  it("shows who it is from, read-only, and nowhere to type it", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    expect(within(dialog).getByText("Who it is from")).toBeInTheDocument();
    expect(within(dialog).getByText(/Sent as/).textContent).toContain(
      "Schull Technologies",
    );
    const boxes = within(dialog)
      .getAllByRole("textbox")
      .map((b) => b.getAttribute("aria-label") ?? b.id);
    expect(boxes.join(" ")).not.toMatch(/from|sender/i);
  });

  it("will not let a name be taken twice", async () => {
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await user.type(
      within(dialog).getByRole("textbox", { name: /Name/ }),
      "Kind decline",
    );
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Kind of email/ }),
      "Not taking them forward",
    );
    await within(dialog).findByText(
      "Made with made-up details, so you can see the shape.",
      {},
      SLOW,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save email" }),
    );
    expect(
      await within(dialog).findByText(
        'There is already a template called "Kind decline".',
      ),
    ).toBeInTheDocument();
  });
});

describe("making one the default, archiving, restoring", () => {
  it("will not archive an email a stage sends, and says how many stages do", async () => {
    const user = userEvent.setup();
    await open();
    const row = screen
      .getByText("Moved to the next stage")
      .closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Archive" }));
    expect(await screen.findByText("That did not work")).toBeInTheDocument();
    expect(
      await screen.findByText(
        /stages send this email\. Point them at another template, or at none, before archiving it\./,
      ),
    ).toBeInTheDocument();
    expect(
      demoPipeline.current().emailTemplates.find((t) => t.id === "etpl-1")
        ?.archived,
    ).toBe(false);
  });

  it("archives one nothing sends, and brings it back", async () => {
    const user = userEvent.setup();
    const made = await demoPipeline.current();
    demoPipeline.commit({
      ...made,
      emailTemplates: [
        ...made.emailTemplates,
        {
          id: "etpl-9",
          kind: "OFFER_SENT",
          kindLabel: "Offer sent",
          name: "Offer on its way",
          subject: "An update",
          body: "Hello {candidate_first_name}",
          isDefault: false,
          archived: false,
          usedByStages: 0,
        },
      ],
    });
    await open();
    const row = screen
      .getByText("Offer on its way")
      .closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Archive" }));
    expect(
      await screen.findByText("Offer on its way archived"),
    ).toBeInTheDocument();
    await user.click(screen.getByText(/Archived \(1\)/));
    await user.click(await screen.findByRole("button", { name: "Restore" }));
    expect(
      await screen.findByText("Offer on its way restored"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("Offer on its way").closest("li"),
      ).toBeInTheDocument(),
    );
  });

  it("makes another the default for its kind, and only one is", async () => {
    const user = userEvent.setup();
    const made = demoPipeline.current();
    demoPipeline.commit({
      ...made,
      emailTemplates: [
        ...made.emailTemplates,
        {
          id: "etpl-8",
          kind: "DECLINE",
          kindLabel: "Not taking them forward",
          name: "Brisk decline",
          subject: "Your application",
          body: "Hello {candidate_first_name}",
          isDefault: false,
          archived: false,
          usedByStages: 0,
        },
      ],
    });
    await open();
    const row = screen.getByText("Brisk decline").closest("li") as HTMLElement;
    await user.click(
      within(row).getByRole("button", { name: "Use by default" }),
    );
    await waitFor(() =>
      expect(within(row).getByText("Used by default")).toBeInTheDocument(),
    );
    const kind = screen.getByText("Kind decline").closest("li") as HTMLElement;
    expect(within(kind).queryByText("Used by default")).not.toBeInTheDocument();
  });
});
