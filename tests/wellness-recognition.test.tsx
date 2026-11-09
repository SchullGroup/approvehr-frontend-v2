import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiKudosReport } from "@/lib/api/wellness";
import type { PermissionKey } from "@/lib/permission-keys";
import { company, fakeDirectory } from "./employee-directory-fake";
import { kudos, paged } from "./wellness-fixtures";

/**
 * Recognition: thanks as sentences, public or private.
 *
 * The rules to hold are that a private kudos says so, that the person's own
 * lists read as "You thanked" and "thanked you", that a delete button appears
 * only where the API said the caller may delete, and that giving one sends the
 * private choice as it was made.
 *
 * Reporting is held to its own rules: the dialog says what happens before it
 * happens, "Reported" is said only once the API has answered, a route that is
 * not there or no connection is said calmly and claims nothing, and the
 * administrators' Reports pill is there only for somebody who holds the
 * permission and whose list the API answered.
 */

const api = vi.hoisted(() => ({
  recognitions: vi.fn(),
  myRecognitions: vi.fn(),
  giveRecognition: vi.fn(),
  removeRecognition: vi.fn(),
  reportRecognition: vi.fn(),
  kudosReports: vi.fn(),
  resolveKudosReport: vi.fn(),
}));

vi.mock("@/lib/api/wellness", async (original) => ({
  ...(await original<typeof import("@/lib/api/wellness")>()),
  wellnessApi: api,
}));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, employeeId: "e-me" }),
  useOrgTimezone: () => "Africa/Lagos",
}));

let held = new Set<PermissionKey>();
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
}));

/* The real search hook over a fake directory that answers as the API does, so
   what is pinned is the screen's own wiring: yourself is left out, and the
   person chosen is the one whose id goes to the API. */
const directory = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api/endpoints", async (original) => ({
  ...(await original<typeof import("@/lib/api/endpoints")>()),
  employees: {
    ...(await original<typeof import("@/lib/api/endpoints")>()).employees,
    list: (...args: unknown[]) => directory.list(...args),
  },
}));

import { RecognitionScreen } from "@/app/(app)/wellness/recognition-screen";

beforeEach(() => {
  vi.resetAllMocks();
  held = new Set<PermissionKey>();
  api.recognitions.mockResolvedValue(paged([kudos()]));
  api.myRecognitions.mockResolvedValue(paged([]));
  api.kudosReports.mockResolvedValue(paged([]));
  directory.list.mockImplementation(
    fakeDirectory([
      { id: "e-me", firstName: "Me", lastName: "Myself", jobTitle: "Engineer" },
      { id: "e-ada", firstName: "Ada", lastName: "Obi", jobTitle: "Designer" },
      {
        id: "e-tunde",
        firstName: "Tunde",
        lastName: "Bello",
        jobTitle: "Analyst",
      },
    ]).list,
  );
});

describe("the company feed", () => {
  it("reads as sentences, with a date", async () => {
    render(<RecognitionScreen />);

    expect(
      await screen.findByText("Thank you for covering the Friday release."),
    ).toBeInTheDocument();
    const row = screen.getByText(/thanked/).closest("li") as HTMLElement;
    expect(within(row).getByText("Ada Obi")).toBeInTheDocument();
    expect(within(row).getByText("Tunde Bello")).toBeInTheDocument();
    expect(within(row).getByText("20 Oct 2026")).toBeInTheDocument();
    expect(within(row).queryByText("Private")).not.toBeInTheDocument();
  });

  it("offers a delete only where the API says the caller may", async () => {
    api.recognitions.mockResolvedValue(
      paged([
        kudos({ id: "k1", canDelete: true, message: "Mine to delete." }),
        kudos({ id: "k2", canDelete: false, message: "Not mine." }),
      ]),
    );
    render(<RecognitionScreen />);
    await screen.findByText("Mine to delete.");

    expect(
      screen.getAllByRole("button", { name: /Delete the kudos/ }),
    ).toHaveLength(1);
  });

  it("deletes after asking, and takes the row away", async () => {
    api.recognitions.mockResolvedValue(paged([kudos({ canDelete: true })]));
    api.removeRecognition.mockResolvedValue({ id: "k1", deleted: true });
    render(<RecognitionScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Delete the kudos/ }),
    );
    expect(api.removeRecognition).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/comes off the company feed/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(api.removeRecognition).toHaveBeenCalledWith("k1");
    await waitFor(() =>
      expect(
        screen.queryByText("Thank you for covering the Friday release."),
      ).not.toBeInTheDocument(),
    );
  });

  it("says there is none, in a way that invites one, and says it did not load when it did not", async () => {
    api.recognitions.mockResolvedValue(paged([]));
    const { unmount } = render(<RecognitionScreen />);
    expect(await screen.findByText("No kudos yet")).toBeInTheDocument();
    unmount();

    api.recognitions.mockRejectedValue(new ApiError(500, "internal", "Broke."));
    render(<RecognitionScreen />);
    expect(
      await screen.findByText("The kudos did not load"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No kudos yet")).not.toBeInTheDocument();
  });
});

