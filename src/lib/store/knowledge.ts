"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { ApiError } from "@/lib/api/client";
import {
  knowledgeApi,
  type ApiKbAnalytics,
  type ApiKbArticle,
  type ApiKbArticleDetail,
  type ApiKbCategory,
  type ApiKbCategoryFlat,
  type ApiKbSearchHit,
  type CreateKbArticleBody,
  type CreateKbCategoryBody,
  type KbArticleListParams,
  type ReorderKbCategoriesBody,
  type UpdateKbArticleBody,
  type UpdateKbCategoryBody,
} from "@/lib/api/knowledge";
import { useCan } from "../permissions";
import { useSession } from "./session";
import { createPersistedState } from "./persisted";
import { useRevalidation } from "@/lib/revalidate";

/**
 * The knowledge base.
 *
 * Two audiences, one module: staff reading it, and whoever has to keep it
 * right. Both are served from `lib/api/knowledge.ts` — no shapes are invented
 * here, only demo rows and the copy for a refusal.
 *
 * ## What demo mode is allowed to do, and why the answers differ
 *
 * | Write | Demo | Why |
 * |---|---|---|
 * | Voting on an article | **works**, persisted here | It is your opinion of the thing you just read. Nothing downstream depends on it, and a "Was this helpful?" you cannot click demonstrates nothing. |
 * | A search that found nothing | **recorded** here | That list *is* the module's point. A demo whose editorial backlog is permanently empty teaches the wrong thing about how the product works. |
 * | Writing, publishing or hiding an article | **refuses** | Publishing is the company telling its staff what the rules are. An article written into one browser would reach nobody. |
 * | Adding, renaming or moving a section | **refuses** | Same reason: it is the shape of the help centre everybody else sees. |
 *
 * That table is the same call `lib/store/conduct.ts` makes for policies, and
 * `lib/store/departments.ts` makes for the org tree.
 *
 * ## Feedback and the miss log can be switched off, and that is not "empty"
 *
 * Both live in tables the API probes for at runtime. When they are absent,
 * voting answers 422 with a plain sentence and `analytics().unavailable` carries
 * the same one. Every hook below passes that sentence through untouched, and no
 * screen may render a zero in its place — "nobody has voted" and "we cannot
 * read the votes" are different facts and only one of them is actionable.
 *
 * ## Nothing here polls
 *
 * Reading an article increments its view count and a failed search writes a
 * row. An interval refresh would invent readers and invent questions nobody
 * asked. Load on mount, reload after a write, and nowhere else.
 */

/* ==========================================================================
 * Refusals
 * ======================================================================== */

/** One shape for every demo refusal, so they cannot drift apart. */
function refuse(message: string): never {
  throw new ApiError(0, "offline", message);
}

const WRITE_REFUSAL =
  "Publishing an article tells your staff what the rules are. That needs the " +
  "API — an article written into this browser would reach nobody.";

const SECTION_REFUSAL =
  "Sections are the shape of the help centre everyone else sees. Changing them " +
  "needs the API.";

/* ==========================================================================
 * What this browser remembers
 * ======================================================================== */

type LocalState = {
  /**
   * Which way you voted, keyed `who|articleId`.
   *
   * Keyed by the account so a second demo sign-in does not inherit the first
   * one's opinions. In connected mode the API holds the authoritative row and
   * the counts always come from it — this is only "which button did I press",
   * so the page can come back and still show your answer rather than offering
   * you the vote again.
   */
  votes: Record<string, "helpful" | "not-helpful">;
  /** Demo only. In connected mode the API records these itself. */
  misses: Record<string, { searches: number; lastSearchedAt: string }>;
};

const local = createPersistedState<LocalState>({
  key: "approvehr.knowledge.store",
  empty: { votes: {}, misses: {} },
});

/** Hydration-safe read. See the header of `persisted.ts` for why. */
function useLocal(): LocalState {
  return useSyncExternalStore(local.subscribe, local.read, local.getServerSnapshot);
}

const voteKey = (who: string, articleId: string) => `${who}|${articleId}`;

/* ==========================================================================
 * Demo rows
 * ======================================================================== */

type DemoSection = { id: string; name: string; slug: string };

