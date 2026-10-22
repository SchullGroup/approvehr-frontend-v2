import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { kudos, paged } from "./wellness-fixtures";

/**
 * Recognition: thanks as sentences, public or private.
 *
 * The rules to hold are that a private kudos says so, that the person's own
 * lists read as "You thanked" and "thanked you", that a delete button appears
 * only where the API said the caller may delete, and that giving one sends the
 * private choice as it was made.
 */

const api = vi.hoisted(() => ({
  recognitions: vi.fn(),
  myRecognitions: vi.fn(),
  giveRecognition: vi.fn(),
  removeRecognition: vi.fn(),
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

vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    people: [
      {
        id: "e-me",
        fullName: "Me Myself",
        jobTitle: "Engineer",
        department: null,
      },
      {
        id: "e-ada",
        fullName: "Ada Obi",
        jobTitle: "Designer",
        department: null,
      },
      {
        id: "e-tunde",
        fullName: "Tunde Bello",
        jobTitle: "Analyst",
        department: null,
      },
    ],
    loading: false,
    error: null,
  }),
}));

import { RecognitionScreen } from "@/app/(app)/wellness/recognition-screen";

beforeEach(() => {
  vi.resetAllMocks();
  api.recognitions.mockResolvedValue(paged([kudos()]));
  api.myRecognitions.mockResolvedValue(paged([]));
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
  it("is behind the filter icon, asks for the right direction and says what is applied", async () => {
    render(<RecognitionScreen />);
    await screen.findByText("Thank you for covering the Friday release.");

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.selectOptions(screen.getByLabelText("Show"), "given");

    await waitFor(() =>
      expect(api.myRecognitions).toHaveBeenCalledWith(
        expect.objectContaining({ direction: "given" }),
        expect.anything(),
      ),
    );
    expect(screen.getByText("Show:")).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.selectOptions(screen.getByLabelText("Show"), "received");

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
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.selectOptions(screen.getByLabelText("Show"), "received");

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
