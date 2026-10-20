"use client";

import { ApiError } from "@/lib/api/client";
import type { ApiApplication } from "@/lib/api/careers";
import { demoBook, overlayQueue } from "@/lib/store/careers";
import { queueDecline } from "@/lib/hiring/pipeline/demo-ops";
import { demoPipeline, demoRun } from "@/lib/hiring/pipeline/demo-store";
import {
  assessmentTemplate,
  numberOf,
  parseScoreCell,
} from "./assessment-file";
import {
  cleaned,
  validateCriteria,
  hasProblems,
  isEmptyCriteria,
  DEFAULT_SCALE,
  FALLBACK_WEIGHTS,
} from "./criteria";
import { demoNow, demoStamp } from "./demo-clock";
import {
  explain,
  fitOf,
  profileFor,
  reasonsLine,
  suggestFrom,
} from "./demo-engine";
import { FORMULA_LINE } from "./score";
import {
  addAssessment,
  assessmentOf,
  belowReasons,
  currentResults,
  DEFAULT_TEST,
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
  testKeyOf,
  testsAmong,
  type DemoPerson,
  type DemoScreeningBook,
  type ScoringContext,
} from "./demo-store";
import type { AssessmentRowInput, ScreeningGateway } from "./gateway";
import {
  NO_CRITERIA,
  type AssessmentCheck,
  type AssessmentEntry,
  type AssessmentFileOptions,
  type AssessmentRow,
  type PassMark,
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

/** How many applicants a preview is tried on. */
const PREVIEW_SAMPLE = 20;

const NEVER_USED = [
  "name",
  "gender",
  "age or date of birth",
  "marital status",
  "nationality",
  "photo",
  "religion",
  "disability",
  "address (beyond the location you ask for)",
  "institution names or rankings",
  "gaps in employment",
  "email address or phone number, or their domain",
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
  now: demoNow(),
  total: applicantsOf(postingId).length,
});

function view(postingId: string): CriteriaView {
  const state = postingStateOf(demoScreening.current(), postingId);
  return {
    postingId,
    version: state.version,
    configured: state.criteria !== null && !isEmptyCriteria(state.criteria),
    criteria: state.criteria ?? NO_CRITERIA,
    defaults: FALLBACK_WEIGHTS,
    scale: DEFAULT_SCALE,
    formula: FORMULA_LINE,
    formQuestions: [],
    neverUsed: NEVER_USED,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedAt && DEMO_ENABLED ? "Fatima Bello" : null,
  };
}

const waiting = (rows: Row[]): Row[] =>
  rows.filter((row) => row.application.status === "RECEIVED");

