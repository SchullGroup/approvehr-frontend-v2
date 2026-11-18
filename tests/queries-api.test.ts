import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import * as queries from "@/lib/api/queries";
import {
  EVENT_LABEL,
  OUTCOME_HELP,
  OUTCOME_LABEL,
  ONCE_SENT,
  QUERY_CHANGES_NOTHING,
  RECEIPT_IS_NOT_AGREEMENT,
  REGISTER_STATE_LABEL,
  SERVED_HOW_HELP,
  STATUS_LABEL,
  isModuleOff,
  missingFor,
  replyBadgeText,
  timeLeft,
  toDetail,
  toSettings,
  toSummary,
} from "@/lib/api/queries";

/**
 * The wire layer and the words.
 *
 * What is proved: a field the server does not send draws or offers nothing (absent is not zero:
 * no `can` offers no button, no `reply` is no reply and not an empty one, a list that is not a
 * list is empty); the only worked-out state is a label about a clock and none of the words in the
 * module accuse anybody of refusing, ignoring or failing; and the two sentences a reader needs
 * before a press (a sent reply cannot be changed, a query changes no pay) are written once.
 */

describe("a detail from a server that sends very little", () => {
  it("offers no button when `can` is missing", () => {
    const read = toDetail({ id: "q", status: "ISSUED", subject: {} });
    expect(Object.values(read.can).every((value) => value === false)).toBe(
      true,
    );
  });

  it("offers no button when `can` is not an object", () => {
    const read = toDetail({ id: "q", can: "yes" });
    expect(read.can.decide).toBe(false);
    expect(read.can.reply).toBe(false);
  });

  it("reads a missing reply as no reply, never as an empty one", () => {
    expect(toDetail({ id: "q" }).reply).toBeNull();
    expect(toDetail({ id: "q", reply: null }).reply).toBeNull();
    expect(toDetail({ id: "q", reply: "words" }).reply).toBeNull();
  });

  it("reads a missing outcome as none", () => {
    expect(toDetail({ id: "q" }).outcome).toBeNull();
    expect(toDetail({ id: "q", outcome: {} }).outcome).toBeNull();
  });

  it("reads lists that are not lists as empty, and drops rows it cannot read", () => {
    const read = toDetail({
      id: "q",
      files: "nope",
      events: [
        { kind: "ISSUED" },
        null,
        { kind: "OPENED", at: "2026-11-18T09:00:00.000Z" },
      ],
      extensions: [{ previousReplyBy: "a" }],
      warnings: [{ code: "x" }],
    });
    expect(read.files).toEqual([]);
    expect(read.events).toHaveLength(1);
    expect(read.extensions).toEqual([]);
    expect(read.warnings).toEqual([]);
  });

  it("keeps the staff-only fields null for the person", () => {
    const read = toDetail({ id: "q", served: { how: "IN_PRODUCT" } });
    expect(read.issuedById).toBeNull();
    expect(read.served.subjectHasSignInNow).toBeNull();
  });

  it("does not turn an unknown served-how into one", () => {
    expect(
      toDetail({ id: "q", served: { how: "CARRIER_PIGEON" } }).served.how,
    ).toBeNull();
  });

  it("reads the real shapes it is given", () => {
    const read = toDetail({
      id: "q",
      reference: "Q-2026-001",
      status: "REPLIED",
      reply: {
        body: "Here.",
        source: "FROM_PAPER",
        sent: true,
        sentAt: "2026-11-19T08:00:00.000Z",
        receivedOn: "2026-11-19",
        enteredByName: "Fatima Bello",
        replyHash: "h",
      },
      outcome: {
        outcome: "NO_FURTHER_ACTION",
        reasons: "Explained.",
        decidedByName: "Tunde",
        decidedAt: "2026-11-20T08:00:00.000Z",
      },
      can: { decide: true },
    });
    expect(read.reply?.source).toBe("FROM_PAPER");
    expect(read.reply?.sent).toBe(true);
    expect(read.outcome?.outcome).toBe("NO_FURTHER_ACTION");
    expect(read.can.decide).toBe(true);
    expect(read.can.issue).toBe(false);
  });
});

