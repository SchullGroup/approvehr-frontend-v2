"use client";

import { ApiError } from "@/lib/api/client";
import {
  accessOf,
  cancel,
  eventsOf,
  findStaff,
  invite,
  optionsOf,
  resend,
  revoke,
  setRestricted,
  setScoreVisibility,
  type Op,
} from "./demo-ops";
import { accessRun, demoAccess } from "./demo-store";
import type { AccessGateway } from "./gateway";

/**
 * The gateway for a demo: the book in this browser, answering in the API's words.
 *
 * Refusals are thrown as `ApiError` so a screen has one catch block whichever side it
 * is talking to; a refusal about fields carries them, as a `400` does.
 */

function unwrap<T>(result: Op<T>): T {
  if (!result.ok) {
    if (result.problems)
      throw new ApiError(
        400,
        "validation_failed",
        result.error,
        result.problems,
      );
    throw new ApiError(422, "unprocessable", result.error);
  }
  return result.value;
}

export const demoAccessGateway: AccessGateway = {
  mode: "demo",

  get: async (requisitionId) => accessOf(demoAccess.current(), requisitionId),

  events: async (requisitionId) =>
    eventsOf(demoAccess.current(), requisitionId),

  setRestricted: async (requisitionId, restricted) => {
    unwrap(accessRun((book) => setRestricted(book, requisitionId, restricted)));
    return accessOf(demoAccess.current(), requisitionId);
  },

  setScoreVisibility: async (requisitionId, visibility) => {
    unwrap(
      accessRun((book) => setScoreVisibility(book, requisitionId, visibility)),
    );
    return accessOf(demoAccess.current(), requisitionId);
  },

  revoke: async (requisitionId, member) => {
    unwrap(accessRun((book) => revoke(book, requisitionId, member.id)));
  },

  invites: {
    options: async () => optionsOf(),
    invite: async (requisitionId, input) =>
      unwrap(accessRun((book) => invite(book, requisitionId, input))),
    resend: async (requisitionId, pending) => {
      unwrap(accessRun((book) => resend(book, requisitionId, pending.id)));
      return {
        delivered: false,
        said: `Invitation sent again to ${pending.email}. Nothing leaves a practice copy, so no email went anywhere.`,
      };
    },
    cancel: async (requisitionId, pending) => {
      unwrap(accessRun((book) => cancel(book, requisitionId, pending.id)));
    },
  },

  people: async (search) => findStaff(demoAccess.current(), search),
};
