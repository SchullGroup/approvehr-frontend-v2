import { afterEach, describe, expect, it, vi } from "vitest";
import { askAi2Stream, type Ai2Event } from "@/lib/api/ai2";

/**
 * Reading the turn off the wire.
 *
 * The client parses SSE by hand — `EventSource` cannot carry a bearer token or
 * `POST` a transcript, so there was no alternative — and a hand-rolled parser
 * has exactly one interesting failure: it works against a stub that delivers one
 * event per chunk, and loses half an answer against a network that does not. So
 * the bodies below are sliced on byte boundaries that fall inside events rather
 * than between them.
 *
 * The other half is the protocol's one irreversible-looking move: `discard`,
 * which takes prose back off the screen after it has been shown. It is asserted
 * here as an ordered sequence, because the order is the whole meaning.
 */

const event = (payload: Ai2Event): string =>
  `data: ${JSON.stringify(payload)}\n\n`;

function streamOf(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}

function respond(body: string, size: number) {
  vi.stubGlobal("fetch", () =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: streamOf(body, size),
    } as unknown as Response),
  );
}

const collect = async (body: string, size: number): Promise<Ai2Event[]> => {
  respond(body, size);
  const seen: Ai2Event[] = [];
  await askAi2Stream([{ role: "user", content: "how many people?" }], (e) =>
    seen.push(e),
  );
  return seen;
};

describe("reading an ai2 stream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reassembles events split on arbitrary byte boundaries", async () => {
    const body =
      event({ type: "delta", text: "There are " }) +
      event({ type: "delta", text: "twelve people." }) +
      event({ type: "answer", text: "There are twelve people." });

    /* One byte at a time: every split, including inside the JSON and between
       the two newlines that terminate an event. */
    const seen = await collect(body, 1);

    expect(seen).toEqual([
      { type: "delta", text: "There are " },
      { type: "delta", text: "twelve people." },
      { type: "answer", text: "There are twelve people." },
    ]);
  });

  it("keeps a multi-byte character whole across a split", async () => {
    /* ₦ is three bytes. Decoding without `stream: true` turns a split one into
       a replacement character — inside a pay figure, on screen. */
    const seen = await collect(event({ type: "delta", text: "₦1,250,000" }), 3);
    expect(seen).toEqual([{ type: "delta", text: "₦1,250,000" }]);
  });

  it("ignores the heartbeat and the end marker", async () => {
    /* The heartbeat is what stops a proxy closing the connection during a long
       lookup, and it arrives in the middle of a turn. Neither it nor `end`
       carries anything to render. */
    const body =
      ": ping\n\n" +
      event({ type: "lookup", round: 1, index: 0, entity: "employee" }) +
      ": ping\n\n" +
      event({ type: "lookup_done", round: 1, index: 0, refused: false }) +
      "event: end\ndata: {}\n\n";

    const seen = await collect(body, 5);

    expect(seen).toEqual([
      { type: "lookup", round: 1, index: 0, entity: "employee" },
      { type: "lookup_done", round: 1, index: 0, refused: false },
    ]);
  });

  it("reports a preamble being withdrawn, in order", async () => {
    /* The model wrote a sentence, then decided it needed data after all. The
       order is the meaning: what was shown is taken back *before* the lookup
       that made it a preamble is announced. */
    const body =
      event({ type: "delta", text: "Let me check." }) +
      event({ type: "discard" }) +
      event({ type: "note", text: "Let me check." }) +
      event({ type: "lookup", round: 1, index: 0, entity: "employee" });

    const seen = await collect(body, 9);

    expect(seen.map((e) => e.type)).toEqual([
      "delta",
      "discard",
      "note",
      "lookup",
    ]);
  });

  it("drops an event it cannot parse rather than the turn", async () => {
    const body =
      event({ type: "delta", text: "Twelve" }) +
      "data: {not json\n\n" +
      event({ type: "answer", text: "Twelve people." });

    const seen = await collect(body, 16);

    expect(seen).toEqual([
      { type: "delta", text: "Twelve" },
      { type: "answer", text: "Twelve people." },
    ]);
  });

  it("delivers a final event that arrived without its blank line", async () => {
    /* A server that ends the response straight after writing is within its
       rights, and the last event would otherwise sit in the buffer unread —
       losing the answer, which is the one event that must not be lost. */
    const seen = await collect(
      `data: ${JSON.stringify({ type: "answer", text: "Done." })}`,
      4,
    );
    expect(seen).toEqual([{ type: "answer", text: "Done." }]);
  });
});
