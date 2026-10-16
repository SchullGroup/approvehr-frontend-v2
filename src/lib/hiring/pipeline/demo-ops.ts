import { TODAY } from "@/lib/today";
import type { ApplicationOutcome } from "@/lib/api/recruitment";
import { columnsFor } from "./columns";
import { referenceFor } from "./reference";
import { cardMatches } from "./filters";
import type { DemoComms } from "@/lib/hiring/comms/state";
import type { MoveResult } from "@/lib/hiring/comms/model";
import { owe, retentionLine, scoreFor } from "./demo-comms-ops";
import { cardScreening } from "@/lib/hiring/screening/demo-queue";
import { compareBySort } from "@/lib/hiring/screening/score";
import { REQUISITIONS } from "@/lib/mock/hiring";
import type {
  BoardCard,
  BoardData,
  BoardFilters,
  BoardStage,
  BulkAction,
  BulkOutcome,
  BulkRefusal,
  ColumnPage,
  ColumnQuery,
  PipelineTemplate,
  RejectionReason,
  Tag,
  TalentEntry,
  TalentPage,
  TalentQuery,
} from "./model";
import type { StageType } from "./stage-types";
import {
  isValid,
  validateTemplate,
  type TemplateStage,
} from "./template-rules";

/**
 * The demo's pipeline, as plain functions over a plain object.
 *
 * A demo has no server, but the screens must still be something a person can try
 * on a laptop with no network: drag a card, reject with a reason, tag forty
 * people, edit a template. So the demo keeps a **book** in this browser and these
 * functions answer the questions the API would, in the sentences the API would
 * use, so the demo cannot show a flow the real one would refuse.
 *
 * Pure on purpose. Every function takes the book and returns the next one — it
 * never reads storage, the clock or a store — so each rule is a unit test and the
 * persisting wrapper in `demo-store.ts` is the only thing that touches a browser.
 *
 * Nothing here is imported by a screen: `demo-gateway.ts` is the one caller.
 */

/** "Now" in the demo. The seed is a fixed snapshot, so the clock is fixed too. */
export const DEMO_NOW = `${TODAY}T09:00:00.000Z`;

export type DemoStage = BoardStage & {
  requisitionId: string;
  type: StageType;
  /** The email a person moving somebody into the stage sends. */
  emailTemplateId?: string | null;
  /** Employee ids on an interview stage's panel. */
  panel?: string[];
};

export type DemoEvent = {
  id: string;
  kind: "SCREENED_IN" | "STAGE_MOVED" | "REJECTED" | "WITHDRAWN" | "HIRED";
  fromStage: string | null;
  toStage: string | null;
  note: string | null;
  at: string;
  by: string;
};

export type DemoApp = {
  id: string;
  requisitionId: string;
  candidateId: string;
  name: string;
  email: string;
  reference: string;
  source: string | null;
  flagged: boolean;
  duplicate: boolean;
  tagIds: string[];
  talentPool: boolean;
  stageId: string;
  /** ISO instant they entered the pipeline: the order lists are kept in. */
  createdAt: string;
  stageEnteredAt: string;
  outcome: ApplicationOutcome;
  rejection: { label: string; note: string | null; at: string } | null;
  history: DemoEvent[];
};

export type DemoTemplate = PipelineTemplate;

export type DemoQueueEntry = {
  declined?: { reason: string; at: string };
  /** Screened in: the pipeline application they became, or already were. */
  advanced?: { appId: string; at: string };
  tagIds?: string[];
};

export type DemoBook = DemoComms & {
  stages: DemoStage[];
  apps: DemoApp[];
  tags: Tag[];
  reasons: RejectionReason[];
  templates: DemoTemplate[];
  /** What was done in the application queue, kept beside the seeded rows. */
  queue: Record<string, DemoQueueEntry>;
  /** Applications with an interview nobody has scored: they cannot leave it. */
  unscored: string[];
};

export type Op<T = undefined> =
  { ok: true; book: DemoBook; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
});

const ACTIVE: ApplicationOutcome[] = ["IN_PROGRESS", "OFFER_MADE"];

/* ------------------------------------------------------------------- reading */

export function stagesOf(book: DemoBook, requisitionId: string): DemoStage[] {
  return book.stages
    .filter((stage) => stage.requisitionId === requisitionId)
    .sort((a, b) => a.order - b.order);
}

