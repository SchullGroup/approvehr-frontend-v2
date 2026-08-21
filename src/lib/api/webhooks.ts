"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * Outbound webhooks — `/api/v1/webhooks`.
 *
 * Typed wrappers in the same hand-written style as the rest of `lib/api/*`.
 * Every route needs `MANAGE_SETTINGS`, the events catalogue included: a webhook
 * decides where a copy of the company's payroll data goes, which puts it beside
 * the bank details rather than beside the org chart.
 *
 * ## Money
 *
 * Nothing in a webhook's own shape is money. Money appears inside the **sample
 * payloads** and inside stored delivery payloads, as integer kobo in a field
 * named `…Kobo`, and those are rendered **verbatim** because they are the bytes
 * a receiver will actually parse — reformatting them would document a wire
 * format the API does not speak.
 *
 * So the boundary conversion here is additive rather than substitutive:
 * `koboFields()` finds every `…Kobo` field in a payload and `naira()` converts
 * it, so a screen can print the naira figure *alongside* the raw JSON. That is
 * the only division by 100 on this side, and the screens render it with
 * `formatMoney(…, { decimals: true })` — never abbreviated, because somebody
 * reconciles these against a bank statement.
 *
 * ## Two things the API is honest about, and the UI has to repeat
 *
 * 1. **`wired: false` on an event.** It is defined, signed and subscribable and
 *    nothing in the product raises it yet. Subscribing is allowed; the endpoint
 *    will simply be quiet. `notRaisedYet` on a webhook is the same fact for the
 *    events that webhook chose.
 * 2. **`delivery.retriesRunning`.** False means the background scheduler is not
 *    running on that deployment, so a failed delivery waits for somebody to
 *    press Retry. A screen that drew an automatic retry schedule anyway would be
 *    describing a queue nobody is draining.
 *
 * `delivery` is only present on the responses that go out through the API's
 * `ok()` helper — the catalogue and a single webhook. Its `page()` helper drops
 * unknown keys, so the **list** and the **delivery log** do not carry it. Read it
 * from the catalogue on a list screen and from the webhook on a detail screen.
 *
 * ## The secret
 *
 * `GET /webhooks/:id` returns the full signing secret every time, and the API's
 * `service.get` explains why: the secret is stored in plain text because signing
 * needs it, so a "shown once, gone forever" claim would be a lie the schema
 * contradicts. The list deliberately does **not** carry it — a list is polled,
 * and a secret in a polled response ends up in every proxy log on the way.
 */

/* ------------------------------------------------------------------- shapes */

/** Where deliveries are attempted, and whether anything retries them. */
export type DeliveryStatus = {
  /** `inline` means the API process makes the POST itself. */
  mode: "queued" | "inline";
  /** False: no automatic retries on this deployment. Retry is manual. */
  retriesRunning: boolean;
};

export type WebhookHealth = {
  /** Deliveries that landed. */
  delivered: number;
  /** Deliveries that used every attempt and never landed. */
  failed: number;
  /** Still inside the retry schedule. */
  pending: number;
  lastActivityAt: string | null;
  lastDeliveredAt: string | null;
};

export type ApiWebhook = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  /** Present on `get`, `create`, `update` and `rotateSecret`. Never on a list. */
  secret?: string;
  /** `whsec_…4f2a`. Enough to tell two secrets apart, no use to a thief. */
  secretHint: string;
  disabledAt: string | null;
  /** Why it is off, in words. "Switched off in Settings." or the failure count. */
  disabledReason: string | null;
  /** Chosen events that nothing in the product raises yet. */
  notRaisedYet: string[];
  health: WebhookHealth;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryState = "delivered" | "pending" | "failed";

export type ApiDelivery = {
  id: string;
  webhookId: string;
  event: string;
  /** The attempt now due. Once it has given up, the number of attempts made. */
  attempt: number;
  maxAttempts: number;
  statusCode: number | null;
  /** Set only when the request never landed. A 500 is a status code, not an error. */
  error: string | null;
  state: DeliveryState;
  deliveredAt: string | null;
  retryAt: string | null;
  /** What we sent. The customer's own data, and seeing it is the point. */
  payload: unknown;
  createdAt: string;
};

export type ApiWebhookDetail = ApiWebhook & {
  recentDeliveries: ApiDelivery[];
  delivery: DeliveryStatus;
};

