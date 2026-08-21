"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  webhooksApi,
  type ApiCatalogue,
  type ApiDelivery,
  type ApiEnvelope,
  type ApiEventDefinition,
  type ApiRetrySpec,
  type ApiSignatureExample,
  type ApiSignatureSpec,
  type ApiWebhook,
  type ApiWebhookDetail,
  type CreateWebhookBody,
  type DeliveryStatus,
  type UpdateWebhookBody,
} from "@/lib/api/webhooks";
import { todayDate } from "@/lib/today";
import { useSession } from "./session";

/**
 * Webhooks, from whichever source is available.
 *
 * ## Demo mode cannot send an HTTP request, and does not pretend to
 *
 * Every other store in `lib/store/*` has a localStorage branch that can write.
 * This one deliberately does not, for the same reason `departments.ts` does not:
 * what a webhook *is* is an HTTP POST to a server the customer owns. A browser
 * with no API behind it cannot make that request, so a demo "Send test" that
 * reported `200 OK` would be inventing the one fact the entire screen exists to
 * establish. A green tick that nothing received is exactly the failure the audit
 * of the incumbent found, in a different column.
 *
 * So demo mode is **read-only worked examples**, derived during render from the
 * fixture below, and every mutation refuses with a message that says why. The
 * two examples are chosen to show the two states that matter: one healthy, and
 * one that switched itself off after repeated failure.
 *
 * ## The fixture never fabricates a signature
 *
 * `DEMO_CATALOGUE` copies event names, descriptions and sample payloads from the
 * API's `events.ts` so the demo can show the checkbox list and the samples — the
 * same demo-prop arrangement `features.ts` makes for the wizard's questions, and
 * with the same rule: the connected path never touches it, and if the two
 * disagree the served one is right.
 *
 * What it does **not** copy is the worked signature example, because that value
 * is an HMAC computed by the API on every request. A hand-written hex digest
 * would be a *wrong* digest that somebody could implement their receiver
 * against and then spend a day debugging. `signature.example` is therefore
 * `null` in demo mode, and `live: false` tells a screen to say so in one line
 * rather than to draw something untrue.
 *
 * ## Derived, not set
 *
 * The demo branch is computed during render and the effects return early when
 * disconnected, so nothing here calls `setState` inside an effect body. Fetched
 * results are keyed by the request they answer, which is what makes `loading`
 * derivable and stops a slow response for one filter landing under another.
 */

/* --------------------------------------------------------------- the shapes */

/**
 * The catalogue as a screen consumes it.
 *
 * Identical to the API's shape except that `signature.example` is nullable and
 * `live` says whether any of this came from a server.
 */
export type CatalogueView = {
  events: ApiEventDefinition[];
  envelope: ApiEnvelope;
  money: string;
  signature: Omit<ApiSignatureSpec, "example"> & {
    /** Null in demo mode: a real HMAC is the API's to compute, not ours. */
    example: ApiSignatureExample | null;
  };
  retries: ApiRetrySpec;
  delivery: DeliveryStatus;
  /** False in demo mode. */
  live: boolean;
};

/* -------------------------------------------------------------- the fixture */

/** Late afternoon on the demo's day, so timestamps read as "today". */
const DEMO_NOW = new Date(todayDate().getTime() + 16 * 3_600_000);

const at = (minutesAgo: number): string =>
  new Date(DEMO_NOW.getTime() - minutesAgo * 60_000).toISOString();

const ahead = (minutes: number): string =>
  new Date(DEMO_NOW.getTime() + minutes * 60_000).toISOString();