export function cardOf(book: DemoBook, app: DemoApp): BoardCard {
  const stage = book.stages.find((s) => s.id === app.stageId);
  return {
    id: app.id,
    candidateId: app.candidateId,
    name: app.name,
    email: app.email,
    reference: app.reference,
    source: app.source,
    flagged: app.flagged,
    duplicate: app.duplicate,
    tags: app.tagIds
      .map((id) => book.tags.find((tag) => tag.id === id))
      .filter((tag): tag is Tag => tag !== undefined),
    talentPool: app.talentPool,
    stageId: app.stageId,
    stageName: stage?.name ?? null,
    stageEnteredAt: app.stageEnteredAt,
    outcome: app.outcome,
    rejectionReason: app.rejection
      ? app.rejection.note
        ? `${app.rejection.label}. ${app.rejection.note}`
        : app.rejection.label
      : null,
    score: scoreFor(app.id),
    screening: cardScreening({
      id: app.id,
      email: app.email,
      name: app.name,
      requisitionId: app.requisitionId,
      roleTitle:
        REQUISITIONS.find((role) => role.id === app.requisitionId)?.title ??
        "A role",
      knockoutCount: app.flagged ? 1 : 0,
    }),
    scheduledDeletionOn:
      app.outcome === "REJECTED" || app.outcome === "WITHDRAWN"
        ? retentionLine(book, app).scheduledDeletionOn
        : null,
  };
}

/**
 * Whether an application belongs in a column.
 *
 * A stage people pass through holds the people still in the process who are in
 * it. The two end columns are read by outcome: Hired is whoever was hired, and
 * Rejected is whoever was rejected or withdrew — whether the column is a stage of
 * that type or stands alone for a pipeline that has none.
 */
function inColumn(book: DemoBook, app: DemoApp, column: string): boolean {
  if (column === "outcome:HIRED") return app.outcome === "HIRED";
  if (column === "outcome:REJECTED")
    return app.outcome === "REJECTED" || app.outcome === "WITHDRAWN";
  if (!column.startsWith("stage:")) return false;
  const stageId = column.slice("stage:".length);
  const stage = book.stages.find((s) => s.id === stageId);
  if (stage?.type === "HIRED") return app.outcome === "HIRED";
  if (stage?.type === "REJECTED")
    return app.outcome === "REJECTED" || app.outcome === "WITHDRAWN";
  return app.stageId === stageId && ACTIVE.includes(app.outcome);
}

/** Newest first: the order a recruiter works a list in. */
const newestFirst = (a: DemoApp, b: DemoApp): number =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

function matching(
  book: DemoBook,
  requisitionId: string,
  column: string,
  filters: BoardFilters,
): DemoApp[] {
  const found = book.apps
    .map((app) => ({ app, card: cardOf(book, app) }))
    .filter(({ app, card }) => {
      if (app.requisitionId !== requisitionId) return false;
      if (!inColumn(book, app, column)) return false;
      return cardMatches(card, filters, app.createdAt.slice(0, 10));
    });
  const sort = filters.sort;
  if (sort && sort !== "newest") {
    return found
      .sort((a, b) =>
        a.card.screening && b.card.screening
          ? compareBySort(
              sort,
              { summary: a.card.screening, at: a.app.createdAt, id: a.app.id },
              { summary: b.card.screening, at: b.app.createdAt, id: b.app.id },
            )
          : newestFirst(a.app, b.app),
      )
      .map(({ app }) => app);
  }
  return found.map(({ app }) => app).sort(newestFirst);
}

/** Every id a filter matches. What "select everyone matching these" works from. */
export function idsMatching(
  book: DemoBook,
  requisitionId: string,
  column: string,
  filters: BoardFilters,
): string[] {
  return matching(book, requisitionId, column, filters).map((app) => app.id);
}

/** A keyset cursor, like the API's: where the last row was, not how many. */
const encodeCursor = (app: DemoApp): string => `${app.createdAt}|${app.id}`;

