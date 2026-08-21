"use client";

import { Crown, KeyRound, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  rankRoles,
  roleTier,
  useSessionRoles,
  type RoleTier,
  type SessionRole,
} from "@/lib/roles";

/**
 * Which kind of user this is.
 *
 * ## Colour is the third channel, not the first
 *
 * The label already says "Payroll officer", so the tone and the icon only have
 * to make two badges *distinguishable at a glance* — they never have to be
 * decoded. That is deliberate rather than defensive: a reader with a colour
 * vision deficiency, a greyscale print of a screenshot and a support ticket
 * pasted into a chat window all lose the tone and none of them lose the answer.
 *
 * Every tone below is an existing token pair from `components/ui/badge.tsx`,
 * already in `scripts/verify-contrast.ts`. No new colour was invented for this,
 * which is what makes the AA claim inherited rather than re-argued.
 *
 * ## Two components
 *
 * `RoleBadge` takes roles and renders them — reusable anywhere a role is known,
 * including for somebody who is *not* the signed-in person. `SessionRoleBadge`
 * is the one screens want: it asks `useSessionRoles()` who is signed in and
 * renders nothing at all while that is still resolving, because a badge that
 * flashes "Employee" and settles on "Owner" is worse than a badge that arrives
 * a moment late.
 */

const TREATMENT: Readonly<
  Record<RoleTier, { tone: BadgeTone; icon: React.ReactNode }>
> = {
  owner: { tone: "ink", icon: <Crown /> },
  admin: { tone: "accent", icon: <ShieldCheck /> },
  custom: { tone: "info", icon: <KeyRound /> },
  staff: { tone: "neutral", icon: <UserRound /> },
};

export function RoleBadge({
  roles,
  lineManager = false,
  size = "sm",
  note,
  className,
}: {
  /** Ranked internally, so a caller may pass them in any order. */
  roles: readonly SessionRole[];
  /** Has direct reports. Rendered as a second badge — see below. */
  lineManager?: boolean;
  size?: "sm" | "md";
  /** One extra sentence for the tooltip. Mode notes use this. */
  note?: string;
  className?: string;
}) {
  const ranked = rankRoles(roles);
  const primary = ranked[0];
  /* No role is a real state, and it is indistinguishable from an API that did
     not send the field. Rendering nothing is an absence; rendering "No role"
     would be a claim about somebody's access. */
  if (!primary) return null;

  const extra = ranked.slice(1);
  const tier = roleTier(primary.name);
  const treatment = TREATMENT[tier];

  /* Only alongside the plain Employee role. An owner who also runs a team does
     not need a second badge to qualify the first, and two badges on everybody
     senior would turn a signal into furniture. */
  const showLineManager = lineManager && tier === "staff";

  const sentence = [
    extra.length > 0
      ? `${primary.name}, and also ${extra.map((role) => role.name).join(", ")}.`
      : `${primary.name}.`,
    showLineManager ? "Has people reporting to them." : null,
    note ?? null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");

  return (
    <span
      title={sentence}
      className={cn("inline-flex flex-wrap items-center gap-1.5", className)}
    >
      <Badge tone={treatment.tone} size={size} icon={treatment.icon}>
        {primary.name}
        {extra.length > 0 && (
          <>
            {/* Same colour as the label, deliberately: dimming this with opacity
                would take a verified contrast ratio and quietly lower it. */}
            <span aria-hidden="true" className="font-semibold">
              +{extra.length}
            </span>
            {/* `title` is not reliably exposed to assistive technology, so the
                roles behind the "+1" are also stated in text. The visible label
                is read normally, so this only carries what it cannot. */}
            <span className="sr-only">
              , and {extra.length === 1 ? "one other role" : `${extra.length} other roles`}:{" "}
              {extra.map((role) => role.name).join(", ")}
            </span>
          </>
        )}
      </Badge>

      {showLineManager && (
        <Badge tone="info" size={size} icon={<UsersRound />}>
          Line manager
        </Badge>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The signed-in person's role. The form nearly every screen wants.
 *
 * The note it attaches is the honest part. A demo session holds every
 * permission whatever role the seed puts the persona in — that is a deliberate
 * decision recorded in `lib/permissions.ts`, and a badge reading "Employee" over
 * an app showing the whole of payroll would otherwise be a lie by omission.
 */
export function SessionRoleBadge({
  size = "sm",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const { loading, roles, isManager, enforced, previewing } = useSessionRoles();

  if (loading || roles.length === 0) return null;

  const note = previewing
    ? "You are previewing the app as this role. Settings → Roles turns it off."
    : enforced
      ? undefined
      : "Demo session. The role is the one the seed puts this person in; a demo holds every permission regardless.";

  return (
    <RoleBadge
      roles={roles}
      lineManager={isManager}
      size={size}
      note={note}
      className={className}
    />
  );
}
