"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * The knowledge base — `/api/v1/knowledge`.
 *
 * Typed wrappers only, in the same style as `conduct.ts` and `shifts.ts`: this
 * file knows the shape of the wire and nothing else. No React, no state, no
 * copy.
 *
 * ## No money crosses this boundary
 *
 * Not one field here is kobo, so there is no `naira()` seam at the bottom the
 * way `loans.ts` has one. If a figure ever does arrive in this module, convert
 * it here and nowhere else.
 *
 * ## Everybody reads. `MANAGE_SETTINGS` writes.
 *
 * The split is not reader versus writer, it is **published versus not**. A draft
 * is *invisible* to somebody without `MANAGE_SETTINGS` — a 404, not a 403,
 * because a 403 confirms that a draft with that id exists and a half-written
 * redundancy policy is exactly the thing you do not want confirmed early. So a
 * reader hitting an unpublished slug gets the same answer as a reader hitting a
 * slug that was never written: `not_found`. Do not translate that into "you do
 * not have permission".
 *
 * ## Two reads that are also writes
 *
 * - `article()` increments the view counter — but only for a published article,
 *   so an author previewing a draft four times is not four readers.
 * - `search()` records the term when it finds nothing. Successful searches are
 *   not written down at all; the failures are the valuable ones, because a
 *   search that returned nothing is an article somebody needs to write.
 *
 * Both mean a component must not poll either endpoint. Fetch on mount, refetch
 * after a write.
 *
 * ## Search and the article list are different searches, on purpose
 *
 * | | `search()` | `articles({ q })` |
 * |---|---|---|
 * | Matches | title and body, full-text, ranked | title only, substring |
 * | Sees drafts | never, for anybody | yes, for an editor |
 * | For | the reader's box | the editor's index |
 *
 * `search()` is prefix-matched, so results appear while somebody types rather
 * than after — "pens" finds the pension article. `q` is **required**: a search
 * with no term is a client bug, not an empty search, and the API refuses it
 * rather than answering with every article.
 *
 * ## Feedback and the miss log can be switched off
 *
 * Both live in tables the API probes for at runtime. If the migration has not
 * been applied, `helpful()` / `notHelpful()` answer **422 with a plain
 * message** and `analytics()` returns that same message in `unavailable`.
 * Show it. An empty helpfulness column that looks like "nobody has voted" is
 * the one wrong answer here.
 *
 * ## Voting replaces, never stacks
 *
 * One vote per person per article, upserted. A second click changes your mind
 * instead of adding another vote — otherwise "least helpful" measures who
 * clicked hardest.
 *
 * ## `DELETE /articles/:id` deletes nothing
 *
 * It clears `publishedAt`: hidden from staff, kept whole, publishable again with
 * one click. An article is the record of what the company told its people, and
 * somebody who followed last year's expenses policy needs it to still exist.
 * Word the control accordingly — "Hide", not "Delete".
 */

/* ------------------------------------------------------------------- shapes */

export type KbArticleStatus = "published" | "draft";

/**
 * A section of the help centre. Mirrors `SerializedCategory`.
 *
 * `articles` is "as this reader is allowed to count them" — published-only for
 * staff, everything for an editor — and `totalArticles` rolls up every section
 * beneath it. Both are on the wire because they answer different questions, the
 * same way the department tree carries direct and rolled-up headcount.
 */
export type ApiKbCategory = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  order: number;
  /** 0 for a top-level section. Drives the indent, and the label. */
  depth: number;
  /** Articles filed directly here. */
  articles: number;
  /** Of those, how many are live. Equal to `articles` for a reader. */
  published: number;
  /** Including every section beneath it. */
  totalArticles: number;
  children: ApiKbCategory[];
};

/** The same node without its children, for a picker. The API sends both. */
export type ApiKbCategoryFlat = Omit<ApiKbCategory, "children">;

export type ApiKbCategoryTree = {
  tree: ApiKbCategory[];
  flat: ApiKbCategoryFlat[];
  counts: {
    categories: number;
    articles: number;
    published: number;
    /** Filed nowhere. The articles nobody browses their way to. */
    uncategorised: number;
  };
};

/** What a create or an update answers with. Thinner than a tree node. */
export type ApiKbCategorySaved = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  order: number;
  articles: number;
  published: number;
  /** Sections inside it, as a count. */
  children: number;
  /** Root first, for a breadcrumb. */
  ancestors: { id: string; name: string; slug: string }[];
};