describe("your own", () => {
  it("is a choice of pills, and asks for the right direction", async () => {
    render(<RecognitionScreen />);
    await screen.findByText("Thank you for covering the Friday release.");

    await userEvent.click(screen.getByRole("radio", { name: "Given by me" }));

    await waitFor(() =>
      expect(api.myRecognitions).toHaveBeenCalledWith(
        expect.objectContaining({ direction: "given" }),
        expect.anything(),
      ),
    );
    expect(screen.getByRole("radio", { name: "Given by me" })).toBeChecked();
  });

  it("says You and you, and marks the private ones", async () => {
    api.myRecognitions.mockResolvedValue(
      paged([
        kudos({
          id: "k9",
          fromEmployeeId: "e-me",
          fromName: "Me Myself",
          toEmployeeId: "e-ada",
          toName: "Ada Obi",
          shared: false,
          message: "Just between us.",
        }),
        kudos({
          id: "k10",
          fromEmployeeId: "e-tunde",
          fromName: "Tunde Bello",
          toEmployeeId: "e-me",
          toName: "Me Myself",
          message: "Thanks for the review.",
        }),
      ]),
    );
    render(<RecognitionScreen />);
    await screen.findByText("Thank you for covering the Friday release.");
    await userEvent.click(screen.getByRole("radio", { name: "Given to me" }));

    const mine = (await screen.findByText("Just between us.")).closest(
      "li",
    ) as HTMLElement;
    expect(within(mine).getByText("You")).toBeInTheDocument();
    expect(within(mine).getByText("Private")).toBeInTheDocument();
    const received = screen
      .getByText("Thanks for the review.")
      .closest("li") as HTMLElement;
    expect(within(received).getByText("you")).toBeInTheDocument();
  });

  it("explains an empty list in its own words", async () => {
    render(<RecognitionScreen />);
    await screen.findByText("Thank you for covering the Friday release.");
    await userEvent.click(screen.getByRole("radio", { name: "Given to me" }));

    expect(
      await screen.findByText("Nobody has thanked you yet"),
    ).toBeInTheDocument();
  });
});

