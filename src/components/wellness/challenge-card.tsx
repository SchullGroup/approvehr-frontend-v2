import Link from "next/link";
import {
  METRIC_LABEL,
  MODE_LABEL,
  type ApiChallenge,
  type ChallengeStatus,
} from "@/lib/api/wellness";
import { cn } from "@/lib/cn";
import {
  STATUS_LABEL,
  daysText,
  durationDays,
  statusText,
} from "@/lib/wellness/format";
import { WellnessArt, type ArtMood, type ArtName } from "./art";
import { TONE_WASH, type WellTone } from "./tiles";

/**
 * A challenge as a card: a tile with a mascot where a photo would be, chips for
 * what is measured, how long it runs and who it is for, and where it stands.
 *
 * Nothing on it counts anybody. The list is open to the whole company and a
 * participant count is the first thing the privacy floor exists to withhold, so
 * the card says whether *you* joined and nothing about how many others did.
 */

export function artFor(challenge: ApiChallenge): {
  name: ArtName;
  tone: WellTone;
} {
  if (challenge.mode === "TEAM") return { name: "cherries", tone: "pink" };
  return challenge.metric === "STEPS"
    ? { name: "sneaker", tone: "green" }
    : { name: "drop", tone: "peri" };
}

export function moodFor(status: ChallengeStatus, joined: boolean): ArtMood {
  if (status === "ENDED" || status === "CANCELLED") return "sleepy";
  return status === "ACTIVE" && joined ? "cheering" : "happy";
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "peri";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-meta font-medium",
        tone === "green" && "bg-well-green-soft text-well-green-text",
        tone === "peri" && "bg-well-peri-soft text-well-peri-text",
        tone === "neutral" && "bg-sunken text-body",
      )}
    >
      {children}
    </span>
  );
}

export function ChallengeCard({
  challenge,
  today,
  href,
  actions,
  menu,
  className,
}: {
  challenge: ApiChallenge;
  today: string;
  href: string;
  /** Buttons under the card, above its link. */
  actions?: React.ReactNode;
  /** The row-actions menu, top right. */
  menu?: React.ReactNode;
  className?: string;
}) {
  const art = artFor(challenge);
  const quiet =
    challenge.status === "ENDED" || challenge.status === "CANCELLED";
  return (
    <li
      className={cn(
        "relative flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4 transition-shadow duration-150 hover:shadow-md",
        quiet && "bg-canvas",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className={cn(
            "flex size-[5.5rem] shrink-0 items-center justify-center rounded-2xl",
            TONE_WASH[art.tone],
          )}
        >
          <WellnessArt
            name={art.name}
            mood={moodFor(challenge.status, challenge.joined)}
            size={72}
            animate={false}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-h4 text-ink">
            <Link
              href={href}
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-offset-4"
            >
              <span className="[overflow-wrap:anywhere]">
                {challenge.title}
              </span>
            </Link>
          </h3>
          <p className="mt-0.5 text-body-sm text-muted">
            {statusText(challenge, today)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>{METRIC_LABEL[challenge.metric]}</Chip>
            <Chip>
              {daysText(durationDays(challenge.startsOn, challenge.endsOn))}
            </Chip>
            <Chip>{MODE_LABEL[challenge.mode]}</Chip>
            {(challenge.status === "ENDED" ||
              challenge.status === "CANCELLED") && (
              <Chip tone="peri">{STATUS_LABEL[challenge.status]}</Chip>
            )}
            {challenge.joined && <Chip tone="green">Joined</Chip>}
          </div>
        </div>
        {menu && <div className="relative z-10 -mr-1 -mt-1">{menu}</div>}
      </div>
      {actions && (
        <div className="relative z-10 flex flex-wrap justify-end gap-2">
          {actions}
        </div>
      )}
    </li>
  );
}