export function queryCards(book: DemoBook, query: ColumnQuery): ColumnPage {
  const all = matching(book, query.requisitionId, query.column, query.filters);
  let start = 0;
  if (query.cursor) {
    const at = query.cursor;
    start = all.findIndex((app) => encodeCursor(app) === at);
    start = start === -1 ? all.length : start + 1;
  }
  const page = all.slice(start, start + query.pageSize);
  const last = page.at(-1);
  return {
    cards: page.map((app) => cardOf(book, app)),
    total: all.length,
    next: last && start + page.length < all.length ? encodeCursor(last) : null,
  };
}

/* -------------------------------------------------------------------- writes */

const nextId = (prefix: string, existing: readonly string[]): string => {
  let n = existing.length + 1;
  while (existing.includes(`${prefix}-${String(n)}`)) n += 1;
  return `${prefix}-${String(n)}`;
};

function replaceApp(book: DemoBook, next: DemoApp): DemoBook {
  return {
    ...book,
    apps: book.apps.map((app) => (app.id === next.id ? next : app)),
  };
}

const eventId = (app: DemoApp): string =>
  `${app.id}-e${String(app.history.length + 1)}`;

export function moveApp(
  book: DemoBook,
  id: string,
  stageId: string,
  sendEmail = false,
): Op<MoveResult> {
  const app = book.apps.find((a) => a.id === id);
  if (!app) return fail("That application is not here any more.");
  const to = book.stages.find((s) => s.id === stageId);
  if (!to || to.requisitionId !== app.requisitionId)
    return fail("That stage is not part of this role's pipeline.");
  if (!ACTIVE.includes(app.outcome))
    return fail(
      `${app.name} is no longer in the process, so they cannot be moved.`,
    );
  if (app.stageId === stageId)
    return { ok: true, book, value: { email: null } };
  if (to.type === "HIRED")
    return fail(
      "Nobody is moved into Hired directly. Make an offer and record that they accepted it.",
    );
  if (to.type === "REJECTED")
    return fail("Use Reject to move somebody here, so a reason is recorded.");

  const from = book.stages.find((s) => s.id === app.stageId);
  if (from?.requiresScorecards && book.unscored.includes(app.id)) {
    return fail(
      `${app.name} has an interview with no scorecard yet. Submit it before they leave ${from.name}.`,
    );
  }

  const moved: DemoApp = {
    ...app,
    stageId,
    stageEnteredAt: DEMO_NOW,
    history: [
      ...app.history,
      {
        id: eventId(app),
        kind: "STAGE_MOVED",
        fromStage: from?.name ?? null,
        toStage: to.name,
        note: null,
        at: DEMO_NOW,
        by: "You",
      },
    ],
  };
  const placed = replaceApp(book, moved);
  /* A person moved them, and said to tell them: that is the one occasion a stage's
     message is owed. Nothing is owed unless the stage has one. */
  const template = sendEmail
    ? book.emailTemplates.find(
        (t) => t.id === to.emailTemplateId && !t.archived,
      )
    : undefined;
  if (!template) return { ok: true, book: placed, value: { email: null } };
  const owed = owe(placed, moved, {
    kind: template.kind,
    trigger: "STAGE_ENTRY",
    stageName: to.name,
    templateId: template.id,
  });
  return { ok: true, book: owed.book, value: { email: owed.notice } };
}

export function rejectApp(
  book: DemoBook,
  id: string,
  reasonId: string,
  note: string | null,
  sendEmail = false,
): Op<MoveResult> {
  const app = book.apps.find((a) => a.id === id);
  if (!app) return fail("That application is not here any more.");
  const reason = book.reasons.find((r) => r.id === reasonId);
  if (!reason) return fail("Choose one of the company's reasons.");
  if (!reason.active)
    return fail(`"${reason.label}" is switched off. Choose another reason.`);
  if (!ACTIVE.includes(app.outcome))
    return fail(`${app.name} is no longer in the process.`);

  const end = book.stages.find(
    (s) => s.requisitionId === app.requisitionId && s.type === "REJECTED",
  );
  const from = book.stages.find((s) => s.id === app.stageId);
  const rejected: DemoApp = {
    ...app,
    outcome: "REJECTED",
    stageId: end?.id ?? app.stageId,
    stageEnteredAt: DEMO_NOW,
    rejection: {
      label: reason.label,
      note: note?.trim() ? note.trim() : null,
      at: DEMO_NOW,
    },
    history: [
      ...app.history,
      {
        id: eventId(app),
        kind: "REJECTED",
        fromStage: from?.name ?? null,
        toStage: end?.name ?? from?.name ?? null,
        note: note?.trim() ? note.trim() : reason.label,
        at: DEMO_NOW,
        by: "You",
      },
    ],
  };
  const placed = replaceApp(book, rejected);
  /* Nothing is sent because somebody was rejected: only when the person said so. */
  if (!sendEmail) return { ok: true, book: placed, value: { email: null } };
  const owed = owe(placed, rejected, {
    kind: "DECLINE",
    trigger: "REJECTION",
    stageName: from?.name ?? null,
    templateId: null,
  });
  return { ok: true, book: owed.book, value: { email: owed.notice } };
}

