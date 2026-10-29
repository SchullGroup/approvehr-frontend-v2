"use client";

import {
  request,
  requestPaged,
  requestStream,
  type Paged,
} from "@/lib/api/client";
import type { EmployeeAccess } from "@/lib/types";

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

export type AnnouncementAudience = "EVERYONE" | "DEPARTMENTS" | "PEOPLE";

/** The attached picture, described. The bytes come from `announcementsApi.image`. */
export type ApiNoticeImage = {
  filename: string;
  contentType: string;
  sizeBytes: number;
};

/** A picture on its way to the API: base64, as documents travel. */
export type NoticeImageUpload = {
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  contentBase64: string;
};

/** Mirrors the API's `MAX_NOTICE_IMAGE_BYTES`. */
export const MAX_NOTICE_IMAGE_BYTES = 5 * 1024 * 1024;
export const NOTICE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Who was told, on a write that published. */
export type ApiDelivery = { notified: number; emailing: number };

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
  /*
   * The three below are optional because demo data and an older API do not
   * carry them; absent reads as "nobody named" and "no picture".
   */
  /** Ids as stored, for `PEOPLE`. */
  employeeIds?: string[];
  /** Names for `employeeIds`. Somebody removed since is dropped. */
  employeeNames?: string[];
  image?: ApiNoticeImage | null;
  pinned: boolean;
  /**
   * Staff are expected to open it.
   *
   * It marks and it counts, and nothing more: it blocks nothing, widens nobody's
   * audience and changes nothing about what a read receipt is. Turning it on or
   * off after the notice is up is allowed, and is recorded in the audit trail.
   */
  mandatory: boolean;
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
  /** Only on a create that published. */
  delivery?: ApiDelivery;
};

/** Mirrors `BoardNotice`. What staff read. */
export type ApiBoardNotice = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  /** Staff are expected to open it. See `ApiAnnouncement.mandatory`. */
  mandatory: boolean;
  publishedAt: string;
  /** Empty when the notice is for everybody. Names, never ids. */
  departmentNames: string[];
  /** Sent to named people, the reader among them. Who else is never said. */
  personal?: boolean;
  /** A picture comes with it: `announcementsApi.image(id)`. */
  hasImage?: boolean;
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

/**
 * Mirrors `MarkedRead`: the answer to "I have opened this".
 *
 * `readAt` is the **first** time and a second press does not move it, so
 * `alreadyRead` is how a caller tells the two apart. Neither is an error.
 */
export type ApiMarkedRead = {
  id: string;
  read: true;
  readAt: string;
  alreadyRead: boolean;
};

/** Which of a notice's two lists: who has opened it, or who still has to. */
export type ReaderState = "read" | "unread";

/**
 * One account on a notice's reader list.
 *
 * Per **account**, not per employee: an owner with no staff record can read a
 * company-wide notice and appears here with `employeeId: null` and no department.
 */
export type ApiReader = {
  userId: string;
  name: string;
  employeeId: string | null;
  department: string | null;
  /** When they first opened it. Null in the "still to read" list, by definition. */
  readAt: string | null;
};

/**
 * What comes with either list, so one screen can say "7 of 12, 58%" above
 * whichever tab is open.
 *
 * `reach` is the accounts that could read the notice now (everybody for a
 * company-wide one, the chosen departments' staff otherwise), and is always
 * `read + unread`. A receipt from somebody who has since left or moved out of the
 * audience is kept by the API and counts in neither, which is what keeps the rate
 * at or under 100%.
 */
export type ApiReadersMeta = {
  counts: { reach: number; read: number; unread: number };
  /** A whole percent, or null when nobody is in the audience: never a 0. */
  readRate: number | null;
  /** Whether staff are expected to open the notice. */
  mandatory: boolean;
};

export type ReadersParams = {
  state: ReaderState;
  page?: number;
  pageSize?: number;
};

export type ApiPublishResult = {
  announcement: ApiAnnouncement;
  /** How many accounts can now read it. */
  reaches: number;
  delivery: ApiDelivery;
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
  /** Only notices sent to this person by name. */
  employeeId?: string;
};