const DEMO_SECTIONS: DemoSection[] = DEMO_ENABLED ? [
  { id: "kbc-pay", name: "Getting paid", slug: "getting-paid" },
  { id: "kbc-time", name: "Leave", slug: "time-off" },
  { id: "kbc-record", name: "Your record", slug: "your-record" },
] : [];

type DemoArticle = {
  id: string;
  slug: string;
  title: string;
  sectionId: string | null;
  body: string;
  views: number;
  helpful: number;
  notHelpful: number;
  published: boolean;
  updated: string;
};

/**
 * Six articles, written the way the product wants articles written.
 *
 * One is a draft and one has more "no" votes than "yes", because those two
 * rows are what the editor screen exists to surface — a seed where everything
 * is fine shows an editor nothing to do.
 */
const DEMO_ARTICLES: DemoArticle[] = DEMO_ENABLED ? [
  {
    id: "kba-payslip",
    slug: "how-to-read-your-payslip",
    title: "How to read your payslip",
    sectionId: "kbc-pay",
    views: 412,
    helpful: 38,
    notHelpful: 2,
    published: true,
    updated: "2026-07-14",
    body:
      "Your payslip has three parts.\n\n" +
      "The top is what you earned this month: your basic pay, your housing and " +
      "transport, and anything extra like a bonus.\n\n" +
      "The middle is what came out: tax (PAYE), your 8% pension, and NHF if you " +
      "are on it. Loan repayments show here too, one line each.\n\n" +
      "The bottom line is what reaches your bank. If that number is not what you " +
      "expected, open the payslip and compare it with last month — the line that " +
      "changed is nearly always the answer. If you still cannot see why, ask " +
      "whoever runs payroll and give them the month.",
  },
  {
    id: "kba-part-month",
    slug: "when-you-get-paid",
    title: "When you get paid, and what a part month looks like",
    sectionId: "kbc-pay",
    views: 231,
    helpful: 19,
    notHelpful: 1,
    published: true,
    updated: "2026-06-28",
    body:
      "Pay lands on the last working day of the month.\n\n" +
      "If you started or left partway through a month, you are paid for the days " +
      "you worked out of the working days in that month. Twelve days out of " +
      "twenty-two is twelve twenty-seconds of your normal pay, and every " +
      "deduction is worked out on that smaller figure, not the full one.\n\n" +
      "Weekends and public holidays are not working days, so they are not counted " +
      "against you.",
  },
  {
    id: "kba-pension",
    slug: "changing-your-pension-provider",
    title: "Changing your pension provider",
    sectionId: "kbc-pay",
    views: 173,
    helpful: 4,
    notHelpful: 9,
    published: true,
    updated: "2026-03-02",
    body:
      "You can move your pension to another PFA once a year.\n\n" +
      "Open the transfer with the PFA you are moving to. They handle it with " +
      "PenCom. When it is done, send us the new PFA name and your PIN so the next " +
      "payroll pays into the right place.\n\n" +
      "Your PIN does not change when you switch provider.",
  },
  {
    id: "kba-leave",
    slug: "booking-time-off",
    title: "Booking time off",
    sectionId: "kbc-time",
    views: 288,
    helpful: 26,
    notHelpful: 3,
    published: true,
    updated: "2026-08-04",
    body:
      "Ask for the days in the app. Your manager gets it straight away and you " +
      "get an answer in the same place.\n\n" +
      "Two things worth knowing. Days you have not earned yet cannot be booked — " +
      "the balance on the screen is what you actually have. And a day you take " +
      "without an approved request behind it is an unpaid day, which comes off " +
      "that month's pay.\n\n" +
      "If you were ill and could not ask first, file it when you are back and say " +
      "so in the note.",
  },
  {
    id: "kba-letter",
    slug: "asking-for-a-confirmation-letter",
    title: "Asking for a letter confirming your job",
    sectionId: "kbc-record",
    views: 96,
    helpful: 11,
    notHelpful: 0,
    published: true,
    updated: "2026-05-19",
    body:
      "Banks and landlords usually want a letter saying what you do here and what " +
      "you earn.\n\n" +
      "Ask whoever keeps the records and say who the letter is for and whether it " +
      "needs your salary in it. Most are ready the same week.",
  },
  {
    id: "kba-holidays",
    slug: "public-holidays-2027",
    title: "Public holidays 2027",
    sectionId: "kbc-time",
    views: 0,
    helpful: 0,
    notHelpful: 0,
    published: false,
    updated: "2026-08-18",
    body:
      "Draft. The 2027 dates are not gazetted yet — this goes live when they are.",
  },
] : [];

