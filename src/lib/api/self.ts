import { request } from "@/lib/api/client";

/**
 * The two self-service calls that had no wrapper.
 *
 * Deliberately its own file rather than an addition to `endpoints.ts`: that
 * module is the typed surface for administering *other people's* records, and
 * these are the only two things a person does to their own account. Keeping
 * them apart means a screen that imports this cannot accidentally reach the
 * directory.
 */
export const self = {
  /**
   * Revokes every session for this account, including the current one.
   *
   * The caller must sign out locally afterwards — the access token in memory
   * stays syntactically valid until it expires, so leaving it in place would
   * look like nothing happened for up to fifteen minutes.
   */
  signOutEverywhere: () =>
    request<void>("/auth/sign-out-everywhere", { method: "POST" }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),
};
