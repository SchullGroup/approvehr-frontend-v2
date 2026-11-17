import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiPin } from "@/lib/api/work-pins";

/**
 * Finished work pinned to an answer: read, and added and removed by the person.
 *
 * What is proved: a pin reads as the task's key (a link that opens it), the day it was finished, on
 * time or late, who set it when somebody else did, the person's own note and whose choice it was, and
 * never a title; nothing is drawn for no pins; a row that is itself a button gets no link; the person's
 * own list has an Unpin on each pin, which asks the server, waits, and shows the server's own sentence
 * when it refuses; "Add work" is there only where the review allows it, opens the picker, and says
 * the limit; it is off at five; the form is told when the picker opens and closes, and is not left
 * switched off when the page goes away with it open; where the person can neither add nor remove,
 * pins are read-only; a key is a link only where the server says the reader may open the task (a
 * server that says nothing makes no claim, so the key is plain text, and so is one that says "may
 * not"); and focus is never
 * left on something that has gone, because focus on the page is where the answering form's keys act:
 * after a pin is taken off, and after the picker closes, it is on "Add work", or on the label over the
 * list when that is off, or on the empty region that is left; after a refusal it is on the "Unpin" that
 * was pressed.
 */

vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/components/performance/pin-work-dialog", () => ({
  PinWorkDialog: ({
    open,
    prompt,
    onClose,
    onPin,
  }: {
    open: boolean;
    prompt: string;
    onClose: () => void;
    onPin: (issueId: string, note: string) => Promise<unknown>;
  }) =>
    open ? (
      <div role="dialog">
        PICKER for {prompt}
        <button type="button" onClick={() => void onPin("x9", "")}>
          Pin one
        </button>
        <button type="button" onClick={onClose}>
          Close picker
        </button>
      </div>
    ) : null,
}));

import { AnswerPins, type Pinning } from "@/components/performance/answer-pins";
import { PinsRead } from "@/components/performance/pins-read";

const pin = (over: Partial<ApiPin> = {}): ApiPin => ({
  id: "pin1",
  issueId: "i1",
  key: "PLT-12",
  type: "TASK",
  personal: false,
  projectId: "p1",
  doneAt: "2026-11-04T10:00:00.000Z",
  finishedOn: "2026-11-04",
  dueDate: "2026-11-05",
  timing: "ON_TIME",
  linked: true,
  setBy: { id: "pat", name: "Pat Projects" },
  note: "Led it end to end",
  pinnedAt: "2026-11-05T09:00:00.000Z",
  /* The real server always says; a test that wants it unsaid builds the pin with `unsaid`. */
  canOpen: true,
  ...over,
});

/** A pin as an older server would send it: with no word about whether the reader may open the task. */
const unsaid = (over: Partial<ApiPin> = {}): ApiPin => {
  const made: Partial<ApiPin> = pin(over);
  delete made.canOpen;
  return made as ApiPin;
};