const DEMO_WEBHOOKS: ApiWebhook[] = [
  {
    id: "demo-live",
    url: "https://hooks.acme-foods.example/approvehr",
    events: ["payroll_run.approved", "payment_batch.approved", "leave.approved"],
    active: true,
    secretHint: "whsec_…4f2a",
    disabledAt: null,
    disabledReason: null,
    /* Every one of them, and truthfully: nothing in the product raises these
       yet. The screen says so rather than implying a quiet endpoint is broken. */
    notRaisedYet: [
      "payroll_run.approved",
      "payment_batch.approved",
      "leave.approved",
    ],
    health: {
      delivered: 128,
      failed: 0,
      pending: 1,
      lastActivityAt: at(12),
      lastDeliveredAt: at(41),
    },
    createdAt: at(60 * 24 * 26),
    updatedAt: at(60 * 24 * 3),
  },
  {
    id: "demo-off",
    url: "https://reporting.acme-foods.example/webhooks/payroll",
    events: ["employee.created", "employee.archived"],
    active: false,
    secretHint: "whsec_…9c07",
    disabledAt: at(60 * 20),
    /* Worded exactly as `runner.ts` writes it, so the demo cannot teach somebody
       to expect a sentence the API never produces. */
    disabledReason:
      "3 deliveries in a row failed every attempt. Last failure: The server refused the connection. Nothing is listening on that port.",
    notRaisedYet: ["employee.created", "employee.archived"],
    health: {
      delivered: 46,
      failed: 3,
      pending: 0,
      lastActivityAt: at(60 * 20),
      lastDeliveredAt: at(60 * 24 * 4),
    },
    createdAt: at(60 * 24 * 51),
    updatedAt: at(60 * 20),
  },
];

const DEMO_DELIVERY_STATUS: DeliveryStatus = { mode: "inline", retriesRunning: false };

const delivery = (
  row: Omit<ApiDelivery, "maxAttempts" | "webhookId"> & { webhookId: string },
): ApiDelivery => ({ maxAttempts: 6, ...row });

const DEMO_DELIVERIES: Record<string, ApiDelivery[]> = {
  "demo-live": [
    delivery({
      id: "demo-d1",
      webhookId: "demo-live",
      event: "payroll_run.approved",
      attempt: 3,
      statusCode: 502,
      error: null,
      state: "pending",
      deliveredAt: null,
      retryAt: ahead(13),
      createdAt: at(12),
      payload: {
        id: "0192f3c3-1122-7bd3-8e44-77a1b0c9d3e2",
        period: "2026-08",
        payDate: "2026-08-28",
        employees: 42,
        grossKobo: 1840000000,
        netKobo: 1482800000,
        payeKobo: 210000000,
      },
    }),
    delivery({
      id: "demo-d2",
      webhookId: "demo-live",
      event: "leave.approved",
      attempt: 1,
      statusCode: 200,
      error: null,
      state: "delivered",
      deliveredAt: at(41),
      retryAt: null,
      createdAt: at(41),
      payload: {
        id: "0192f3c2-0f11-7a52-b3cd-4a9e2f7c1b08",
        employee: { id: "0192f3c1-8a4e-7c2b-9f10-6d2b7a4e11c3", name: "Adaeze Okonkwo" },
        leaveType: "Annual",
        startDate: "2026-09-14",
        endDate: "2026-09-18",
        days: 5,
      },
    }),
    delivery({
      id: "demo-d3",
      webhookId: "demo-live",
      event: "webhook.test",
      attempt: 1,
      statusCode: 200,
      error: null,
      state: "delivered",
      deliveredAt: at(60 * 26),
      retryAt: null,
      createdAt: at(60 * 26),
      payload: {
        message:
          "If your server is reading this, the endpoint and the signature both work.",
        sentAt: "2026-08-18T14:00:00.000Z",
      },
    }),
  ],
  "demo-off": [
    delivery({
      id: "demo-d4",
      webhookId: "demo-off",
      event: "employee.created",
      attempt: 6,
      statusCode: null,
      error: "The server refused the connection. Nothing is listening on that port.",
      state: "failed",
      deliveredAt: null,
      retryAt: null,
      createdAt: at(60 * 33),
      payload: {
        id: "0192f3c1-8a4e-7c2b-9f10-6d2b7a4e11c3",
        employeeNo: "EMP-0042",
        firstName: "Adaeze",
        lastName: "Okonkwo",
        jobTitle: "Accountant",
        department: "Finance",
        startDate: "2026-09-01",
        grossMonthlyKobo: 45000000,
      },
    }),
    delivery({
      id: "demo-d5",
      webhookId: "demo-off",
      event: "employee.archived",
      attempt: 6,
      statusCode: null,
      error: "No answer within 10 seconds.",
      state: "failed",
      deliveredAt: null,
      retryAt: null,
      createdAt: at(60 * 44),
      payload: {
        id: "0192f3c1-8a4e-7c2b-9f10-6d2b7a4e11c3",
        employeeNo: "EMP-0042",
        name: "Adaeze Okonkwo",
        lastWorkingDay: "2026-10-31",
        reason: "RESIGNATION",
      },
    }),
  ],
};

