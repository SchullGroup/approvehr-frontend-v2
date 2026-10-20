import { beforeEach, describe, expect, it } from "vitest";
import {
  archiveEmailTemplate,
  catalogOf,
  checkDraft,
  createEmailTemplate,
  emailsOf,
  previewDraft,
  restoreEmailTemplate,
  retentionLine,
  retentionReport,
  setRetention,
  setStageEmail,
  setStagePanel,
  stageSettings,
  updateEmailTemplate,
} from "@/lib/hiring/pipeline/demo-comms-ops";
import {
  applyBulk,
  moveApp,
  rejectApp,
  type DemoApp,
  type DemoBook,
} from "@/lib/hiring/pipeline/demo-ops";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";

/**
 * The offline book's emails, panels and retention, on the seeded demo book.
 *
 * What matters here is what the offline book will not do. It has no mail transport,
 * so an email somebody asks for is recorded as **not sent**, with the reason the API's
 * worker would give; nothing ever comes back saying it was sent or queued. And an
 * email is owed only when a person said so: a move without the tick, a rejection
 * without the tick and a bulk action without the tick owe nothing.
 */

let book: DemoBook;
beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
  book = demoPipeline.current();
});

const inStage = (b: DemoBook, stageId: string): DemoApp => {
  const found = b.apps.find(
    (a) => a.stageId === stageId && a.outcome === "IN_PROGRESS",
  );
  if (!found) throw new Error(`Nobody in ${stageId}`);
  return found;
};

const ok = <T>(result: { ok: boolean } & Record<string, unknown>): T => {
  if (!result.ok) throw new Error(String(result["error"]));
  return result as unknown as T;
};

describe("moving a person", () => {
  it("owes no email when the person did not ask for one", () => {
    const app = inStage(book, "req-01:sourced");
    const moved = ok<{ book: DemoBook; value: { email: unknown } }>(
      moveApp(book, app.id, "req-01:shortlisted"),
    );
    expect(moved.value.email).toBeNull();
    expect(moved.book.emails).toHaveLength(0);
  });

  it("records an asked-for email as not sent, and why, never as sent or queued", () => {
    const app = inStage(book, "req-01:sourced");
    const moved = ok<{
      book: DemoBook;
      value: { email: { status: string; note: string; kindLabel: string } };
    }>(moveApp(book, app.id, "req-01:shortlisted", true));
    expect(moved.value.email.status).toBe("SKIPPED");
    expect(moved.value.email.note).toBe(
      "not sent: nothing is sent from a practice board",
    );
    expect(moved.value.email.kindLabel).toBe("Update on their application");

    const log = emailsOf(moved.book, app.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      status: "SKIPPED",
      stageName: "Shortlisted",
      templateName: "Moved to the next stage",
      because: "Moved into Shortlisted",
      sentAt: null,
    });
    expect(moved.book.emails.every((e) => e.status !== "PENDING")).toBe(true);
  });

  it("owes nothing for a stage that has no message, even when asked", () => {
    const app = inStage(book, "req-01:sourced");
    const moved = ok<{ book: DemoBook; value: { email: unknown } }>(
      moveApp(book, app.id, "req-01:prescreen", true),
    );
    expect(moved.value.email).toBeNull();
    expect(moved.book.emails).toHaveLength(0);
  });

  it("says which field has no value when an invitation has no interview behind it", () => {
    const app = inStage(book, "req-01:sourced");
    const moved = ok<{
      value: { email: { note: string } };
    }>(moveApp(book, app.id, "req-01:interview", true));
    expect(moved.value.email.note).toContain("{interview_time}");
    expect(moved.value.email.note).toContain("{interview_location}");
    expect(moved.value.email.note).toContain(
      "no interview is scheduled for them",
    );
  });

  it("gives the same reasons, in the same order, as the API's worker", () => {
    const app = inStage(book, "req-01:sourced");
    const off = { ...book, mail: { ...book.mail, enabled: false } };
    expect(
      ok<{ value: { email: { note: string } } }>(
        moveApp(off, app.id, "req-01:shortlisted", true),
      ).value.email.note,
    ).toBe("not sent: emails to candidates are switched off for this company");

    const noReply = { ...book, mail: { ...book.mail, replyTo: null } };
    expect(
      ok<{ value: { email: { note: string } } }>(
        moveApp(noReply, app.id, "req-01:shortlisted", true),
      ).value.email.note,
    ).toMatch(/^not sent: no reply-to address is set for this company/);

    /* Both wrong: the company's own switch is said first. */
    const both = {
      ...book,
      mail: { ...book.mail, enabled: false, replyTo: null },
    };
    expect(
      ok<{ value: { email: { note: string } } }>(
        moveApp(both, app.id, "req-01:shortlisted", true),
      ).value.email.note,
    ).toMatch(/switched off for this company/);
  });

  it("still refuses what it always refused, and asked-for email changes none of it", () => {
    const app = inStage(book, "req-01:sourced");
    const refused = moveApp(book, app.id, "req-01:hired", true);
    expect(refused.ok).toBe(false);
  });
});

