import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { demoScreeningGateway as gateway } from "@/lib/hiring/screening/demo-gateway";
import { demoScreening } from "@/lib/hiring/screening/demo-store";
import { demoBook } from "@/lib/store/careers";
import { RESCORE_MS } from "@/lib/hiring/screening/demo-store";
import { kw } from "./screening-helpers";
import type { AssessmentRowInput } from "@/lib/hiring/screening/gateway";
import { NO_CRITERIA, type PassMarkInput } from "@/lib/hiring/screening/model";

/**
 * The demo's screening, end to end, against the real demo book.
 *
 * What these hold: the module opens on a scored advert and an advert with no
 * criteria, every state of a CV is on screen somewhere (a scan, one waiting, one
 * that would not open, one scored with an older version), a save is a new version
 * that re-scores everybody over a few seconds, two people saving at once are told,
 * the pass mark's count is the list's count, and a rejection is a person's, in
 * bulk, with a count that has to still be true.
 */

const SEEDED = "demo-advert-req-01";
const EMPTY = "demo-advert-req-02";
const signal = new AbortController().signal;

const person = (pattern: RegExp) => {
  const found = demoBook().applications.find((a) => pattern.test(a.email));
  if (!found) throw new Error(`no demo applicant like ${String(pattern)}`);
  return found;
};

