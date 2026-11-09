import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { WellnessArt } from "./art";

/**
 * Ranks: the starburst number, the podium, a ranked row and your pinned row.
 *
 * ## Only ever inside one challenge
 *
 * Nothing here knows what is being ranked. A caller passes a name, a total it
 * got from the API (steps, millilitres) and a rank the API computed, and these
 * draw it. There is no "points" and no company-wide table to put one in: a
 * board belongs to a challenge the viewer joined, and the API will not give a
 * screen a ranking of anybody else.
 *
 * ## Shared ranks are drawn as shared
 *
 * The API ranks people on the same total with the same number and skips the
 * next. Two people on rank 9 are both 9, and a screen reader hears "joint 9th".
 * Nothing here re-sorts or re-numbers.
 *
 * ## Read order is 1, 2, 3, even though the podium is drawn 2, 1, 3
 *
 * The podium keeps the winner in the middle with CSS `order`, and the DOM stays
 * in rank order, so a screen reader and a keyboard meet them winner first.
 */

export type RankTone = "gold" | "peri" | "pink" | "green" | "plain";

const TONE_FILL: Record<RankTone, string> = {
  gold: "var(--color-well-sun)",
  peri: "var(--color-well-peri)",
  pink: "var(--color-well-pink)",
  green: "var(--color-well-green)",
  plain: "var(--color-well-peri)",
};

/** `1st`, `22nd`, `13th`. */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${String(n)}th`;
  switch (n % 10) {
    case 1:
      return `${String(n)}st`;
    case 2:
      return `${String(n)}nd`;
    case 3:
      return `${String(n)}rd`;
    default:
      return `${String(n)}th`;
  }
}

/** What a screen reader hears for a rank: `5th`, or `joint 5th` when shared. */
export function rankWords(rank: number, tied: boolean): string {
  return tied ? `joint ${ordinal(rank)}` : ordinal(rank);
}

/** Which entries share their rank with somebody else in the list. */
export function tiedRanks(ranks: readonly number[]): Set<number> {
  const seen = new Set<number>();
  const tied = new Set<number>();
  for (const rank of ranks) {
    if (seen.has(rank)) tied.add(rank);
    seen.add(rank);
  }
  return tied;
}

/* ------------------------------------------------------------- the starburst */

const BURST_POINTS = 12;

function burstPath(size: number): string {
  const centre = size / 2;
  const outer = size / 2 - 1.5;
  const inner = outer * 0.8;
  const points: string[] = [];
  for (let i = 0; i < BURST_POINTS * 2; i += 1) {
    const angle = (Math.PI * i) / BURST_POINTS - Math.PI / 2;
    const radius = i % 2 === 0 ? outer : inner;
    points.push(
      `${(centre + radius * Math.cos(angle)).toFixed(2)},${(centre + radius * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return `M${points.join("L")}Z`;
}

const BURST_SIZE = { sm: 36, md: 44, lg: 54 } as const;

export function RankBadge({
  rank,
  size = "md",
  tone = "plain",
  className,
}: {
  rank: number | null;
  size?: keyof typeof BURST_SIZE;
  tone?: RankTone;
  className?: string;
}) {
  const px = BURST_SIZE[size];
  const long = rank !== null && String(rank).length >= 3;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center font-semibold text-well-ink tabular",
        size === "lg" ? "text-body-md" : "text-body-sm",
        long && "text-meta",
        className,
      )}
      style={{ width: px, height: px }}
    >
      <svg
        viewBox={`0 0 ${String(px)} ${String(px)}`}
        width={px}
        height={px}
        className="absolute inset-0"
        focusable={false}
      >
        <path
          d={burstPath(px)}
          style={{
            fill: TONE_FILL[tone],
            stroke: TONE_FILL[tone],
            strokeWidth: 3,
            strokeLinejoin: "round",
          }}
        />
      </svg>
      <span className="relative">{rank === null ? "–" : rank}</span>
    </span>
  );
}

/* ----------------------------------------------------------------- the people */

export type RankedPerson = {
  /** Unique within the list. The API gives no id, so a caller builds one. */
  key: string;
  rank: number;
  name: string;
  /** What the API gave, already worded: `98,384 steps`. */
  total: string;
  mine?: boolean;
};

const RING: Record<
  number,
  { ring: string; pill: string; face: string; tone: RankTone }