describe("giving kudos", () => {
  const open = async () => {
    render(<RecognitionScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Give kudos/ }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("combobox", { name: "Who" }),
    );
    await screen.findAllByRole("option");
    return dialog;
  };

  it("lists colleagues but not yourself", async () => {
    await open();
    const options = screen
      .getAllByRole("option")
      .map((el) => el.textContent ?? "");
    expect(options.some((text) => text.includes("Ada Obi"))).toBe(true);
    expect(options.some((text) => text.includes("Me Myself"))).toBe(false);
  });

  it("shares by default and sends exactly what was chosen", async () => {
    api.giveRecognition.mockResolvedValue(kudos());
    const dialog = await open();

    await userEvent.click(screen.getByRole("option", { name: /Ada Obi/ }));
    await userEvent.type(
      within(dialog).getByLabelText(/What for/),
      "Great demo",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send kudos" }),
    );

    expect(api.giveRecognition).toHaveBeenCalledWith({
      toEmployeeId: "e-ada",
      message: "Great demo",
      shared: true,
    });
  });

  it("sends it as private when the share switch is off, and names who can read it", async () => {
    api.giveRecognition.mockResolvedValue(kudos({ shared: false }));
    const dialog = await open();

    await userEvent.click(screen.getByRole("option", { name: /Tunde Bello/ }));
    expect(
      within(dialog).getByText(
        "Off, and only you and Tunde Bello can read it.",
      ),
    ).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByLabelText(/What for/),
      "Quietly, thank you",
    );
    await userEvent.click(
      within(dialog).getByRole("switch", { name: "Share on the company feed" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send kudos" }),
    );

    expect(api.giveRecognition).toHaveBeenCalledWith({
      toEmployeeId: "e-tunde",
      message: "Quietly, thank you",
      shared: false,
    });
  });

  it("thanks a colleague who is past the first two hundred, found by typing her name", async () => {
    /* Four hundred and fifty people, and number 380 sorts after the page the
       picker used to read. She could not be thanked before. */
    directory.list.mockImplementation(
      fakeDirectory(
        company(450, {
          380: {
            id: "e-zainab",
            firstName: "Zainab",
            lastName: "Okafor",
            jobTitle: "Auditor",
          },
        }),
      ).list,
    );
    api.giveRecognition.mockResolvedValue(kudos());
    render(<RecognitionScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Give kudos/ }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByRole("combobox", { name: "Who" }),
      "Zainab Okafor",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Zainab Okafor/ }),
    );

    /* The list has since changed under her; she is still the one chosen. */
    expect(within(dialog).getByRole("combobox", { name: "Who" })).toHaveValue(
      "Zainab Okafor",
    );
    expect(
      within(dialog).getByText(
        "Off, and only you and Zainab Okafor can read it.",
      ),
    ).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/What for/), "Thanks");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send kudos" }),
    );

    expect(api.giveRecognition).toHaveBeenCalledWith({
      toEmployeeId: "e-zainab",
      message: "Thanks",
      shared: true,
    });
  });

  it("will not send without a person and some words", async () => {
    render(<RecognitionScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Give kudos/ }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Send kudos" }),
    ).toBeDisabled();
  });

  it("shows the API's sentence when the daily limit is reached", async () => {
    api.giveRecognition.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "You can recognise up to 10 people in a day. Try again tomorrow.",
        {
          reason: "daily_limit",
        },
      ),
    );
    const dialog = await open();
    await userEvent.click(screen.getByRole("option", { name: /Ada Obi/ }));
    await userEvent.type(within(dialog).getByLabelText(/What for/), "Thanks");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send kudos" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /up to 10 people in a day/,
    );
  });
});

/* ------------------------------------------------------------------ report */

const renderWithToasts = () =>
  render(
    <ToastProvider>
      <RecognitionScreen />
    </ToastProvider>,
  );

const DIDNT_SAY = "Thank you for covering the Friday release.";

const openReport = async () => {
  renderWithToasts();
  await userEvent.click(
    await screen.findByRole("button", { name: /Report the kudos from/ }),
  );
  return screen.findByRole("dialog");
};

