import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Finished work pinned to an answer, over the wire.
 *
 * What is proved: a pin is read as the API said it and never as more (no title is read even when one
 * arrives, an unknown timing says nothing, a pin with no id or key is not a pin); a missing or malformed
 * list is no pins; a pin is written with the task's id and the person's trimmed note and a blank note
 * is left out; an answer that cannot be read is `null` and not a failure; taking a pin off is a
 * DELETE on the review's own pin; and `canOpen` (whether this reader may open the task) is kept only
 * when it is a boolean, so a server that says nothing leaves the field out: it makes no claim either
 * way, and the screens draw a link only for an explicit `true`.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ request }));

import {
  PIN_NOTE_MAX,
  PINS_PER_ANSWER,
  pinsOf,
  toPin,
  workPinsApi,
} from "@/lib/api/work-pins";

const wire = (over: Record<string, unknown> = {}) => ({
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
  note: "The migration",
  pinnedAt: "2026-11-05T09:00:00.000Z",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("the limits", () => {
  it("are the API's: five to an answer and a note of 280", () => {
    expect(PINS_PER_ANSWER).toBe(5);
    expect(PIN_NOTE_MAX).toBe(280);
  });
});

describe("reading a pin", () => {
  it("reads what the API sent, field by field", () => {
    expect(toPin(wire())).toEqual({
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
      note: "The migration",
      pinnedAt: "2026-11-05T09:00:00.000Z",
    });
  });

  it("never reads a title, a description or anything else that arrives with it", () => {
    const pin = toPin(
      wire({
        title: "Chemo schedule for Ada",
        description: "union meeting",
        comments: ["x"],
        labels: ["health"],
      }),
    ) as unknown as Record<string, unknown>;
    expect(Object.keys(pin).sort()).toEqual(
      [
        "dueDate",
        "doneAt",
        "finishedOn",
        "id",
        "issueId",
        "key",
        "linked",
        "note",
        "personal",
        "pinnedAt",
        "projectId",
        "setBy",
        "timing",
        "type",
      ].sort(),
    );
    expect(JSON.stringify(pin)).not.toContain("Chemo");
    expect(JSON.stringify(pin)).not.toContain("union");
  });

  it.each([
    ["no id", { id: "" }],
    ["no task id", { issueId: "" }],
    ["no key", { key: "" }],
    ["an id that is not a string", { id: 7 }],
  ])("is not a pin with %s", (_why, over) => {
    expect(toPin(wire(over))).toBeNull();
  });

  it("says nothing about a timing it does not know, and keeps the pin", () => {
    expect(toPin(wire({ timing: "SOONISH" }))?.timing).toBe("NO_DUE_DATE");
  });

  it("keeps a pin whose dates did not arrive: it is still the person's choice", () => {
    const pin = toPin(wire({ doneAt: undefined, finishedOn: undefined }));
    expect(pin).not.toBeNull();
    expect(pin?.doneAt).toBe("");
    expect(pin?.finishedOn).toBe("");
  });

  it("reads a blank note as no note, and trims the rest", () => {
    expect(toPin(wire({ note: "   " }))?.note).toBeNull();
    expect(toPin(wire({ note: null }))?.note).toBeNull();
    expect(toPin(wire({ note: "  Led it  " }))?.note).toBe("Led it");
  });

  it("names who set it only when the API named somebody", () => {
    expect(toPin(wire({ setBy: null }))?.setBy).toBeNull();
    expect(toPin(wire({ setBy: { id: "x" } }))?.setBy).toBeNull();
  });

  it("cuts a due date to its day", () => {
    expect(toPin(wire({ dueDate: "2026-11-05T00:00:00.000Z" }))?.dueDate).toBe(
      "2026-11-05",
    );
    expect(toPin(wire({ dueDate: null }))?.dueDate).toBeNull();
  });
});

describe("whether the reader may open the task", () => {
  it.each([true, false])("keeps what the API said: %s", (value) => {
    expect(toPin(wire({ canOpen: value }))?.canOpen).toBe(value);
  });

  it.each([undefined, null, "false", "true", 0, 1, {}])(
    "says nothing for %s, and leaves the key out: no claim that the task can be opened",
    (value) => {
      const pin = toPin(wire({ canOpen: value })) as unknown as Record<
        string,
        unknown
      >;
      expect(pin).not.toBeNull();
      expect("canOpen" in pin).toBe(false);
    },
  );

  it("is kept per pin in a list, and a pin the reader may not open is still a pin", () => {
    const pins = pinsOf([
      wire({ id: "a", canOpen: true }),
      wire({ id: "b", issueId: "i2", key: "PLT-13", canOpen: false }),
      wire({ id: "c", issueId: "i3", key: "PLT-14" }),
    ]);
    expect(pins.map((pin) => pin.canOpen)).toEqual([true, false, undefined]);
    expect(pins).toHaveLength(3);
  });
});

describe("a list of pins", () => {
  it("leaves out what is not a pin", () => {
    const pins = pinsOf([
      wire(),
      { nonsense: true },
      null,
      wire({ id: "pin2" }),
    ]);
    expect(pins.map((pin) => pin.id)).toEqual(["pin1", "pin2"]);
  });

  it.each([undefined, null, "pins", 3, {}])(
    "is no pins when the server sent %s, which is what a server that predates them sends",
    (raw) => {
      expect(pinsOf(raw)).toEqual([]);
    },
  );
});

describe("pinning", () => {
  it("posts the task and the trimmed note to the question's own route and returns the pin", async () => {
    request.mockResolvedValue({ pin: wire() });
    const pin = await workPinsApi.pin("r1", "q1", {
      issueId: "i1",
      note: "  The migration  ",
    });
    expect(request).toHaveBeenCalledWith(
      "/performance/reviews/r1/questions/q1/pins",
      { method: "POST", body: { issueId: "i1", note: "The migration" } },
    );
    expect(pin?.key).toBe("PLT-12");
  });

  it.each([undefined, "", "   "])(
    "leaves the note out when it is %j",
    async (note) => {
      request.mockResolvedValue({ pin: wire() });
      await workPinsApi.pin("r1", "q1", {
        issueId: "i1",
        ...(note !== undefined ? { note } : {}),
      });
      const call = request.mock.calls[0] as [string, { body: object }];
      expect(call[1].body).toEqual({ issueId: "i1" });
      expect(call[1].body).not.toHaveProperty("note");
    },
  );

  it("is null, not an error, when the pin was written and the answer cannot be read", async () => {
    request.mockResolvedValue({ unexpected: true });
    await expect(
      workPinsApi.pin("r1", "q1", { issueId: "i1" }),
    ).resolves.toBeNull();
    request.mockResolvedValue(null);
    await expect(
      workPinsApi.pin("r1", "q1", { issueId: "i1" }),
    ).resolves.toBeNull();
  });

  it("lets the server's refusal through untouched", async () => {
    const refusal = new Error("5 pins is the most one answer can carry.");
    request.mockRejectedValue(refusal);
    await expect(workPinsApi.pin("r1", "q1", { issueId: "i1" })).rejects.toBe(
      refusal,
    );
  });
});

describe("unpinning", () => {
  it("deletes the pin on its review and nothing else", async () => {
    request.mockResolvedValue({ removed: true });
    await workPinsApi.unpin("r1", "pin9");
    expect(request).toHaveBeenCalledWith("/performance/reviews/r1/pins/pin9", {
      method: "DELETE",
    });
  });
});
