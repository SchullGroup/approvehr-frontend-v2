import Link from "next/link";
import { Avatar } from "./misc";
import { cn } from "@/lib/cn";

/**
 * A department as a card with a clear order to it: a coloured tile carrying its
 * initial, the name large, one quiet line under it, then three faces and how many
 * more. Each department keeps its own colour wherever it is drawn, taken from its
 * name so it needs nothing stored, so Engineering is the same indigo "E" on the
 * Objectives page, the period's People tab and anywhere else that groups people
 * by department.
 *
 * The colour is the category colour at a light wash over whatever the page is, so
 * it holds in both themes.
 */

const TONES = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
  "var(--color-cat-6)",
] as const;

/** The same colour for the same name, every time. */
export function departmentTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

export function DepartmentTile({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const tone = departmentTone(name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl font-semibold",
        size === "md" ? "size-12 text-h4" : "size-9 text-body-sm",
      )}
      style={{
        color: tone,
        background: `color-mix(in srgb, ${tone} 14%, transparent)`,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function DepartmentCard({
  name,
  line,
  members = [],
  href,
  onClick,
  progress,
}: {
  name: string;
  /** One quiet line: how many objectives, who is waiting. */
  line: string;
  /** Names, for the faces. */
  members?: readonly string[];
  href?: string;
  onClick?: () => void;
  /** 0 to 1, drawn as a thin bar at the foot when given. */
  progress?: number;
}) {
  const body = (
    <>
      <DepartmentTile name={name} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-h4 font-semibold text-ink">{name}</span>
        <span className="text-body-sm text-muted">{line}</span>
      </span>
      <span className="mt-auto flex w-full flex-col gap-3 pt-2">
        {members.length > 0 && (
          <span className="flex items-center -space-x-2">
            {members.slice(0, 3).map((who) => (
              <Avatar
                key={who}
                name={who}
                size="sm"
                className="ring-2 ring-surface"
              />
            ))}
            {members.length > 3 && (
              <span className="pl-3 text-meta text-muted">
                +{members.length - 3}
              </span>
            )}
          </span>
        )}
        {progress !== undefined && (
          <span
            role="progressbar"
            aria-label={`${name} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="block h-1.5 w-full overflow-hidden rounded-full bg-sunken"
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${String(progress * 100)}%`,
                background: departmentTone(name),
              }}
            />
          </span>
        )}
      </span>
    </>
  );
  const cls =
    "flex h-full min-h-44 w-full flex-col items-start gap-4 rounded-xl border border-line bg-surface p-5 text-left transition-colors hover:border-line-strong hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}
