import { describe, expect, it } from "vitest";
import {
  CAN_NOTHING,
  toDetail,
  toSettings,
  toSummary,
} from "@/lib/api/queries";
import {
  isDayWarning,
  leadHref,
  queryHref,
  toCitation,
  toCitationAdded,
  toCounts,
  toDocumentAsked,
  toLead,
  toTemplateList,
  toWarnings,
} from "@/lib/api/query-ties";

/**
 * The wire layer for the ties between a query and the rest of the product.
 *
 * What is proved: a citation is read as a copy and a field the copy did not hold is `null`; a kind
 * this build does not know is left out and not guessed at; a lead is a link built from ids and
 * never from text the API wrote; a withheld count is `null` and is never a nought; the detail of a
 * server a deploy behind reads exactly as Stage 2 did (every new field absent).
 */

describe("a citation", () => {
  const policy = {
    id: "c-1",
    kind: "POLICY",
    title: "Code of conduct, version 3",
    takenAt: "2026-11-18T09:00:00.000Z",
    frozen: true,
    hash: "abc",
    asItStood: {
      title: "Code of conduct",
      version: 3,
      personAcknowledged: false,
      acknowledgedAt: null,
      body: "Be on time.",
      publishedAfterIncident: null,
    },
  };

  it("is read with its kind, its one-line title and what the record said", () => {
    const citation = toCitation(policy);
    expect(citation?.kind).toBe("POLICY");
    expect(citation?.title).toBe("Code of conduct, version 3");
    expect(citation?.frozen).toBe(true);
    expect(citation?.asItStood).toMatchObject({
      kind: "POLICY",
      version: 3,
      personAcknowledged: false,
      body: "Be on time.",
    });
  });

  it("leaves a field the copy did not hold as null, never a nought or a none", () => {
    const citation = toCitation(policy);
    if (citation?.asItStood.kind !== "POLICY") throw new Error("wrong kind");
    expect(citation.asItStood.acknowledgedAt).toBeNull();
    expect(citation.asItStood.publishedAfterIncident).toBeNull();
    expect(citation.asItStood.withdrawn).toBeNull();
    expect(citation.asItStood.category).toBeNull();
  });

  it("is left out when it is not one, or is a kind this build does not know", () => {
    expect(toCitation({ id: "c", kind: "SALARY", title: "x" })).toBeNull();
    expect(toCitation({ kind: "POLICY", title: "no id" })).toBeNull();
    expect(toCitation({ id: "c", kind: "POLICY" })).toBeNull();
    expect(toCitation("a string")).toBeNull();
    expect(toCitation(null)).toBeNull();
  });

  it("reads a rota day's shift from its nested object, and every kind without throwing", () => {
    expect(
      toCitation({
        id: "c",
        kind: "ROTA_DAY",
        title: "Rota",
        asItStood: {
          date: "2026-11-10",
          shift: { name: "Night", startTime: "20:00", endTime: "06:00" },
          status: "WORKED",
        },
      })?.asItStood,
    ).toMatchObject({
      kind: "ROTA_DAY",
      shiftName: "Night",
      startTime: "20:00",
      endTime: "06:00",
    });
    for (const kind of [
      "EQUIPMENT",
      "ATTENDANCE_DAY",
      "LEAVE_REQUEST",
      "DOCUMENT_REQUEST",
    ]) {
      expect(
        toCitation({ id: "c", kind, title: "t", asItStood: null }),
      ).not.toBeNull();
    }
  });

  it("carries the warnings of the day on the answer to adding one", () => {
    const added = toCitationAdded({
      ...policy,
      warnings: [
        {
          code: "cited_day_on_leave",
          message: "A day is inside approved leave.",
          dates: ["2026-11-04"],
        },
      ],
    });
    expect(added?.warnings).toEqual([
      {
        code: "cited_day_on_leave",
        message: "A day is inside approved leave.",
        dates: ["2026-11-04"],
      },
    ]);
  });
});