/**
 * Four events, copied from the API's catalogue.
 *
 * A demo prop, in the sense `features.ts` uses the term: enough to show the
 * checkbox list and a real sample payload without a server. The connected path
 * never reads it.
 */
const DEMO_CATALOGUE: CatalogueView = {
  events: [
    {
      name: "webhook.test",
      description:
        "A sample payload, sent on request so you can prove your endpoint works.",
      raisedWhen: "Somebody presses Send test event. Nothing else raises it.",
      wired: true,
      sample: {
        message:
          "If your server is reading this, the endpoint and the signature both work.",
        sentAt: "2026-08-20T09:15:00.000Z",
      },
    },
    {
      name: "employee.created",
      description: "A new person has been added to the staff list.",
      raisedWhen: "An employee record is created, by hand or by an import.",
      wired: false,
      sample: {
        id: "0192f3c1-8a4e-7c2b-9f10-6d2b7a4e11c3",
        employeeNo: "EMP-0042",
        firstName: "Adaeze",
        lastName: "Okonkwo",
        jobTitle: "Accountant",
        department: "Finance",
        startDate: "2026-09-01",
        grossMonthlyKobo: 45000000,
      },
    },
    {
      name: "leave.approved",
      description: "A leave request has been approved.",
      raisedWhen: "The last approver on the request approves it.",
      wired: false,
      sample: {
        id: "0192f3c2-0f11-7a52-b3cd-4a9e2f7c1b08",
        employee: {
          id: "0192f3c1-8a4e-7c2b-9f10-6d2b7a4e11c3",
          name: "Adaeze Okonkwo",
        },
        leaveType: "Annual",
        startDate: "2026-09-14",
        endDate: "2026-09-18",
        days: 5,
        balanceRemainingDays: 7,
      },
    },
    {
      name: "payroll_run.approved",
      description: "A payroll run has been approved and its figures are now fixed.",
      raisedWhen:
        "The run is approved. Approving does not move money — this is the event to hook if you post journals to an accounting system.",
      wired: false,
      sample: {
        id: "0192f3c3-1122-7bd3-8e44-77a1b0c9d3e2",
        period: "2026-08",
        payDate: "2026-08-28",
        employees: 42,
        grossKobo: 1840000000,
        netKobo: 1482800000,
        payeKobo: 210000000,
        pensionEmployeeKobo: 147200000,
        pensionEmployerKobo: 184000000,
      },
    },
  ],
  envelope: {
    id: "0192f3c7-5566-7f17-c288-bbe5f4031726",
    event: "webhook.test",
    createdAt: "2026-08-20T09:15:00.000Z",
    data: {
      message:
        "If your server is reading this, the endpoint and the signature both work.",
      sentAt: "2026-08-20T09:15:00.000Z",
    },
  },
  money:
    "Every amount is a whole number of kobo and every field is named …Kobo. ₦450,000.00 is 45000000.",
  signature: {
    algorithm: "HMAC-SHA256",
    version: "v1",
    headers: {
      signature: "X-ApproveHR-Signature",
      timestamp: "X-ApproveHR-Timestamp",
      event: "X-ApproveHR-Event",
      delivery: "X-ApproveHR-Delivery",
    },
    construction:
      'X-ApproveHR-Signature = "v1=" + lowercase_hex(HMAC_SHA256(secret, timestamp + "." + raw_request_body))',
    steps: [
      "Read the raw request body before parsing it. Re-serialising parsed JSON changes the bytes and the digest will not match.",
      "Join the X-ApproveHR-Timestamp value, a full stop, and that raw body.",
      "HMAC-SHA256 it with your webhook secret as the key, exactly as shown to you, and hex-encode the result.",
      "Compare in constant time, and reject anything older than 300 seconds.",
    ],
    toleranceSeconds: 300,
    /* Never invented. See the note at the top of this file. */
    example: null,
  },
  retries: {
    attempts: 6,
    backoffMinutes: [1, 5, 25, 125, 625],
    timeoutMs: 10_000,
    switchedOffAfter: 3,
    note: "6 attempts per event, waiting 1, 5, 25, 125, 625 minutes between them. After 3 events fail every attempt, the webhook is switched off and whoever manages settings is told why. Test sends never count towards that.",
    idempotency:
      "Retries reuse the X-ApproveHR-Delivery value, so treat it as an idempotency key. Delivery is at-least-once.",
  },
  delivery: DEMO_DELIVERY_STATUS,
  live: false,
};