describe("rejecting a person", () => {
  it("never emails because somebody was rejected", () => {
    const app = inStage(book, "req-01:sourced");
    const out = ok<{ book: DemoBook; value: { email: unknown } }>(
      rejectApp(book, app.id, "reason-1", null),
    );
    expect(out.value.email).toBeNull();
    expect(out.book.emails).toHaveLength(0);
  });

  it("records a decline as not sent when the person ticked it", () => {
    const app = inStage(book, "req-01:sourced");
    const out = ok<{
      book: DemoBook;
      value: { email: { status: string; kindLabel: string } };
    }>(rejectApp(book, app.id, "reason-1", null, true));
    expect(out.value.email).toMatchObject({
      status: "SKIPPED",
      kindLabel: "Not taking them forward",
    });
    expect(emailsOf(out.book, app.id)[0]).toMatchObject({
      because: "Rejected, with a decline email",
      templateName: "Kind decline",
    });
  });
});

describe("bulk actions", () => {
  const three = (b: DemoBook): string[] =>
    b.apps
      .filter(
        (a) => a.stageId === "req-01:sourced" && a.outcome === "IN_PROGRESS",
      )
      .slice(0, 3)
      .map((a) => a.id);

  it("owes nothing and says nothing about email unless the action asked", () => {
    const { outcome, book: next } = applyBulk(book, three(book), {
      type: "reject",
      reasonId: "reason-1",
      note: null,
      sendEmail: false,
    });
    expect(outcome.done).toBe(3);
    expect(outcome.emailed).toBeNull();
    expect(next.emails).toHaveLength(0);
  });

  it("when asked, counts how many were queued (none, offline) and says why", () => {
    const { outcome } = applyBulk(book, three(book), {
      type: "reject",
      reasonId: "reason-1",
      note: null,
      sendEmail: true,
    });
    expect(outcome.done).toBe(3);
    expect(outcome.emailed).toBe(0);
    expect(outcome.emailNote).toBe(
      "not sent: nothing is sent from a practice board",
    );
  });

  it("does not email somebody the action did nothing for", () => {
    const ids = three(book);
    const first = ok<{ book: DemoBook }>(
      moveApp(book, ids[0] as string, "req-01:shortlisted"),
    );
    const { book: next, outcome } = applyBulk(first.book, ids, {
      type: "move",
      stageId: "req-01:shortlisted",
      sendEmail: true,
    });
    expect(outcome.skipped).toBe(1);
    expect(next.emails).toHaveLength(2);
  });
});