describe("a register row", () => {
  it("is null for something that is not one", () => {
    expect(toSummary(null)).toBeNull();
    expect(toSummary({ subjectLine: "x" })).toBeNull();
  });

  it("keeps the server's own sentence for where the reply stands", () => {
    const row = toSummary({
      id: "q",
      replyState: "no_reply_by_deadline",
      replyStateLabel: "No reply by 14 Nov 2026, 5:00 pm.",
    });
    expect(row?.replyStateLabel).toBe("No reply by 14 Nov 2026, 5:00 pm.");
  });
});

describe("settings", () => {
  it("reads three real fields and nothing else", () => {
    expect(
      toSettings({
        replyHours: 48,
        warnHours: 24,
        issuerMayDecideIfSole: true,
        retention: "archive_only",
      }),
    ).toEqual({
      replyHours: 48,
      warnHours: 24,
      issuerMayDecideIfSole: true,
      retention: "archive_only",
    });
  });

  it("is null when any of the three is missing, so no form is drawn over a guess", () => {
    expect(toSettings({ replyHours: 48, warnHours: 24 })).toBeNull();
    expect(toSettings("48")).toBeNull();
  });
});

describe("silence is not a finding", () => {
  it("labels the one worked-out state in neutral words", () => {
    expect(replyBadgeText("no_reply_by_deadline")).toBe("No reply in time");
    expect(REGISTER_STATE_LABEL.no_reply_by_deadline).toBe("No reply in time");
  });

  it("has nothing to say about a state it does not know", () => {
    expect(replyBadgeText(null)).toBeNull();
    expect(replyBadgeText("not_served")).toBeNull();
  });

  it("uses no accusing word anywhere in what this module says", () => {
    const everything = JSON.stringify([
      STATUS_LABEL,
      OUTCOME_LABEL,
      OUTCOME_HELP,
      REGISTER_STATE_LABEL,
      SERVED_HOW_HELP,
      EVENT_LABEL,
      ONCE_SENT,
      RECEIPT_IS_NOT_AGREEMENT,
      QUERY_CHANGES_NOTHING,
      replyBadgeText("no_reply_by_deadline"),
      replyBadgeText("replied_late"),
      replyBadgeText("closed_without_reply"),
    ]).toLowerCase();
    for (const word of [
      "refus",
      "ignor",
      "fail",
      "guilt",
      "overdue",
      "defaulter",
    ]) {
      expect(everything).not.toContain(word);
    }
  });
});

describe("the two sentences a reader needs before a press", () => {
  it("says a sent reply cannot be changed", () => {
    expect(ONCE_SENT).toBe(
      "Once sent, a reply cannot be changed. Read it through first.",
    );
  });

  it("says receipt is not agreement and that nothing waits on it", () => {
    expect(RECEIPT_IS_NOT_AGREEMENT).toMatch(/not agreeing/);
    expect(RECEIPT_IS_NOT_AGREEMENT).toMatch(/nothing waits on it/);
  });

  it("says a query changes no pay, status or exit", () => {
    expect(QUERY_CHANGES_NOTHING).toMatch(
      /no pay, no employment status and no exit/,
    );
  });

  it("says recording a warning or a hearing does nothing more", () => {
    expect(OUTCOME_HELP.WARNING).toMatch(/no warning is issued from here/);
    expect(OUTCOME_HELP.HEARING).toMatch(/no hearing is arranged from here/);
  });
});

