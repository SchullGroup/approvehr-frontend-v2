import { cn } from "@/lib/cn";

/**
 * Visual orb component representing the assistant's state.
 */
export function AssistantOrb({
  size = 32,
  phase = "resting",
  className,
}: {
  /** Diameter in px. */
  size?: number;
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