export function setTagged(
  book: DemoBook,
  id: string,
  tagId: string,
  on: boolean,
): Op {
  const app = book.apps.find((a) => a.id === id);
  if (!app) return fail("That application is not here any more.");
  if (!book.tags.some((t) => t.id === tagId))
    return fail("That tag has been removed.");
  const has = app.tagIds.includes(tagId);
  if (on === has) return { ok: true, book, value: undefined };
  return {
    ok: true,
    book: replaceApp(book, {
      ...app,
      tagIds: on
        ? [...app.tagIds, tagId]
        : app.tagIds.filter((existing) => existing !== tagId),
    }),
    value: undefined,
  };
}

export function setTalentPool(book: DemoBook, id: string, on: boolean): Op {
  const app = book.apps.find((a) => a.id === id);
  if (!app) return fail("That application is not here any more.");
  if (app.talentPool === on) return { ok: true, book, value: undefined };
  return {
    ok: true,
    book: replaceApp(book, { ...app, talentPool: on }),
    value: undefined,
  };
}

/** One action for many people, with the refusals kept apart. */
export function applyBulk(
  book: DemoBook,
  ids: readonly string[],
  action: BulkAction,
): { book: DemoBook; outcome: BulkOutcome } {
  let next = book;
  let done = 0;
  let skipped = 0;
  const refused: BulkRefusal[] = [];
  let asked = 0;
  let queued = 0;
  let firstNote: string | null = null;

  const asksEmail =
    (action.type === "move" && action.sendEmail === true) ||
    (action.type === "reject" && action.sendEmail);

  for (const id of ids) {
    const app = next.apps.find((a) => a.id === id);
    const name = app?.name ?? "Somebody";
    let result: Op<MoveResult | undefined>;
    switch (action.type) {
      case "move":
        result = moveApp(next, id, action.stageId, action.sendEmail === true);
        break;
      case "reject":
        result = rejectApp(
          next,
          id,
          action.reasonId,
          action.note,
          action.sendEmail,
        );
        break;
      case "tag":
        result = setTagged(next, id, action.tagId, true);
        break;
      case "untag":
        result = setTagged(next, id, action.tagId, false);
        break;
      case "talent-pool":
        result = setTalentPool(next, id, action.on);
        break;
    }
    if (result.ok) {
      const email = result.value?.email ?? null;
      if (email) {
        asked += 1;
        if (email.status === "PENDING" || email.status === "SENDING")
          queued += 1;
        else firstNote ??= email.note;
      }
      /* A write that changed nothing — already in that stage, already tagged —
         is skipped, not done and not refused. */
      if (result.book === next) skipped += 1;
      else done += 1;
      next = result.book;
    } else {
      refused.push({ id, name, reason: result.error });
    }
  }

  return {
    book: next,
    outcome: {
      requested: ids.length,
      done,
      skipped,
      refused,
      emailed: asksEmail ? queued : null,
      emailNote:
        asksEmail && asked > queued
          ? (firstNote ?? "Some emails were not queued.")
          : null,
    },
  };
}

/* ---------------------------------------------------------------------- tags */

const clean = (text: string): string => text.trim().replace(/\s+/g, " ");

export function createTag(book: DemoBook, name: string): Op<Tag> {
  const label = clean(name);
  if (label === "") return fail("Name the tag.");
  if (label.length > 40) return fail("Keep a tag to 40 characters.");
  if (book.tags.some((t) => t.name.toLowerCase() === label.toLowerCase()))
    return fail(`There is already a tag called "${label}".`);
  const tag: Tag = {
    id: nextId(
      "tag",
      book.tags.map((t) => t.id),
    ),
    name: label,
  };
  return { ok: true, book: { ...book, tags: [...book.tags, tag] }, value: tag };
}

