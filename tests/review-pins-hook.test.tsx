import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiPin } from "@/lib/api/work-pins";

/**
 * The finished work pinned to the answers of one review, and what a person can do to it.
 *
 * What is proved: adding needs the person's own unsent self-review, the company's setting on and a
 * period with dates (the picker lists the work done between them, so a period that states none has
 * nothing to choose from), and taking one off needs only the first, so a company that turns the setting
 * off does not trap what somebody pinned; nothing is offered offline, to a reader, to a manager's form,
 * or after the review was sent; what the server held is read through `pinsOf` and only what is a pin
 * gets through; a pin added or taken off is held as a diff over the server's list and not a copy of it,
 * so a review that is read again is not shadowed, and **the server's list wins whenever it is read
 * again**: a pin added here that the new list does not carry is gone, and a pin removed in another tab
 * leaves this screen; a delete the server answers with "not found" is a pin that is already gone; nothing
 * is added or removed until the server agrees; and a write the server could not read back adds nothing
 * and is not a failure.
 */

const session = vi.hoisted(() => ({ isConnected: true }));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: session.isConnected }),
}));

const api = vi.hoisted(() => ({ pin: vi.fn(), unpin: vi.fn() }));
vi.mock("@/lib/api/work-pins", async (original) => ({
  ...(await original<typeof import("@/lib/api/work-pins")>()),
  workPinsApi: api,
}));

import { useReviewPins } from "@/lib/store/work-pins";

const wire = (over: Partial<ApiPin> = {}): ApiPin => ({
  id: "pin1",
  issueId: "i1",
  key: "PLT-12",
  type: "TASK",
  personal: false,
  projectId: "p1",
  doneAt: "2026-11-04T10:00:00.000Z",
  finishedOn: "2026-11-04",
  dueDate: null,
  timing: "ON_TIME",
  linked: false,
  setBy: null,
  note: null,
  pinnedAt: "2026-11-05T09:00:00.000Z",
  ...over,
});

type Review = Parameters<typeof useReviewPins>[0];

const review = (over: Partial<Review> = {}): Review => ({
  id: "r1",
  kind: "SELF",
  submitted: false,
  mine: true,
  workPins: true,
  periodStart: "2026-07-01",
  periodEnd: "2026-12-31",
  questions: [{ id: "q1", pins: [wire()] }, { id: "q2" }],
  ...over,
});

const mount = (initial: Review) =>
  renderHook((props: { review: Review }) => useReviewPins(props.review), {
    initialProps: { review: initial },
  });

beforeEach(() => {
  vi.clearAllMocks();
  session.isConnected = true;
});

describe("who can do what", () => {
  it("lets the person add and remove on their own unsent self-review, with the setting on", () => {
    const { result } = mount(review());
    expect(result.current.canAdd).toBe(true);
    expect(result.current.canRemove).toBe(true);
  });

  it("does not let them add with the setting off, and still lets them take a pin off", () => {
    const { result } = mount(review({ workPins: false }));
    expect(result.current.canAdd).toBe(false);
    expect(result.current.canRemove).toBe(true);
  });

  it.each([
    ["no start date", { periodStart: null }],
    ["no end date", { periodEnd: null }],
    ["no dates at all", { periodStart: null, periodEnd: null }],
  ])(
    "does not offer to add when the period has %s, and still lets a pin be taken off",
    (_why, over) => {
      const { result } = mount(review(over));
      /* There is no stretch of work to read, so nothing to choose from: not an empty list offered. */
      expect(result.current.canAdd).toBe(false);
      expect(result.current.canRemove).toBe(true);
    },
  );

  it("treats a server that does not say as off, not on", () => {
    const { result } = mount(review({ workPins: undefined }));
    expect(result.current.canAdd).toBe(false);
  });

  it.each([
    ["a manager's form", { kind: "MANAGER" as const }],
    ["peer feedback", { kind: "PEER" as const }],
    ["a review that has been sent", { submitted: true }],
    ["somebody else's review", { mine: false }],
  ])("offers neither on %s", (_why, over) => {
    const { result } = mount(review(over));
    expect(result.current.canAdd).toBe(false);
    expect(result.current.canRemove).toBe(false);
  });

  it("offers neither with no server, where nothing could hold a pin", () => {
    session.isConnected = false;
    const { result } = mount(review());
    expect(result.current.canAdd).toBe(false);
    expect(result.current.canRemove).toBe(false);
  });
});