/** Mirrors `ArticleSummary`. `excerpt` is the opening, not the body. */
export type ApiKbArticle = {
  id: string;
  slug: string;
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  status: KbArticleStatus;
  publishedAt: string | null;
  views: number;
  helpful: number;
  notHelpful: number;
  /** Percent of votes that said yes. `null` until somebody votes. */
  helpfulness: number | null;
  excerpt: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiKbArticleDetail = ApiKbArticle & {
  body: string;
  /** Root first, for a breadcrumb. Empty when the article is filed nowhere. */
  section: { id: string; name: string; slug: string }[];
};

/** One ranked hit. `snippet` is cut around the first matching word. */
export type ApiKbSearchHit = {
  id: string;
  slug: string;
  title: string;
  categoryId: string | null;
  views: number;
  snippet: string;
  /** Higher is a better match. Title matches outrank body matches. */
  rank: number;
};

/** What a vote answers with. `yourVote` is the vote as now recorded. */
export type ApiKbVote = {
  id: string;
  yourVote: "helpful" | "not-helpful";
  helpful: number;
  notHelpful: number;
  helpfulness: number | null;
};

/** `DELETE /articles/:id`. Hidden, not deleted — `note` says so in words. */
export type ApiKbArticleHidden = {
  id: string;
  archived: boolean;
  note: string;
};

export type ApiKbCategoryDeleted = { id: string; deleted: boolean };

export type ApiKbReordered = { reordered: number; parentId: string | null };

/**
 * The editor's queue. Mirrors `analytics()`.
 *
 * `unansweredSearches` is the list worth opening: a question somebody had, in
 * their own words, that the knowledge base could not answer. Prefixes are
 * collapsed by the API — "how", "how d", "how do i change my bank" is one
 * question typed slowly — so these rows are whole questions, not keystrokes.
 *
 * `unavailable` is a plain sentence when the feedback and miss-log tables are
 * not there, and `null` when everything is wired. When it is set, `votes`,
 * `leastHelpful` and `unansweredSearches` are empty because they *cannot be
 * read*, which is a different thing from nobody having voted.
 */
export type ApiKbAnalytics = {
  totals: {
    articles: number;
    published: number;
    drafts: number;
    categories: number;
    views: number;
    votes: number;
    /** Published and never opened. Either nobody needs it, or nobody found it. */
    neverRead: number;
  };
  mostViewed: {
    id: string;
    slug: string;
    title: string;
    views: number;
    helpful: number;
    notHelpful: number;
  }[];
  leastHelpful: {
    id: string;
    slug: string;
    title: string;
    views: number;
    helpful: number;
    notHelpful: number;
    helpfulness: number | null;
  }[];
  unansweredSearches: {
    term: string;
    searches: number;
    lastSearchedAt: string;
  }[];
  unavailable: string | null;
};

/* ------------------------------------------------------------------- bodies */

export type CreateKbCategoryBody = {
  name: string;
  /** Derived from the name when omitted. Nobody should have to invent one. */
  slug?: string;
  /** Omit for a top-level section. */
  parentId?: string;
};

/** `parentId: null` promotes it to the top level; absent leaves it alone. */
export type UpdateKbCategoryBody = {
  name?: string;
  slug?: string;
  parentId?: string | null;
};

/**
 * Reorder a set of siblings, and set their parent in the same call.
 *
 * One operation because the gesture is one gesture: dragging a section sets
 * both where it sits and what it sits under, and splitting that in two means a
 * half-applied drag when the second call fails.
 */
export type ReorderKbCategoriesBody = {
  /** `null` is the top level. */
  parentId: string | null;
  /** Every sibling under that parent, in the order they should appear. */
  ids: string[];
};

export type CreateKbArticleBody = {
  title: string;
  body: string;
  slug?: string;
  categoryId?: string;
  /** Publish now, rather than saving a draft and publishing after. */
  publish?: boolean;
};

/**
 * `slug` is editable but never regenerated from a new title.
 *
 * The old slug is in somebody's bookmarks and in the message where they shared
 * it, so renaming an article leaves its URL alone. A form that sends a new
 * `slug` every time somebody edits the title breaks every link to it.
 */
export type UpdateKbArticleBody = {
  title?: string;
  slug?: string;
  body?: string;
  /** `null` moves it out of every section. */
  categoryId?: string | null;
};

export type KbArticleListParams = {
  page?: number;
  pageSize?: number;
  /** Title substring. Not the reader's search — see the table above. */
  q?: string;
  sort?: "updatedAt" | "createdAt" | "title" | "views" | "publishedAt";
  order?: "asc" | "desc";
  /** Forced to `published` by the API for anybody without `MANAGE_SETTINGS`. */
  status?: "all" | "published" | "draft";
  categoryId?: string;
  /** Narrows to articles filed nowhere. */
  uncategorised?: boolean;
};

export type KbSearchParams = {
  /** Required. A search with no term is a client bug, and the API says so. */
  q: string;
  page?: number;
  pageSize?: number;
};

/* -------------------------------------------------------------------- calls */

/** The API wants the string, and only when it is true. */
const flag = (value: boolean | undefined): "true" | undefined =>
  value ? "true" : undefined;

export const knowledgeApi = {
  /* ----------------------------------------------------------- sections */

  categories: (signal?: AbortSignal) =>
    request<ApiKbCategoryTree>("/knowledge/categories", {
      ...(signal ? { signal } : {}),
    }),

  createCategory: (body: CreateKbCategoryBody) =>
    request<ApiKbCategorySaved>("/knowledge/categories", {
      method: "POST",
      body,
    }),

  updateCategory: (id: string, body: UpdateKbCategoryBody) =>
    request<ApiKbCategorySaved>(`/knowledge/categories/${id}`, {
      method: "PATCH",
      body,
    }),

  /** Both the move and the ordering. See `ReorderKbCategoriesBody`. */
  reorderCategories: (body: ReorderKbCategoriesBody) =>
    request<ApiKbReordered>("/knowledge/categories/reorder", {
      method: "POST",
      body,
    }),

  /**
   * A hard delete, and it refuses while anything is filed inside — naming the
   * articles. An empty section is not evidence of anything; a section with
   * articles in it is somebody's filing, and moving it silently helps nobody.
   */
  deleteCategory: (id: string) =>
    request<ApiKbCategoryDeleted>(`/knowledge/categories/${id}`, {
      method: "DELETE",
    }),

  /* ----------------------------------------------------------- reading */

  /** Ranked, published-only, prefix-matched. Records a miss when it finds none. */
  search: (params: KbSearchParams, signal?: AbortSignal) =>
    requestPaged<ApiKbSearchHit>("/knowledge/search", {
      query: {
        q: params.q,
        page: params.page,
        pageSize: params.pageSize,
      },
      ...(signal ? { signal } : {}),
    }),

  articles: (params: KbArticleListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiKbArticle>("/knowledge/articles", {
      query: {
        page: params.page,
        pageSize: params.pageSize,
        q: params.q,
        sort: params.sort,
        order: params.order,
        status: params.status,
        categoryId: params.categoryId,
        uncategorised: flag(params.uncategorised),
      },
      ...(signal ? { signal } : {}),
    }),

  /**
   * By id **or** by slug — anything that is not a uuid is treated as a slug, so
   * a link can read `/help/kb/how-payslips-work`.
   *
   * Counts as a read. 404 for a draft unless the caller can edit.
   */
  article: (idOrSlug: string, signal?: AbortSignal) =>
    request<ApiKbArticleDetail>(
      `/knowledge/articles/${encodeURIComponent(idOrSlug)}`,
      { ...(signal ? { signal } : {}) },
    ),

  /** The editor's queue: what is read, what is wrong, what is missing. */
  analytics: (signal?: AbortSignal) =>
    request<ApiKbAnalytics>("/knowledge/analytics", {
      ...(signal ? { signal } : {}),
    }),

  /* ----------------------------------------------------------- writing */

  createArticle: (body: CreateKbArticleBody) =>
    request<ApiKbArticleDetail>("/knowledge/articles", { method: "POST", body }),

  updateArticle: (idOrSlug: string, body: UpdateKbArticleBody) =>
    request<ApiKbArticleDetail>(
      `/knowledge/articles/${encodeURIComponent(idOrSlug)}`,
      { method: "PATCH", body },
    ),

  /** 409 if it is already published. */
  publishArticle: (idOrSlug: string) =>
    request<ApiKbArticleDetail>(
      `/knowledge/articles/${encodeURIComponent(idOrSlug)}/publish`,
      { method: "POST" },
    ),

  /** Back to a draft. 409 if it was not published. */
  unpublishArticle: (idOrSlug: string) =>
    request<ApiKbArticleDetail>(
      `/knowledge/articles/${encodeURIComponent(idOrSlug)}/unpublish`,
      { method: "POST" },
    ),

  /** Hides it. Deletes nothing — see the note at the top of this file. */
  hideArticle: (idOrSlug: string) =>
    request<ApiKbArticleHidden>(
      `/knowledge/articles/${encodeURIComponent(idOrSlug)}`,
      { method: "DELETE" },
    ),

  /* ---------------------------------------------------------- feedback */

  /** Replaces this person's previous vote. 422 when the tables are missing. */
  helpful: (idOrSlug: string) =>
    request<ApiKbVote>(
      `/knowledge/articles/${encodeURIComponent(idOrSlug)}/helpful`,
      { method: "POST" },
    ),

  notHelpful: (idOrSlug: string) =>
    request<ApiKbVote>(
      `/knowledge/articles/${encodeURIComponent(idOrSlug)}/not-helpful`,
      { method: "POST" },
    ),
};

export type { Paged };