export function renameTag(book: DemoBook, id: string, name: string): Op {
  const label = clean(name);
  if (label === "") return fail("Name the tag.");
  if (label.length > 40) return fail("Keep a tag to 40 characters.");
  if (
    book.tags.some(
      (t) => t.id !== id && t.name.toLowerCase() === label.toLowerCase(),
    )
  )
    return fail(`There is already a tag called "${label}".`);
  return {
    ok: true,
    book: {
      ...book,
      tags: book.tags.map((t) => (t.id === id ? { ...t, name: label } : t)),
    },
    value: undefined,
  };
}

export function deleteTag(book: DemoBook, id: string): Op {
  return {
    ok: true,
    book: {
      ...book,
      tags: book.tags.filter((t) => t.id !== id),
      apps: book.apps.map((app) =>
        app.tagIds.includes(id)
          ? { ...app, tagIds: app.tagIds.filter((t) => t !== id) }
          : app,
      ),
    },
    value: undefined,
  };
}

/** How many applications carry each tag and each reason, for the settings lists. */
export function usage(book: DemoBook): {
  tags: Record<string, number>;
  reasons: Record<string, number>;
} {
  const tags: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  for (const app of book.apps) {
    for (const id of app.tagIds) tags[id] = (tags[id] ?? 0) + 1;
    if (app.rejection) {
      const reason = book.reasons.find((r) => r.label === app.rejection?.label);
      if (reason) reasons[reason.id] = (reasons[reason.id] ?? 0) + 1;
    }
  }
  return { tags, reasons };
}

/* ------------------------------------------------------------------- reasons */

export function createReason(
  book: DemoBook,
  label: string,
): Op<RejectionReason> {
  const text = clean(label);
  if (text === "") return fail("Write the reason.");
  if (text.length > 120) return fail("Keep a reason to 120 characters.");
  if (book.reasons.some((r) => r.label.toLowerCase() === text.toLowerCase()))
    return fail(`"${text}" is already on the list.`);
  const reason: RejectionReason = {
    id: nextId(
      "reason",
      book.reasons.map((r) => r.id),
    ),
    label: text,
    active: true,
  };
  return {
    ok: true,
    book: { ...book, reasons: [...book.reasons, reason] },
    value: reason,
  };
}

export function updateReason(
  book: DemoBook,
  id: string,
  change: { label?: string; active?: boolean },
): Op {
  const current = book.reasons.find((r) => r.id === id);
  if (!current) return fail("That reason is not here any more.");
  let label = current.label;
  if (change.label !== undefined) {
    label = clean(change.label);
    if (label === "") return fail("Write the reason.");
    if (label.length > 120) return fail("Keep a reason to 120 characters.");
    if (
      book.reasons.some(
        (r) => r.id !== id && r.label.toLowerCase() === label.toLowerCase(),
      )
    )
      return fail(`"${label}" is already on the list.`);
  }
  const active = change.active ?? current.active;
  if (
    !active &&
    current.active &&
    book.reasons.filter((r) => r.active).length <= 1
  )
    return fail(
      "At least one reason has to stay on, or nobody could be rejected.",
    );
  return {
    ok: true,
    book: {
      ...book,
      reasons: book.reasons.map((r) =>
        r.id === id ? { ...r, label, active } : r,
      ),
    },
    value: undefined,
  };
}

/* ----------------------------------------------------------------- templates */

export function saveTemplate(
  book: DemoBook,
  draft: { id: string | null; name: string; stages: TemplateStage[] },
): Op<DemoTemplate> {
  const problems = validateTemplate(draft.name, draft.stages);
  if (!isValid(problems)) {
    const first =
      problems.name ??
      problems.list ??
      Object.values(problems.stages)[0] ??
      "This template cannot be saved.";
    return fail(first);
  }
  const title = clean(draft.name);
  if (
    book.templates.some(
      (t) => t.id !== draft.id && t.name.toLowerCase() === title.toLowerCase(),
    )
  )
    return fail(`There is already a template called "${title}".`);

  const stages = draft.stages.map((s) => ({ ...s, name: clean(s.name) }));
  if (draft.id === null) {
    const template: DemoTemplate = {
      id: nextId(
        "tpl",
        book.templates.map((t) => t.id),
      ),
      name: title,
      isDefault: book.templates.length === 0,
      stages,
    };
    return {
      ok: true,
      book: { ...book, templates: [...book.templates, template] },
      value: template,
    };
  }
  const existing = book.templates.find((t) => t.id === draft.id);
  if (!existing) return fail("That template is not here any more.");
  const updated: DemoTemplate = { ...existing, name: title, stages };
  return {
    ok: true,
    book: {
      ...book,
      templates: book.templates.map((t) => (t.id === updated.id ? updated : t)),
    },
    value: updated,
  };
}

