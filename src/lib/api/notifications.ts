"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * The notification inbox endpoints.
 *
 * Hand-written like the rest of `lib/api/*`, and deliberately thin: there is no
 * money here and nothing to convert, so this file is a type and five calls.
 *
 * Two things about the API worth knowing before you use it:
 *
 * 1. **There is no user id in any of these paths.** The server scopes every
 *    query to the caller's own account, and there is no permission that opens
 *    somebody else's inbox. A notification is often the only place a private
 *    fact appears as a sentence ("Ngozi's account number was changed"), so
 *    "read everyone's bell" is a surveillance feature rather than an admin
 *    convenience. Nothing to pass means nothing to get wrong.
 *
 * 2. **Every mutation returns the new unread count.** That is what keeps the
 *    bell honest without a second round trip — see `publishUnread` in
 *    `lib/store/notifications.ts`, which is the only place these numbers go.
 *
 * The list endpoint ignores `sort` and `order` on purpose. An inbox has one
 * correct order (unread first, then newest) and a client that can re-sort it is
 * a client that can bury the thing needing a decision on page three.
 */

/** `ACTION` is the one that means "there is something for you to do". */
export type NotificationSeverity = "INFO" | "ACTION" | "WARNING" | "CRITICAL";

/** Mirrors `SerializedNotification` in the API's notifications service. */
export type ApiNotification = {
  id: string;
  /** The rule that produced it, where one did. */
  ruleId: string | null;
  title: string;
  body: string | null;
  /** Relative, so it survives a domain change. Null when there is nowhere to go. */
  actionHref: string | null;
  /** What the message is about: `payroll_run`, `employee`, `leave_request`, … */
  entityType: string | null;
  entityId: string | null;
  severity: NotificationSeverity;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};

export type InboxParams = {
  page?: number;
  pageSize?: number;
  /** Only what has not been read. Omit for everything. */
  unread?: boolean;
  severity?: NotificationSeverity;
};

export const notificationsApi = {
  list: (
    params: InboxParams = {},
    signal?: AbortSignal,
  ): Promise<Paged<ApiNotification>> =>
    requestPaged<ApiNotification>("/notifications", {
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 40,
        /* Sent only when filtering. The API defaults it to "false" and passing
           the default back would just make the URL noisier. */
        unread: params.unread ? "true" : undefined,
        severity: params.severity,
      },
      ...(signal ? { signal } : {}),
    }),

  /** Just the number, for the bell. One count, no per-severity breakdown. */
  unreadCount: (signal?: AbortSignal): Promise<{ unread: number }> =>
    request<{ unread: number }>("/notifications/unread-count", {
      ...(signal ? { signal } : {}),
    }),

  /** Idempotent. Reading something twice is not an error. */
  markRead: (id: string): Promise<{ id: string; read: true; unread: number }> =>
    request<{ id: string; read: true; unread: number }>(
      `/notifications/${id}/read`,
      { method: "POST" },
    ),

  markAllRead: (): Promise<{ marked: number; unread: number }> =>
    request<{ marked: number; unread: number }>("/notifications/read-all", {
      method: "POST",
    }),

  /**
   * A hard delete, unlike everything else in this product.
   *
   * The archive-never-delete rule protects records — an employment record, a
   * payslip, an approval. A notification is a *message about* a record, and the
   * record it points at is still there. Keeping the message forever would only
   * make the inbox unusable.
   */
  remove: (id: string): Promise<{ id: string; deleted: true; unread: number }> =>
    request<{ id: string; deleted: true; unread: number }>(
      `/notifications/${id}`,
      { method: "DELETE" },
    ),
};