describe("reporting a kudos", () => {
  it("is offered on a kudos somebody else gave, and not on one you gave", async () => {
    api.recognitions.mockResolvedValue(
      paged([
        kudos({ id: "k1", message: "From Ada." }),
        kudos({
          id: "k2",
          fromEmployeeId: "e-me",
          fromName: "Me Myself",
          message: "From me.",
          canDelete: true,
        }),
      ]),
    );
    render(<RecognitionScreen />);
    await screen.findByText("From Ada.");

    const reportButtons = screen.getAllByRole("button", {
      name: /Report the kudos/,
    });
    expect(reportButtons).toHaveLength(1);
    const mine = screen.getByText("From me.").closest("li") as HTMLElement;
    expect(
      within(mine).queryByRole("button", { name: /Report the kudos/ }),
    ).not.toBeInTheDocument();
    expect(
      within(mine).getByRole("button", { name: /Delete the kudos/ }),
    ).toBeInTheDocument();
  });

  it("says what it does before it does it, and sends nothing yet", async () => {
    const dialog = await openReport();

    expect(
      within(dialog).getByText(
        /This hides it from you and sends it to your company's administrators\./,
      ),
    ).toBeInTheDocument();
    /* What the administrators will see, in the same words as the policy. */
    expect(
      within(dialog).getByText(
        /what it says, who gave it, who it was for and that you reported it/,
      ),
    ).toBeInTheDocument();
    /* So the person can see which one they are reporting. */
    expect(within(dialog).getByText(DIDNT_SAY)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Why\? \(optional\)/)).toHaveAttribute(
      "maxlength",
      "500",
    );
    expect(api.reportRecognition).not.toHaveBeenCalled();
  });

  it("can be cancelled, and then nothing was sent and the kudos is still there", async () => {
    const dialog = await openReport();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    expect(api.reportRecognition).not.toHaveBeenCalled();
    expect(screen.getByText(DIDNT_SAY)).toBeInTheDocument();
  });

  it("sends the reason it was given, or none, and the kudos goes only once the API has answered", async () => {
    let answer!: () => void;
    api.reportRecognition.mockImplementation(
      () => new Promise<void>((resolve) => (answer = resolve)),
    );
    const dialog = await openReport();
    await userEvent.type(
      within(dialog).getByLabelText(/Why\? \(optional\)/),
      "Not kind",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Report" }),
    );

    expect(api.reportRecognition).toHaveBeenCalledWith("k1", "Not kind");
    /* Asked, not answered: nothing is claimed and nothing has gone. */
    expect(screen.queryByText("Reported")).not.toBeInTheDocument();
    expect(screen.getAllByText(DIDNT_SAY)).toHaveLength(2);

    answer();

    expect(await screen.findByText("Reported")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText(DIDNT_SAY)).not.toBeInTheDocument();
    /* Gone from the list, and the list was not asked again to find out. */
    expect(api.recognitions).toHaveBeenCalledTimes(1);
  });

  it("is fine with no reason", async () => {
    api.reportRecognition.mockResolvedValue(undefined);
    const dialog = await openReport();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Report" }),
    );

    await waitFor(() =>
      expect(api.reportRecognition).toHaveBeenCalledWith("k1", ""),
    );
    expect(await screen.findByText("Reported")).toBeInTheDocument();
  });

  it.each([
    ["the route is not there yet (404)", new ApiError(404, "not_found", "No.")],
    [
      "the server is down (502)",
      new ApiError(502, "http_error", "Something went wrong on our side."),
    ],
    [
      "there is no connection",
      new ApiError(0, "network_error", "The app cannot reach the server."),
    ],
  ])(
    "says so calmly when %s, keeps the kudos and claims nothing",
    async (_, error) => {
      api.reportRecognition.mockRejectedValue(error);
      const dialog = await openReport();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Report" }),
      );

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Reporting isn't available right now.",
      );
      expect(screen.queryByText("Reported")).not.toBeInTheDocument();
      expect(
        screen.queryByText(/has been sent|was sent/i),
      ).not.toBeInTheDocument();
      /* Still there to try again, and the kudos has not left the list. */
      expect(
        within(dialog).getByRole("button", { name: "Report" }),
      ).toBeEnabled();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Cancel" }),
      );
      expect(screen.getByText(DIDNT_SAY)).toBeInTheDocument();
    },
  );

  it("shows the API's own sentence when it refused for another reason", async () => {
    api.reportRecognition.mockRejectedValue(
      new ApiError(422, "unprocessable", "You have already reported this."),
    );
    const dialog = await openReport();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Report" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You have already reported this.",
    );
    expect(screen.queryByText("Reported")).not.toBeInTheDocument();
  });

  it("is offered on the lists of your own, and the kudos leaves the one it was reported from", async () => {
    api.myRecognitions.mockResolvedValue(
      paged([
        kudos({ id: "k7", message: "Sent to me.", toEmployeeId: "e-me" }),
      ]),
    );
    api.reportRecognition.mockResolvedValue(undefined);
    renderWithToasts();
    await screen.findByText(DIDNT_SAY);
    await userEvent.click(screen.getByRole("radio", { name: "Given to me" }));
    await userEvent.click(
      await screen.findByRole("button", { name: /Report the kudos from/ }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Report",
      }),
    );

    await waitFor(() =>
      expect(api.reportRecognition).toHaveBeenCalledWith("k7", ""),
    );
    await waitFor(() =>
      expect(screen.queryByText("Sent to me.")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText("Nobody has thanked you yet"),
    ).toBeInTheDocument();
  });
});

/* ----------------------------------------------------------------- reports */

const report = (over: Partial<ApiKudosReport> = {}): ApiKudosReport => ({
  id: "r1",
  createdAt: "2026-11-08T09:00:00.000Z",
  status: "OPEN",
  reason: null,
  recognition: {
    id: "k1",
    message: "A private message that was reported.",
    giver: { name: "Ada Obi" },
    recipient: { name: "Tunde Bello" },
    createdAt: "2026-11-07T09:00:00.000Z",
    removed: false,
  },
  reporter: { name: "Chidi Obi" },
  ...over,
});