export function duplicateTemplate(
  book: DemoBook,
  id: string,
): Op<DemoTemplate> {
  const source = book.templates.find((t) => t.id === id);
  if (!source) return fail("That template is not here any more.");
  let name = `${source.name} copy`;
  for (let n = 2; book.templates.some((t) => t.name === name); n += 1)
    name = `${source.name} copy ${String(n)}`;
  const copy: DemoTemplate = {
    id: nextId(
      "tpl",
      book.templates.map((t) => t.id),
    ),
    name,
    isDefault: false,
    stages: source.stages.map((s, index) => ({
      ...s,
      id: `${s.id}-c${String(index)}`,
    })),
  };
  return {
    ok: true,
    book: { ...book, templates: [...book.templates, copy] },
    value: copy,
  };
}

export function deleteTemplate(book: DemoBook, id: string): Op {
  const template = book.templates.find((t) => t.id === id);
  if (!template) return fail("That template is not here any more.");
  if (template.isDefault)
    return fail(
      "This is the default for new roles. Make another template the default first.",
    );
  return {
    ok: true,
    book: { ...book, templates: book.templates.filter((t) => t.id !== id) },
    value: undefined,
  };
}

export function makeDefaultTemplate(book: DemoBook, id: string): Op {
  if (!book.templates.some((t) => t.id === id))
    return fail("That template is not here any more.");
  return {
    ok: true,
    book: {
      ...book,
      templates: book.templates.map((t) => ({ ...t, isDefault: t.id === id })),
    },
    value: undefined,
  };
}

/** The whole board: every column, its true count and its first page. */
export function boardOf(
  book: DemoBook,
  requisitionId: string,
  filters: BoardFilters,
  limit: number,
): BoardData {
  const columns = columnsFor(stagesOf(book, requisitionId));
  return {
    columns: columns.map((column) => {
      const page = queryCards(book, {
        requisitionId,
        column: column.key,
        filters,
        cursor: null,
        pageSize: limit,
      });
      return {
        ...column,
        total: page.total,
        cards: page.cards,
        next: page.next,
      };
    }),
  };
}

/* --------------------------------------------------------------- talent pool */

/**
 * Everybody kept on file, one entry per person, with every role they have been in.
 *
 * Keyed by the candidate, because keeping somebody is about the person: they may
 * be in the pool because of one application and have another that is still open.
 */