/** The pass mark as saved, with the tests that have a result on this advert. */
function passMarkView(postingId: string): PassMark {
  const book = demoScreening.current();
  return passMarkOf(
    book,
    postingId,
    testsAmong(
      book,
      applicantsOf(postingId).map((row) => row.application.email),
    ),
  );
}

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
  /* Everybody here is waiting: a practice board keeps nobody on the list once they are screened in. */
  if (filters.state === "IN_PIPELINE") return false;
  const words = (filters.q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  const haystack =
    `${row.application.name} ${row.application.email}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
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
        mark.flagKnockouts && summary.knockoutCount > 0
          ? mark.knockouts.slice(0, summary.knockoutCount).map((rule) => ({
              question: rule.question,
              answer: rule.flagWhen,
            }))
          : [],
      state: "WAITING",
      stage: null,
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

/* ---------------------------------------------------------- reading an assessment file */

/** A result a file or a form would write, once it is known whose it is. */
type Write = {
  email: string;
  test: string;
  score: number;
  max: number | null;
  percent: number;
  takenOn: string | null;
};

const DAY_ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_UK = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** `2026-10-12` or `12/10/2026`, as a day, or `null` when it is not one. */
function dayOf(text: string): string | null | "bad" {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (DAY_ISO.test(trimmed)) return trimmed;
  const uk = DAY_UK.exec(trimmed);
  if (!uk) return "bad";
  const [, d, m, y] = uk;
  return `${y ?? ""}-${(m ?? "").padStart(2, "0")}-${(d ?? "").padStart(2, "0")}`;
}

/** A mark and what it is out of, as a percentage, or the sentence saying why not. */
function percentOf(
  score: number,
  max: number | null,
): { ok: true; percent: number } | { ok: false; problem: string } {
  if (max !== null) {
    if (max <= 0)
      return { ok: false, problem: "The maximum has to be more than zero." };
    if (score > max)
      return {
        ok: false,
        problem: `${String(score)} is more than the maximum of ${String(max)}.`,
      };
    return { ok: true, percent: Math.round((score / max) * 1000) / 10 };
  }
  if (score > 100)
    return {
      ok: false,
      problem: `${String(score)} is over 100 and no maximum was given, so it cannot be read as a percentage. Give the maximum the mark is out of.`,
    };
  return { ok: true, percent: score };
}

/**
 * Whose each row is and what it would do, and the writes that would follow.
 *
 * One function for the check and the commit, so the commit can only ever do what
 * the check said.
 */
function evaluate(
  postingId: string,
  rows: readonly AssessmentRowInput[],
  options: AssessmentFileOptions,
): { rows: AssessmentRow[]; writes: Write[] } {
  const people = applicantsOf(postingId);
  const byEmail = new Map<string, Row[]>();
  const byReference = new Map<string, Row[]>();
  for (const person of people) {
    const email = person.application.email.toLowerCase();
    byEmail.set(email, [...(byEmail.get(email) ?? []), person]);
    const ref = (person.application.reference ?? "").toUpperCase();
    if (ref) byReference.set(ref, [...(byReference.get(ref) ?? []), person]);
  }
  const book = demoScreening.current();
  const defaultTest = options.test.trim() || DEFAULT_TEST;
  const seen = new Map<string, { score: number; max: number | null }>();
  const writes: Write[] = [];

  const checked = rows.map((input): AssessmentRow => {
    const email = input.email.trim().toLowerCase();
    const reference = input.reference.trim().toUpperCase();
    const base: AssessmentRow = {
      row: input.row,
      email: input.email.trim() || input.reference.trim() || null,
      name: null,
      score: null,
      max: null,
      refusal: null,
      message: null,
      effect: null,
    };
    const refuse = (
      refusal: NonNullable<AssessmentRow["refusal"]>,
      message: string,
    ): AssessmentRow => ({ ...base, refusal, message });

    if (email === "" && reference === "")
      return refuse(
        "blank_email",
        "There is no email or reference in this row.",
      );
    const fromEmail = email === "" ? null : (byEmail.get(email) ?? []);
    const fromReference =
      reference === "" ? null : (byReference.get(reference) ?? []);
    if (fromEmail !== null && fromEmail.length === 0)
      return refuse(
        "unmatched_email",
        "No applicant for this advert has that email.",
      );
    if (fromReference !== null && fromReference.length === 0)
      return refuse(
        "refused",
        "No applicant for this advert has that reference.",
      );
    if ((fromEmail?.length ?? 0) > 1)
      return refuse(
        "ambiguous",
        "More than one application uses that email, so it is not clear whose score this is.",
      );
    const person = fromEmail?.[0] ?? fromReference?.[0];
    if (!person)
      return refuse(
        "blank_email",
        "There is no email or reference in this row.",
      );
    if (
      fromEmail?.[0] &&
      fromReference?.[0] &&
      fromEmail[0] !== fromReference[0]
    )
      return refuse(
        "refused",
        "The email and the reference point at different applicants.",
      );
    const named = { ...base, name: person.application.name };

    const cell = parseScoreCell(input.score);
    if (cell === null)
      return {
        ...named,
        refusal: "not_a_number",
        message: `"${input.score}" is not a score. Use a number such as 72, 58.5 or 42/60.`,
      };
    const maxCell = input.max.trim() === "" ? null : numberOf(input.max);
    if (input.max.trim() !== "" && maxCell === null)
      return {
        ...named,
        score: cell.score,
        refusal: "not_a_number",
        message: `"${input.max}" is not a number. Say what the test was marked out of, such as 60.`,
      };
    const max = maxCell ?? cell.max;
    const marked = percentOf(cell.score, max);
    if (!marked.ok)
      return {
        ...named,
        score: cell.score,
        max,
        refusal: "out_of_range",
        message: marked.problem,
      };
    const day = dayOf(input.date);
    if (day === "bad")
      return {
        ...named,
        score: cell.score,
        max,
        refusal: "refused",
        message: "Use a date such as 2026-10-16.",
      };

    const test = input.test.trim() || defaultTest;
    const slot = `${person.application.id}|${testKeyOf(test)}`;
    const earlier = seen.get(slot);
    if (earlier) {
      return earlier.score === cell.score && earlier.max === max
        ? {
            ...named,
            score: cell.score,
            max,
            effect: "unchanged",
            message: "The same mark is on an earlier row, so it is saved once.",
          }
        : {
            ...named,
            score: cell.score,
            max,
            refusal: "duplicate_in_file",
            message:
              "This person has two different marks for this test in the file. The first row is the one used.",
          };
    }
    seen.set(slot, { score: cell.score, max });

    const current = currentResults(
      book.assessments[person.application.email.toLowerCase()] ?? [],
    ).find((result) => testKeyOf(result.test) === testKeyOf(test));
    const effect =
      current === undefined
        ? "new"
        : current.score === cell.score && current.max === max
          ? "unchanged"
          : "replaces";
    if (effect !== "unchanged")
      writes.push({
        email: person.application.email,
        test,
        score: cell.score,
        max,
        percent: marked.percent,
        takenOn: day,
      });
    return { ...named, score: cell.score, max, effect };
  });
  return { rows: checked, writes };
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
  supports: {
    passMark: true,
    assessment: true,
    below: true,
    board: true,
    boardSort: true,
    boardStatus: true,
    belowState: false,
    sorts: [
      "newest",
      "fit-desc",
      "fit-asc",
      "assessment-desc",
      "knockouts-desc",
    ],
  },

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
          demoNow(),
        ),
      );
      return view(postingId);
    },

    suggest: async (postingId) => {
      const posting = demoBook().postings.find((p) => p.id === postingId);
      return suggestFrom(posting?.description ?? "", posting?.location ?? null);
    },

    preview: async (postingId, criteria) => {
      const rows = applicantsOf(postingId);
      const ctx = context(postingId);
      const state = postingStateOf(ctx.book, postingId);
      const version = (state.version ?? 0) + 1;
      /* A CV nobody has read has no words to try a draft on. */
      const readable = rows.filter((row) => !specialOf(row.person.email));
      const sample = readable.slice(0, PREVIEW_SAMPLE);
      const bands = Array.from({ length: 10 }, () => 0);
      let scored = 0;
      const items = sample.map((row) => {
        const explanation = explain(
          profileFor(row.person, specialOf(row.person.email)),
          cleaned(criteria),
          { version, currentVersion: version },
        );
        const next = fitOf(explanation).score;
        if (next !== null) {
          scored += 1;
          const band = Math.min(9, Math.floor(next / 10));
          bands[band] = (bands[band] ?? 0) + 1;
        }
        const current = fitOf(explanationFor(ctx, row.person, row.order)).score;
        return {
          id: row.application.id,
          name: row.application.name,
          current,
          next,
          change: current !== null && next !== null ? next - current : null,
          reasons: next === null ? null : reasonsLine(explanation),
        };
      });
      const scores = items.flatMap((item) =>
        item.next === null ? [] : [item.next],
      );
      return {
        available: readable.length,
        sampled: items.length,
        rows: items,
        scored,
        notScorable: items.length - scored,
        mean:
          scores.length === 0
            ? null
            : Math.round(
                (scores.reduce((sum, value) => sum + value, 0) /
                  scores.length) *
                  10,
              ) / 10,
        bands,
      };
    },
  },

  rescore: {
    start: null,
    progress: async (postingId) => {
      const total = applicantsOf(postingId).length;
      return rescoreAt(
        postingStateOf(demoScreening.current(), postingId),
        total,
        demoNow(),
      );
    },
  },

  passMark: {
    get: async (postingId) => passMarkView(postingId),

    count: async (postingId, input) => {
      const ctx = context(postingId);
      const rows = waiting(applicantsOf(postingId));
      const byReason = { fit: 0, assessment: 0, knockout: 0 };
      let below = 0;
      let kept = 0;
      let notScored = 0;
      let noAssessment = 0;
      for (const row of rows) {
        const saved = summaryFor(ctx, row.person, row.order);
        /* The draft may read another test, so the figure is read again for it. */
        const summary = {
          ...saved,
          assessment: assessmentOf(
            ctx.book,
            row.application.email,
            input.assessmentTest,
          ),
        };
        if (summary.fit.status !== "SCORED") notScored += 1;
        if (input.assessmentMin !== null && summary.assessment === null)
          noAssessment += 1;
        const reasons = belowReasons(summary, input);
        if (reasons.length === 0) continue;
        if (ctx.book.kept[row.application.id] !== undefined) {
          kept += 1;
          continue;
        }
        below += 1;
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
        noAssessment,
        kept,
      };
      return count;
    },

    save: async (postingId, input) => {
      demoScreening.commit(
        savePassMarkOp(demoScreening.current(), postingId, input, demoNow()),
      );
      return passMarkView(postingId);
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

    check: async (postingId, filename, rows, options) => {
      const { rows: checked } = evaluate(postingId, rows, options);
      const usable = checked.filter((row) => row.refusal === null);
      const check: AssessmentCheck = {
        filename,
        token: JSON.stringify([rows, options]),
        total: checked.length,
        usable: usable.length,
        refused: checked.length - usable.length,
        replacing: usable.filter((row) => row.effect === "replaces").length,
        unchanged: usable.filter((row) => row.effect === "unchanged").length,
        rows: checked,
      };
      return check;
    },

    commit: async (postingId, check, rows, options) => {
      if (check.token !== JSON.stringify([rows, options])) {
        throw refuse(
          409,
          "conflict",
          "The file is not the one that was checked. Check it again.",
        );
      }
      const { rows: checked, writes } = evaluate(postingId, rows, options);
      let book: DemoScreeningBook = demoScreening.current();
      const before = belowCount(postingId);
      writes.forEach((write, index) => {
        book = addAssessment(book, write.email, {
          id: `imp-${String(demoNow())}-${String(index)}`,
          at: demoStamp(),
          by: "You",
          source: "IMPORT",
          test: write.test,
          score: write.score,
          max: write.max,
          percent: write.percent,
          takenOn: write.takenOn,
          cleared: false,
        });
      });
      demoScreening.commit(book);
      const after = belowCount(postingId);
      const usable = checked.filter((row) => row.refusal === null);
      return {
        saved: writes.length,
        unchanged: usable.length - writes.length,
        refused: checked.length - usable.length,
        movedBelow: Math.max(0, after - before),
      };
    },

    enter: async (subject, input) => {
      const email = subjectEmail(subject);
      if (!email)
        throw refuse(404, "not_found", "That application is not here.");
      const test =
        (input.test ?? "").replace(/\s+/g, " ").trim() || DEFAULT_TEST;
      if (test.length > 80)
        throw refuse(
          400,
          "validation_failed",
          "Name the test in up to 80 characters.",
        );
      if (!Number.isFinite(input.score) || input.score < 0)
        throw refuse(400, "validation_failed", "A mark cannot be negative.");
      const marked = percentOf(input.score, input.max);
      if (!marked.ok) throw refuse(400, "validation_failed", marked.problem);
      const day = input.takenOn === null ? null : dayOf(input.takenOn);
      if (day === "bad")
        throw refuse(
          400,
          "validation_failed",
          "Use a date such as 2026-10-16.",
        );
      demoScreening.commit(
        addAssessment(demoScreening.current(), email, {
          id: `man-${String(demoNow())}`,
          at: demoStamp(),
          by: "You",
          source: "MANUAL",
          test,
          score: input.score,
          max: input.max,
          percent: marked.percent,
          takenOn: day,
          cleared: false,
        }),
      );
    },

    history: async (subject) => {
      const email = subjectEmail(subject);
      if (!email) return { current: [], entries: [] };
      const entries: AssessmentEntry[] =
        demoScreening.current().assessments[email.toLowerCase()] ?? [];
      return {
        current: currentResults(entries),
        entries: [...entries].reverse(),
      };
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
        keepOp(demoScreening.current(), applicationId, trimmed, demoNow()),
      );
    },
  },
};

/** How many waiting applicants are below the pass mark now. */
function belowCount(postingId: string): number {
  return belowRows(postingId, {}).length;
}

export { RESCORE_MS };
