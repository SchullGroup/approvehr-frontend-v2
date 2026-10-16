"use client";

import { ApiError } from "@/lib/api/client";
import type { ApiApplication } from "@/lib/api/careers";
import { demoBook, overlayQueue } from "@/lib/store/careers";
import { queueDecline } from "@/lib/hiring/pipeline/demo-ops";
import { demoPipeline, demoRun } from "@/lib/hiring/pipeline/demo-store";
import { assessmentTemplate, parseScoreCell } from "./assessment-file";
import {
  cleaned,
  validateCriteria,
  hasProblems,
  DEFAULT_SCALE,
  FALLBACK_WEIGHTS,
} from "./criteria";
import {
  DEMO_FORMULA,
  explain,
  fitOf,
  profileFor,
  suggestFrom,
} from "./demo-engine";
import {
  addAssessment,
  belowReasons,
  demoScreening,
  explanationFor,
  keepOp,
  passMarkOf,
  postingStateOf,
  rescoreAt,
  RESCORE_MS,
  saveCriteriaOp,
  savePassMarkOp,
  specialOf,
  summaryFor,
  type DemoPerson,
  type DemoScreeningBook,
  type ScoringContext,
} from "./demo-store";
import type { ScreeningGateway } from "./gateway";
import {
  NO_CRITERIA,
  type AssessmentCheck,
  type AssessmentRow,
  type BelowFilters,
  type BelowRow,
  type CriteriaView,
  type PassMarkCount,
  type ScreeningSubject,
} from "./model";

/**
 * The gateway for a demo: the screening book in this browser, answering in the
 * API's words.
 *
 * Refusals are thrown as `ApiError`, so a screen has one catch block whichever
 * side it is talking to.
 */

const NEVER_USED = [
  "Name, gender, age or date of birth",
  "A photograph",
  "Marital status, religion, tribe or state of origin",
  "Which school or which employer: education counts as a level only",
  "Anything else on the CV that is not written on the criteria",
];

/* ------------------------------------------------------------------- applicants */

type Row = { application: ApiApplication; person: DemoPerson; order: number };

/** An advert's applicants, in the demo's own order, as people the scorer knows. */
function applicantsOf(postingId: string): Row[] {
  const { applications } = demoBook();
  const all = overlayQueue(applications, demoPipeline.current().queue);
  const mine = all.filter((application) => application.postingId === postingId);
  return mine.map((application, order) => ({
    application,
    order,
    person: {
      id: application.id,
      applicationId: application.id,
      email: application.email,
      name: application.name,
      postingId: application.postingId,
      role: application.postingTitle,
      knockoutCount: application.knockoutCount ?? 0,
    },
  }));
}

const context = (postingId: string): ScoringContext => ({
  book: demoScreening.current(),
  now: Date.now(),
  total: applicantsOf(postingId).length,
});

function view(postingId: string): CriteriaView {
  const state = postingStateOf(demoScreening.current(), postingId);
  return {
    postingId,
    version: state.version,
    criteria: state.criteria ?? NO_CRITERIA,
    defaults: FALLBACK_WEIGHTS,
    scale: DEFAULT_SCALE,
    formula: DEMO_FORMULA,
    neverUsed: NEVER_USED,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedAt ? "Fatima Bello" : null,
  };
}

const waiting = (rows: Row[]): Row[] =>
  rows.filter((row) => row.application.status === "RECEIVED");

/* ------------------------------------------------------------------- below list */