describe("time left", () => {
  const now = new Date("2026-11-18T09:00:00.000Z");
  it("counts days and hours", () => {
    expect(timeLeft("2026-11-20T13:00:00.000Z", now)).toBe(
      "2 days 4 hours left",
    );
  });
  it("says hours alone under a day", () => {
    expect(timeLeft("2026-11-18T12:00:00.000Z", now)).toBe("3 hours left");
  });
  it("says minutes under an hour, and singular when it is one", () => {
    expect(timeLeft("2026-11-18T09:01:00.000Z", now)).toBe("1 minute left");
  });
  it("states that the time has passed, as a fact about a clock", () => {
    expect(timeLeft("2026-11-18T08:00:00.000Z", now)).toBe(
      "The reply-by time has passed",
    );
  });
  it("says nothing for a missing or unreadable time", () => {
    expect(timeLeft(null, now)).toBeNull();
    expect(timeLeft("soon", now)).toBeNull();
  });
});

describe("refusals", () => {
  it("lists what the server says a letter still needs", () => {
    const error = new ApiError(
      422,
      "unprocessable",
      "This letter cannot be sent yet.",
      {
        reason: "letter_incomplete",
        missing: ["what happened", 4, "the date it happened"],
      },
    );
    expect(missingFor(error)).toEqual([
      "what happened",
      "the date it happened",
    ]);
    expect(missingFor(new Error("x"))).toEqual([]);
  });

  it("knows a module-off refusal by its stable reason", () => {
    expect(
      isModuleOff(
        new ApiError(422, "unprocessable", "off", { reason: "module_off" }),
      ),
    ).toBe(true);
    expect(
      isModuleOff(new ApiError(422, "unprocessable", "x", { reason: "other" })),
    ).toBe(false);
    expect(isModuleOff(null)).toBe(false);
  });
});

describe("the calls", () => {
  const request = vi.fn();
  const requestPaged = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    request.mockReset();
    requestPaged.mockReset();
  });

  async function load() {
    vi.doMock("@/lib/api/client", async (original) => ({
      ...(await original<typeof import("@/lib/api/client")>()),
      request,
      requestPaged,
    }));
    return (await import("@/lib/api/queries")).queriesApi;
  }

  it("asks the register for a state and a person and reads nothing it was not sent", async () => {
    const api = await load();
    requestPaged.mockResolvedValue({
      data: [{ id: "q" }, 5],
      meta: { total: 1, page: 1, pageSize: 50, totalPages: 1, hasMore: false },
    });
    const page = await api.register({ state: "replied", subjectId: "e-1" });
    expect(requestPaged).toHaveBeenCalledWith(
      "/queries",
      expect.objectContaining({
        query: expect.objectContaining({ state: "replied", subjectId: "e-1" }),
      }),
    );
    expect(page.rows).toHaveLength(1);
    expect(page.waiting).toBeNull();
  });

  it("reads the waiting count only when the server sent one", async () => {
    const api = await load();
    requestPaged.mockResolvedValue({
      data: [],
      meta: {
        total: 0,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        hasMore: false,
        waiting: 2,
      },
    });
    expect((await api.mine()).waiting).toBe(2);
  });

  it("sends a reply as its own words and nothing else", async () => {
    const api = await load();
    request.mockResolvedValue({ id: "q" });
    await api.saveReply("q-1", "Here is what happened.");
    expect(request).toHaveBeenCalledWith("/queries/q-1/reply", {
      method: "PUT",
      body: { body: "Here is what happened." },
    });
  });

  it("has no call that edits a reply once sent", () => {
    expect(
      Object.keys(queries.queriesApi).filter((name) =>
        /edit|change|amend/i.test(name),
      ),
    ).toEqual([]);
  });

  it("reads the issue answer without trusting the flags it did not get", async () => {
    const api = await load();
    request.mockResolvedValue({
      detail: { id: "q" },
      warnings: [{ code: "short_reply_time", message: "This gives 6 hours." }],
    });
    const result = await api.issue("q-1");
    expect(result.nobodyToldInProduct).toBeNull();
    expect(result.toldInProduct).toBeNull();
    expect(result.warnings[0]?.message).toBe("This gives 6 hours.");
  });
});