describe("templates", () => {
  const draft = {
    kind: "DECLINE" as const,
    name: "Warm decline",
    subject: "Your application",
    body: "Hello {candidate_first_name}, thank you.",
    isDefault: false,
  };

  it("starts with the company's three, one default per kind", () => {
    const catalog = catalogOf(book);
    expect(catalog.templates.map((t) => t.name).sort()).toEqual([
      "Interview invitation",
      "Kind decline",
      "Moved to the next stage",
    ]);
    expect(
      catalog.kinds.find((k) => k.kind === "DECLINE")?.defaultTemplateId,
    ).toBe("etpl-3");
    expect(catalog.sender?.name).toBe("Schull Technologies");
  });

  it("is checked at the field, and a taken name is a conflict about the whole thing", () => {
    expect(
      checkDraft(book, { ...draft, body: "Hello {salary}" }).problems[0],
    ).toMatchObject({ field: "body" });
    expect(checkDraft(book, { ...draft, name: "x" }).problems[0]).toEqual({
      field: "name",
      message: "Give the template a name.",
    });
    expect(checkDraft(book, { ...draft, name: "kind DECLINE" }).conflict).toBe(
      'There is already a template called "kind DECLINE".',
    );
    expect(checkDraft(book, draft).problems).toEqual([]);
    expect(checkDraft(book, draft).conflict).toBeNull();
  });

  it("makes another the default by taking it from the first", () => {
    const made = ok<{ book: DemoBook; value: { id: string } }>(
      createEmailTemplate(book, { ...draft, isDefault: true }),
    );
    const catalog = catalogOf(made.book);
    const declines = catalog.templates.filter((t) => t.kind === "DECLINE");
    expect(declines.filter((t) => t.isDefault).map((t) => t.name)).toEqual([
      "Warm decline",
    ]);
    expect(
      catalog.kinds.find((k) => k.kind === "DECLINE")?.defaultTemplateId,
    ).toBe(made.value.id);
  });

  it("will not be archived while a stage sends it, and says how many", () => {
    const refused = archiveEmailTemplate(book, "etpl-1");
    expect(refused.ok).toBe(false);
    if (!refused.ok)
      expect(refused.error).toMatch(
        /^\d+ stages send this email\. Point them at another template, or at none, before archiving it\.$/,
      );
  });

  it("is archived once nothing sends it, and comes back", () => {
    const unused = ok<{ book: DemoBook; value: { id: string } }>(
      createEmailTemplate(book, draft),
    );
    const archived = ok<{ book: DemoBook; value: { archived: boolean } }>(
      archiveEmailTemplate(unused.book, unused.value.id),
    );
    expect(archived.value.archived).toBe(true);
    const archivedAgain = updateEmailTemplate(archived.book, unused.value.id, {
      name: "Renamed",
    });
    expect(archivedAgain.ok).toBe(false);
    const back = ok<{ value: { archived: boolean } }>(
      restoreEmailTemplate(archived.book, unused.value.id),
    );
    expect(back.value.archived).toBe(false);
  });

  it("is previewed with made-up details, or with a person's own", () => {
    const sample = previewDraft(
      book,
      {
        kind: "STAGE_UPDATE",
        subject: "{company_name}: hi",
        body: "Hi {candidate_first_name}",
      },
      () => null,
    );
    expect(sample).toMatchObject({
      valid: true,
      sample: true,
      subject: "Schull Technologies: hi",
      text: "Hi Ada",
    });
    const real = previewDraft(
      book,
      {
        kind: "INVITE",
        subject: "x",
        body: "At {interview_time}",
        applicationId: "app-1",
      },
      () => ({ candidate_first_name: "Bola" }),
    );
    expect(real.sample).toBe(false);
    expect(real.missing).toEqual(["interview_time"]);
  });
});

describe("stages", () => {
  it("send an email only if it exists and is not archived, and take it off with null", () => {
    expect(setStageEmail(book, "req-01:prescreen", "nope").ok).toBe(false);
    const set = ok<{ book: DemoBook }>(
      setStageEmail(book, "req-01:prescreen", "etpl-1"),
    );
    const named = stageSettings(set.book, "req-01", (id) => ({
      employeeId: id,
      userId: null,
      kind: "EMPLOYEE" as const,
      name: id,
      jobTitle: "",
    }));
    expect(
      named.find((s) => s.stageId === "req-01:prescreen")?.emailTemplateId,
    ).toBe("etpl-1");
    const cleared = ok<{ book: DemoBook }>(
      setStageEmail(set.book, "req-01:prescreen", null),
    );
    expect(
      stageSettings(cleared.book, "req-01", (id) => ({
        employeeId: id,
        userId: null,
        kind: "EMPLOYEE" as const,
        name: id,
        jobTitle: "",
      })).find((s) => s.stageId === "req-01:prescreen")?.emailTemplateId,
    ).toBeNull();
  });

  it("have a panel only when they are interview stages, of at most 20, with no repeats", () => {
    const refused = setStagePanel(book, "req-01:prescreen", ["p-01"]);
    expect(refused.ok).toBe(false);
    if (!refused.ok)
      expect(refused.error).toBe(
        '"Pre-screening" is not an interview stage, so it has no panel. Only an interview stage does.',
      );
    const many = Array.from({ length: 21 }, (_, n) => `p-${String(n)}`);
    const tooMany = setStagePanel(book, "req-01:interview", many);
    expect(tooMany.ok).toBe(false);
    const set = ok<{ book: DemoBook }>(
      setStagePanel(book, "req-01:interview", ["p-01", "p-02", "p-01"]),
    );
    const panel = stageSettings(set.book, "req-01", (id) => ({
      employeeId: id,
      userId: null,
      kind: "EMPLOYEE" as const,
      name: `Name ${id}`,
      jobTitle: "",
    })).find((s) => s.stageId === "req-01:interview")?.panel;
    expect(panel?.map((m) => m.employeeId)).toEqual(["p-01", "p-02"]);
  });

  it("show no panel at all for a stage that is not an interview", () => {
    const named = stageSettings(book, "req-01", (id) => ({
      employeeId: id,
      userId: null,
      kind: "EMPLOYEE" as const,
      name: id,
      jobTitle: "",
    }));
    expect(named.find((s) => s.type === "SCREENING")?.panel).toBeNull();
    expect(named.find((s) => s.type === "INTERVIEW")?.panel).not.toBeNull();
  });
});

