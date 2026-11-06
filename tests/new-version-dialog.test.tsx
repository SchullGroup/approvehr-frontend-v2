import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiCompetency, NewVersionResult } from "@/lib/api/performance";

/**
 * Starting a new version of a subsection, from the dialog.
 *
 * What is worth a test is what a person is told and what is sent: that nothing is
 * chosen for them, that the consequences are on the page before the button, that the
 * API's refusal stays in the dialog with the choice still made, that the sentences
 * it sends about what moved stay up until they have been read, and that the dialog
 * cannot be closed on a request that is still in flight. None of it is visible to
 * `tsc`; each is what somebody finds by pressing the button.
 */

let newCompetencyVersion: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
  useFrameworkActions: () => ({
    newCompetencyVersion: (...args: unknown[]) => newCompetencyVersion(...args),
  }),
}));

const { NewVersionDialog } =
  await import("@/app/(app)/performance/new-version-dialog");

const competency = (over: Partial<ApiCompetency> = {}): ApiCompetency => ({
  id: "c1",
  name: "Teamwork",
  sectionId: "s1",
  sectionName: "Core competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 12,
  answerKind: "BOOLEAN",
  ...over,
});

const started = (notes: string[] = []): NewVersionResult => ({
  competency: competency({
    id: "c2",
    ratingCount: 0,
    answerKind: "RATING",
  }),
  retired: { id: "c1", name: "Teamwork (retired)", ratingsKept: 12 },
  notes,
});

const show = (subject: ApiCompetency = competency()) => {
  const onClose = vi.fn();
  const onStarted = vi.fn();
  render(
    <ToastProvider>
      <NewVersionDialog
        competency={subject}
        onClose={onClose}
        onStarted={onStarted}
      />
    </ToastProvider>,
  );
  return { onClose, onStarted };
};

const kindSelect = () =>
  screen.getByLabelText(/How the new version is answered/) as HTMLSelectElement;
const confirm = () => screen.getByRole("button", { name: "Start new version" });

beforeEach(() => {
  newCompetencyVersion = vi.fn().mockResolvedValue(started());
});

describe("choosing how the new version is answered", () => {
  it("is titled with the subsection and offers the two other ways, after a prompt", () => {
    show();
    expect(
      screen.getByRole("dialog", { name: "Start a new version of Teamwork" }),
    ).toBeInTheDocument();
    expect(
      within(kindSelect())
        .getAllByRole("option")
        .map((one) => one.textContent),
    ).toEqual([
      "Choose how it is answered",
      "A level on a scale, 1 to 5",
      "Pick one from a list",
    ]);
  });

  it("offers a yes or no and a pick-one for a subsection that is a level", () => {
    show(competency({ answerKind: "RATING" }));
    expect(
      within(kindSelect())
        .getAllByRole("option")
        .slice(1)
        .map((one) => one.textContent),
    ).toEqual(["Yes or no", "Pick one from a list"]);
  });

  it("reads a subsection that does not say as a level, which is what an older server means", () => {
    show(competency({ answerKind: undefined }));
    expect(
      within(kindSelect())
        .getAllByRole("option")
        .slice(1)
        .map((one) => one.textContent),
    ).toEqual(["Yes or no", "Pick one from a list"]);
  });

  it("chooses nothing for anybody, and will not go ahead until a way is chosen", async () => {
    show();
    expect(kindSelect().value).toBe("");
    expect(confirm()).toBeDisabled();

    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");
    expect(confirm()).toBeEnabled();
    expect(newCompetencyVersion).not.toHaveBeenCalled();
  });

  it("says what happens on the page, before the button is pressed", () => {
    show();
    expect(screen.getByText(/Teamwork keeps its 12 ratings/)).toBeVisible();
    expect(screen.getByText(/starts with no ratings/)).toBeVisible();
    expect(
      screen.getByText(/Published periods keep the old one/),
    ).toBeVisible();
  });

  it("changes what it says about draft periods to match what will really happen", async () => {
    show();
    expect(
      screen.getByText(/Periods that have not started move over/),
    ).toBeInTheDocument();

    await userEvent.selectOptions(kindSelect(), "Pick one from a list");
    expect(
      screen.getByText(/stop asking it until you add its choices/),
    ).toBeInTheDocument();

    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");
    expect(
      screen.getByText(/ask the new version in its place/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/stop asking it until you add its choices/),
    ).not.toBeInTheDocument();
  });
});