export function talentList(
  book: DemoBook,
  query: TalentQuery,
  roleName: (requisitionId: string) => string,
): TalentPage {
  const words = (query.q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  const kept = new Map<string, DemoApp[]>();
  for (const app of book.apps) {
    if (!kept.has(app.candidateId)) kept.set(app.candidateId, []);
    kept.get(app.candidateId)?.push(app);
  }

  const entries: TalentEntry[] = [];
  for (const apps of kept.values()) {
    if (!apps.some((app) => app.talentPool)) continue;
    const lead = [...apps].sort(newestFirst)[0] as DemoApp;
    const tagIds = new Set(apps.flatMap((app) => app.tagIds));
    const tags = book.tags.filter((tag) => tagIds.has(tag.id));
    const haystack = `${lead.name} ${lead.email}`.toLowerCase();
    if (!words.every((word) => haystack.includes(word))) continue;
    if (query.tagId && !tagIds.has(query.tagId)) continue;
    if (query.source && lead.source !== query.source) continue;
    entries.push({
      candidateId: lead.candidateId,
      name: lead.name,
      email: lead.email,
      source: lead.source,
      tags,
      note: null,
      applications: [...apps].sort(newestFirst).map((app) => ({
        id: app.id,
        requisitionId: app.requisitionId,
        role: roleName(app.requisitionId),
        outcome: app.outcome,
        stageName: book.stages.find((s) => s.id === app.stageId)?.name ?? null,
        reason: app.rejection?.label ?? null,
      })),
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const start = query.cursor
    ? Math.max(0, Number.parseInt(query.cursor, 10) || 0)
    : 0;
  const page = entries.slice(start, start + query.pageSize);
  const end = start + page.length;
  return {
    entries: page,
    total: entries.length,
    next: end < entries.length ? String(end) : null,
  };
}

/** Takes a person out of the pool, whichever of their applications put them in. */
export function leaveTalentPool(book: DemoBook, candidateId: string): Op {
  if (!book.apps.some((app) => app.candidateId === candidateId))
    return fail("That person is not here any more.");
  return {
    ok: true,
    book: {
      ...book,
      apps: book.apps.map((app) =>
        app.candidateId === candidateId ? { ...app, talentPool: false } : app,
      ),
    },
    value: undefined,
  };
}

/* ----------------------------------------------------------- the application queue */

/**
 * Turning an applicant in the queue down.
 *
 * The reason is the company's own wording and is kept on the row; nothing is sent.
 * Somebody already decided on is refused in the API's words, so a second press
 * does not quietly overwrite the first decision.
 */
export function queueDecline(book: DemoBook, id: string, reason: string): Op {
  const entry = book.queue[id];
  if (entry?.declined)
    return fail("This application has already been turned down.");
  if (entry?.advanced)
    return fail("This application has already been screened in.");
  return {
    ok: true,
    book: {
      ...book,
      queue: {
        ...book.queue,
        [id]: { ...entry, declined: { reason, at: DEMO_NOW } },
      },
    },
    value: undefined,
  };
}

/**
 * Screening an applicant in: they become a person on the role's board.
 *
 * They land in the Applied stage (else the first one people pass through), the way
 * the API puts them. Somebody already on that role's board, applying a second way,
 * is linked rather than added twice, which is what the API does too.
 */
export function queueAdvance(
  book: DemoBook,
  who: {
    id: string;
    name: string;
    email: string;
    requisitionId: string | null;
    source: string | null;
  },
): Op<{ appId: string; alreadyThere: boolean }> {
  const entry = book.queue[who.id];
  if (entry?.advanced)
    return fail("This application has already been screened in.");
  if (entry?.declined)
    return fail(
      "This application was turned down, so it cannot be screened in.",
    );
  if (!who.requisitionId)
    return fail(
      "This advert has no approved role behind it, so there is nowhere to put them.",
    );

  const stages = stagesOf(book, who.requisitionId);
  const entryStage =
    stages.find((stage) => stage.type === "APPLIED") ??
    stages.find((stage) => stage.type !== "HIRED" && stage.type !== "REJECTED");
  if (!entryStage) return fail("This role has no stage to put them in yet.");

  const already = book.apps.find(
    (app) =>
      app.requisitionId === who.requisitionId &&
      app.email.toLowerCase() === who.email.toLowerCase(),
  );
  const appId = already?.id ?? `demo-adv-${who.id}`;
  const apps = already
    ? book.apps
    : [
        ...book.apps,
        {
          id: appId,
          requisitionId: who.requisitionId,
          candidateId: `cand-${who.id}`,
          name: who.name,
          email: who.email,
          reference: referenceFor(who.id),
          source: who.source,
          flagged: false,
          duplicate: false,
          tagIds: [],
          talentPool: false,
          stageId: entryStage.id,
          createdAt: DEMO_NOW,
          stageEnteredAt: DEMO_NOW,
          outcome: "IN_PROGRESS" as const,
          rejection: null,
          history: [
            {
              id: `${appId}-e1`,
              kind: "SCREENED_IN" as const,
              fromStage: null,
              toStage: entryStage.name,
              note: null,
              at: DEMO_NOW,
              by: "You",
            },
          ],
        },
      ];
  return {
    ok: true,
    book: {
      ...book,
      apps,
      queue: {
        ...book.queue,
        [who.id]: { ...entry, advanced: { appId, at: DEMO_NOW } },
      },
    },
    value: { appId, alreadyThere: Boolean(already) },
  };
}