export type CreateAnnouncementBody = {
  title: string;
  body: string;
  audience?: AnnouncementAudience;
  departmentIds?: string[];
  employeeIds?: string[];
  image?: NoticeImageUpload;
  pinned?: boolean;
  /** Staff are expected to open it. Defaults to false. */
  mandatory?: boolean;
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
  employeeIds?: string[];
  /** `null` removes the picture. Absent leaves it alone. */
  image?: NoticeImageUpload | null;
  pinned?: boolean;
  /**
   * Set or cleared at any time. The API records a change to it as its own audit
   * event, and only when the stored value actually moves, so a body that repeats
   * the current value says nothing.
   */
  mandatory?: boolean;
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

/**
 * What a must-read notice is, and what changing it later does.
 *
 * Written once so the form's tooltip and the list's badge cannot say different
 * things. "Recorded" is the API's behaviour (an audit event of its own, apart from
 * the edit's): who stopped requiring staff to read something, and when, is one
 * thing to search for. People who have already read the notice stay read either
 * way, and a notice cannot be made to ask everybody again except by taking it down
 * and publishing it.
 */
export const MANDATORY_CHANGE_RECORDED =
  "Turning this on or off after the notice is published is recorded, with " +
  "who did it and when. People who have already read it stay read.";

/** What the switch does for the reader. It blocks nothing. */
export const MANDATORY_EFFECT =
  "A task on their Today panel until they open it. It does not stop anybody " +
  "working and it reaches nobody new.";

/** Why a draft is not a dimmed notice. Used wherever drafts are listed. */
export const DRAFT_EFFECT =
  "A draft is invisible to staff, it is not on anybody's dashboard, dimmed or " +
  "otherwise. Publishing is what puts it there.";

/**
 * Whether a notice can be addressed to somebody by name, and what to say about it.
 *
 * It copies the API's rule and nothing stricter (`assertPeople` in the
 * announcements module): a person is refused when they have **no account at
 * all** or their account is **archived**, and accepted otherwise. That includes
 * somebody who was invited and has not accepted yet. They have an account, so
 * the notice waits in their notifications until they sign in.
 *
 * The first version of this refused everybody who was not `ACCEPTED`, which
 * turned away people the API takes and told them to invite somebody who had
 * already been invited. A screen that is stricter than the server teaches
 * people a rule the server does not have.
 *
 * `undefined` is "not known" (demo mode, or a caller who is sent lookup rows
 * and so gets no access summary), and not known is allowed: the API decides at
 * send, and its refusal names the person.
 *
 * The wording is the record's own ("Invited", "Invitation expired", "Access
 * closed"), kept in one place so the picker's row and the Send message dialog
 * cannot describe the same person two ways.
 */
export type NoticeReach = {
  /** False exactly when the API would refuse them. */
  can: boolean;
  /** One short line for a row in a list. Null when there is nothing to say. */
  line: string | null;
  /** A phrase that follows their name, for a heading. Null when there is nothing to say. */
  headline: string | null;
  /** What it means for the message, and what to do. Null when there is nothing to say. */
  detail: string | null;
};

const REACHABLE: NoticeReach = {
  can: true,
  line: null,
  headline: null,
  detail: null,
};

export function noticeReach(
  access: Pick<EmployeeAccess, "state"> | undefined,
): NoticeReach {
  switch (access?.state) {
    case "NONE":
      return {
        can: false,
        line: "No account yet, so cannot be sent a message",
        headline: "has no account yet",
        detail:
          "A message lands in their notifications, which they cannot open " +
          "without an account. Invite them to sign in first.",
      };
    case "DISABLED":
      return {
        can: false,
        line: "Access closed, so cannot be sent a message",
        headline: "no longer has access",
        detail:
          "Their account is archived, so a message would sit in notifications " +
          "they cannot open.",
      };
    case "SENT":
      return {
        can: true,
        line: "Invited, has not signed in yet",
        headline: "has not signed in yet",
        detail:
          "They have been invited and have not accepted yet. They will see " +
          "this once they do.",
      };
    case "EXPIRED":
      return {
        can: true,
        line: "Invitation expired, has not signed in yet",
        headline: "has not signed in yet",
        detail:
          "Their invitation ran out before they used it. They will see this " +
          "once they sign in, which needs another invitation.",
      };
    default:
      return REACHABLE;
  }
}

/* ------------------------------------------------------------------- calls */

export const announcementsApi = {
  /** What the signed-in person may currently read. No id to tamper with. */
  board(signal?: AbortSignal): Promise<ApiBoard> {
    return request<ApiBoard>("/announcements/board", {
      ...(signal ? { signal } : {}),
    });
  },

  /**
   * "I have opened this."
   *
   * No permission: the signed-in person is the account in the token, so there is
   * no id to tamper with but the notice's own. Idempotent and always 200. A
   * notice the board would not have shown them (a draft, an expired one, another
   * department's) is a 404 whatever the reason.
   */
  markRead(id: string): Promise<ApiMarkedRead> {
    return request<ApiMarkedRead>(`/announcements/${id}/read`, {
      method: "POST",
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

  /**
   * Who has opened a notice and who still has to, for the notice's own audience.
   * Needs `MANAGE_SETTINGS`: an employee gets 403 whatever the notice, even one
   * addressed to them, and sees only their own receipt on Today.
   *
   * `read` is the evidence (newest first) and `unread` the chase list (by name).
   * A draft or a notice taken down is a 409, because nobody can have read it, and
   * an expired one still answers so HR can see the final rate.
   */
  readers(
    id: string,
    params: ReadersParams,
    signal?: AbortSignal,
  ): Promise<Paged<ApiReader, ApiReadersMeta>> {
    return requestPaged<ApiReader, ApiReadersMeta>(
      `/announcements/${id}/readers`,
      { query: { ...params }, ...(signal ? { signal } : {}) },
    );
  },

  /**
   * The notice's picture, as a blob for an object URL. An `<img src>` cannot
   * carry the bearer token, so it is fetched like any other call.
   */
  async image(id: string, signal?: AbortSignal): Promise<Blob> {
    const response = await requestStream(`/announcements/${id}/image`, {
      method: "GET",
      accept: "image/*",
      ...(signal ? { signal } : {}),
    });
    return response.blob();
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
  remove(id: string): Promise<{
    id: string;
    title: string;
    wasPublished: boolean;
    note: string;
  }> {
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
  employeeNames: readonly string[] = [],
): string {
  if (audience === "EVERYONE") return "Everybody";
  if (audience === "PEOPLE") {
    if (employeeNames.length === 0) return "Nobody chosen";
    if (employeeNames.length <= 2) return employeeNames.join(" and ");
    return `${employeeNames.slice(0, 2).join(", ")} and ${employeeNames.length - 2} more`;
  }
  if (departmentNames.length === 0) return "No department chosen";
  if (departmentNames.length <= 2) return departmentNames.join(" and ");
  return `${departmentNames.slice(0, 2).join(", ")} and ${departmentNames.length - 2} more`;
}