describe("what the server held", () => {
  it("is read per question, through the pin reader", () => {
    const { result } = mount(review());
    expect(result.current.pinsFor("q1").map((pin) => pin.key)).toEqual([
      "PLT-12",
    ]);
    expect(result.current.pinsFor("q2")).toEqual([]);
    expect(result.current.pinsFor("nowhere")).toEqual([]);
  });

  it("reads none on any form that is not a self-review, even if a server sent some", () => {
    for (const kind of ["MANAGER", "PEER"] as const) {
      const { result } = mount(review({ kind }));
      expect(result.current.pinsFor("q1")).toEqual([]);
    }
  });

  it("leaves out what is not a pin, and never carries a title", () => {
    const { result } = mount(
      review({
        questions: [
          {
            id: "q1",
            pins: [
              { ...wire(), title: "Chemo schedule" } as never,
              { nonsense: true } as never,
            ],
          },
        ],
      }),
    );
    const pins = result.current.pinsFor("q1");
    expect(pins).toHaveLength(1);
    expect(JSON.stringify(pins)).not.toContain("Chemo");
  });
});

describe("adding", () => {
  it("writes to the server, then shows the pin it returned", async () => {
    api.pin.mockResolvedValue(
      wire({ id: "pin2", issueId: "i2", key: "PLT-13" }),
    );
    const { result } = mount(review());
    let made: ApiPin | null = null;
    await act(async () => {
      made = await result.current.pin("q1", "i2", "  Led it  ");
    });
    expect(api.pin).toHaveBeenCalledWith("r1", "q1", {
      issueId: "i2",
      note: "  Led it  ",
    });
    expect((made as ApiPin | null)?.key).toBe("PLT-13");
    expect(result.current.pinsFor("q1").map((pin) => pin.key)).toEqual([
      "PLT-12",
      "PLT-13",
    ]);
  });

  it("sends no note for a blank one", async () => {
    api.pin.mockResolvedValue(wire({ id: "pin2" }));
    const { result } = mount(review());
    await act(async () => {
      await result.current.pin("q2", "i2", "   ");
    });
    expect(api.pin).toHaveBeenCalledWith("r1", "q2", { issueId: "i2" });
  });

  it("adds nothing, and throws, when the server refuses", async () => {
    api.pin.mockRejectedValue(new Error("Five pins is the most."));
    const { result } = mount(review());
    await act(async () => {
      await expect(result.current.pin("q1", "i2", "")).rejects.toThrow(
        "Five pins is the most.",
      );
    });
    expect(result.current.pinsFor("q1").map((pin) => pin.key)).toEqual([
      "PLT-12",
    ]);
  });

  it("adds nothing, and is not a failure, when the pin was written and could not be read back", async () => {
    api.pin.mockResolvedValue(null);
    const { result } = mount(review());
    let made: ApiPin | null | undefined;
    await act(async () => {
      made = await result.current.pin("q2", "i2", "");
    });
    expect(made).toBeNull();
    expect(result.current.pinsFor("q2")).toEqual([]);
  });
});

describe("taking one off", () => {
  it("removes it once the server agrees, whether the server held it or it was added here", async () => {
    api.pin.mockResolvedValue(
      wire({ id: "pin2", issueId: "i2", key: "PLT-13" }),
    );
    api.unpin.mockResolvedValue(undefined);
    const { result } = mount(review());
    await act(async () => {
      await result.current.pin("q1", "i2", "");
    });
    await act(async () => {
      await result.current.unpin("q1", "pin1");
    });
    expect(api.unpin).toHaveBeenCalledWith("r1", "pin1");
    expect(result.current.pinsFor("q1").map((pin) => pin.key)).toEqual([
      "PLT-13",
    ]);
    await act(async () => {
      await result.current.unpin("q1", "pin2");
    });
    expect(result.current.pinsFor("q1")).toEqual([]);
  });

  it("keeps it, and throws, when the server refuses", async () => {
    api.unpin.mockRejectedValue(
      new Error("You have already sent this review."),
    );
    const { result } = mount(review());
    await act(async () => {
      await expect(result.current.unpin("q1", "pin1")).rejects.toThrow(
        "already sent",
      );
    });
    expect(result.current.pinsFor("q1")).toHaveLength(1);
  });
});