describe("reading pins", () => {
  it("draws the key as a link to the task, the quiet facts, the note, and whose choice it was", () => {
    render(<PinsRead pins={[pin()]} pinnedBy="Chidi Nwosu" />);
    expect(screen.getByText("Work pinned to this answer")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "PLT-12" });
    expect(link).toHaveAttribute("href", "/projects/tasks/i1");
    expect(link).not.toHaveAttribute("target");
    expect(screen.getByText("Finished 4 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("On time")).toBeInTheDocument();
    expect(screen.getByText("Set by Pat Projects")).toBeInTheDocument();
    expect(screen.getByText("Under an objective")).toBeInTheDocument();
    expect(screen.getByText("Led it end to end")).toBeInTheDocument();
    expect(
      screen.getByText("Pinned by Chidi Nwosu on 5 Nov 2026"),
    ).toBeInTheDocument();
  });

  describe("whether the reader may open the task", () => {
    it("is a link where the server says they may", () => {
      render(<PinsRead pins={[pin({ canOpen: true })]} pinnedBy="you" />);
      expect(screen.getByRole("link", { name: "PLT-12" })).toHaveAttribute(
        "href",
        "/projects/tasks/i1",
      );
    });

    it("is plain text where the server says nothing: an absent answer makes no claim, so no link is offered", () => {
      render(<PinsRead pins={[unsaid()]} pinnedBy="Chidi Nwosu" />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("PLT-12")).toBeInTheDocument();
      /* Everything else about the pin is read as usual. */
      expect(screen.getByText("Finished 4 Nov 2026")).toBeInTheDocument();
      expect(screen.getByText("Led it end to end")).toBeInTheDocument();
    });

    it("is plain text, with everything else still read, where the server says they may not", () => {
      render(
        <PinsRead pins={[pin({ canOpen: false })]} pinnedBy="Chidi Nwosu" />,
      );
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("PLT-12")).toBeInTheDocument();
      expect(screen.getByText("Finished 4 Nov 2026")).toBeInTheDocument();
      expect(screen.getByText("Led it end to end")).toBeInTheDocument();
      expect(
        screen.getByText("Pinned by Chidi Nwosu on 5 Nov 2026"),
      ).toBeInTheDocument();
    });

    it("is decided per pin, so one the reader may not open does not take the others' links away", () => {
      render(
        <PinsRead
          pins={[
            pin({ canOpen: false }),
            pin({ id: "pin2", issueId: "i2", key: "PLT-13", canOpen: true }),
            pin({ id: "pin3", issueId: "i3", key: "PLT-14" }),
            unsaid({ id: "pin4", issueId: "i4", key: "PLT-15" }),
          ]}
        />,
      );
      expect(
        screen.queryByRole("link", { name: "PLT-12" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "PLT-13" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "PLT-14" })).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "PLT-15" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("PLT-15")).toBeInTheDocument();
    });

    it("is plain text on the person's own list too when the server says nothing, with no 'opens in a new tab' said of nothing", () => {
      render(<AnswerPins pinning={pinning({ pins: [unsaid()] })} />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("PLT-12")).toBeInTheDocument();
      expect(screen.queryByText(/opens in a new tab/)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Unpin PLT-12" }),
      ).toBeInTheDocument();
    });

    it("is plain text on the person's own list too, with no 'opens in a new tab' said of nothing", () => {
      render(
        <AnswerPins pinning={pinning({ pins: [pin({ canOpen: false })] })} />,
      );
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("PLT-12")).toBeInTheDocument();
      expect(screen.queryByText(/opens in a new tab/)).not.toBeInTheDocument();
      /* And it can still be taken off: it is the person's own pin whether they can open it or not. */
      expect(
        screen.getByRole("button", { name: "Unpin PLT-12" }),
      ).toBeInTheDocument();
    });
  });

  it("says it was the reader's own choice when the reader is the person", () => {
    render(<PinsRead pins={[pin()]} pinnedBy="you" />);
    expect(screen.getByText("Pinned by you on 5 Nov 2026")).toBeInTheDocument();
  });

  it("says only when, when it is not known whose choice it was", () => {
    render(<PinsRead pins={[pin()]} pinnedBy={null} />);
    expect(screen.getByText("Pinned on 5 Nov 2026")).toBeInTheDocument();
  });

  it("has no 'pinned by' line when the caller leaves it out", () => {
    render(<PinsRead pins={[pin()]} />);
    expect(screen.queryByText(/^Pinned/)).not.toBeInTheDocument();
  });

  it("counts them in the heading from two", () => {
    render(
      <PinsRead
        pins={[pin(), pin({ id: "pin2", issueId: "i2", key: "PLT-13" })]}
      />,
    );
    expect(
      screen.getByText("2 pieces of work pinned to this answer"),
    ).toBeInTheDocument();
  });

  it("draws nothing for none: an answer with no pins is the ordinary case", () => {
    const { container } = render(<PinsRead pins={[]} pinnedBy="you" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws no link, no button and no title where the row is itself a button", () => {
    render(
      <button type="button">
        <PinsRead pins={[pin()]} linkless />
      </button>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("PLT-12")).toBeInTheDocument();
  });

  it("never draws a title, even for a pin that arrived with one", () => {
    const withTitle = { ...pin(), title: "Chemo schedule for Ada" } as ApiPin;
    render(<PinsRead pins={[withTitle]} pinnedBy="you" />);
    expect(screen.queryByText(/Chemo/)).not.toBeInTheDocument();
  });

  it("says nothing about a due date that was never set, or a setter that is the person", () => {
    render(
      <PinsRead
        pins={[
          pin({
            timing: "NO_DUE_DATE",
            setBy: null,
            linked: false,
            note: null,
          }),
        ]}
      />,
    );
    expect(screen.queryByText("On time")).not.toBeInTheDocument();
    expect(screen.queryByText("Late")).not.toBeInTheDocument();
    expect(screen.queryByText(/Set by/)).not.toBeInTheDocument();
    expect(screen.queryByText("Under an objective")).not.toBeInTheDocument();
  });

  it("keeps the paragraphs of a note and does not let a long word run out of its row", () => {
    render(
      <PinsRead
        pins={[pin({ note: "Line one\n\nhttps://example.com/very/long" })]}
      />,
    );
    const note = screen.getByText(/Line one/);
    expect(note.className).toMatch(/whitespace-pre-line/);
    expect(note.className).toMatch(/break-words/);
  });
});

const onPin = vi.fn();
const onUnpin = vi.fn<(pinId: string) => Promise<void>>();

