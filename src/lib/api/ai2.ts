"use client";

import { request, requestStream } from "@/lib/api/client";

/**
 * The new question-answering module — `/api/v1/ai2`.
 *
 * Read-only, one provider: a message list in, an answer out. See
 * `modules/ai2/router.ts` on the API for why there is no permission gate here —
 * every field and every entity is gated individually against the caller.
 *
 * Two ways to ask, and they run the identical turn on the server:
 *
 * - `askAi2` waits and returns the answer.
 * - `askAi2Stream` reports the turn as it happens — which lookup is running,
 *   and the answer as it is written.
 */

export type Ai2Message = { role: "user" | "assistant"; content: string };

export type Ai2Status = {
  available: boolean;
  model: string | null;
  reason?: string;
};

/** What `/ai2/ask` answers. Kept as the record of that contract; unused here. */
export type Ai2Answer = {
  available: boolean;
  text?: string;
  reason?: string;
};

/**
 * One thing that happened during a turn. Mirrors `Ai2Event` in `answer.ts`.
 *
 * The one rule worth carrying across: **`delta` is provisional.** The model may
 * write a sentence and then decide it needs to look something up after all, at
 * which point that sentence was a preamble to work it has not done — `discard`
 * says so and whatever has been shown must come off the screen. `answer` is the
 * authoritative text and arrives on every turn that answered, so a client that
 * lost a delta should render that rather than its own accumulation.
 */
export type Ai2Event =
  | { type: "delta"; text: string }
  | { type: "discard" }
  | { type: "note"; text: string }
  | { type: "lookup"; round: number; index: number; entity?: string }
  | { type: "lookup_done"; round: number; index: number; refused: boolean }
  | { type: "answer"; text: string }
  | { type: "usage"; promptTokens: number; outputTokens: number; thinkingTokens: number }
  | { type: "unavailable"; reason: string };

export const ai2Status = (): Promise<Ai2Status> =>
  request<Ai2Status>("/ai2/status");

/**
 * Ask, and watch the turn happen.
 *
 * The only way to send a turn from this app. `/ai2/ask` still answers buffered
 * on the API, for callers that are not a person watching a screen, and nothing
 * here reaches it — a second client for one endpoint is a second thing to keep
 * in agreement.
 *
 * Resolves when the stream ends. Everything it has to say it says through
 * `onEvent` — there is no return value, because a turn that failed reports the
 * reason as an event exactly like a turn that succeeded reports the answer, and
 * a second channel for the same facts is a second thing to keep in agreement.
 *
 * A throw means the request never started: a validation refusal, a dead session,
 * no network. Once the body is open, nothing throws.
 *
 * ## Why this parses SSE by hand
 *
 * `EventSource` cannot send an `Authorization` header, and this app holds a
 * bearer token rather than a cookie — see `client.ts`. It also cannot `POST`,
 * and a question about somebody's pay has no business in a URL. So the server
 * speaks SSE over an ordinary `POST` and this reads it: about twenty lines, and
 * the alternative is putting the transcript in a query string.
 */
export async function askAi2Stream(
  messages: Ai2Message[],
  onEvent: (event: Ai2Event) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await requestStream("/ai2/ask/stream", {
    method: "POST",
    body: { messages },
    ...(signal ? { signal } : {}),
  });

  /* `requestStream` refuses a response without a body, so this is non-null. */
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  /**
   * One SSE event — everything up to a blank line.
   *
   * Only `data:` lines carry anything here. A `:` line is the server's
   * heartbeat, there to stop a proxy closing a connection during a long lookup,
   * and `event: end` marks a turn that finished rather than a socket that
   * dropped — neither is something to render.
   */
  const take = (block: string) => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (data === "" || data === "{}") return;

    let event: Ai2Event;
    try {
      event = JSON.parse(data) as Ai2Event;
    } catch {
      /* A malformed event is one lost step, not a lost turn. The answer is
         sent whole at the end, so dropping this costs a progress line. */
      return;
    }
    onEvent(event);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      /* Events are separated by a blank line. Anything after the last one is
         held back: half an event must not be parsed as a whole one. */
      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        take(buffer.slice(0, split));
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim() !== "") take(buffer);
  } finally {
    /* An aborted read leaves the body open otherwise, and the connection with
       it — the turn is a read and costs the server nothing more, but the
       socket is real. */
    reader.cancel().catch(() => {
      /* Already closed. */
    });
  }
}