export type ApiRotateResult = ApiWebhookDetail & {
  /** Signed with the old secret and still queued. They will fail verification. */
  queuedWithOldSecret: number;
};

export type ApiRemoveResult = {
  id: string;
  deleted: boolean;
  deliveriesRemoved: number;
};

/** The exact request we made, so a signature that will not verify is debuggable. */
export type SentRequest = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  /** The raw bytes the signature covers. */
  body: string;
  /** `timestamp + "." + body` — what the HMAC was computed over. */
  signedString: string;
};

export type ApiTestResult = {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
  /** Their response, first 500 characters. */
  responseBody: string | null;
  timeoutMs: number;
  delivery: ApiDelivery;
  sent: SentRequest;
};

export type ApiRetryResult = {
  attempted: boolean;
  ok: boolean;
  delivery: ApiDelivery;
  webhookActive: boolean;
};

export type ApiEventDefinition = {
  name: string;
  description: string;
  raisedWhen: string;
  /** False: nothing raises it yet. You may subscribe; it will be quiet. */
  wired: boolean;
  sample: Record<string, unknown>;
};

export type ApiEnvelope = {
  /** The delivery id. Stable across retries, so it is the idempotency key. */
  id: string;
  event: string;
  createdAt: string;
  data: Record<string, unknown>;
};

/**
 * The worked example, computed by the same function that signs a real delivery.
 *
 * Which is why it is never reconstructed on this side. A hand-written digest
 * would be a wrong digest somebody implemented their receiver against.
 */
export type ApiSignatureExample = {
  secret: string;
  timestamp: string;
  body: string;
  signedString: string;
  signature: string;
};

export type ApiSignatureSpec = {
  algorithm: string;
  version: string;
  headers: {
    signature: string;
    timestamp: string;
    event: string;
    delivery: string;
  };
  construction: string;
  steps: string[];
  /** Reject a request older than this. Five minutes, today. */
  toleranceSeconds: number;
  example: ApiSignatureExample;
};

export type ApiRetrySpec = {
  attempts: number;
  /** Minutes between attempt n and n+1. */
  backoffMinutes: number[];
  timeoutMs: number;
  /** Exhausted deliveries in a row before the webhook switches itself off. */
  switchedOffAfter: number;
  note: string;
  idempotency: string;
};

export type ApiCatalogue = {
  events: ApiEventDefinition[];
  envelope: ApiEnvelope;
  money: string;
  signature: ApiSignatureSpec;
  retries: ApiRetrySpec;
  delivery: DeliveryStatus;
};

/* ------------------------------------------------------------------ queries */

export type WebhookListParams = {
  page?: number;
  pageSize?: number;
  /** Matches the URL. */
  q?: string;
  state?: "all" | "active" | "off";
  sort?: "createdAt" | "url";
  order?: "asc" | "desc";
};

export type DeliveryListParams = {
  page?: number;
  pageSize?: number;
  /** `failed` is "given up on". A delivery still inside its schedule is `pending`. */
  status?: "all" | "delivered" | "failed" | "pending";
  event?: string;
  order?: "asc" | "desc";
};

export type CreateWebhookBody = {
  url: string;
  events: string[];
  /** Omit and the API generates one, which is what almost everybody wants. */
  secret?: string;
  active?: boolean;
};

export type UpdateWebhookBody = {
  url?: string;
  events?: string[];
  /** `true` switches it on **and** clears the reason it went off. */
  active?: boolean;
};

/* -------------------------------------------------------------------- calls */

