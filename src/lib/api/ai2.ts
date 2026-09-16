"use client";

import { request, requestStream } from "@/lib/api/client";

/**
 * `/api/v1/ai2` — read-only Q&A, one provider. `askAi2Stream` runs the same
 * turn as `/ai2/ask` but narrates it as it happens.
 */

export type Ai2Message = { role: "user" | "assistant"; content: string };

export type Ai2Status = {
  available: boolean;
  model: string | null;
  reason?: string;
};

/** What `/ai2/ask` answers. Unused here — `askAi2Stream` is the only client. */
export type Ai2Answer = {
  available: boolean;
  text?: string;
  reason?: string;
};

/**
 * `delta` is provisional prose; `discard` withdraws it if the model decides it
 * needs a lookup after all. `answer` is authoritative and always sent last.
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
 * Ask, and watch the turn happen. Resolves when the stream ends; everything is
 * reported through `onEvent`, including a failed turn's reason.
 *
 * A throw means the request never started. Once the body is open, nothing
 * throws.
 *
 * SSE over POST rather than `EventSource`, which cannot carry a bearer token
 * or take a body.
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

  // requestStream refuses a response without a body, so this is non-null.
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
      return;
    }
    onEvent(event);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line.
      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        take(buffer.slice(0, split));
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim() !== "") take(buffer);
  } finally {
    reader.cancel().catch(() => {
      // Already closed.
    });
  }
}