describe("a review that is read again", () => {
  it("is not shadowed by a copy held here: the server's newer list wins, once each", async () => {
    api.pin.mockResolvedValue(
      wire({ id: "pin2", issueId: "i2", key: "PLT-13" }),
    );
    const { result, rerender } = mount(review());
    await act(async () => {
      await result.current.pin("q1", "i2", "");
    });
    /* The window was focused: the review is read again, and now carries the pin that was added, and
       one that was added from another tab. */
    rerender({
      review: review({
        questions: [
          {
            id: "q1",
            pins: [
              wire(),
              wire({ id: "pin2", issueId: "i2", key: "PLT-13" }),
              wire({ id: "pin3", issueId: "i3", key: "PLT-14" }),
            ],
          },
          { id: "q2" },
        ],
      }),
    });
    await waitFor(() =>
      expect(result.current.pinsFor("q1").map((pin) => pin.key)).toEqual([
        "PLT-12",
        "PLT-13",
        "PLT-14",
      ]),
    );
  });

  it("does not bring back a pin that was taken off here", async () => {
    api.unpin.mockResolvedValue(undefined);
    const { result, rerender } = mount(review());
    await act(async () => {
      await result.current.unpin("q1", "pin1");
    });
    rerender({ review: review() });
    expect(result.current.pinsFor("q1")).toEqual([]);
  });
});

describe("the server's list wins whenever the review is read again", () => {
  it("drops a pin added here that the new list does not carry, instead of keeping a ghost", async () => {
    api.pin.mockResolvedValue(
      wire({ id: "pin2", issueId: "i2", key: "PLT-13" }),
    );
    const { result, rerender } = mount(review());
    await act(async () => {
      await result.current.pin("q1", "i2", "");
    });
    expect(result.current.pinsFor("q1").map((pin) => pin.key)).toEqual([
      "PLT-12",
      "PLT-13",
    ]);
    /* Taken off from another tab: the review is read again and does not list it. */
    rerender({ review: review() });
    expect(result.current.pinsFor("q1").map((pin) => pin.key)).toEqual([
      "PLT-12",
    ]);
  });

  it("drops a pin the server no longer lists, when it was removed in another tab", () => {
    const { result, rerender } = mount(review());
    expect(result.current.pinsFor("q1")).toHaveLength(1);
    rerender({
      review: review({ questions: [{ id: "q1", pins: [] }, { id: "q2" }] }),
    });
    expect(result.current.pinsFor("q1")).toEqual([]);
  });

  it("shows a pin once, not twice, when the new list carries the one added here", async () => {
    api.pin.mockResolvedValue(
      wire({ id: "pin2", issueId: "i2", key: "PLT-13" }),
    );
    const { result, rerender } = mount(review());
    await act(async () => {
      await result.current.pin("q1", "i2", "");
    });
    rerender({
      review: review({
        questions: [
          {
            id: "q1",
            pins: [wire(), wire({ id: "pin2", issueId: "i2", key: "PLT-13" })],
          },
          { id: "q2" },
        ],
      }),
    });
    expect(result.current.pinsFor("q1").map((pin) => pin.key)).toEqual([
      "PLT-12",
      "PLT-13",
    ]);
  });

  it("keeps a pin hidden while a read still lists it, and forgets the removal once a read does not", async () => {
    api.unpin.mockResolvedValue(undefined);
    const { result, rerender } = mount(review());
    await act(async () => {
      await result.current.unpin("q1", "pin1");
    });
    /* A read that was in flight before the removal still lists it: it stays hidden. */
    rerender({ review: review() });
    expect(result.current.pinsFor("q1")).toEqual([]);
    /* A read after the removal does not list it: the removal is forgotten, having been applied... */
    rerender({
      review: review({ questions: [{ id: "q1", pins: [] }, { id: "q2" }] }),
    });
    expect(result.current.pinsFor("q1")).toEqual([]);
    /* ...so a pin the server lists again under that id (a restore) is shown, not hidden for ever. */
    rerender({ review: review() });
    expect(result.current.pinsFor("q1").map((pin) => pin.key)).toEqual([
      "PLT-12",
    ]);
  });
});

describe("a delete the server answers with not found", () => {
  it("is a pin that is already gone: it is removed here and nothing is thrown", async () => {
    api.unpin.mockRejectedValue(
      new ApiError(404, "not_found", "That pin was not found."),
    );
    const { result } = mount(review());
    await act(async () => {
      await result.current.unpin("q1", "pin1");
    });
    expect(result.current.pinsFor("q1")).toEqual([]);
  });

  it.each([
    [
      "a refusal",
      new ApiError(409, "conflict", "You have already sent this review."),
    ],
    ["a server fault", new ApiError(500, "internal", "Something went wrong.")],
    [
      "a forbidden",
      new ApiError(403, "forbidden", "That is not yours to change."),
    ],
    ["a dropped connection", new Error("Failed to fetch")],
  ])("still throws for %s, and keeps the pin", async (_why, failure) => {
    api.unpin.mockRejectedValue(failure);
    const { result } = mount(review());
    await act(async () => {
      await expect(result.current.unpin("q1", "pin1")).rejects.toBe(failure);
    });
    expect(result.current.pinsFor("q1")).toHaveLength(1);
  });
});