export const webhooksApi = {
  /** The endpoints. Newest first by default; no secrets in the rows. */
  list: (
    params: WebhookListParams = {},
    signal?: AbortSignal,
  ): Promise<Paged<ApiWebhook>> =>
    requestPaged<ApiWebhook>("/webhooks", {
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 25,
        q: params.q,
        state: params.state ?? "all",
        sort: params.sort,
        order: params.order ?? "desc",
      },
      ...(signal ? { signal } : {}),
    }),

  /** One webhook, with its secret, its last ten deliveries and the queue state. */
  get: (id: string, signal?: AbortSignal): Promise<ApiWebhookDetail> =>
    request<ApiWebhookDetail>(`/webhooks/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  create: (body: CreateWebhookBody): Promise<ApiWebhookDetail> =>
    request<ApiWebhookDetail>("/webhooks", { method: "POST", body }),

  update: (id: string, body: UpdateWebhookBody): Promise<ApiWebhookDetail> =>
    request<ApiWebhookDetail>(`/webhooks/${id}`, { method: "PATCH", body }),

  remove: (id: string): Promise<ApiRemoveResult> =>
    request<ApiRemoveResult>(`/webhooks/${id}`, { method: "DELETE" }),

  /**
   * Send one signed sample and report what came back.
   *
   * Works on a switched-off webhook — that is exactly when somebody needs to
   * know whether their fix worked — and never counts towards the failures that
   * switch a webhook off.
   */
  test: (id: string, event?: string): Promise<ApiTestResult> =>
    request<ApiTestResult>(`/webhooks/${id}/test`, {
      method: "POST",
      body: event ? { event } : {},
    }),

  /** The delivery log. Newest first. */
  deliveries: (
    id: string,
    params: DeliveryListParams = {},
    signal?: AbortSignal,
  ): Promise<Paged<ApiDelivery>> =>
    requestPaged<ApiDelivery>(`/webhooks/${id}/deliveries`, {
      query: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
        status: params.status ?? "all",
        event: params.event,
        order: params.order ?? "desc",
      },
      ...(signal ? { signal } : {}),
    }),

  /** One attempt now, ignoring the schedule. The button after fixing a server. */
  retryDelivery: (deliveryId: string): Promise<ApiRetryResult> =>
    request<ApiRetryResult>(`/webhooks/deliveries/${deliveryId}/retry`, {
      method: "POST",
    }),

  /** A new secret. The old one stops verifying the moment this returns. */
  rotateSecret: (id: string): Promise<ApiRotateResult> =>
    request<ApiRotateResult>(`/webhooks/${id}/rotate-secret`, { method: "POST" }),

  /** Events, sample payloads, the signature construction and the retry schedule. */
  catalogue: (signal?: AbortSignal): Promise<ApiCatalogue> =>
    request<ApiCatalogue>("/webhooks/events", { ...(signal ? { signal } : {}) }),
};

/* -------------------------------------------------------------- money seam */

/**
 * Kobo to naira. The only division by 100 on this side.
 *
 * `Math.round` first because a kobo figure is an integer by contract, and a
 * fractional one is a bug worth flooring rather than propagating.
 */
export const naira = (kobo: number): number => Math.round(kobo) / 100;

/** One money field found in a payload, with its converted value. */
export type KoboField = {
  /** Dotted path, e.g. `sourceAccount.totalKobo`. */
  path: string;
  kobo: number;
  /** Naira. Format it with two decimals and thousands separators, never compact. */
  naira: number;
};

/**
 * Every `…Kobo` field in a payload, in the order they appear.
 *
 * The API's rule is that money is an integer number of kobo and every such field
 * says so in its name, which makes the name the only reliable way to find one —
 * there is no schema for arbitrary payload JSON. Depth-capped for the same
 * reason the API's `redact()` is: a payload should not be able to spin a render.
 */
export function koboFields(value: unknown, prefix = "", depth = 0): KoboField[] {
  if (depth > 8 || value === null || typeof value !== "object") return [];

  const found: KoboField[] = [];

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      found.push(...koboFields(item, `${prefix}[${index}]`, depth + 1));
    });
    return found;
  }

  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (key.endsWith("Kobo") && typeof inner === "number") {
      found.push({ path, kobo: inner, naira: naira(inner) });
      continue;
    }
    found.push(...koboFields(inner, path, depth + 1));
  }
  return found;
}

/* ------------------------------------------------------------------ helpers */

/** `https://hooks.acme.example/approvehr` → `hooks.acme.example`. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The path and query, for the line under the host. `/` when there is none. */
export function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "";
  }
}

/**
 * How long the whole retry schedule covers, in words.
 *
 * Derived from `backoffMinutes` rather than written down, so a change to the
 * schedule on the API changes this sentence too.
 */
export function retryWindowLabel(backoffMinutes: number[]): string {
  const total = backoffMinutes.reduce((sum, minutes) => sum + minutes, 0);
  if (total < 60) return `${total} minutes`;
  const hours = Math.round(total / 60);
  return hours === 1 ? "about an hour" : `about ${hours} hours`;
}

/** Pretty-printed JSON, for a payload block. Two spaces, like the API's own docs. */
export const asJson = (value: unknown): string => JSON.stringify(value, null, 2);