describe("retention", () => {
  const closed = (
    id: string,
    candidateId: string,
    at: string,
    over: Partial<DemoApp> = {},
  ): DemoApp => ({
    ...inStage(book, "req-01:sourced"),
    id,
    candidateId,
    outcome: "REJECTED",
    talentPool: false,
    rejection: { label: "Over the band", note: null, at },
    ...over,
  });

  it("keeps everybody until a company chooses, and does not suggest a number", () => {
    expect(book.retention).toEqual({ months: null, setAt: null });
    const line = retentionLine(
      book,
      closed("x1", "cx1", "2026-01-10T09:00:00.000Z"),
    );
    expect(line).toEqual({ scheduledDeletionOn: null, reason: "none_set" });
    expect(retentionReport(book)).toMatchObject({
      months: null,
      purgeFrom: null,
      purgeActive: false,
      due: { candidates: 0 },
    });
  });

  it("takes whole months from 1 to 120, in the API's words", () => {
    expect(setRetention(book, 0)).toMatchObject({
      ok: false,
      error: "At least a month, or clear it to keep rejected candidates.",
    });
    expect(setRetention(book, 1.5)).toMatchObject({
      ok: false,
      error: "Months are a whole number.",
    });
    expect(setRetention(book, 121)).toMatchObject({
      ok: false,
      error: "Ten years is the longest this takes. Clear it to keep them.",
    });
    expect(setRetention(book, 12).ok).toBe(true);
  });

  it("starts a week of grace when the period is set, and clearing it clears the grace", () => {
    const set = ok<{ book: DemoBook }>(setRetention(book, 6));
    expect(set.book.retention.setAt).not.toBeNull();
    const report = retentionReport(set.book);
    expect(report.purgeFrom).toBe("2026-08-26");
    expect(report.purgeActive).toBe(false);
    const cleared = ok<{ book: DemoBook }>(setRetention(set.book, null));
    expect(cleared.book.retention).toEqual({ months: null, setAt: null });
  });

  it("says the day a record goes: the later of its own date and the end of the grace", () => {
    const six = ok<{ book: DemoBook }>(setRetention(book, 6)).book;
    const old = closed("x1", "cx1", "2026-01-10T09:00:00.000Z");
    /* Six months after 10 Jan is 10 Jul, already past: the grace decides. */
    expect(retentionLine({ ...six, apps: [...six.apps, old] }, old)).toEqual({
      scheduledDeletionOn: "2026-08-26",
      reason: null,
    });

    const twelve = ok<{ book: DemoBook }>(setRetention(book, 12)).book;
    expect(
      retentionLine({ ...twelve, apps: [...twelve.apps, old] }, old),
    ).toEqual({ scheduledDeletionOn: "2027-01-10", reason: null });
  });

  it("gives a reason, not a date, for the talent pool, somebody still in progress and a hire", () => {
    const six = ok<{ book: DemoBook }>(setRetention(book, 6)).book;
    const pooled = closed("x2", "cx2", "2026-01-10T09:00:00.000Z", {
      talentPool: true,
    });
    const active = inStage(six, "req-01:sourced");
    const hired = closed("x3", "cx3", "2026-01-10T09:00:00.000Z", {
      outcome: "HIRED",
    });
    const all = { ...six, apps: [...six.apps, pooled, hired] };
    expect(retentionLine(all, pooled).reason).toBe("talent_pool");
    expect(retentionLine(all, active).reason).toBe("still_active");
    expect(retentionLine(all, hired).reason).toBe("hired");
  });

  it("reports who is due, who becomes due, and who is kept on purpose", () => {
    const six = ok<{ book: DemoBook }>(setRetention(book, 6)).book;
    const apps: DemoApp[] = [
      closed("d1", "cd1", "2026-01-10T09:00:00.000Z"),
      closed("d2", "cd2", "2026-01-11T09:00:00.000Z"),
      /* Becomes due in the next 30 days. */
      closed("s1", "cs1", "2026-03-01T09:00:00.000Z"),
      /* Far from due. */
      closed("f1", "cf1", "2026-08-01T09:00:00.000Z"),
      /* Old enough, and kept. */
      closed("h1", "ch1", "2026-01-12T09:00:00.000Z", { talentPool: true }),
    ];
    const report = retentionReport({ ...six, apps });
    expect(report.due.candidates).toBe(2);
    expect(report.dueWithin30Days.candidates).toBe(1);
    expect(report.heldInTalentPool).toBe(1);
    expect(report.purgeActive).toBe(false);
  });
});