beforeEach(() => {
  window.localStorage?.clear?.();
  demoScreening.reset();
  demoPipeline.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

/** A pass mark input, with what it leaves alone left alone. */
const mark = (over: Partial<PassMarkInput> = {}): PassMarkInput => ({
  fitMin: null,
  assessmentMin: null,
  assessmentTest: null,
  flagKnockouts: true,
  ...over,
});

/** One row of a file, as typed. */
const line = (
  row: number,
  email: string,
  score: string,
  over: Partial<AssessmentRowInput> = {},
): AssessmentRowInput => ({
  row,
  email,
  reference: "",
  score,
  max: "",
  test: "",
  date: "",
  ...over,
});
const NO_TEST = { test: "" };

describe("the criteria", () => {
  it("opens on one advert with criteria and one without", async () => {
    const seeded = await gateway.criteria.get(SEEDED, signal);
    expect(seeded.version).toBe(2);
    expect(seeded.configured).toBe(true);
    expect(seeded.criteria.mustHave.map((c) => c.label)).toEqual([
      "Node.js",
      "PostgreSQL",
      "REST APIs",
    ]);
    const empty = await gateway.criteria.get(EMPTY, signal);
    expect(empty.version).toBeNull();
    expect(empty.configured).toBe(false);
    expect(empty.criteria).toEqual(NO_CRITERIA);
    expect(seeded.neverUsed).toContain("photo");
    expect(seeded.defaults.mustHave).toBe(50);
  });

  it("saves as the next version, and says so when somebody saved first", async () => {
    const view = await gateway.criteria.get(SEEDED, signal);
    const next = await gateway.criteria.save(
      SEEDED,
      { ...view.criteria, minYears: 6 },
      view.version,
    );
    expect(next.version).toBe(3);
    await expect(
      gateway.criteria.save(SEEDED, view.criteria, view.version),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(
        /Somebody saved newer criteria, version 3/,
      ),
    });
  });

  it("refuses criteria that are not complete", async () => {
    await expect(
      gateway.criteria.save(EMPTY, NO_CRITERIA, null),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("suggests from the advert's own words and applies nothing", async () => {
    const suggestion = await gateway.criteria.suggest(SEEDED, signal);
    expect(
      suggestion.mustHave.length + suggestion.niceToHave.length,
    ).toBeGreaterThan(0);
    expect((await gateway.criteria.get(SEEDED, signal)).version).toBe(2);
  });

  it("previews on the advert's own applicants and writes nothing", async () => {
    const view = await gateway.criteria.get(SEEDED, signal);
    const preview = await gateway.criteria.preview(
      SEEDED,
      { ...view.criteria, mustHave: [kw("Node.js")] },
      signal,
    );
    /* Tried on those whose CV could be read: three of the 22 could not be. */
    expect(preview.available).toBe(19);
    expect(preview.sampled).toBe(19);
    expect(preview.rows).toHaveLength(19);
    expect(preview.scored + preview.notScorable).toBe(preview.sampled);
    expect(preview.bands).toHaveLength(10);
    expect(preview.bands.reduce((a, b) => a + b, 0)).toBe(preview.scored);
    const row = preview.rows.find((r) => r.next !== null && r.current !== null);
    expect(row?.change).toBe((row?.next ?? 0) - (row?.current ?? 0));
    expect(row?.reasons).toMatch(/Matched|Missing/);
    expect((await gateway.criteria.get(SEEDED, signal)).version).toBe(2);
  });
});

describe("every state of a CV is somewhere", () => {
  const explain = (pattern: RegExp) =>
    gateway.explanation(
      { kind: "application", id: person(pattern).id },
      signal,
    );

  it("has a scan that needs a person to read it", async () => {
    const result = await explain(/\.q04@/);
    expect(result.status).toBe("NO_TEXT");
    expect(result.score).toBeNull();
    expect(result.extraction.reason).toMatch(/scan of paper/);
  });

  it("has a CV still waiting to be read", async () => {
    expect((await explain(/\.q07@/)).status).toBe("WAITING_FOR_TEXT");
  });

  it("has a file that would not open, with the reason", async () => {
    const result = await explain(/\.q10@/);
    expect(result.status).toBe("COULD_NOT_READ");
    expect(result.extraction.reason).toMatch(/password/);
  });

  it("has somebody scored with the version before", async () => {
    const result = await explain(/\.q13@/);
    expect(result.status).toBe("SCORED");
    expect(result.stale).toBe(true);
    expect(result.version).toBe(1);
    expect(result.currentVersion).toBe(2);
  });

  it("has an advert with no criteria, where nobody is scored", async () => {
    const other = demoBook().applications.find((a) => a.postingId === EMPTY);
    const result = await gateway.explanation(
      { kind: "application", id: other?.id ?? "" },
      signal,
    );
    expect(result.status).toBe("NO_CRITERIA");
  });

  it("explains a score with the reasons and where the person stands", async () => {
    const scored = demoBook().applications.find(
      (a) => a.postingId === SEEDED && !/\.q(04|07|10)@/.test(a.email),
    );
    const result = await gateway.explanation(
      { kind: "application", id: scored?.id ?? "" },
      signal,
    );
    expect(result.items.length).toBeGreaterThan(3);
    expect(result.formula).toMatch(/weight/);
    expect(result.standing).not.toBeNull();
  });
});

describe("re-scoring", () => {
  it("runs for a few seconds after a save, and leaves the rest on the older version meanwhile", async () => {
    const stale = person(/\.q13@/);
    const view = await gateway.criteria.get(SEEDED, signal);
    await gateway.criteria.save(
      SEEDED,
      { ...view.criteria, minYears: 6 },
      view.version,
    );

    const begun = await gateway.rescore.progress(SEEDED, signal);
    expect(begun).toMatchObject({
      running: true,
      done: 0,
      total: 22,
      cause: "CRITERIA",
    });

    vi.setSystemTime(new Date("2026-10-16T09:00:02Z"));
    const half = await gateway.rescore.progress(SEEDED, signal);
    expect(half.running).toBe(true);
    expect(half.done).toBeGreaterThan(5);
    expect(half.done).toBeLessThan(22);

    vi.setSystemTime(
      new Date(Date.parse("2026-10-16T09:00:00Z") + RESCORE_MS + 100),
    );
    const done = await gateway.rescore.progress(SEEDED, signal);
    expect(done.running).toBe(false);

    const after = await gateway.explanation(
      { kind: "application", id: stale.id },
      signal,
    );
    expect(after.stale).toBe(false);
    expect(after.version).toBe(3);
  });

  it("shows somebody not yet reached as scored with the older version", async () => {
    const view = await gateway.criteria.get(SEEDED, signal);
    await gateway.criteria.save(SEEDED, view.criteria, view.version);
    const rows = demoBook().applications.filter((a) => a.postingId === SEEDED);
    const last = rows[rows.length - 1];
    const result = await gateway.explanation(
      { kind: "application", id: last?.id ?? "" },
      signal,
    );
    /* The last in line has not been reached a moment after the save. */
    expect(result.stale || result.status !== "SCORED").toBe(true);
  });
});

describe("the pass mark", () => {
  it("counts who would be below it, and the count is the list's count", async () => {
    const count = await gateway.passMark.count(
      SEEDED,
      mark({ fitMin: 50 }),
      signal,
    );
    const list = await gateway.below.list(
      { postingId: SEEDED, filters: {}, cursor: null, pageSize: 100 },
      signal,
    );
    expect(count.total).toBe(22);
    expect(count.below).toBe(list.total);
    expect(count.notScored).toBeGreaterThan(0);
    expect(count.byReason.fit).toBeGreaterThan(0);
  });

  it("does not count people with no score as below it", async () => {
    const list = await gateway.below.list(
      { postingId: SEEDED, filters: {}, cursor: null, pageSize: 100 },
      signal,
    );
    const none = [/\.q04@/, /\.q07@/, /\.q10@/].map((p) => person(p).id);
    expect(
      list.rows.map((r) => r.id).filter((id) => none.includes(id)),
    ).toEqual([]);
  });

  it("raises the count when the line is raised, and saves it as a new version", async () => {
    const low = await gateway.passMark.count(
      SEEDED,
      mark({ fitMin: 20 }),
      signal,
    );
    const high = await gateway.passMark.count(
      SEEDED,
      mark({ fitMin: 90 }),
      signal,
    );
    expect(high.below).toBeGreaterThan(low.below);
    const saved = await gateway.passMark.save(SEEDED, mark({ fitMin: 90 }));
    expect(saved.fitMin).toBe(90);
    expect(saved.version).toBe(2);
    expect((await gateway.rescore.progress(SEEDED, signal)).cause).toBe(
      "PASS_MARK",
    );
  });

  it("lists the lowest scores first, each with its reasons", async () => {
    const list = await gateway.below.list(
      { postingId: SEEDED, filters: {}, cursor: null, pageSize: 100 },
      signal,
    );
    const scores = list.rows.map((r) => r.summary.fit.score ?? 1000);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(list.rows[0]?.reasons[0]?.kind).toBe("FIT");
    expect(list.rows[0]?.reasons[0]?.text).toMatch(/pass mark is 50/);
  });

  it("pages the list with a cursor", async () => {
    const first = await gateway.below.list(
      { postingId: SEEDED, filters: {}, cursor: null, pageSize: 3 },
      signal,
    );
    expect(first.rows).toHaveLength(3);
    expect(first.next).not.toBeNull();
    const second = await gateway.below.list(
      { postingId: SEEDED, filters: {}, cursor: first.next, pageSize: 3 },
      signal,
    );
    expect(second.rows[0]?.id).not.toBe(first.rows[0]?.id);
  });
});

describe("deciding", () => {
  const all = () =>
    gateway.below.list(
      { postingId: SEEDED, filters: {}, cursor: null, pageSize: 100 },
      signal,
    );

  it("rejects the people it was asked to, and they leave the list", async () => {
    const before = await all();
    const ids = before.rows.slice(0, 2).map((r) => r.id);
    const outcome = await gateway.below.reject({
      target: { kind: "ids", postingId: SEEDED, ids },
      decision: { reasonId: "any", note: "Thin CV", sendEmails: false },
      idempotencyKey: "k-1-xxxxxxxx",
      signal,
      onProgress: () => undefined,
    });
    expect(outcome).toMatchObject({ requested: 2, done: 2, emailed: null });
    const after = await all();
    expect(after.total).toBe(before.total - 2);
    expect(after.rows.map((r) => r.id)).not.toEqual(
      expect.arrayContaining(ids),
    );
  });

  it("says no email was sent, whatever was asked, because a demo has no mail", async () => {
    const before = await all();
    const outcome = await gateway.below.reject({
      target: {
        kind: "ids",
        postingId: SEEDED,
        ids: [before.rows[0]?.id ?? ""],
      },
      decision: { reasonId: "any", note: null, sendEmails: true },
      idempotencyKey: "k-2-xxxxxxxx",
      signal,
      onProgress: () => undefined,
    });
    expect(outcome.emailed).toBe(0);
    expect(outcome.emailNote).toMatch(/Nothing was sent/);
  });

  it("does an 'everyone matching' only if the count is still the one confirmed", async () => {
    const before = await all();
    await expect(
      gateway.below.reject({
        target: {
          kind: "filter",
          postingId: SEEDED,
          filters: {},
          expected: before.total + 5,
        },
        decision: { reasonId: "any", note: null, sendEmails: false },
        idempotencyKey: "k-3-xxxxxxxx",
        signal,
        onProgress: () => undefined,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(
        /The list changed while you were choosing/,
      ),
    });
    expect((await all()).total).toBe(before.total);

    const outcome = await gateway.below.reject({
      target: {
        kind: "filter",
        postingId: SEEDED,
        filters: {},
        expected: before.total,
      },
      decision: { reasonId: "any", note: null, sendEmails: false },
      idempotencyKey: "k-4-xxxxxxxx",
      signal,
      onProgress: () => undefined,
    });
    expect(outcome.done).toBe(before.total);
    expect((await all()).total).toBe(0);
  });

  it("keeps somebody in the running only with a reason, and takes them off the list", async () => {
    const before = await all();
    const id = before.rows[0]?.id ?? "";
    await expect(gateway.below.keep(id, "ok")).rejects.toMatchObject({
      status: 400,
    });
    await gateway.below.keep(id, "Strong portfolio");
    const after = await all();
    expect(after.rows.map((r) => r.id)).not.toContain(id);
    const standing = (
      await gateway.explanation({ kind: "application", id }, signal)
    ).standing;
    expect(standing?.kept?.reason).toBe("Strong portfolio");
    expect(standing?.below).toBe(false);
  });

  it("narrows by reason and by search", async () => {
    const bySearch = await gateway.below.list(
      { postingId: SEEDED, filters: { q: "zzzz" }, cursor: null, pageSize: 50 },
      signal,
    );
    expect(bySearch.total).toBe(0);
    const byReason = await gateway.below.list(
      {
        postingId: SEEDED,
        filters: { reason: "ASSESSMENT" },
        cursor: null,
        pageSize: 50,
      },
      signal,
    );
    expect(byReason.total).toBe(0);
  });
});

describe("assessment scores", () => {
  const emailOf = (pattern: RegExp) => person(pattern).email;

  it("checks every row and says what is wrong with each, by name", async () => {
    const good = emailOf(/\.q01@/);
    const check = await gateway.assessment.check(
      SEEDED,
      "boot.csv",
      [
        line(1, good, "72"),
        line(2, "", "50"),
        line(3, "nobody@example.test", "50"),
        line(4, good, "80"),
        line(5, emailOf(/\.q04@/), "seven"),
        line(6, emailOf(/\.q07@/), "130"),
      ],
      NO_TEST,
      signal,
    );
    expect(check.rows.map((r) => r.refusal)).toEqual([
      null,
      "blank_email",
      "unmatched_email",
      "duplicate_in_file",
      "not_a_number",
      "out_of_range",
    ]);
    expect(check.usable).toBe(1);
    expect(check.refused).toBe(5);
    expect(check.rows[2]?.message).toMatch(
      /No applicant for this advert has that email/,
    );
    expect(check.rows[5]?.message).toMatch(/no maximum was given/);
  });

  it("matches a row by the reference the applicant was given", async () => {
    const q = person(/\.q01@/);
    const reference = demoBook().applications.find(
      (a) => a.id === q.id,
    )?.reference;
    expect(reference).toBeTruthy();
    const check = await gateway.assessment.check(
      SEEDED,
      "boot.csv",
      [
        line(1, "", "72", { reference: reference ?? "" }),
        line(2, "", "50", { reference: "APP-NOPE0000" }),
        line(3, q.email, "50", { reference: reference ?? "" }),
      ],
      NO_TEST,
      signal,
    );
    expect(check.rows[0]).toMatchObject({ refusal: null, name: q.name });
    expect(check.rows[1]?.message).toBe(
      "No applicant for this advert has that reference.",
    );
    expect(check.rows[2]?.refusal).toBe("duplicate_in_file");
  });

  it("reads a mark with what it is out of as a percentage, and refuses one over its maximum", async () => {
    const good = emailOf(/\.q01@/);
    const other = emailOf(/\.q16@/);
    const check = await gateway.assessment.check(
      SEEDED,
      "boot.csv",
      [
        line(1, good, "42", { max: "60" }),
        line(2, other, "45/60"),
        line(3, emailOf(/\.q19@/), "70", { max: "60" }),
        line(4, emailOf(/\.q10@/), "50", { date: "next week" }),
      ],
      NO_TEST,
      signal,
    );
    expect(check.rows[0]).toMatchObject({ refusal: null, score: 42, max: 60 });
    expect(check.rows[1]).toMatchObject({ refusal: null, score: 45, max: 60 });
    expect(check.rows[2]?.message).toBe("70 is more than the maximum of 60.");
    expect(check.rows[3]?.message).toBe("Use a date such as 2026-10-16.");
    await gateway.assessment.commit(
      SEEDED,
      check,
      [
        line(1, good, "42", { max: "60" }),
        line(2, other, "45/60"),
        line(3, emailOf(/\.q19@/), "70", { max: "60" }),
        line(4, emailOf(/\.q10@/), "50", { date: "next week" }),
      ],
      NO_TEST,
    );
    const history = await gateway.assessment.history(
      { kind: "application", id: person(/\.q01@/).id },
      signal,
    );
    expect(history.current[0]).toMatchObject({
      test: "Assessment",
      score: 42,
      max: 60,
      percent: 70,
    });
  });

  it("saves only the usable rows, and refuses a file that is not the one checked", async () => {
    const good = emailOf(/\.q01@/);
    const rows = [line(1, good, "30"), line(2, "nobody@example.test", "50")];
    const check = await gateway.assessment.check(
      SEEDED,
      "boot.csv",
      rows,
      NO_TEST,
      signal,
    );
    await expect(
      gateway.assessment.commit(
        SEEDED,
        check,
        [{ ...rows[0]!, score: "99" }],
        NO_TEST,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      gateway.assessment.commit(SEEDED, check, rows, { test: "Another" }),
    ).rejects.toMatchObject({ status: 409 });
    const result = await gateway.assessment.commit(
      SEEDED,
      check,
      rows,
      NO_TEST,
    );
    expect(result).toMatchObject({ saved: 1, unchanged: 0, refused: 1 });
    const history = await gateway.assessment.history(
      { kind: "application", id: person(/\.q01@/).id },
      signal,
    );
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({
      score: 30,
      source: "IMPORT",
      test: "Assessment",
      cleared: false,
    });
  });

  it("importing the same file again changes nothing, and a different mark replaces the one in use", async () => {
    const good = emailOf(/\.q01@/);
    const id = person(/\.q01@/).id;
    const first = [line(1, good, "30")];
    const checked = await gateway.assessment.check(
      SEEDED,
      "a.csv",
      first,
      NO_TEST,
      signal,
    );
    expect(checked.rows[0]?.effect).toBe("new");
    await gateway.assessment.commit(SEEDED, checked, first, NO_TEST);

    const again = await gateway.assessment.check(
      SEEDED,
      "a.csv",
      first,
      NO_TEST,
      signal,
    );
    expect(again).toMatchObject({ usable: 1, unchanged: 1, replacing: 0 });
    const result = await gateway.assessment.commit(
      SEEDED,
      again,
      first,
      NO_TEST,
    );
    expect(result).toMatchObject({ saved: 0, unchanged: 1 });

    const newer = [line(1, good, "55")];
    const replaced = await gateway.assessment.check(
      SEEDED,
      "b.csv",
      newer,
      NO_TEST,
      signal,
    );
    expect(replaced).toMatchObject({ replacing: 1, unchanged: 0 });
    await gateway.assessment.commit(SEEDED, replaced, newer, NO_TEST);
    const history = await gateway.assessment.history(
      { kind: "application", id },
      signal,
    );
    /* One in use, and both values kept. */
    expect(history.current.map((c) => c.score)).toEqual([55]);
    expect(history.entries.map((e) => e.score)).toEqual([55, 30]);
  });

  it("keeps two tests apart, and the pass mark reads the one it is told to", async () => {
    const q = person(/\.q16@/);
    const subject = { kind: "application" as const, id: q.id };
    await gateway.assessment.enter(subject, {
      test: "Aptitude",
      score: 20,
      max: null,
      takenOn: null,
    });
    await gateway.assessment.enter(subject, {
      test: "Interview task",
      score: 90,
      max: null,
      takenOn: null,
    });
    const view = await gateway.passMark.get(SEEDED, signal);
    expect(view.tests.map((t) => t.name)).toEqual([
      "Aptitude",
      "Interview task",
    ]);
    const latest = await gateway.passMark.count(
      SEEDED,
      mark({ assessmentMin: 60 }),
      signal,
    );
    const aptitude = await gateway.passMark.count(
      SEEDED,
      mark({ assessmentMin: 60, assessmentTest: "Aptitude" }),
      signal,
    );
    /* The one entered last is 90, which clears 60; the Aptitude test is 20. */
    expect(aptitude.byReason.assessment).toBe(latest.byReason.assessment + 1);
  });

  it("feeds the pass mark: a low assessment result puts somebody below it", async () => {
    const q = person(/\.q16@/);
    const before = await gateway.passMark.count(
      SEEDED,
      mark({ assessmentMin: 60 }),
      signal,
    );
    await gateway.assessment.enter(
      { kind: "application", id: q.id },
      { test: null, score: 20, max: null, takenOn: null },
    );
    const after = await gateway.passMark.count(
      SEEDED,
      mark({ assessmentMin: 60 }),
      signal,
    );
    expect(after.byReason.assessment).toBe(before.byReason.assessment + 1);
  });

  it("does not count somebody kept in the running as below, and says how many were kept", async () => {
    const before = await gateway.passMark.count(
      SEEDED,
      mark({ fitMin: 90 }),
      signal,
    );
    const listed = await gateway.below.list(
      { postingId: SEEDED, filters: {}, cursor: null, pageSize: 100 },
      signal,
    );
    const first = listed.rows[0];
    await gateway.below.keep(first?.id ?? "", "Referred by the hiring manager");
    const after = await gateway.passMark.count(
      SEEDED,
      mark({ fitMin: 90 }),
      signal,
    );
    expect(after.kept).toBe(before.kept + 1);
    expect(after.below).toBeLessThan(before.below);
  });

  it("keeps the history, newest first, with each value's test, maximum and day", async () => {
    const subject = { kind: "application" as const, id: person(/\.q03@/).id };
    await gateway.assessment.enter(subject, {
      test: null,
      score: 40,
      max: null,
      takenOn: null,
    });
    vi.setSystemTime(new Date("2026-10-17T09:00:00Z"));
    await gateway.assessment.enter(subject, {
      test: null,
      score: 45,
      max: 60,
      takenOn: "2026-10-16",
    });
    const history = await gateway.assessment.history(subject, signal);
    expect(history.entries.map((h) => h.score)).toEqual([45, 40]);
    expect(history.entries[0]).toMatchObject({
      source: "MANUAL",
      max: 60,
      percent: 75,
      takenOn: "2026-10-16",
    });
    expect(history.current).toHaveLength(1);
    expect(history.current[0]?.score).toBe(45);
  });

  it("refuses a typed result with no maximum over 100, and one over its maximum", async () => {
    const subject = { kind: "application" as const, id: person(/\.q03@/).id };
    await expect(
      gateway.assessment.enter(subject, {
        test: null,
        score: 130,
        max: null,
        takenOn: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      gateway.assessment.enter(subject, {
        test: null,
        score: 70,
        max: 60,
        takenOn: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