/** What every mutation refuses with when there is no API behind the screen. */
const DEMO_REFUSAL = new ApiError(
  0,
  "demo_mode",
  "Nothing in this browser can post to your server. Connect the API to add an " +
    "endpoint, send a test, or retry a delivery.",
);

/* ------------------------------------------------------------ the catalogue */

/**
 * Events, sample payloads, the signature construction and the retry schedule.
 *
 * One request, on mount. Cached per hook rather than globally because two
 * screens are never mounted at once — the list and the detail are separate
 * routes — and a module singleton here would outlive a sign-out.
 */
export function useWebhookCatalogue() {
  const { isConnected, isLoading } = useSession();
  const [loaded, setLoaded] = useState<{
    catalogue: CatalogueView | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const served: ApiCatalogue = await webhooksApi.catalogue(controller.signal);
        if (!cancelled) {
          setLoaded({ catalogue: { ...served, live: true }, error: null });
        }
      } catch (error) {
        if (cancelled) return;
        setLoaded({
          catalogue: null,
          error:
            error instanceof ApiError
              ? error.message
              : "Could not load the event list.",
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected]);

  if (!isConnected) {
    return {
      catalogue: isLoading ? null : DEMO_CATALOGUE,
      loading: isLoading,
      error: null as string | null,
    };
  }

  return {
    catalogue: loaded?.catalogue ?? null,
    loading: loaded === null,
    error: loaded?.error ?? null,
  };
}

/* ------------------------------------------------------------------ the list */

export type WebhookListOptions = {
  state?: "all" | "active" | "off";
  q?: string;
  page?: number;
};

export function useWebhooks(options: WebhookListOptions = {}) {
  const { isConnected, isLoading } = useSession();
  const state = options.state ?? "all";
  const q = options.q ?? "";
  const page = options.page ?? 1;

  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    rows: ApiWebhook[];
    total: number;
    hasMore: boolean;
    error: string | null;
  } | null>(null);

  /* The request this result answers. Comparing it during render is what makes
     `loading` derivable and stops a slow answer for one filter being shown
     under another. */
  const key = `${state}|${q}|${page}|${nonce}`;

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await webhooksApi.list(
          { state, q: q || undefined, page },
          controller.signal,
        );
        if (!cancelled) {
          setLoaded({
            key,
            rows: result.data,
            total: result.meta.total,
            hasMore: result.meta.hasMore,
            error: null,
          });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoaded({
          key,
          rows: [],
          total: 0,
          hasMore: false,
          error:
            error instanceof ApiError
              ? error.message
              : "Could not load your endpoints.",
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, state, q, page, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (!isConnected) {
    const rows = DEMO_WEBHOOKS.filter((row) => {
      if (state === "active" && !row.active) return false;
      if (state === "off" && row.active) return false;
      if (q && !row.url.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    return {
      rows: isLoading ? [] : rows,
      total: rows.length,
      hasMore: false,
      loading: isLoading,
      error: null as string | null,
      /** False: the examples are read-only. */
      editable: false,
      reload,
    };
  }

  const matched = loaded !== null && loaded.key === key;
  return {
    rows: matched ? loaded.rows : [],
    total: matched ? loaded.total : 0,
    hasMore: matched ? loaded.hasMore : false,
    loading: !matched,
    error: matched ? loaded.error : null,
    editable: true,
    reload,
  };
}

/* ---------------------------------------------------------------- one webhook */

export function useWebhook(id: string) {
  const { isConnected, isLoading } = useSession();
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    detail: ApiWebhookDetail | null;
    error: string | null;
  } | null>(null);

  const key = `${id}|${nonce}`;

  useEffect(() => {
    if (!isConnected || !id) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const detail = await webhooksApi.get(id, controller.signal);
        if (!cancelled) setLoaded({ key, detail, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoaded({
          key,
          detail: null,
          error:
            error instanceof ApiError
              ? error.message
              : "Could not load this endpoint.",
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, id, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (!isConnected) {
    const found = DEMO_WEBHOOKS.find((row) => row.id === id);
    const detail: ApiWebhookDetail | null = found
      ? {
          ...found,
          secret: undefined,
          recentDeliveries: DEMO_DELIVERIES[id] ?? [],
          delivery: DEMO_DELIVERY_STATUS,
        }
      : null;
    return {
      detail: isLoading ? null : detail,
      loading: isLoading,
      error: null as string | null,
      editable: false,
      reload,
    };
  }

  const matched = loaded !== null && loaded.key === key;
  return {
    detail: matched ? loaded.detail : null,
    loading: !matched,
    error: matched ? loaded.error : null,
    editable: true,
    reload,
  };
}

/* -------------------------------------------------------------- the log */

export type DeliveryLogOptions = {
  status?: "all" | "delivered" | "failed" | "pending";
  event?: string;
  page?: number;
};

/**
 * The delivery log for one webhook.
 *
 * Newest first, always. A delivery log is read from the top.
 */
export function useDeliveryLog(webhookId: string, options: DeliveryLogOptions = {}) {
  const { isConnected, isLoading } = useSession();
  const status = options.status ?? "all";
  const event = options.event ?? "";
  const page = options.page ?? 1;

  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    rows: ApiDelivery[];
    total: number;
    hasMore: boolean;
    error: string | null;
  } | null>(null);

  const key = `${webhookId}|${status}|${event}|${page}|${nonce}`;

  useEffect(() => {
    if (!isConnected || !webhookId) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await webhooksApi.deliveries(
          webhookId,
          { status, event: event || undefined, page },
          controller.signal,
        );
        if (!cancelled) {
          setLoaded({
            key,
            rows: result.data,
            total: result.meta.total,
            hasMore: result.meta.hasMore,
            error: null,
          });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoaded({
          key,
          rows: [],
          total: 0,
          hasMore: false,
          error:
            error instanceof ApiError
              ? error.message
              : "Could not load the delivery log.",
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, webhookId, status, event, page, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (!isConnected) {
    const all = DEMO_DELIVERIES[webhookId] ?? [];
    const rows = all.filter((row) => {
      if (status !== "all" && row.state !== status) return false;
      if (event && row.event !== event) return false;
      return true;
    });
    return {
      rows: isLoading ? [] : rows,
      total: rows.length,
      hasMore: false,
      loading: isLoading,
      error: null as string | null,
      reload,
    };
  }

  const matched = loaded !== null && loaded.key === key;
  return {
    rows: matched ? loaded.rows : [],
    total: matched ? loaded.total : 0,
    hasMore: matched ? loaded.hasMore : false,
    loading: !matched,
    error: matched ? loaded.error : null,
    reload,
  };
}

/* ----------------------------------------------------------------- the writes */

/**
 * Everything that changes something, and the refusal when nothing can.
 *
 * Each one throws on failure and the caller shows the API's own message: the
 * refusals in this module are written to be read out loud — "Take the username
 * and password out of the URL", "There is already a webhook pointing at that
 * URL" — and replacing them with "could not save" throws away the useful half.
 */
export function useWebhookActions() {
  const { isConnected } = useSession();

  const guard = useCallback(() => {
    if (!isConnected) throw DEMO_REFUSAL;
  }, [isConnected]);

  return {
    /** False in demo mode. Screens hide the controls rather than disable them. */
    editable: isConnected,

    create: useCallback(
      async (body: CreateWebhookBody) => {
        guard();
        return webhooksApi.create(body);
      },
      [guard],
    ),

    update: useCallback(
      async (id: string, body: UpdateWebhookBody) => {
        guard();
        return webhooksApi.update(id, body);
      },
      [guard],
    ),

    remove: useCallback(
      async (id: string) => {
        guard();
        return webhooksApi.remove(id);
      },
      [guard],
    ),

    /** One signed sample, and the whole response. Works on a switched-off one. */
    sendTest: useCallback(
      async (id: string, event?: string) => {
        guard();
        return webhooksApi.test(id, event);
      },
      [guard],
    ),

    retryDelivery: useCallback(
      async (deliveryId: string) => {
        guard();
        return webhooksApi.retryDelivery(deliveryId);
      },
      [guard],
    ),

    rotateSecret: useCallback(
      async (id: string) => {
        guard();
        return webhooksApi.rotateSecret(id);
      },
      [guard],
    ),
  };
}
