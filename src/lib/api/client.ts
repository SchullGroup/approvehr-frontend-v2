"use client";

/**
 * The API client.
 *
 * One place that knows how to talk to `approvehr-api`, so no component ever
 * calls `fetch` directly. It handles four things that are easy to get wrong
 * repeatedly:
 *
 * 1. **Access-token refresh, once.** A 401 triggers a refresh and a single
 *    retry. Concurrent 401s share one refresh promise rather than each firing
 *    their own — otherwise a screen loading five panels would send five refresh
 *    requests, and because refresh tokens *rotate*, four of them would present
 *    an already-rotated token. The API treats that as theft and revokes every
 *    session, so the naive version logs the user out on every token expiry.
 *
 * 2. **One error shape.** Everything throws `ApiError`, which carries the
 *    machine-readable `code` and the field-level `details` the API returns, so a
 *    form can highlight the right input.
 *
 * 3. **Money at the boundary.** The API speaks integer kobo. The frontend's
 *    existing domain types are in naira, so conversion happens here — in the
 *    adapter — and nowhere else. See `mappers.ts`.
 *
 * 4. **Aborting.** Every request accepts a signal, so a screen that unmounts
 *    mid-load does not resolve into a dead component.
 */

const BASE_URL = (
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:8000/api/v1"
).replace(/\/$/, "");

const ACCESS_KEY = "approvehr.auth.access";
const REFRESH_KEY = "approvehr.auth.refresh";

export type ApiErrorDetail = { field: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ApiErrorDetail[] | Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field-level messages, for a form. Empty when the error is not per-field. */
  get fieldErrors(): ApiErrorDetail[] {
    return Array.isArray(this.details) ? this.details : [];
  }

  messageFor(field: string): string | undefined {
    return this.fieldErrors.find((d) => d.field === field)?.message;
  }
}

/** Thrown when the session is gone and the caller should show the sign-in screen. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, "session_expired", "Your session has ended. Sign in again.");
    this.name = "SessionExpiredError";
  }
}

/* ------------------------------------------------------------------ tokens */

/**
 * Tokens live in localStorage.
 *
 * Not the most secure option — an httpOnly cookie would be, because script
 * cannot read it — but the API is on a different origin from the app, and doing
 * cookies properly across origins means `SameSite=None`, a shared parent domain
 * and CSRF tokens. That is the right destination and it is a deployment change,
 * not a client change. Recording the trade rather than pretending localStorage
 * is fine: an XSS on this app can steal a session today.
 */
export const tokens = {
  access: (): string | null => safeGet(ACCESS_KEY),
  refresh: (): string | null => safeGet(REFRESH_KEY),
  set(access: string, refresh: string) {
    safeSet(ACCESS_KEY, access);
    safeSet(REFRESH_KEY, refresh);
    listeners.forEach((l) => l());
  },
  clear() {
    safeRemove(ACCESS_KEY);
    safeRemove(REFRESH_KEY);
    listeners.forEach((l) => l());
  },
  has: (): boolean => safeGet(ACCESS_KEY) !== null,
};

const listeners = new Set<() => void>();

/** Notified when tokens change, so the session store can re-render. */
export function onAuthChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Private browsing. The session lasts this page load. */
  }
}
function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* As above. */
  }
}

/* ----------------------------------------------------------------- refresh */

/**
 * The shared refresh promise.
 *
 * The single most important variable in this file. Because refresh tokens rotate,
 * two concurrent refreshes mean the second presents a token the first already
 * invalidated — which the API correctly reads as a stolen token and answers by
 * revoking every session for that user. Sharing one in-flight promise is what
 * stops a page with several panels from signing itself out.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const refreshToken = tokens.refresh();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        tokens.clear();
        return false;
      }
      const body = (await response.json()) as {
        data: { accessToken: string; refreshToken: string };
      };
      tokens.set(body.data.accessToken, body.data.refreshToken);
      return true;
    } catch {
      /* Network failure, not an auth failure. Keep the tokens: the user may
         simply be offline, and clearing them would sign them out for it. */
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/* ------------------------------------------------------------------ request */

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Set for sign-in and refresh, which must not attach or retry a token. */
  anonymous?: boolean;
};

export type Paged<T> = {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `Request failed with ${response.status}.`;
  let details: ApiError["details"];

  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: never };
    };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    /* A non-JSON body — a gateway error page, most likely. Keep the default. */
  }

  return new ApiError(response.status, code, message, details);
}

/** The single entry point. Every typed helper below goes through this. */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, query, signal, anonymous } = options;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const access = anonymous ? null : tokens.access();
    if (access) headers["Authorization"] = `Bearer ${access}`;

    return fetch(buildUrl(path, query), {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  };

  let response: Response;
  try {
    response = await send();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      0,
      "network_error",
      "Could not reach the server. Check your connection.",
    );
  }

  /* One refresh, one retry. A second 401 after a successful refresh means the
     new token is not being accepted either, and retrying again would loop. */
  if (response.status === 401 && !anonymous) {
    const refreshed = await refreshTokens();
    if (!refreshed) {
      tokens.clear();
      throw new SessionExpiredError();
    }
    response = await send();
    if (response.status === 401) {
      tokens.clear();
      throw new SessionExpiredError();
    }
  }

  if (!response.ok) throw await toApiError(response);

  if (response.status === 204) return undefined as T;

  const payload = (await response.json()) as { data: T };
  /* Every response is enveloped. Unwrapping here means no caller writes
     `.data.data`, and a list's `meta` is still reachable via `requestPaged`. */
  return payload.data;
}

/** For list endpoints, which return `{ data, meta }`. */
export async function requestPaged<T>(
  path: string,
  options: RequestOptions = {},
): Promise<Paged<T>> {
  const { method = "GET", query, signal } = options;

  const send = async () => {
    const headers: Record<string, string> = {};
    const access = tokens.access();
    if (access) headers["Authorization"] = `Bearer ${access}`;
    return fetch(buildUrl(path, query), {
      method,
      headers,
      ...(signal ? { signal } : {}),
    });
  };

  let response: Response;
  try {
    response = await send();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network_error", "Could not reach the server.");
  }

  if (response.status === 401) {
    const refreshed = await refreshTokens();
    if (!refreshed) {
      tokens.clear();
      throw new SessionExpiredError();
    }
    response = await send();
    if (response.status === 401) {
      tokens.clear();
      throw new SessionExpiredError();
    }
  }

  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as Paged<T>;
}

/** True when the API is reachable. Used by the connection banner. */
export async function ping(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL.replace(/\/api\/v1$/, "")}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const apiBaseUrl = BASE_URL;