/**
 * Four questions the demo knowledge base cannot answer.
 *
 * Seeded rather than empty for the same reason one demo article has bad votes:
 * the editorial backlog is the screen worth having, and it only reads as one
 * with rows in it. Your own failed searches join this list as you make them.
 */
const DEMO_MISSES: Record<string, { searches: number; lastSearchedAt: string }> = {
  "how do i change my bank account": {
    searches: 14,
    lastSearchedAt: "2026-08-19T10:12:00.000Z",
  },
  "13th month": { searches: 9, lastSearchedAt: "2026-08-17T16:41:00.000Z" },
  "carry over unused leave": {
    searches: 6,
    lastSearchedAt: "2026-08-15T08:05:00.000Z",
  },
  "salary advance": { searches: 4, lastSearchedAt: "2026-08-11T13:27:00.000Z" },
};

const DEMO_UPDATED_AT = (day: string) => `${day}T09:00:00.000Z`;

const excerpt = (body: string, length = 180): string => {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= length ? flat : `${flat.slice(0, length).trimEnd()}…`;
};

const sectionName = (id: string | null): string | null =>
  DEMO_SECTIONS.find((s) => s.id === id)?.name ?? null;

function demoSummary(
  row: DemoArticle,
  mine: "helpful" | "not-helpful" | null,
): ApiKbArticle {
  const helpful = row.helpful + (mine === "helpful" ? 1 : 0);
  const notHelpful = row.notHelpful + (mine === "not-helpful" ? 1 : 0);
  const votes = helpful + notHelpful;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    categoryId: row.sectionId,
    categoryName: sectionName(row.sectionId),
    status: row.published ? "published" : "draft",
    publishedAt: row.published ? DEMO_UPDATED_AT(row.updated) : null,
    views: row.views,
    helpful,
    notHelpful,
    helpfulness: votes === 0 ? null : Math.round((helpful / votes) * 100),
    excerpt: excerpt(row.body),
    createdAt: DEMO_UPDATED_AT(row.updated),
    updatedAt: DEMO_UPDATED_AT(row.updated),
  };
}

function demoDetail(
  row: DemoArticle,
  mine: "helpful" | "not-helpful" | null,
): ApiKbArticleDetail {
  const section = DEMO_SECTIONS.find((s) => s.id === row.sectionId);
  return {
    ...demoSummary(row, mine),
    body: row.body,
    section: section ? [section] : [],
  };
}

function demoTree(): {
  tree: ApiKbCategory[];
  flat: ApiKbCategoryFlat[];
  counts: {
    categories: number;
    articles: number;
    published: number;
    uncategorised: number;
  };
} {
  const tree = DEMO_SECTIONS.map((section, index): ApiKbCategory => {
    const filed = DEMO_ARTICLES.filter((a) => a.sectionId === section.id);
    const published = filed.filter((a) => a.published).length;
    return {
      id: section.id,
      name: section.name,
      slug: section.slug,
      parentId: null,
      order: index,
      depth: 0,
      articles: filed.length,
      published,
      totalArticles: filed.length,
      children: [],
    };
  });

  return {
    tree,
    flat: tree.map(({ children, ...rest }) => {
      void children;
      return rest;
    }),
    counts: {
      categories: tree.length,
      articles: DEMO_ARTICLES.length,
      published: DEMO_ARTICLES.filter((a) => a.published).length,
      uncategorised: DEMO_ARTICLES.filter((a) => a.sectionId === null).length,
    },
  };
}