> = {
  1: {
    ring: "ring-well-sun",
    pill: "bg-well-sun-soft text-well-sun-text",
    face: "bg-well-sun-soft text-well-sun-text",
    tone: "gold",
  },
  2: {
    ring: "ring-well-peri",
    pill: "bg-well-peri-soft text-well-peri-text",
    face: "bg-well-peri-soft text-well-peri-text",
    tone: "peri",
  },
  3: {
    ring: "ring-well-pink",
    pill: "bg-well-pink-soft text-well-pink-text",
    face: "bg-well-pink-soft text-well-pink-text",
    tone: "pink",
  },
};

const BLOCK: Record<number, { height: string; fill: string }> = {
  1: { height: "h-24", fill: "bg-well-sun" },
  2: { height: "h-16", fill: "bg-well-peri" },
  3: { height: "h-12", fill: "bg-well-pink" },
};

/** A person's name as the board gives it, without a stray trailing space. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function Slot({
  person,
  position,
  tied,
  mineLabel,
}: {
  person: RankedPerson;
  /** 0 is the winner's seat in the middle, 1 the left, 2 the right. */
  position: 0 | 1 | 2;
  tied: boolean;
  mineLabel: string;
}) {
  const place = Math.min(person.rank, 3);
  const look = RING[place] ?? RING[3]!;
  const winner = position === 0;
  const name = cleanName(person.name);
  return (
    <li
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center text-center",
        position === 0 ? "order-2" : position === 1 ? "order-1" : "order-3",
        winner ? "-mt-1 sm:-mt-3" : "mt-5 sm:mt-6",
      )}
    >
      <span className="sr-only">
        {rankWords(person.rank, tied)}: {name}, {person.total}
        {person.mine ? `, ${mineLabel.toLowerCase()}` : ""}.
      </span>
      <div aria-hidden="true" className="flex min-w-0 flex-col items-center">
        <div className="relative">
          {winner && (
            <>
              <span className="well-twinkle absolute -left-3 top-1 text-well-sun-text">
                <Sparkle />
              </span>
              <span
                className="well-twinkle absolute -right-3 top-6 text-well-sun-text"
                style={{ animationDelay: "1.2s" }}
              >
                <Sparkle small />
              </span>
            </>
          )}
          <Avatar
            name={name}
            tone="accent"
            className={cn(
              "ring-4 ring-offset-2 ring-offset-surface",
              look.ring,
              look.face,
              winner
                ? "size-20 text-h4 sm:size-24"
                : "size-16 text-body-md sm:size-[4.5rem]",
              person.mine && "bg-well-green-soft text-well-green-text",
            )}
          />
          <RankBadge
            rank={person.rank}
            tone={look.tone}
            size={winner ? "md" : "sm"}
            className="absolute -right-2 -top-2"
          />
        </div>
        <p
          className={cn(
            "mt-3 line-clamp-2 w-full max-w-[8.5rem] text-balance break-words font-medium text-ink [overflow-wrap:anywhere]",
            winner ? "text-body-md" : "text-body-sm",
          )}
          title={name}
        >
          {name}
        </p>
        <p
          className={cn(
            "tabular mt-1.5 rounded-full px-2.5 py-0.5 text-meta font-semibold leading-tight",
            look.pill,
          )}
        >
          {person.total}
        </p>
        {person.mine && (
          <span className="mt-1.5 rounded-full bg-well-green px-2 py-0.5 text-meta font-semibold text-well-ink">
            {mineLabel}
          </span>
        )}
      </div>
    </li>
  );
}

function GhostSlot({ position }: { position: 1 | 2 }) {
  return (
    <li
      aria-hidden="true"
      className={cn(
        "mt-5 flex min-w-0 flex-1 flex-col items-center text-center sm:mt-6",
        position === 1 ? "order-1" : "order-3",
      )}
    >
      <span className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-line-strong text-well-peri-text sm:size-[4.5rem]">
        <span className="text-h4 font-medium">?</span>
      </span>
      <p className="mt-3 text-body-sm text-muted">Room for you</p>
    </li>
  );
}

