"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * The company noticeboard — `/api/v1/announcements`.
 *
 * ## Two shapes, because they answer different questions
 *
 * `ApiAnnouncement` is the management shape: it carries the draft state, the
 * expiry, the audience as ids **and** names, and `expired` — which is the field
 * a management screen cannot do without, because a notice can be published and
 * invisible at the same time and nothing else on the row says so.
 *
 * `ApiBoardNotice` is what staff read. No ids, no draft state, no expiry: a
 * notice on somebody's board is by definition live and in date, and shipping
 * fields nobody can act on is how a panel ends up rendering a "draft" badge to
 * two hundred people.
 *
 * ## The board arrives on the dashboard, not from here
 *
 * `/insights/dashboard` composes the same notices into its one request — see the
 * header of `app/(app)/dashboard/dashboard-screen.tsx`. `board()` below exists
 * for a caller that wants the noticeboard without a dashboard around it, and both
 * come out of one function on the API (`boardFor`), so the panel and the page
 * cannot disagree about whether somebody was told something.
 *
 * ## Deleting really deletes
 *
 * Every other DELETE in this API archives. This one does not, because nothing
 * references an announcement — no payslip, leave request or approval — so there
 * is no history to keep resolving. `DELETE_EFFECT` is that sentence, written
 * once so the confirm dialog and the toast cannot describe the same act
 * differently.
 *
 * No money crosses this module, so there is no kobo boundary in this file.
 */

/* ------------------------------------------------------------------- shapes */

export type AnnouncementAudience = "EVERYONE" | "DEPARTMENTS";

/** Mirrors `SerializedAnnouncement`. */
export type ApiAnnouncement = {
  id: string;
  title: string;
  /** Plain text. Render as paragraphs, never as HTML. */
  body: string;
  audience: AnnouncementAudience;
  departmentIds: string[];
  /**
   * Names for `departmentIds`, in the same order.
   *
   * Shorter than `departmentIds` when a department has been archived since —
   * the API drops the name rather than rendering a uuid. So the **ids** are the
   * count of who it is for and these are the label.
   */
  departmentNames: string[];
  pinned: boolean;
  published: boolean;
  publishedAt: string | null;
  /** `YYYY-MM-DD`, inclusive. Null means it stays until somebody takes it down. */
  expiresOn: string | null;
  /**
   * Published, and the date has passed.
   *
   * Not the same as `!published`: the row still says live and every screen would
   * show it as such while staff see nothing. This is the only field that says so.
   */
  expired: boolean;
  postedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Mirrors `BoardNotice`. What staff read. */
export type ApiBoardNotice = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string;
  /** Empty when the notice is for everybody. Names, never ids. */
  departmentNames: string[];
  postedByName: string | null;
};

/** Mirrors `Board`. */
export type ApiBoard = {
  notices: ApiBoardNotice[];
  /**
   * How many the reader may see in total.
   *
   * The API caps one read at ten. `total` above `notices.length` means older
   * notices exist and were not sent — worth saying rather than dropping.
   */
  total: number;
};

export type ApiPublishResult = {
  announcement: ApiAnnouncement;
  /** How many accounts can now read it. */
  reaches: number;
};

/* ------------------------------------------------------------------ params */

export type AnnouncementListParams = {
  page?: number;
  pageSize?: number;
  status?: "all" | "published" | "draft";
  /** Default true on the API — an expired notice is still somebody's work. */
  includeExpired?: boolean;
  sort?: "publishedAt" | "createdAt" | "updatedAt" | "title";
  order?: "asc" | "desc";
  /** Matches the title and the wording. */
  q?: string;
};

export type CreateAnnouncementBody = {
  title: string;
  body: string;
  audience?: AnnouncementAudience;
  departmentIds?: string[];
  pinned?: boolean;
  /** `YYYY-MM-DD`. */
  expiresOn?: string;
  /** Put it up straight away rather than saving a draft. Defaults to false. */
  publish?: boolean;
};