const pinning = (over: Partial<Pinning> = {}): Pinning => ({
  pins: [pin()],
  canAdd: true,
  canRemove: true,
  work: {
    subjectId: "e1",
    cycleId: "c1",
    periodStart: "2026-07-01",
    periodEnd: "2026-12-31",
  },
  prompt: "What did you achieve?",
  onPin,
  onUnpin,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  onUnpin.mockResolvedValue(undefined);
});

describe("the person's own list", () => {
  it("opens tasks in a new tab, so following one never leaves the form", () => {
    render(<AnswerPins pinning={pinning()} />);
    const link = screen.getByRole("link", { name: /PLT-12/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleName(/^PLT-12\s*\(opens in a new tab\)$/);
  });

  it("has an Unpin on each pin that asks the server", async () => {
    render(
      <AnswerPins
        pinning={pinning({
          pins: [pin(), pin({ id: "pin2", issueId: "i2", key: "PLT-13" })],
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Unpin PLT-13" }));
    expect(onUnpin).toHaveBeenCalledWith("pin2");
    expect(onUnpin).toHaveBeenCalledTimes(1);
  });

  it("shows the server's own sentence when it refuses, and keeps the pin", async () => {
    onUnpin.mockRejectedValue(
      new ApiError(409, "conflict", "You have already sent this review."),
    );
    render(<AnswerPins pinning={pinning()} />);
    await userEvent.click(screen.getByRole("button", { name: "Unpin PLT-12" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have already sent this review.",
    );
    expect(screen.getByRole("button", { name: "Unpin PLT-12" })).toBeEnabled();
  });

  it("waits for one unpin before another", async () => {
    let release: () => void = () => undefined;
    onUnpin.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    render(
      <AnswerPins
        pinning={pinning({
          pins: [pin(), pin({ id: "pin2", issueId: "i2", key: "PLT-13" })],
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Unpin PLT-12" }));
    expect(screen.getByRole("button", { name: "Unpin PLT-13" })).toBeDisabled();
    release();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Unpin PLT-13" }),
      ).toBeEnabled(),
    );
  });

  it("says nothing about whose choice it was: it is the person's own page", () => {
    render(<AnswerPins pinning={pinning()} />);
    expect(screen.queryByText(/^Pinned/)).not.toBeInTheDocument();
  });
});

describe("Add work", () => {
  it("is there where the review allows it, and says the limit and who reads it", () => {
    render(<AnswerPins pinning={pinning({ pins: [] })} />);
    expect(screen.getByRole("button", { name: "Add work" })).toBeEnabled();
    expect(screen.getByText(/Up to 5 on each answer\./)).toBeInTheDocument();
    expect(
      screen.getByText(
        /The people who read your review see it beside your answer/,
      ),
    ).toBeInTheDocument();
  });

  it("opens the picker for this question", async () => {
    render(<AnswerPins pinning={pinning({ pins: [] })} />);
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "PICKER for What did you achieve?",
    );
  });

  it("is off at five, with the count said", () => {
    const five = [1, 2, 3, 4, 5].map((n) =>
      pin({
        id: `p${String(n)}`,
        issueId: `x${String(n)}`,
        key: `PLT-${String(n)}`,
      }),
    );
    render(<AnswerPins pinning={pinning({ pins: five })} />);
    expect(screen.getByRole("button", { name: "Add work" })).toBeDisabled();
    expect(
      screen.getByText(/5 of 5 added\. Unpin one to add another\./),
    ).toBeInTheDocument();
  });

  it("is not there where the review does not allow it, though pins already written are read", () => {
    render(<AnswerPins pinning={pinning({ canAdd: false })} />);
    expect(
      screen.queryByRole("button", { name: "Add work" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PLT-12/ })).toBeInTheDocument();
    /* Unpinning is a separate permission: the setting being off does not trap a pin. */
    expect(
      screen.getByRole("button", { name: "Unpin PLT-12" }),
    ).toBeInTheDocument();
  });

  it("is read-only where the person can neither add nor remove", () => {
    render(
      <AnswerPins pinning={pinning({ canAdd: false, canRemove: false })} />,
    );
    expect(screen.getByRole("link", { name: /PLT-12/ })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("draws nothing at all when there is nothing to read and nothing to add", () => {
    const { container } = render(
      <AnswerPins pinning={pinning({ pins: [], canAdd: false })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("telling the form about the picker", () => {
  it("says it is open when it opens and closed when it closes", async () => {
    const changed = vi.fn();
    const view = render(
      <AnswerPins
        pinning={pinning({ pins: [] })}
        onDialogOpenChange={changed}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    expect(changed).toHaveBeenLastCalledWith(true);
    view.unmount();
  });

  it("is not left open when the page goes away with the picker up", async () => {
    const changed = vi.fn();
    const view = render(
      <AnswerPins
        pinning={pinning({ pins: [] })}
        onDialogOpenChange={changed}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add work" }));
    view.unmount();
    expect(changed).toHaveBeenLastCalledWith(false);
  });

  it("lays out the pins before the button, under one labelled region", () => {
    render(<AnswerPins pinning={pinning()} />);
    const region = screen.getByRole("region", {
      name: "Work added to this answer",
    });
    expect(
      within(region).getByText("Work you added to this answer"),
    ).toBeInTheDocument();
  });
});

describe("where focus goes", () => {
  const second = () => pin({ id: "pin2", issueId: "i2", key: "PLT-13" });

  /** The person's own list, with the pins held the way the form holds them: what was taken off is gone. */
  function Live({
    initial,
    canAdd = true,
    canRemove = true,
  }: {
    initial: ApiPin[];
    canAdd?: boolean;
    canRemove?: boolean;
  }) {
    const [pins, setPins] = useState(initial);
    return (
      <AnswerPins
        pinning={pinning({
          pins,
          canAdd,
          canRemove,
          onUnpin: async (id) => {
            await onUnpin(id);
            setPins((current) => current.filter((one) => one.id !== id));
          },
          onPin: async (issueId) => {
            const made = pin({ id: `n-${issueId}`, issueId, key: "NEW-1" });
            setPins((current) => [...current, made]);
            return made;
          },
        })}
      />
    );
  }
  const add = () => screen.getByRole("button", { name: "Add work" });

  it("is on Add work after a pin is taken off, not on the page, when one is left", async () => {
    render(<Live initial={[pin(), second()]} />);
    await userEvent.click(screen.getByRole("button", { name: "Unpin PLT-12" }));
    await waitFor(() => expect(add()).toHaveFocus());
    expect(
      screen.queryByRole("button", { name: "Unpin PLT-12" }),
    ).not.toBeInTheDocument();
  });

  it("is on Add work after the last pin is taken off, where something can be added", async () => {
    render(<Live initial={[pin()]} />);
    await userEvent.click(screen.getByRole("button", { name: "Unpin PLT-12" }));
    await waitFor(() => expect(add()).toHaveFocus());
  });

  it("is on the empty region that is left after the last pin is taken off, where nothing can be added", async () => {
    render(<Live initial={[pin()]} canAdd={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Unpin PLT-12" }));
    const region = await screen.findByRole("region", {
      name: "Work added to this answer",
    });
    await waitFor(() => expect(region).toHaveFocus());
    expect(region).toBeEmptyDOMElement();
    expect(document.body).not.toHaveFocus();
  });

  it("is on the label over the list when Add work is off, because the list is full and one was taken off then added", async () => {
    const four = [1, 2, 3, 4].map((n) =>
      pin({
        id: `p${String(n)}`,
        issueId: `x${String(n)}`,
        key: `PLT-${String(n)}`,
      }),
    );
    render(<Live initial={four} />);
    await userEvent.click(add());
    await userEvent.click(screen.getByRole("button", { name: "Pin one" }));
    /* Five now, so Add work is off; closing the picker has nowhere to give focus back to. */
    expect(add()).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Close picker" }));
    await waitFor(() =>
      expect(screen.getByText("Work you added to this answer")).toHaveFocus(),
    );
  });

  it("is on Add work when the picker is closed, where it was opened from", async () => {
    render(<Live initial={[pin()]} />);
    await userEvent.click(add());
    await userEvent.click(screen.getByRole("button", { name: "Close picker" }));
    await waitFor(() => expect(add()).toHaveFocus());
  });

  it("goes back to the Unpin that was pressed, with the pin still there and the server's sentence said, when it is refused", async () => {
    onUnpin.mockImplementation(async () => {
      /* A browser lets go of focus when the control is turned off under it, which is what a request
         being out does to it; jsdom does not, so say it. */
      (document.activeElement as HTMLElement | null)?.blur();
      throw new ApiError(409, "conflict", "You have already sent this review.");
    });
    render(<Live initial={[pin(), second()]} />);
    await userEvent.click(screen.getByRole("button", { name: "Unpin PLT-13" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have already sent this review.",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Unpin PLT-13" }),
      ).toHaveFocus(),
    );
    expect(
      screen.getByRole("button", { name: "Unpin PLT-12" }),
    ).toBeInTheDocument();
  });

  it("never leaves focus on the page when a pin is taken off, which is where the form's keys act", async () => {
    render(<Live initial={[pin(), second()]} />);
    await userEvent.click(screen.getByRole("button", { name: "Unpin PLT-13" }));
    await waitFor(() => expect(document.body).not.toHaveFocus());
    expect(document.activeElement?.tagName).toBe("BUTTON");
  });
});