/** A line of the body around the first matching word, as `search.ts` cuts it. */
function demoSnippet(body: string, words: string[], length = 180): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= length) return flat;

  const haystack = flat.toLowerCase();
  const at = words
    .map((word) => haystack.indexOf(word))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (at === undefined || at < length / 2) {
    return `${flat.slice(0, length).trimEnd()}…`;
  }
  const from = Math.max(0, at - Math.floor(length / 3));
  return `…${flat.slice(from, from + length).trim()}…`;
}

/** Words, the way the API rebuilds them: letters and digits only. */
function terms(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 0)
    .slice(0, 8);
}

/* ==========================================================================
 * Sections
 * ======================================================================== */

type Tree = ReturnType<typeof demoTree> & { error: ApiError | null };

const EMPTY_TREE: Tree = {
  tree: [],
  flat: [],
  counts: { categories: 0, articles: 0, published: 0, uncategorised: 0 },
  error: null,
};

/**
 * The section tree, with the counts each node rolls up.
 *
 * Demo mode derives the tree from the seeded articles and refuses every write —
 * the same call `departments.ts` makes, and for the same reason: a structure
 * built in browser storage is a help centre nobody else can see.
 */
export function useKbCategories() {
  const { isConnected } = useSession();
  const [fetched, setFetched] = useState<Tree | null>(null);
  /* Bumped by `reload`, so a write can force a re-read without this hook
     keeping a second copy of "am I loading". */
  const [tick, setTick] = useState(0);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await knowledgeApi.categories(controller.signal);
        if (!cancelled) setFetched({ ...result, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          tree: [],
          flat: [],
          counts: { categories: 0, articles: 0, published: 0, uncategorised: 0 },
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, tick, revalidation]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const demo = useMemo((): Tree => ({ ...demoTree(), error: null }), []);

  const guard = useCallback(() => {
    if (!isConnected) refuse(SECTION_REFUSAL);
  }, [isConnected]);

  /* Empty while a live tree is in flight — never the demo one, which would put
     seeded sections on a connected screen for as long as the request takes. */
  const state: Tree = isConnected ? (fetched ?? EMPTY_TREE) : demo;

  return {
    tree: state.tree,
    flat: state.flat,
    counts: state.counts,
    error: state.error,
    loading: isConnected && fetched === null,
    /** False in demo mode: the tree can be read, not written. */
    editable: isConnected,
    reload,
    create: useCallback(
      async (body: CreateKbCategoryBody) => {
        guard();
        const created = await knowledgeApi.createCategory(body);
        reload();
        return created;
      },
      [guard, reload],
    ),
    update: useCallback(
      async (id: string, body: UpdateKbCategoryBody) => {
        guard();
        const updated = await knowledgeApi.updateCategory(id, body);
        reload();
        return updated;
      },
      [guard, reload],
    ),
    reorder: useCallback(
      async (body: ReorderKbCategoriesBody) => {
        guard();
        const result = await knowledgeApi.reorderCategories(body);
        reload();
        return result;
      },
      [guard, reload],
    ),
    /** Refuses on the API while anything is filed inside, and names it. */
    remove: useCallback(
      async (id: string) => {
        guard();
        const result = await knowledgeApi.deleteCategory(id);
        reload();
        return result;
      },
      [guard, reload],
    ),
  };
}

/* ==========================================================================
 * The article list
 * ======================================================================== */

type Rows = { articles: ApiKbArticle[]; total: number; error: ApiError | null };

const SORT_VALUE = (row: ApiKbArticle, sort: KbArticleListParams["sort"]) => {
  if (sort === "title") return row.title.toLowerCase();
  if (sort === "views") return row.views;
  if (sort === "publishedAt") return row.publishedAt ?? "";
  if (sort === "createdAt") return row.createdAt;
  return row.updatedAt;
};

/**
 * Articles, for the editor's index and for a section listing.
 *
 * `q` here matches the **title only** — that is the API's behaviour and not an
 * oversight. Somebody in this list knows the name of the article they are
 * looking for. The reader's search is `useKbSearch`, which is full-text and
 * ranked.
 *
 * The answer is stored keyed by the query and `loading` is derived from whether
 * the stored key still matches. Two things fall out: a slow answer for a filter
 * the user has already changed cannot be rendered, and there is nothing to
 * clear when the query changes — so no setState runs in an effect body.
 */
export function useKbArticles(params: KbArticleListParams = {}) {
  const { isConnected, user, employeeId } = useSession();
  const store = useLocal();
  const who = user?.id ?? employeeId ?? "demo";

  /* Serialised so the effect re-runs on a value change rather than on every
     render — an inline object literal is a new reference each time. */
  const key = JSON.stringify(params);

  const [fetched, setFetched] = useState<(Rows & { key: string }) | null>(null);
  const [tick, setTick] = useState(0);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await knowledgeApi.articles(
          JSON.parse(key) as KbArticleListParams,
          controller.signal,
        );
        if (!cancelled) {
          setFetched({
            key,
            articles: result.data,
            total: result.meta.total,
            error: null,
          });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          key,
          articles: [],
          total: 0,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, key, tick, revalidation]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  /* Parsed from `key` rather than closing over `params`, so the memo's
     dependency is a value and not an object literal re-created every render. */
  const demo = useMemo((): Rows => {
    const parsed = JSON.parse(key) as KbArticleListParams;
    const needle = parsed.q?.trim().toLowerCase();

    const rows = DEMO_ARTICLES.filter((row) => {
      if (parsed.status === "published" && !row.published) return false;
      if (parsed.status === "draft" && row.published) return false;
      if (parsed.categoryId && row.sectionId !== parsed.categoryId) return false;
      if (parsed.uncategorised && row.sectionId !== null) return false;
      if (needle && !row.title.toLowerCase().includes(needle)) return false;
      return true;
    }).map((row) =>
      demoSummary(row, store.votes[voteKey(who, row.id)] ?? null),
    );

    const direction = parsed.order === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const left = SORT_VALUE(a, parsed.sort);
      const right = SORT_VALUE(b, parsed.sort);
      if (left === right) return a.title.localeCompare(b.title);
      return left > right ? direction : -direction;
    });

    return { articles: rows, total: rows.length, error: null };
  }, [key, store, who]);

  const guard = useCallback(() => {
    if (!isConnected) refuse(WRITE_REFUSAL);
  }, [isConnected]);

  const matched = fetched !== null && fetched.key === key;
  const rows: Rows = isConnected
    ? matched
      ? fetched
      : { articles: [], total: 0, error: null }
    : demo;

  return {
    articles: rows.articles,
    total: rows.total,
    error: rows.error,
    loading: isConnected && !matched,
    /** False in demo mode: articles can be read, not written. */
    editable: isConnected,
    reload,
    create: useCallback(
      async (body: CreateKbArticleBody) => {
        guard();
        const created = await knowledgeApi.createArticle(body);
        reload();
        return created;
      },
      [guard, reload],
    ),
    update: useCallback(
      async (id: string, body: UpdateKbArticleBody) => {
        guard();
        const updated = await knowledgeApi.updateArticle(id, body);
        reload();
        return updated;
      },
      [guard, reload],
    ),
    publish: useCallback(
      async (id: string) => {
        guard();
        const published = await knowledgeApi.publishArticle(id);
        reload();
        return published;
      },
      [guard, reload],
    ),
    unpublish: useCallback(
      async (id: string) => {
        guard();
        const drafted = await knowledgeApi.unpublishArticle(id);
        reload();
        return drafted;
      },
      [guard, reload],
    ),
    /** Hides it from staff. Deletes nothing. */
    hide: useCallback(
      async (id: string) => {
        guard();
        const result = await knowledgeApi.hideArticle(id);
        reload();
        return result;
      },
      [guard, reload],
    ),
  };
}