export type UpdateAnnouncementBody = {
  title?: string;
  body?: string;
  audience?: AnnouncementAudience;
  departmentIds?: string[];
  pinned?: boolean;
  /** `null` clears the date. Absent leaves it alone. */
  expiresOn?: string | null;
};

/* -------------------------------------------------------------------- copy */

/**
 * What deleting a notice actually does.
 *
 * Written here rather than in the dialog so the confirm and the toast cannot
 * drift, the same way `HOLIDAY_DELETE_EFFECTS` in `lib/api/leave.ts` does. And
 * it is worth spelling out precisely because it contradicts the rest of the
 * product: a caller who has learned "this system archives, it does not delete"
 * needs telling that here it does.
 */
export const DELETE_EFFECT =
  "Deleted, not archived. Nothing else in the system referenced it, so there " +
  "is nothing left to read afterwards, not for you and not in a report. To " +
  "take a notice off the board and keep the wording, take it down instead.";

/** Why a draft is not a dimmed notice. Used wherever drafts are listed. */
export const DRAFT_EFFECT =
  "A draft is invisible to staff — it is not on anybody's dashboard, dimmed or " +
  "otherwise. Publishing is what puts it there.";

/* ------------------------------------------------------------------- calls */

export const announcementsApi = {
  /** What the signed-in person may currently read. No id to tamper with. */
  board(signal?: AbortSignal): Promise<ApiBoard> {
    return request<ApiBoard>("/announcements/board", {
      ...(signal ? { signal } : {}),
    });
  },

  /** The management list, drafts included. Needs `MANAGE_SETTINGS`. */
  list(
    params: AnnouncementListParams = {},
    signal?: AbortSignal,
  ): Promise<Paged<ApiAnnouncement>> {
    return requestPaged<ApiAnnouncement>("/announcements", {
      query: { ...params },
      ...(signal ? { signal } : {}),
    });
  },

  get(id: string, signal?: AbortSignal): Promise<ApiAnnouncement> {
    return request<ApiAnnouncement>(`/announcements/${id}`, {
      ...(signal ? { signal } : {}),
    });
  },

  create(body: CreateAnnouncementBody): Promise<ApiAnnouncement> {
    return request<ApiAnnouncement>("/announcements", { method: "POST", body });
  },

  update(id: string, body: UpdateAnnouncementBody): Promise<ApiAnnouncement> {
    return request<ApiAnnouncement>(`/announcements/${id}`, {
      method: "PATCH",
      body,
    });
  },

  /** Refused if it is already up: publishing twice would bump it to the top. */
  publish(id: string): Promise<ApiPublishResult> {
    return request<ApiPublishResult>(`/announcements/${id}/publish`, {
      method: "POST",
    });
  },

  /** Off the board, wording kept. */
  unpublish(id: string): Promise<ApiAnnouncement & { note: string }> {
    return request<ApiAnnouncement & { note: string }>(
      `/announcements/${id}/unpublish`,
      { method: "POST" },
    );
  },

  /** Hard. See `DELETE_EFFECT`. */
  remove(
    id: string,
  ): Promise<{ id: string; title: string; wasPublished: boolean; note: string }> {
    return request<{
      id: string;
      title: string;
      wasPublished: boolean;
      note: string;
    }>(`/announcements/${id}`, { method: "DELETE" });
  },
};

/* ----------------------------------------------------------------- helpers */

/**
 * Who a notice is for, in words.
 *
 * One function so the management table, the form's preview and the dashboard
 * panel cannot describe the same audience three ways.
 */
export function audienceLabel(
  audience: AnnouncementAudience,
  departmentNames: readonly string[],
): string {
  if (audience === "EVERYONE") return "Everybody";
  if (departmentNames.length === 0) return "No department chosen";
  if (departmentNames.length <= 2) return departmentNames.join(" and ");
  return `${departmentNames.slice(0, 2).join(", ")} and ${departmentNames.length - 2} more`;
}