describe("warnings", () => {
  it("keep the server's sentence and the days it is about, and drop what has no sentence", () => {
    expect(
      toWarnings([
        { code: "reply_by_on_leave", message: "Inside leave.", dates: ["2026-11-20"] },
        { code: "x" },
        "nope",
      ]),
    ).toEqual([
      { code: "reply_by_on_leave", message: "Inside leave.", dates: ["2026-11-20"] },
    ]);
  });

  it("tell a cited-day warning from a reply-by one, which sit beside different things", () => {
    expect(isDayWarning("cited_day_on_leave")).toBe(true);
    expect(isDayWarning("cited_day_not_rostered")).toBe(true);
    expect(isDayWarning("reply_by_on_leave")).toBe(false);
    expect(isDayWarning("short_reply_time")).toBe(false);
  });
});

describe("a lead", () => {
  it("is read by kind and id, and a kind this build does not know is left out", () => {
    expect(
      toLead({
        kind: "EXIT",
        id: "x-1",
        subKind: "TERMINATION",
        date: "2026-12-01",
        dateMeans: "last_working_day",
      }),
    ).toEqual({
      kind: "EXIT",
      id: "x-1",
      subKind: "TERMINATION",
      date: "2026-12-01",
      dateMeans: "last_working_day",
    });
    expect(toLead({ kind: "HEARING", id: "h" })).toBeNull();
    expect(toLead({ kind: "EXIT" })).toBeNull();
  });

  it("is linked from its kind and ids and from nothing the API wrote", () => {
    const hostile = {
      kind: "WARNING" as const,
      id: "w-1",
      subKind: "javascript:alert(1)",
      date: "https://evil.example/",
      dateMeans: "recorded" as const,
    };
    expect(leadHref(hostile, "e-9")).toBe("/people/e-9?tab=conduct");
    expect(
      leadHref({ ...hostile, kind: "EMPLOYMENT_CHANGE" }, "e-9"),
    ).toBe("/people/e-9?tab=history");
    expect(leadHref({ ...hostile, kind: "EXIT", id: "x-2" }, "e-9")).toBe(
      "/people/offboarding/x-2",
    );
  });

  it("encodes an id so it can never become another path", () => {
    expect(queryHref("a/../b")).toBe("/people/queries/a%2F..%2Fb");
    expect(
      leadHref({ kind: "EXIT", id: "x/../y", subKind: null, date: null, dateMeans: null }, "e"),
    ).toBe("/people/offboarding/x%2F..%2Fy");
  });
});

describe("the detail", () => {
  it("reads every new field as absent from a server a deploy behind, as Stage 2 did", () => {
    const read = toDetail({ id: "q-1", status: "ISSUED", can: { edit: true } });
    expect(read.citations).toEqual([]);
    expect(read.documentRequests).toEqual([]);
    expect(read.leads).toBeNull();
    expect(read.startedByManager).toBe(false);
    expect(read.draftedByName).toBeNull();
    expect(read.can.cite).toBe(false);
    expect(read.can.askForDocument).toBe(false);
  });

  it("keeps a list of leads apart from none being sent", () => {
    expect(toDetail({ leads: [] }).leads).toEqual([]);
    expect(toDetail({}).leads).toBeNull();
    expect(
      toDetail({ leads: [{ kind: "WARNING", id: "w", subKind: "WRITTEN" }, { kind: "?" }] })
        .leads,
    ).toHaveLength(1);
  });

  it("offers nothing for a `can` that is not an object, including the new two", () => {
    expect(toDetail({ can: "yes" }).can).toEqual(CAN_NOTHING);
    expect(CAN_NOTHING.cite).toBe(false);
    expect(CAN_NOTHING.askForDocument).toBe(false);
  });

  it("reads documents asked for, and a status it does not know as still open", () => {
    const read = toDetail({
      documentRequests: [
        { id: "d-1", name: "Medical certificate", status: "FULFILLED", dueOn: "2026-11-30" },
        { id: "d-2", name: "Something", status: "WEIRD" },
        { name: "no id" },
      ],
    });
    expect(read.documentRequests.map((r) => [r.name, r.status])).toEqual([
      ["Medical certificate", "FULFILLED"],
      ["Something", "OPEN"],
    ]);
  });

  it("flags a manager's draft on a summary too", () => {
    expect(toSummary({ id: "q", startedByManager: true })?.startedByManager).toBe(true);
    expect(toSummary({ id: "q" })?.startedByManager).toBe(false);
  });
});

