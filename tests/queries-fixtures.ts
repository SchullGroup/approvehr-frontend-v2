import type {
  ApiQueryCan,
  ApiQueryDetail,
  ApiQuerySummary,
} from "@/lib/api/queries";
import { CAN_NOTHING } from "@/lib/api/queries";

/** A subject line and an allegation that must never appear in a notification-shaped place. */
export const SUBJECT_LINE = "Unexplained absence on 4 and 5 November";
export const WHAT_HAPPENED =
  "You were not at your post on 4 and 5 November and nobody was told why.";

export const can = (over: Partial<ApiQueryCan> = {}): ApiQueryCan => ({
  ...CAN_NOTHING,
  ...over,
});

/** A detail the way the server sends it, with everything a reader needs and nothing more. */
export function detail(over: Partial<ApiQueryDetail> = {}): ApiQueryDetail {
  return {
    id: "q-1",
    reference: "Q-2026-014",
    status: "ISSUED",
    archived: false,
    subject: { id: "e-1", name: "Chidi Nwosu", employeeNo: "AHR-0003" },
    subjectLine: SUBJECT_LINE,
    whatHappened: WHAT_HAPPENED,
    rulesRelied: null,
    incidentOn: "2026-11-04",
    incidentUntil: "2026-11-05",
    question: "Please explain where you were and why you did not call in.",
    replyBy: "2026-11-20T16:00:00.000Z",
    replyState: "waiting",
    replyStateLabel: "Waiting for a reply. Reply by 20 Nov 2026, 5:00 pm.",
    served: {
      how: "IN_PRODUCT",
      at: "2026-11-18T09:00:00.000Z",
      handedByName: null,
      witnessName: null,
      refusedToReceive: false,
      note: null,
      subjectHadSignIn: true,
      subjectHasSignInNow: null,
      nobodyToldInProduct: false,
    },
    issuedBy: "Fatima Bello",
    issuedById: null,
    issuedAt: "2026-11-18T09:00:00.000Z",
    letterHash: "abc",
    openedAt: null,
    receiptConfirmedAt: null,
    reply: null,
    extensions: [],
    outcome: null,
    withdrawn: null,
    files: [],
    events: [],
    warnings: [],
    can: CAN_NOTHING,
    ...over,
  };
}

export function summary(over: Partial<ApiQuerySummary> = {}): ApiQuerySummary {
  return {
    id: "q-1",
    reference: "Q-2026-014",
    status: "ISSUED",
    archived: false,
    subject: { id: "e-1", name: "Chidi Nwosu", employeeNo: "AHR-0003" },
    subjectLine: SUBJECT_LINE,
    replyBy: "2026-11-20T16:00:00.000Z",
    replyState: "waiting",
    replyStateLabel: "Waiting for a reply. Reply by 20 Nov 2026, 5:00 pm.",
    issuedAt: "2026-11-18T09:00:00.000Z",
    openedAt: null,
    receiptConfirmedAt: null,
    outcome: null,
    updatedAt: "2026-11-18T09:00:00.000Z",
    ...over,
  };
}
