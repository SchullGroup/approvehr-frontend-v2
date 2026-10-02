"use client";

import { ApiError, request } from "./client";

/**
 * Plans and checkout — `/billing/*`.
 *
 * Typed wrappers in the same hand-written style as the rest of `lib/api/*`.
 * `plans()` and `checkout()` are open to anyone signed in to read a price, but
 * `constraints.md` restricts who the UI lets *act* on them: only an account
 * holding `MANAGE_SETTINGS` sees a Subscribe/Pay action at all.
 *
 * Money is integer kobo, same convention as the rest of this directory; a
 * screen divides by 100 at the point it renders naira, never here.
 */

export type ApiPlan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceKobo: number;
  currency: string;
  modules: string[];
};
export type ApiCheckout = {
  order: {
    id: string;
    planId: string;
    planName: string;
    months: number;
    amountKobo: number;
  };
  account: { bankName: string; accountNumber: string; accountName: string };
};

export const billingApi = {
  plans: (signal?: AbortSignal) =>
    request<ApiPlan[]>("/billing/plans", signal ? { signal } : {}),
  checkout: (body: { planId: string; months: number }) =>
    request<ApiCheckout>("/billing/checkout", { method: "POST", body }),
  /** The open order, or null when there is none (the API answers 404). */
  currentCheckout: async (
    signal?: AbortSignal,
  ): Promise<ApiCheckout | null> => {
    try {
      return await request<ApiCheckout>(
        "/billing/checkout",
        signal ? { signal } : {},
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
};