/* ==========================================================================
 * One article, and the vote at the foot of it
 * ======================================================================== */

type Vote = "helpful" | "not-helpful";

/**
 * One article by id or slug, with the "was this any use?" vote attached.
 *
 * ## The vote
 *
 * One per person, replaced rather than added to — that is the API's upsert, and
 * the interface has to say the same thing: a second click **changes** your
 * answer. `yourVote` is what this browser last sent, so returning to an article
 * shows your answer rather than offering you the vote again. The counts always
 * come from the server.
 *
 * ## When feedback is switched off
 *
 * The API answers 422 with a sentence naming the missing migration. It arrives
 * here as `feedbackRefusal` and it is the only thing a screen should show in
 * place of the buttons. Rendering "0 of 0 found this helpful" instead would be
 * a lie with a number in it.
 */
export function useKbArticle(idOrSlug: string | null) {
  const { isConnected, user, employeeId } = useSession();
  const store = useLocal();
  const who = user?.id ?? employeeId ?? "demo";

  const [fetched, setFetched] = useState<{
    key: string;
    article: ApiKbArticleDetail | null;
    error: ApiError | null;
  } | null>(null);

  /* Keyed by the article, so a vote cast on one article cannot be read as a
     vote on the next one — and so nothing has to be cleared in an effect. */
  const [cast, setCast] = useState<{
    key: string;
    vote: Vote;
    helpful: number;
    notHelpful: number;
    helpfulness: number | null;
  } | null>(null);
  const [refused, setRefused] = useState<{ key: string; message: string } | null>(
    null,
  );

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !idOrSlug) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const article = await knowledgeApi.article(idOrSlug, controller.signal);
        if (!cancelled) setFetched({ key: idOrSlug, article, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          key: idOrSlug,
          article: null,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, idOrSlug, revalidation]);

  const demoRow = useMemo(() => {
    if (isConnected || !idOrSlug) return null;
    return (
      DEMO_ARTICLES.find((a) => a.slug === idOrSlug || a.id === idOrSlug) ?? null
    );
  }, [isConnected, idOrSlug]);

  const matched = idOrSlug !== null && fetched !== null && fetched.key === idOrSlug;

  /**
   * The article's real id, whatever the URL used to reach it.
   *
   * A vote has to be remembered against the id and never against the slug: the
   * reader arrives at `/help/kb/how-payslips-work` and the editor's list holds
   * the uuid, and keying by whichever string happened to be in the URL means the
   * same person's vote reads as two different votes on two different screens.
   */
  const resolvedId = isConnected
    ? matched
      ? (fetched.article?.id ?? null)
      : null
    : (demoRow?.id ?? null);

  const mine: Vote | null = resolvedId
    ? cast?.key === resolvedId
      ? cast.vote
      : (store.votes[voteKey(who, resolvedId)] ?? null)
    : null;

  const article: ApiKbArticleDetail | null = isConnected
    ? matched
      ? fetched.article
      : null
    : demoRow
      ? demoDetail(demoRow, mine)
      : null;

  /* The server's counts win the moment a vote comes back; before that, the
     ones that came with the article. */
  const tally =
    article === null
      ? { helpful: 0, notHelpful: 0, helpfulness: null as number | null }
      : cast?.key === resolvedId
        ? {
            helpful: cast.helpful,
            notHelpful: cast.notHelpful,
            helpfulness: cast.helpfulness,
          }
        : {
            helpful: article.helpful,
            notHelpful: article.notHelpful,
            helpfulness: article.helpfulness,
          };

  const vote = useCallback(
    async (helpful: boolean) => {
      if (!idOrSlug || !resolvedId) return;
      const answer: Vote = helpful ? "helpful" : "not-helpful";

      /* Only ever called after the vote has actually landed. Marking the button
         first would leave "you said yes" on screen after a refusal, which is the
         exact lie this module is careful about. */
      const remember = () => {
        const current = local.current();
        local.commit({
          ...current,
          votes: { ...current.votes, [voteKey(who, resolvedId)]: answer },
        });
      };

      if (!isConnected) {
        const row = DEMO_ARTICLES.find((a) => a.id === resolvedId);
        if (!row) return;
        const next = demoSummary(row, answer);
        remember();
        setRefused(null);
        setCast({
          key: resolvedId,
          vote: answer,
          helpful: next.helpful,
          notHelpful: next.notHelpful,
          helpfulness: next.helpfulness,
        });
        return;
      }

      try {
        const result = helpful
          ? await knowledgeApi.helpful(idOrSlug)
          : await knowledgeApi.notHelpful(idOrSlug);
        remember();
        setRefused(null);
        setCast({
          key: resolvedId,
          vote: result.yourVote,
          helpful: result.helpful,
          notHelpful: result.notHelpful,
          helpfulness: result.helpfulness,
        });
      } catch (error) {
        /* The API's own sentence, verbatim. It names what is missing and what
           to do about it, which is more than this file could say. */
        setRefused({
          key: idOrSlug,
          message:
            error instanceof ApiError
              ? error.message
              : "That vote did not reach the server. Try again.",
        });
      }
    },
    [idOrSlug, resolvedId, isConnected, who],
  );

  return {
    article,
    /* Derived, not tracked: loading exactly while a live id has no matching
       answer yet. True from the moment the id changes, so no window shows the
       previous article's text as though it were this one's. */
    loading: isConnected && idOrSlug !== null && !matched,
    error: matched ? fetched.error : null,
    /**
     * True for a slug that does not exist — and for a draft, to a reader.
     *
     * Demo mode answers it from the seed rather than leaving it false, so an
     * unknown slug reads as "that article is not here" rather than as a request
     * that went wrong. Same sentence, whichever mode you are in.
     */
    notFound: isConnected
      ? matched
        ? fetched.error?.status === 404
        : false
      : idOrSlug !== null && demoRow === null,
    yourVote: mine,
    tally,
    /** The API's message when feedback is not switched on. Show it verbatim. */
    feedbackRefusal:
      refused !== null && refused.key === idOrSlug ? refused.message : null,
    vote,
  };
}