describe("settings", () => {
  const base = { replyHours: 48, warnHours: 24, issuerMayDecideIfSole: true };

  it("reads whether managers may draft, and null when the server did not say", () => {
    expect(toSettings({ ...base, managersMayDraft: true })?.managersMayDraft).toBe(true);
    expect(toSettings({ ...base, managersMayDraft: false })?.managersMayDraft).toBe(false);
    expect(toSettings(base)?.managersMayDraft).toBeNull();
    expect(toSettings({ ...base, managersMayDraft: "yes" })?.managersMayDraft).toBeNull();
  });
});

describe("templates", () => {
  it("are read with the server's merge fields and sentence, and none is invented", () => {
    const list = toTemplateList({
      data: [
        { id: "t-1", name: "Absence", subjectLine: "About {{employee_first_name}}", archived: false },
        { name: "no id" },
      ],
      meta: {
        total: 1,
        mergeFields: [{ token: "{{employee_name}}", label: "Their full name" }, { token: "x" }],
        note: "These are your company's own words.",
      },
    });
    expect(list.rows.map((row) => row.name)).toEqual(["Absence"]);
    expect(list.mergeFields).toEqual([
      { token: "{{employee_name}}", label: "Their full name" },
    ]);
    expect(list.note).toBe("These are your company's own words.");
  });

  it("are an empty list, with no wording, when the server sent none", () => {
    const list = toTemplateList({ data: [], meta: {} });
    expect(list.rows).toEqual([]);
    expect(list.mergeFields).toEqual([]);
    expect(list.note).toBeNull();
  });
});

describe("counts", () => {
  it("keep a withheld cell as null and never turn it into a nought", () => {
    const counts = toCounts({
      year: 2026,
      floor: 3,
      byStatus: [
        { status: "ISSUED", count: 5 },
        { status: "REPLIED", count: null },
        { status: "CLOSED", count: 0 },
        { status: "WITHDRAWN", count: "7" },
      ],
      byMonth: [
        { month: "2026-01", count: null },
        { month: "2026-02", count: 4 },
      ],
      note: "A figure under 3 is never shown.",
    });
    expect(counts?.byStatus.map((c) => [c.key, c.count])).toEqual([
      ["ISSUED", 5],
      ["REPLIED", null],
      /* A real zero from the server is a zero, and a string is not a number. */
      ["CLOSED", 0],
      ["WITHDRAWN", null],
    ]);
    expect(counts?.byMonth.map((c) => c.count)).toEqual([null, 4]);
  });

  it("carries no total and no field a screen could add up into one", () => {
    const counts = toCounts({ year: 2026, floor: 3, byStatus: [], byMonth: [], note: "n" });
    expect(Object.keys(counts ?? {}).sort()).toEqual([
      "byMonth",
      "byStatus",
      "floor",
      "note",
      "year",
    ]);
  });

  it("is null for something that is not counts", () => {
    expect(toCounts(null)).toBeNull();
    expect(toCounts({ byStatus: [] })).toBeNull();
  });
});

describe("a document asked for", () => {
  it("reports whether the person was told, and null when the server did not say", () => {
    expect(
      toDocumentAsked({ request: { id: "d-1" }, notifiedPerson: false }),
    ).toEqual({ requestId: "d-1", notifiedPerson: false });
    expect(toDocumentAsked({ request: { id: "d-1" } }).notifiedPerson).toBeNull();
    expect(toDocumentAsked(null)).toEqual({ requestId: null, notifiedPerson: null });
  });
});