describe("starting it", () => {
  it("sends the subsection and the way chosen, once", async () => {
    show();
    await userEvent.selectOptions(kindSelect(), "Pick one from a list");
    await userEvent.click(confirm());

    await waitFor(() => expect(newCompetencyVersion).toHaveBeenCalledTimes(1));
    expect(newCompetencyVersion).toHaveBeenCalledWith("c1", "CHOICE");
  });

  it("tells the owner of the list what came back, and which way it was answered", async () => {
    const result = started();
    newCompetencyVersion.mockResolvedValue(result);
    const { onStarted } = show();
    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");
    await userEvent.click(confirm());

    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(onStarted).toHaveBeenCalledWith(result, "RATING");
  });

  it("closes on a short toast when the API has nothing to add", async () => {
    const { onClose } = show();
    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");
    await userEvent.click(confirm());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Started a new version of Teamwork"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Teamwork (retired) keeps its 12 ratings."),
    ).toBeInTheDocument();
  });

  it("stays up with the API's own sentences when it has some, until Done", async () => {
    const notes = [
      '"H2 2026 Appraisal" asks the new one.',
      'A job role\'s target is a level, so "Engineer" no longer expects it.',
    ];
    newCompetencyVersion.mockResolvedValue(started(notes));
    const { onClose, onStarted } = show();
    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");
    await userEvent.click(confirm());

    expect(
      await screen.findByRole("dialog", {
        name: "Started a new version of Teamwork",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Teamwork is now answered as a level on a scale. Teamwork (retired) keeps its 12 ratings and every mark made from them.",
      ),
    ).toBeInTheDocument();
    for (const note of notes) {
      expect(screen.getByText(note)).toBeInTheDocument();
    }
    /* The list was told the moment the API said yes, and the dialog is still up. */
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledTimes(1);
  });
});

describe("when it is refused", () => {
  const refusal =
    '"Teamwork" is asked on the review form of "H2 2026 Appraisal", which is running. Retiring it now would take that question off the forms people are filling in. Start the new version once that period is published.';

  beforeEach(() => {
    newCompetencyVersion.mockRejectedValue(
      new ApiError(409, "conflict", refusal),
    );
  });

  it("shows the API's sentence as it comes, and keeps the dialog open", async () => {
    const { onClose, onStarted } = show();
    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");
    await userEvent.click(confirm());

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("keeps the way that was chosen, so it can be tried again without choosing twice", async () => {
    show();
    await userEvent.selectOptions(kindSelect(), "Pick one from a list");
    await userEvent.click(confirm());
    await screen.findByText(refusal);

    expect(kindSelect().value).toBe("CHOICE");
    expect(confirm()).toBeEnabled();
  });

  it("takes the refusal away when another way is chosen, because it was about the last", async () => {
    show();
    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");
    await userEvent.click(confirm());
    await screen.findByText(refusal);

    await userEvent.selectOptions(kindSelect(), "Pick one from a list");
    expect(screen.queryByText(refusal)).not.toBeInTheDocument();
  });

  it("says something honest when there is no sentence from the API to show", async () => {
    newCompetencyVersion.mockRejectedValue(new Error("boom"));
    show();
    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");
    await userEvent.click(confirm());

    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeInTheDocument();
  });

  it("says the subsection is gone, by name, when the API cannot find it, and never that the version is", async () => {
    newCompetencyVersion.mockRejectedValue(
      new ApiError(404, "not_found", "That competency could not be found."),
    );
    const { onClose } = show();
    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");
    await userEvent.click(confirm());

    /* A 404 has no sentence of its own to show, and what it says is missing is the
       subsection. "The new version is not there any more" would be about
       something that was never made. */
    expect(
      await screen.findByText(
        "Teamwork is not there any more, so nothing was changed.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/The new version is not there/),
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("while the request is in flight", () => {
  it("cannot be closed, so what comes back is never lost behind a dialog that has gone", async () => {
    let release!: (value: unknown) => void;
    newCompetencyVersion.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { onClose } = show();
    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");
    await userEvent.click(confirm());

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    release(started());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("will not send a second request on a second press", async () => {
    let release!: (value: unknown) => void;
    newCompetencyVersion.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    show();
    await userEvent.selectOptions(kindSelect(), "A level on a scale, 1 to 5");
    const button = confirm();
    await userEvent.click(button);
    await userEvent.click(button);

    expect(newCompetencyVersion).toHaveBeenCalledTimes(1);
    release(started());
  });
});

describe("cancelling", () => {
  it("closes without sending anything", async () => {
    const { onClose } = show();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(newCompetencyVersion).not.toHaveBeenCalled();
  });
});