function Sparkle({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={small ? 12 : 18}
      height={small ? 12 : 18}
      aria-hidden="true"
      focusable={false}
    >
      <path
        d="M12 1 Q13.6 10.4 23 12 Q13.6 13.6 12 23 Q10.4 13.6 1 12 Q10.4 10.4 12 1Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * The top three. The winner is drawn in the middle and larger. With fewer than
 * three people the empty places are drawn as open seats, not as an error: it is
 * only that nobody else has joined yet.
 *
 * From `sm` up, a block for each place rises beneath them (the 1-2-3 steps), a
 * wide-screen flourish that carries nothing the avatars do not already say.
 */
export function Podium({
  people,
  tied,
  label = "Top three",
  mineLabel = "You",
  className,
}: {
  /** In rank order, at most three. */
  people: readonly RankedPerson[];
  /** Ranks that more than one person holds. */
  tied: ReadonlySet<number>;
  label?: string;
  /** What to call the viewer's own seat: `You`, or `Your team`. */
  mineLabel?: string;
  className?: string;
}) {
  const top = people.slice(0, 3);
  const [first, second, third] = top;
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <ol
        aria-label={label}
        className="flex w-full max-w-xl items-start justify-center gap-2 sm:gap-6"
      >
        {first && (
          <Slot
            person={first}
            position={0}
            tied={tied.has(first.rank)}
            mineLabel={mineLabel}
          />
        )}
        {second ? (
          <Slot
            person={second}
            position={1}
            tied={tied.has(second.rank)}
            mineLabel={mineLabel}
          />
        ) : (
          <GhostSlot position={1} />
        )}
        {third ? (
          <Slot
            person={third}
            position={2}
            tied={tied.has(third.rank)}
            mineLabel={mineLabel}
          />
        ) : (
          <GhostSlot position={2} />
        )}
      </ol>
      <div
        aria-hidden="true"
        className="mt-2 hidden w-full max-w-xl items-end justify-center gap-2 sm:flex sm:gap-6"
      >
        {([1, 0, 2] as const).map((index) => {
          const person = top[index];
          const place = Math.min(person?.rank ?? index + 1, 3);
          const block = BLOCK[place] ?? BLOCK[3]!;
          return (
            <div key={index} className="flex min-w-0 flex-1 flex-col">
              <div
                className={cn(
                  "well-rise flex items-start justify-center rounded-t-xl pt-2 text-h3 font-semibold text-well-ink",
                  block.height,
                  person ? block.fill : "bg-sunken",
                )}
                style={{ animationDelay: `${String(index * 0.08)}s` }}
              >
                {person ? (index === 0 ? top[0]?.rank : person.rank) : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- the rows */

export function RankRow({
  person,
  tied,
  className,
}: {
  person: RankedPerson;
  tied: boolean;
  className?: string;
}) {
  const name = cleanName(person.name);
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-3 py-2.5 sm:gap-4 sm:px-4",
        person.mine
          ? "border-well-peri bg-well-peri-soft"
          : "border-line bg-surface",
        className,
      )}
    >
      <span className="sr-only">
        {rankWords(person.rank, tied)}: {name}, {person.total}
        {person.mine ? ", you" : ""}.
      </span>
      <RankBadge rank={person.rank} tone={person.mine ? "green" : "plain"} />
      <div aria-hidden="true" className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 text-body-md font-medium text-ink">
          <span className="truncate" title={name}>
            {name}
          </span>
          {person.mine && (
            <span className="shrink-0 rounded-full bg-well-green px-2 py-0.5 text-meta font-semibold text-well-ink">
              You
            </span>
          )}
        </p>
        <p className="tabular text-body-sm text-muted">
          {person.total}
          {tied && <span> · shared place</span>}
        </p>
      </div>
      <Avatar
        name={name}
        tone="accent"
        size="md"
        className={cn(
          "hidden min-[23rem]:inline-flex",
          person.mine && "bg-well-green-soft text-well-green-text",
        )}
      />
    </li>
  );
}

/**
 * Your own row, pinned to the bottom of the board while you scroll, so you are
 * never lost in a long list. It reads the API's `me` block, which is there even
 * when your row is not in the entries it listed.
 */
export function YouRow({
  rank,
  tied,
  total,
  className,
}: {
  rank: number;
  tied: boolean;
  total: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={`Your place: ${rankWords(rank, tied)}, ${total}`}
      className={cn(
        "sticky bottom-3 z-10 flex items-center gap-3 rounded-2xl bg-well-peri px-4 py-3 text-well-ink shadow-lg ring-1 ring-well-ink/10",
        className,
      )}
    >
      <RankBadge rank={rank} tone="green" />
      <div aria-hidden="true" className="min-w-0 flex-1">
        <p className="text-body-md font-semibold">Your place</p>
        <p className="tabular text-body-sm">
          {total}
          {tied && <span> · shared place</span>}
        </p>
      </div>
      <WellnessArt
        name="apple"
        mood="happy"
        size={40}
        animate={false}
        className="hidden min-[23rem]:block"
      />
    </div>
  );
}