const openReports = async () => {
  renderWithToasts();
  await userEvent.click(await screen.findByRole("radio", { name: /^Reports/ }));
};

describe("the Reports pill, for administrators", () => {
  it("is not there for somebody without the permission, who does not even ask", async () => {
    render(<RecognitionScreen />);
    await screen.findByText(DIDNT_SAY);

    expect(
      screen.queryByRole("radio", { name: /Reports/ }),
    ).not.toBeInTheDocument();
    expect(api.kudosReports).not.toHaveBeenCalled();
  });

  it("is there for somebody who holds it and whose list the API answered, with how many are open", async () => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    api.kudosReports.mockResolvedValue(paged([report(), report({ id: "r2" })]));
    render(<RecognitionScreen />);

    expect(
      await screen.findByRole("radio", { name: /^Reports/ }),
    ).toHaveTextContent("2");
    expect(api.kudosReports).toHaveBeenCalledWith(
      expect.objectContaining({ status: "OPEN" }),
      expect.anything(),
    );
  });

  it("is drawn with no count when nothing is open", async () => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    render(<RecognitionScreen />);

    expect(
      await screen.findByRole("radio", { name: "Reports" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["refuses it", new ApiError(403, "forbidden", "Not yours.")],
    ["has no such route", new ApiError(404, "not_found", "No.")],
  ])(
    "is absent, not disabled, when the API %s even though the permission is held",
    async (_, error) => {
      held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
      api.kudosReports.mockRejectedValue(error);
      render(<RecognitionScreen />);

      await screen.findByText(DIDNT_SAY);
      await waitFor(() => expect(api.kudosReports).toHaveBeenCalled());
      expect(
        screen.queryByRole("radio", { name: /Reports/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/did not load/)).not.toBeInTheDocument();
    },
  );

  it("is not drawn while the answer is still on its way", async () => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    api.kudosReports.mockImplementation(() => new Promise(() => {}));
    render(<RecognitionScreen />);

    await screen.findByText(DIDNT_SAY);
    expect(
      screen.queryByRole("radio", { name: /Reports/ }),
    ).not.toBeInTheDocument();
  });

  it("is drawn when the list failed for some other reason, so it can be tried again", async () => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    api.kudosReports.mockRejectedValue(new ApiError(500, "internal", "Broke."));
    render(<RecognitionScreen />);
    await userEvent.click(
      await screen.findByRole("radio", { name: /^Reports/ }),
    );

    expect(
      await screen.findByText("The reports did not load"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();
  });
});

describe("the open reports", () => {
  beforeEach(() => {
    held = new Set<PermissionKey>(["MANAGE_SETTINGS"]);
    api.kudosReports.mockResolvedValue(
      paged([
        report({ reason: "It was not meant kindly." }),
        report({ id: "r2", reporter: { name: "Bola Eze" } }),
      ]),
    );
  });

  it("shows the words, who gave it, who it was for, who reported it and what they wrote", async () => {
    await openReports();

    expect(await screen.findByText("Reported kudos")).toBeInTheDocument();
    const first = screen
      .getAllByText("A private message that was reported.")[0]
      ?.closest("li") as HTMLElement;
    expect(within(first).getByText("Ada Obi")).toBeInTheDocument();
    expect(within(first).getByText("Tunde Bello")).toBeInTheDocument();
    expect(within(first).getByText("Chidi Obi")).toBeInTheDocument();
    expect(
      within(first).getByText(/It was not meant kindly\./),
    ).toBeInTheDocument();
    expect(within(first).getByText(/8 Nov 2026/)).toBeInTheDocument();
    /* The feed's list is not drawn beside it. */
    expect(screen.queryByText(DIDNT_SAY)).not.toBeInTheDocument();
  });

  it("offers the two answers, and nothing happens until one is confirmed", async () => {
    await openReports();
    await screen.findByText("Reported kudos");

    expect(
      screen.getAllByRole("button", { name: /^Remove the kudos/ }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: /^Dismiss the report/ }),
    ).toHaveLength(2);
    expect(api.resolveKudosReport).not.toHaveBeenCalled();
  });

  it("removes after naming what that does, and the report leaves the list", async () => {
    api.resolveKudosReport.mockResolvedValue(undefined);
    await openReports();
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /^Remove the kudos/ }))[0]!,
    );

    const confirm = await screen.findByRole("dialog");
    expect(within(confirm).getByText("Remove this kudos?")).toBeInTheDocument();
    expect(
      within(confirm).getByText(
        /deleted for everybody, the two people it was between included, and this report is closed/,
      ),
    ).toBeInTheDocument();
    expect(api.resolveKudosReport).not.toHaveBeenCalled();

    await userEvent.click(
      within(confirm).getByRole("button", { name: "Remove kudos" }),
    );

    expect(api.resolveKudosReport).toHaveBeenCalledWith("r1", "REMOVE");
    expect(await screen.findByText("Kudos removed")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(1),
    );
    /* The count on the pill follows. */
    expect(screen.getByRole("radio", { name: /^Reports/ })).toHaveTextContent(
      "1",
    );
  });

  it("dismisses after naming what that does, and leaves the kudos alone", async () => {
    api.resolveKudosReport.mockResolvedValue(undefined);
    await openReports();
    await userEvent.click(
      (
        await screen.findAllByRole("button", { name: /^Dismiss the report/ })
      )[1]!,
    );

    const confirm = await screen.findByRole("dialog");
    expect(
      within(confirm).getByText("Dismiss this report?"),
    ).toBeInTheDocument();
    expect(
      within(confirm).getByText(
        "The kudos is left as it is and this report is closed. It stays hidden from the person who reported it.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Dismiss report" }),
    );

    expect(api.resolveKudosReport).toHaveBeenCalledWith("r2", "DISMISS");
    expect(await screen.findByText("Report dismissed")).toBeInTheDocument();
    expect(api.recognitions).toHaveBeenCalledTimes(1);
  });

  it("asks nothing when the confirm is cancelled", async () => {
    await openReports();
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /^Remove the kudos/ }))[0]!,
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(api.resolveKudosReport).not.toHaveBeenCalled();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps the report, and says the API's sentence, when it did not work", async () => {
    api.resolveKudosReport.mockRejectedValue(
      new ApiError(403, "forbidden", "You cannot change this."),
    );
    await openReports();
    await userEvent.click(
      (
        await screen.findAllByRole("button", { name: /^Dismiss the report/ })
      )[0]!,
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Dismiss report",
      }),
    );

    expect(await screen.findByText("That did not work")).toBeInTheDocument();
    expect(screen.getByText("You cannot change this.")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("says another administrator may have got there first on a 404, and asks the list again", async () => {
    api.resolveKudosReport.mockRejectedValue(
      new ApiError(404, "not_found", "No."),
    );
    await openReports();
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /^Remove the kudos/ }))[0]!,
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Remove kudos",
      }),
    );

    expect(
      await screen.findByText(/Somebody may have dealt with it already/),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.kudosReports).toHaveBeenCalledTimes(2));
  });

  it("shows the API's sentence and asks the list again when another administrator decided it differently (409)", async () => {
    api.resolveKudosReport.mockRejectedValue(
      new ApiError(409, "conflict", "This report was already decided."),
    );
    await openReports();
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /^Remove the kudos/ }))[0]!,
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Remove kudos",
      }),
    );

    expect(
      await screen.findByText("This report was already decided."),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.kudosReports).toHaveBeenCalledTimes(2));
  });

  it("says there are none, plainly, when nothing is open", async () => {
    api.kudosReports.mockResolvedValue(paged([]));
    await openReports();

    expect(await screen.findByText("No open reports")).toBeInTheDocument();
  });

  it("offers only to close a report on a kudos that is already removed", async () => {
    api.kudosReports.mockResolvedValue(
      paged([
        report({
          recognition: { ...report().recognition, removed: true },
        }),
      ]),
    );
    await openReports();

    expect(await screen.findByText("Already removed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Remove the kudos/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Close the report/ }),
    ).toBeInTheDocument();
  });

  it("leaves the reports behind when a list is chosen again", async () => {
    await openReports();
    await screen.findByText("Reported kudos");

    await userEvent.click(screen.getByRole("radio", { name: "Company feed" }));
    expect(await screen.findByText(DIDNT_SAY)).toBeInTheDocument();
    expect(screen.queryByText("Reported kudos")).not.toBeInTheDocument();
  });
});