function matchesBelow(
  row: Row,
  summary: ReturnType<typeof summaryFor>,
  mark: ReturnType<typeof passMarkOf>,
  filters: BelowFilters,
): boolean {
  const reasons = belowReasons(summary, mark);
  if (
    filters.reason &&
    !reasons.some((reason) => reason.kind === filters.reason)
  )
    return false;
  const words = (filters.q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  const haystack =
    `${row.application.name} ${row.application.email}`.toLowerCase();
  if (!words.every((word) => haystack.includes(word))) return false;
  const day = row.application.appliedAt.slice(0, 10);
  if (filters.from && day < filters.from) return false;
  if (filters.to && day > filters.to) return false;
  return true;
}

function belowRows(postingId: string, filters: BelowFilters): BelowRow[] {
  const ctx = context(postingId);
  const mark = passMarkOf(ctx.book, postingId);
  const out: BelowRow[] = [];
  for (const row of waiting(applicantsOf(postingId))) {
    const summary = summaryFor(ctx, row.person, row.order);
    if (!summary.belowPassMark) continue;
    if (!matchesBelow(row, summary, mark, filters)) continue;
    out.push({
      id: row.application.id,
      name: row.application.name,
      email: row.application.email,
      appliedAt: row.application.appliedAt,
      summary,
      reasons: belowReasons(summary, mark),
      flagged:
        summary.knockoutCount > 0
          ? mark.knockouts.slice(0, summary.knockoutCount).map((rule) => ({
              question: rule.question,
              answer: rule.flagWhen,
            }))
          : [],
    });
  }
  /* The clearest cases first: the lowest score at the top, and people with no
     score, who are below only for a flag, after them. */
  return out.sort(
    (a, b) =>
      (a.summary.fit.score ?? 1000) - (b.summary.fit.score ?? 1000) ||
      b.appliedAt.localeCompare(a.appliedAt) ||
      a.id.localeCompare(b.id),
  );
}

/* --------------------------------------------------------------------- the gateway */

const subjectEmail = (subject: ScreeningSubject): string | null => {
  if (subject.kind === "application") {
    return (
      demoBook().applications.find((a) => a.id === subject.id)?.email ?? null
    );
  }
  return (
    demoPipeline.current().apps.find((app) => app.id === subject.id)?.email ??
    null
  );
};

function subjectPerson(
  subject: ScreeningSubject,
): { person: DemoPerson; order: number | null } | null {
  if (subject.kind === "application") {
    const found = demoBook().applications.find((a) => a.id === subject.id);
    if (!found) return null;
    const rows = applicantsOf(found.postingId);
    const at = rows.find((row) => row.application.id === found.id);
    return at ? { person: at.person, order: at.order } : null;
  }
  const app = demoPipeline.current().apps.find((a) => a.id === subject.id);
  if (!app) return null;
  return {
    person: {
      id: app.id,
      applicationId: app.id,
      email: app.email,
      name: app.name,
      postingId: `demo-advert-${app.requisitionId}`,
      role:
        demoBook().postings.find((p) => p.requisitionId === app.requisitionId)
          ?.title ?? "A role",
      knockoutCount: app.flagged ? 1 : 0,
    },
    order: null,
  };
}

const refuse = (status: number, code: string, message: string): ApiError =>
  new ApiError(status, code, message);

export const demoScreeningGateway: ScreeningGateway = {
  mode: "demo",

  criteria: {
    get: async (postingId) => view(postingId),

    save: async (postingId, criteria, baseVersion) => {
      const draft = cleaned(criteria);
      if (hasProblems(validateCriteria(draft))) {
        throw refuse(
          400,
          "validation_failed",
          "These criteria are not complete. Fix what is marked, then save.",
        );
      }
      demoScreening.commit(
        saveCriteriaOp(
          demoScreening.current(),
          postingId,
          draft,
          baseVersion,
          Date.now(),
        ),
      );
      return view(postingId);
    },

    suggest: async (postingId) => {
      const posting = demoBook().postings.find((p) => p.id === postingId);
      return suggestFrom(posting?.description ?? "");
    },

    preview: async (postingId, criteria) => {
      const rows = applicantsOf(postingId);
      const state = postingStateOf(demoScreening.current(), postingId);
      const version = (state.version ?? 0) + 1;
      const bands = [0, 0, 0, 0, 0];
      let scored = 0;
      let waitingForText = 0;
      let noText = 0;
      const sample = rows.map((row) => {
        const explanation = explain(
          profileFor(row.person, specialOf(row.person.email)),
          cleaned(criteria),
          { version, currentVersion: version },
        );
        const fit = fitOf(explanation);
        if (fit.status === "SCORED" && fit.score !== null) {
          scored += 1;
          const band = Math.min(4, Math.floor(fit.score / 20));
          bands[band] = (bands[band] ?? 0) + 1;
        } else if (fit.status === "WAITING_FOR_TEXT") waitingForText += 1;
        else noText += 1;
        return { id: row.application.id, name: row.application.name, fit };
      });
      return {
        total: rows.length,
        rows: sample.slice(0, 20),
        scored,
        waitingForText,
        noText,
        bands,
      };
    },
  },

  rescore: {
    progress: async (postingId) => {
      const total = applicantsOf(postingId).length;
      return rescoreAt(
        postingStateOf(demoScreening.current(), postingId),
        total,
        Date.now(),
      );
    },
  },

  passMark: {
    get: async (postingId) => passMarkOf(demoScreening.current(), postingId),

    count: async (postingId, input) => {
      const ctx = context(postingId);
      const rows = waiting(applicantsOf(postingId));
      const byReason = { fit: 0, assessment: 0, knockout: 0 };
      let below = 0;
      let notScored = 0;
      for (const row of rows) {
        const summary = summaryFor(ctx, row.person, row.order);
        if (summary.fit.status !== "SCORED") notScored += 1;
        const reasons = belowReasons(summary, input);
        if (reasons.length > 0) below += 1;
        for (const reason of reasons) {
          if (reason.kind === "FIT") byReason.fit += 1;
          else if (reason.kind === "ASSESSMENT") byReason.assessment += 1;
          else byReason.knockout += 1;
        }
      }
      const count: PassMarkCount = {
        total: rows.length,
        below,
        byReason,
        notScored,
      };
      return count;
    },

    save: async (postingId, input) => {
      demoScreening.commit(
        savePassMarkOp(demoScreening.current(), postingId, input, Date.now()),
      );
      return passMarkOf(demoScreening.current(), postingId);
    },
  },

  explanation: async (subject) => {
    const found = subjectPerson(subject);
    if (!found) throw refuse(404, "not_found", "That application is not here.");
    const ctx = context(found.person.postingId);
    const explanation = explanationFor(ctx, found.person, found.order);
    const summary = summaryFor(ctx, found.person, found.order);
    const kept = ctx.book.kept[found.person.applicationId];
    return {
      ...explanation,
      standing: {
        below: summary.belowPassMark,
        reasons: summary.belowPassMark
          ? belowReasons(summary, passMarkOf(ctx.book, found.person.postingId))
          : [],
        kept: kept ? { reason: kept.reason, at: kept.at, by: "You" } : null,
      },
    };
  },

  /* A demo cannot read a file again: there is no file. */
  retryReading: null,

  assessment: {
    template: assessmentTemplate,

    check: async (postingId, filename, rows) => {
      const known = new Map<string, number>();
      for (const row of applicantsOf(postingId)) {
        const email = row.application.email.toLowerCase();
        known.set(email, (known.get(email) ?? 0) + 1);
      }
      const names = new Map(
        applicantsOf(postingId).map((row) => [
          row.application.email.toLowerCase(),
          row.application.name,
        ]),
      );
      const seen = new Set<string>();
      const checked: AssessmentRow[] = rows.map((input) => {
        const email = input.email.trim().toLowerCase();
        const base = {
          row: input.row,
          email: input.email.trim() || null,
          name: null as string | null,
          score: null as number | null,
          refusal: null as AssessmentRow["refusal"],
          message: null as string | null,
        };
        if (email === "")
          return {
            ...base,
            refusal: "blank_email",
            message: "There is no email in this row.",
          };
        const matches = known.get(email) ?? 0;
        if (matches === 0)
          return {
            ...base,
            refusal: "unmatched_email",
            message: "No applicant for this advert has that email.",
          };
        if (matches > 1)
          return {
            ...base,
            refusal: "ambiguous",
            message:
              "More than one application uses that email, so it is not clear whose score this is.",
          };
        if (seen.has(email))
          return {
            ...base,
            refusal: "duplicate_in_file",
            message:
              "This email is in the file twice. The first row is the one used.",
          };
        seen.add(email);
        const score = parseScoreCell(input.score);
        if (score === null)
          return {
            ...base,
            name: names.get(email) ?? null,
            refusal: "not_a_number",
            message: `"${input.score}" is not a score. Use a number such as 72 or 58.5.`,
          };
        if (score > 100)
          return {
            ...base,
            name: names.get(email) ?? null,
            score,
            refusal: "out_of_range",
            message: "Scores run from 0 to 100.",
          };
        return { ...base, name: names.get(email) ?? null, score };
      });
      const refused = checked.filter((row) => row.refusal !== null).length;
      const check: AssessmentCheck = {
        filename,
        token: JSON.stringify(rows),
        total: checked.length,
        usable: checked.length - refused,
        refused,
        max: 100,
        rows: checked,
      };
      return check;
    },

    commit: async (postingId, check, rows) => {
      if (check.token !== JSON.stringify(rows)) {
        throw refuse(
          409,
          "conflict",
          "The file is not the one that was checked. Check it again.",
        );
      }
      let book: DemoScreeningBook = demoScreening.current();
      const before = belowCount(postingId);
      let saved = 0;
      for (const row of check.rows) {
        if (row.refusal !== null || row.score === null || row.email === null)
          continue;
        book = addAssessment(book, row.email, {
          id: `imp-${String(Date.now())}-${String(row.row)}`,
          at: new Date().toISOString(),
          by: "You",
          source: "IMPORT",
          filename: check.filename,
          score: row.score,
          note: null,
        });
        saved += 1;
      }
      demoScreening.commit(book);
      const after = belowCount(postingId);
      return {
        saved,
        refused: check.refused,
        movedBelow: Math.max(0, after - before),
      };
    },

    enter: async (subject, score, note) => {
      const email = subjectEmail(subject);
      if (!email)
        throw refuse(404, "not_found", "That application is not here.");
      if (!Number.isFinite(score) || score < 0 || score > 100)
        throw refuse(400, "validation_failed", "Scores run from 0 to 100.");
      demoScreening.commit(
        addAssessment(demoScreening.current(), email, {
          id: `man-${String(Date.now())}`,
          at: new Date().toISOString(),
          by: "You",
          source: "MANUAL",
          filename: null,
          score,
          note,
        }),
      );
    },

    history: async (subject) => {
      const email = subjectEmail(subject);
      if (!email) return [];
      const entries =
        demoScreening.current().assessments[email.toLowerCase()] ?? [];
      return [...entries].reverse();
    },
  },

  below: {
    count: async (postingId) => {
      const rows = waiting(applicantsOf(postingId));
      return { below: belowRows(postingId, {}).length, total: rows.length };
    },

    list: async (query) => {
      const all = belowRows(query.postingId, query.filters);
      const start = query.cursor ? Number(query.cursor) : 0;
      const page = all.slice(start, start + query.pageSize);
      const end = start + page.length;
      return {
        rows: page,
        total: all.length,
        next: end < all.length ? String(end) : null,
      };
    },

    reject: async ({ target, decision, onProgress }) => {
      const ids =
        target.kind === "ids"
          ? target.ids
          : (() => {
              const found = belowRows(target.postingId, target.filters).map(
                (row) => row.id,
              );
              if (found.length !== target.expected) {
                throw refuse(
                  409,
                  "conflict",
                  `The list changed while you were choosing: it was ${target.expected.toLocaleString("en-NG")} people and is now ${found.length.toLocaleString("en-NG")}. Nothing was done. Check the filters and select again.`,
                );
              }
              return found;
            })();
      const reason =
        demoPipeline.current().reasons.find((r) => r.id === decision.reasonId)
          ?.label ?? "No reason given";
      const text = decision.note ? `${reason}: ${decision.note}` : reason;
      const refused: { id: string; name: string; reason: string }[] = [];
      let done = 0;
      let skipped = 0;
      onProgress({ done: 0, total: ids.length });
      for (const id of ids) {
        const name =
          demoBook().applications.find((a) => a.id === id)?.name ?? "Someone";
        const result = demoRun((book) => queueDecline(book, id, text));
        if (result.ok) done += 1;
        else if (/already/.test(result.error)) skipped += 1;
        else refused.push({ id, name, reason: result.error });
        onProgress({
          done: done + skipped + refused.length,
          total: ids.length,
        });
        await Promise.resolve();
      }
      return {
        requested: ids.length,
        done,
        skipped,
        refused,
        emailed: decision.sendEmails ? 0 : null,
        emailNote: decision.sendEmails
          ? "Nothing was sent: a practice board has no mail."
          : null,
      };
    },

    keep: async (applicationId, reason) => {
      const trimmed = reason.trim();
      if (trimmed.length < 3)
        throw refuse(
          400,
          "validation_failed",
          "Say in a few words why they stay in the running.",
        );
      demoScreening.commit(
        keepOp(demoScreening.current(), applicationId, trimmed, Date.now()),
      );
    },
  },
};

/** How many waiting applicants are below the pass mark now. */
function belowCount(postingId: string): number {
  return belowRows(postingId, {}).length;
}

export { RESCORE_MS };
