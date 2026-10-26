import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rules the text message screens carry, pinned where they are decided.
 *
 * The API owns each of them (`modules/sms/consent.ts`); what is checked here is
 * that the web side words them the same way and wires the requests the way the
 * API reads them. The one that matters most is the one a screen could most easily
 * get wrong: HR cannot undo a person's own opt-out.
 */

const request = vi.fn();
const requestPaged = vi.fn();
vi.mock("@/lib/api/client", () => ({
  request: (...args: unknown[]) => request(...args),
  requestPaged: (...args: unknown[]) => requestPaged(...args),
}));

const sms = await import("@/lib/api/sms");
type Subscription = import("@/lib/api/sms").ApiSmsSubscription;
type Status = import("@/lib/api/sms").ApiSmsStatus;

beforeEach(() => {
  request.mockReset();
  requestPaged.mockReset();
});

const row = (over: Partial<Subscription> = {}): Subscription => ({
  employeeId: "e1",
  employeeNo: "AHR-0001",
  name: "Ada Obi",
  phoneMasked: "+234******4567",
  state: "OPTED_IN",
  optedInAt: "2026-10-12T09:00:00.000Z",
  optInChannel: "APP",
  optInActor: "EMPLOYEE",
  optedOutAt: null,
  optOutChannel: null,
  optOutActor: null,
  lastMessage: null,
  ...over,
});

const status = (over: Partial<Status> = {}): Status => ({
  enabled: true,
  transport: { name: "termii", sends: true, supportsReply: false },
  optOutPath: "link",
  ready: true,
  subscribers: { optedIn: 3, optedOut: 1 },
  thisWeek: { weekKey: "2026-W43", byStatus: {}, segments: 0 },
  notes: [],
  ...over,
});

describe("HR cannot undo a person's own opt-out", () => {
  it("lets HR record consent again after an opt-out HR recorded", () => {
    expect(
      sms.hrMayRecordConsent(row({ state: "OPTED_OUT", optOutActor: "HR" })),
    ).toEqual({ allowed: true });
  });

  it.each([
    ["in the app", "APP", "EMPLOYEE"],
    ["by a STOP reply", "SMS", "SYSTEM"],
    ["by the stop link", "LINK", "SYSTEM"],
  ] as const)(
    "refuses when the employee opted out %s, and says only they can opt back in",
    (_, channel, actor) => {
      const verdict = sms.hrMayRecordConsent(
        row({
          state: "OPTED_OUT",
          optOutChannel: channel,
          optOutActor: actor,
        }),
      );
      expect(verdict.allowed).toBe(false);
      expect(verdict).toMatchObject({
        why: expect.stringContaining("Only they can opt back in"),
      });
    },
  );

  it("treats an opt-out with no recorded actor as the employee's, as the API does", () => {
    expect(
      sms.hrMayRecordConsent(row({ state: "OPTED_OUT", optOutActor: null }))
        .allowed,
    ).toBe(false);
  });

  it("has nothing to record for somebody already opted in", () => {
    expect(sms.hrMayRecordConsent(row({ state: "OPTED_IN" }))).toEqual({
      allowed: false,
      why: "Already opted in.",
    });
  });

  it("lets HR opt anybody out, and has nothing to do for somebody already out", () => {
    expect(sms.hrMayRecordOptOut(row({ state: "OPTED_IN" }))).toEqual({
      allowed: true,
    });
    expect(sms.hrMayRecordOptOut(row({ state: "OPTED_OUT" })).allowed).toBe(
      false,
    );
  });
});

describe("how consent was given", () => {
  it("names the app and the written form, and who recorded it", () => {
    expect(sms.howOptedIn(row())).toEqual({
      how: "In the app",
      by: "By the employee",
    });
    expect(
      sms.howOptedIn(row({ optInChannel: "WRITTEN", optInActor: "HR" })),
    ).toEqual({ how: "Written form", by: "Recorded by HR" });
  });

  it("falls back to what was sent, not to a guess", () => {
    expect(
      sms.howOptedIn(row({ optInChannel: null, optInActor: null })).how,
    ).toBe("Not recorded");
  });

  it("names each way of opting out, and that only HR's can be taken back by HR", () => {
    expect(
      sms.howOptedOut({ optOutChannel: "SMS", optOutActor: "SYSTEM" }).how,
    ).toBe("Replied STOP");
    expect(
      sms.howOptedOut({ optOutChannel: "LINK", optOutActor: "SYSTEM" }).how,
    ).toBe("Used the stop link");
    expect(
      sms.howOptedOut({ optOutChannel: "APP", optOutActor: "EMPLOYEE" }),
    ).toEqual({ how: "Opted out in the app", by: "By the employee" });
    expect(
      sms.howOptedOut({ optOutChannel: "APP", optOutActor: "HR" }),
    ).toEqual({
      how: "Opted out by HR",
      by: "HR can record consent again",
    });
  });
});

