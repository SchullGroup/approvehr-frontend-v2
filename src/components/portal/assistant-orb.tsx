import { cn } from "@/lib/cn";

/**
 * The assistant's presence — a brand-coloured orb standing in for "the
 * model" wherever the chat needs to say something is happening.
 *
 * `/ai/chat` is one round trip per turn, not a stream of named steps — see
 * `agent.ts` on the API side, which runs its own look-up loop internally and
 * hands back only the final result. There is no honest "reading records…
 * now thinking…" progress this screen could report, because the client never
 * sees the steps. What is true is calmer: a turn is in flight, then it has
 * landed. This carries that difference instead of a generic spinner, and
 * nothing here claims a step that did not happen.
 *
 * Purely decorative — `aria-hidden` — because the words next to it (a
 * rotating status line, an answer, a name) are what actually says something.
 */
export function AssistantOrb({
  size = 32,
  phase = "resting",
  className,
}: {
  /** Diameter in px. */
  size?: number;
  /**
   * - `resting` — a still brand mark. Message avatars, the empty state.
   *   No animation, deliberately: a transcript of several messages should
   *   not turn into a row of independently pulsing dots.
   * - `thinking` — a turn is in flight. The only place this should appear.
   * - `arrive` — plays once on mount, then settles to the same look as
   *   `resting`. Give this to a message the moment it is created — see the
   *   component's own header for why that is always "just now" here.
   */
  phase?: "resting" | "thinking" | "arrive";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ "--orb-size": `${String(size)}px` } as React.CSSProperties}
      className={cn(
        "assistant-orb",
        phase === "thinking" && "assistant-orb--thinking",
        phase === "arrive" && "assistant-orb--arrive",
        className,
      )}
    />
  );
}
