import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ApiAnnouncement } from "@/lib/api/announcements";
import { AnnouncementForm } from "@/app/(app)/settings/announcements/announcement-form";
import type { Draft } from "@/app/(app)/settings/announcements/announcement-form";

/**
 * The notice form is a new form every time it is opened.
 *
 * It stays mounted on the screen so the dialog can animate out, `Modal` unmounts
 * its children on close, and the fields were held above it. So after a notice
 * with a picture was saved, "Write a notice" opened with the last title and text
 * still in it and the last picture still attached, while the file field read
 * "Choose a file". The next notice then went out with a picture nobody could see.
 */

const draftNotice = (over: Partial<ApiAnnouncement> = {}): ApiAnnouncement => ({
  id: "n1",
  title: "Payday moves",
  body: "It is the 27th this month.",
  audience: "EVERYONE",
  departmentIds: [],
  departmentNames: [],
  pinned: false,
  mandatory: false,
  published: false,
  publishedAt: null,
  expiresOn: null,
  expired: false,
  postedByName: "Ada Obi",
  createdAt: "2026-10-19T09:00:00.000Z",
  updatedAt: "2026-10-19T09:00:00.000Z",
  ...over,
});

function Harness({
  notice,
  onSave,
}: {
  notice?: ApiAnnouncement;
  onSave: (draft: Draft, publish: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open the form
      </button>
      <AnnouncementForm
        open={open}
        {...(notice ? { notice } : {})}
        departments={[]}
        onClose={() => setOpen(false)}
        onSave={async (draft, publish) => {
          onSave(draft, publish);
          setOpen(false);
        }}
      />
    </>
  );
}

const picture = () =>
  new File([new Uint8Array([137, 80, 78, 71])], "closure.png", {
    type: "image/png",
  });

const fileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;

const gone = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

describe("writing a second notice after the first", () => {
  it("opens blank, with no picture left over from the last one", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    await user.type(screen.getByLabelText(/Title/), "Office closed Friday");
    await user.type(screen.getByLabelText(/The notice/), "Back on Monday.");
    await user.upload(fileInput(), picture());
    expect(await screen.findByText("closure.png")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save as a draft" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      title: "Office closed Friday",
      image: { filename: "closure.png", contentType: "image/png" },
    });
    await gone();

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    expect(screen.getByLabelText(/Title/)).toHaveValue("");
    expect(screen.getByLabelText(/The notice/)).toHaveValue("");
    /* What the file field says is what the form holds. */
    expect(
      screen.getByRole("button", { name: "Choose a file" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Title/), "A different notice");
    await user.type(screen.getByLabelText(/The notice/), "No picture.");
    await user.click(screen.getByRole("button", { name: "Save as a draft" }));

    expect(onSave).toHaveBeenCalledTimes(2);
    const second = onSave.mock.calls[1]?.[0] as Draft;
    expect(second.title).toBe("A different notice");
    expect(second.image).toBeUndefined();
  });

  it("does not bring back what was typed and cancelled", async () => {
    const user = userEvent.setup();
    render(<Harness onSave={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    await user.type(screen.getByLabelText(/Title/), "Half a thought");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await gone();

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    expect(screen.getByLabelText(/Title/)).toHaveValue("");
  });
});

describe("editing a notice", () => {
  it("opens on the notice's own wording, not on what was typed and cancelled", async () => {
    const user = userEvent.setup();
    render(<Harness notice={draftNotice()} onSave={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    expect(screen.getByLabelText(/Title/)).toHaveValue("Payday moves");
    await user.type(screen.getByLabelText(/Title/), " (changed my mind)");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await gone();

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    expect(screen.getByLabelText(/Title/)).toHaveValue("Payday moves");
  });

  it("does not lose what is being typed when the board refreshes under it", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Harness notice={draftNotice()} onSave={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    await user.type(screen.getByLabelText(/Title/), " again");

    /* The same notice, as a new object: what a refetch on window focus hands over. */
    rerender(<Harness notice={draftNotice()} onSave={vi.fn()} />);
    expect(screen.getByLabelText(/Title/)).toHaveValue("Payday moves again");
  });

  it("does not change what is on screen while the dialog is closing", async () => {
    const user = userEvent.setup();
    render(<Harness notice={draftNotice()} onSave={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Open the form" }));
    await user.type(screen.getByLabelText(/Title/), " (edited)");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    /* Closed, and still animating out: it is the same form, not a blank one. */
    expect(screen.getByLabelText(/Title/)).toHaveValue("Payday moves (edited)");
    await gone();
  });
});