/* ==========================================================================
 * Search
 * ======================================================================== */

/**
 * The reader's search box.
 *
 * Self-contained: hold the query here, read `hits`. Debounced, because the API
 * writes a row for a search that finds nothing and a keystroke is not a
 * question — the same reason it collapses "how", "how d", "how do i" into one
 * backlog row.
 *
 * Two characters is the floor. One letter matches most of the knowledge base
 * and answering it is noise, not a search.
 */
export function useKbSearch({ pageSize = 8, minLength = 2 } = {}) {
  const { isConnected } = useSession();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{
    term: string;
    hits: ApiKbSearchHit[];
    total: number;
    error: ApiError | null;
  } | null>(null);

  const term = query.trim();
  const active = term.length >= minLength;

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      void (async () => {
        if (!isConnected) {
          const words = terms(term);
          const hits = DEMO_ARTICLES.filter((row) => {
            if (!row.published) return false;
            const haystack = `${row.title} ${row.body}`.toLowerCase();
            return words.every((word) => haystack.includes(word));
          }).map((row): ApiKbSearchHit => {
            const inTitle = words.some((word) =>
              row.title.toLowerCase().includes(word),
            );
            return {
              id: row.id,
              slug: row.slug,
              title: row.title,
              categoryId: row.sectionId,
              views: row.views,
              snippet: demoSnippet(row.body, words),
              /* Title hits outrank body hits, as the weighted index does. */
              rank: inTitle ? 1 : 0.4,
            };
          });
          hits.sort((a, b) => b.rank - a.rank || b.views - a.views);

          /* A demo search that found nothing joins the backlog, exactly as the
             API would record it. Four characters is the API's own floor. */
          if (hits.length === 0 && term.length >= 4) {
            const flat = term.replace(/\s+/g, " ").toLowerCase();
            const current = local.current();
            const seen = current.misses[flat];
            local.commit({
              ...current,
              misses: {
                ...current.misses,
                [flat]: {
                  searches: (seen?.searches ?? 0) + 1,
                  lastSearchedAt: new Date().toISOString(),
                },
              },
            });
          }

          if (!cancelled) {
            setResult({ term, hits, total: hits.length, error: null });
          }
          return;
        }

        try {
          const found = await knowledgeApi.search(
            { q: term, pageSize },
            controller.signal,
          );
          if (!cancelled) {
            setResult({
              term,
              hits: found.data,
              total: found.meta.total,
              error: null,
            });
          }
        } catch (error) {
          if (cancelled) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResult({
            term,
            hits: [],
            total: 0,
            error: error instanceof ApiError ? error : null,
          });
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [term, active, isConnected, pageSize, revalidation]);

  const matched = result !== null && result.term === term;

  return {
    query,
    setQuery,
    term,
    /** True once the term is long enough to be a search. */
    active,
    hits: matched ? result.hits : [],
    total: matched ? result.total : 0,
    error: matched ? result.error : null,
    /** Waiting on this exact term. */
    searching: active && !matched,
    /**
     * This term has been searched and answered.
     *
     * The "nothing found" state hangs off this rather than off an empty array,
     * so a half-typed word never reads as a question with no answer.
     */
    answered: active && matched,
    clear: useCallback(() => setQuery(""), []),
  };
}

/* ==========================================================================
 * The editor's queue
 * ======================================================================== */

/**
 * What is read, what is wrong, and what is missing.
 *
 * `unavailable` is the whole reason this hook exists separately from the
 * article list: it is a sentence from the API saying the feedback and miss-log
 * tables are not there. When it is set, the screen must say so rather than draw
 * an empty backlog — those look identical and mean opposite things.
 */
export function useKbAnalytics() {
  const { isConnected } = useSession();
  /**
   * `GET /knowledge/analytics` is `MANAGE_SETTINGS` on the API, with no
   * narrower reading for anybody else — so asking without it is a request that
   * can only ever come back 403. Five of the six seeded roles hit that on
   * every visit to `/settings/knowledge`, while the screen was already
   * rendering the correct refusal from its own permission check: the panel
   * knew it could not read this and asked anyway.
   *
   * Gated in the hook rather than at the one call site so a second caller
   * cannot reintroduce it. The boolean goes in the dependency array, never
   * `can` itself — that is rebuilt every render and would loop.
   */
  const mayRead = useCan("MANAGE_SETTINGS");
  const store = useLocal();

  const [fetched, setFetched] = useState<{
    analytics: ApiKbAnalytics | null;
    error: ApiError | null;
  } | null>(null);
  const [tick, setTick] = useState(0);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected || !mayRead) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const analytics = await knowledgeApi.analytics(controller.signal);
        if (!cancelled) setFetched({ analytics, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFetched({
          analytics: null,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, mayRead, tick, revalidation]);

  const demo = useMemo((): ApiKbAnalytics => {
    const published = DEMO_ARTICLES.filter((a) => a.published);
    const rows = DEMO_ARTICLES.map((row) => demoSummary(row, null));
    const misses = { ...DEMO_MISSES, ...store.misses };

    return {
      totals: {
        articles: DEMO_ARTICLES.length,
        published: published.length,
        drafts: DEMO_ARTICLES.length - published.length,
        categories: DEMO_SECTIONS.length,
        views: DEMO_ARTICLES.reduce((sum, a) => sum + a.views, 0),
        votes: DEMO_ARTICLES.reduce((sum, a) => sum + a.helpful + a.notHelpful, 0),
        neverRead: published.filter((a) => a.views === 0).length,
      },
      mostViewed: rows
        .filter((row) => row.status === "published")
        .sort((a, b) => b.views - a.views)
        .slice(0, 10)
        .map(({ id, slug, title, views, helpful, notHelpful }) => ({
          id,
          slug,
          title,
          views,
          helpful,
          notHelpful,
        })),
      leastHelpful: rows
        .filter((row) => row.notHelpful > 0)
        .sort((a, b) => b.notHelpful - a.notHelpful)
        .slice(0, 10)
        .map(({ id, slug, title, views, helpful, notHelpful, helpfulness }) => ({
          id,
          slug,
          title,
          views,
          helpful,
          notHelpful,
          helpfulness,
        })),
      unansweredSearches: Object.entries(misses)
        .map(([term, miss]) => ({
          term,
          searches: miss.searches,
          lastSearchedAt: miss.lastSearchedAt,
        }))
        .sort(
          (a, b) =>
            b.searches - a.searches ||
            b.lastSearchedAt.localeCompare(a.lastSearchedAt),
        )
        .slice(0, 10),
      unavailable: null,
    };
  }, [store]);

  const analytics = isConnected ? (fetched?.analytics ?? null) : demo;

  return {
    analytics,
    loading: isConnected && mayRead && fetched === null,
    error: isConnected ? (fetched?.error ?? null) : null,
    /**
     * The API's sentence when feedback and the miss log are not switched on.
     * Null when they are.
     */
    unavailable: analytics?.unavailable ?? null,
    reload: useCallback(() => setTick((t) => t + 1), []),
  };
}