describe("the last text", () => {
  const message = (
    status: import("@/lib/api/sms").SmsMessageStatus,
    reason: string | null = null,
  ) => ({
    kind: "WEEKLY_DIGEST" as const,
    status,
    reason,
    at: "2026-10-19T09:00:00.000Z",
  });

  it("flags what somebody might act on and leaves the rest quiet", () => {
    for (const bad of ["FAILED", "BLOCKED", "UNKNOWN"] as const) {
      expect(sms.lastTextSummary(message(bad)).attention).toBe(true);
    }
    for (const fine of [
      "DELIVERED",
      "SENT",
      "QUEUED",
      "SKIPPED",
      "SENDING",
    ] as const) {
      expect(sms.lastTextSummary(message(fine)).attention).toBe(false);
    }
  });

  it("says why a text was not sent in a few words, and never echoes a reason it does not know", () => {
    expect(sms.lastTextSummary(message("BLOCKED", "suppressed")).label).toBe(
      "Number said stop",
    );
    expect(sms.lastTextSummary(message("BLOCKED", "content_money")).label).toBe(
      "Not sent",
    );
  });
});

describe("the overview line", () => {
  it("leads with nothing being sent whenever no provider is connected, switch or no switch", () => {
    const wired = {
      transport: { name: "dev-log", sends: false, supportsReply: false },
    };
    expect(sms.statusHeadline(status(wired))).toEqual({
      text: "Nothing is sent until a text provider is connected.",
      attention: true,
    });
    expect(sms.statusHeadline(status({ ...wired, enabled: false }))?.text).toBe(
      "Nothing is sent until a text provider is connected.",
    );
  });

  it("says there is no way to stop a text before anything else once a provider is wired", () => {
    expect(sms.statusHeadline(status({ optOutPath: "none" }))?.text).toContain(
      "no way for a person to stop a text",
    );
  });

  it("is quiet when it is only off or empty, and says nothing when all is in order", () => {
    expect(sms.statusHeadline(status({ enabled: false }))).toEqual({
      text: "The weekly text is switched off.",
      attention: false,
    });
    expect(
      sms.statusHeadline(status({ subscribers: { optedIn: 0, optedOut: 0 } }))
        ?.attention,
    ).toBe(false);
    expect(sms.statusHeadline(status())).toBeNull();
  });

  it("counts a text as sent whether or not the carrier has said it arrived", () => {
    expect(
      sms.sentThisWeek(
        status({
          thisWeek: {
            weekKey: "2026-W43",
            byStatus: { SENT: 2, DELIVERED: 5, FAILED: 9, QUEUED: 4 },
            segments: 7,
          },
        }),
      ),
    ).toBe(7);
  });
});

describe("what goes to the API", () => {
  it("opts in with the tick as a literal, the number and the wording version", async () => {
    request.mockResolvedValue({});
    await sms.smsApi.optIn({
      phone: "0803 123 4567",
      textVersion: "2026-10-v1",
      acknowledged: true,
    });
    expect(request).toHaveBeenCalledWith("/sms/me/opt-in", {
      method: "POST",
      body: {
        phone: "0803 123 4567",
        textVersion: "2026-10-v1",
        acknowledged: true,
      },
    });
  });

  it("records written consent against the employee's id, with the evidence", async () => {
    request.mockResolvedValue({});
    await sms.smsApi.recordConsent("e1", { evidence: "HR/TEXT/0042" });
    expect(request).toHaveBeenCalledWith("/sms/subscriptions/e1/consent", {
      method: "POST",
      body: { evidence: "HR/TEXT/0042" },
    });
  });

  it("records an opt-out against the employee's id", async () => {
    request.mockResolvedValue({});
    await sms.smsApi.recordOptOut("e1");
    expect(request).toHaveBeenCalledWith("/sms/subscriptions/e1/opt-out", {
      method: "POST",
    });
  });

  it("asks for one page, under a state, and leaves the state out when there is none", async () => {
    requestPaged.mockResolvedValue({ data: [], meta: {} });
    await sms.smsApi.subscriptions({ page: 2, pageSize: 25 });
    await sms.smsApi.subscriptions({
      page: 1,
      pageSize: 25,
      state: "OPTED_OUT",
    });
    expect(requestPaged).toHaveBeenNthCalledWith(1, "/sms/subscriptions", {
      query: { page: 2, pageSize: 25 },
    });
    expect(requestPaged).toHaveBeenNthCalledWith(2, "/sms/subscriptions", {
      query: { page: 1, pageSize: 25, state: "OPTED_OUT" },
    });
  });
});
