"use client";

import { BellRing, Monitor } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Skeleton,
} from "@/components/ui";
import { usePush } from "@/lib/store/push";
import type { ApiPushDevice } from "@/lib/api/push";

/**
 * Browser notifications for this device.
 *
 * ## Five states, and none of them is a switch that lies
 *
 * A switch implies on or off. Collapsing the five is how a settings screen ends
 * up showing "off" to somebody who has **blocked** notifications and will press
 * it forever — the browser will not ask again, and only its own site settings
 * can undo that. So `blocked` says what to do instead of offering a control.
 *
 * `unconfigured` is the other one worth keeping separate: the server has no
 * VAPID key, which is not something the person reading can fix. It names what
 * to ask for rather than hiding the section, because a capability that vanishes
 * reads as one the product does not have.
 *
 * ## What a push says, and what it does not
 *
 * A notification is drawn by the operating system, on a screen that may be
 * locked and visible to whoever is holding the phone. So a push carries "a
 * payroll needs approving", never the figure — and the copy below says so,
 * because somebody deciding whether to turn this on is deciding what may appear
 * on their lock screen.
 */
export function PushPanel() {
  const push = usePush();

  return (
    <Card>
      <CardHeader
        level={2}
        title="Notifications on this device"
        description="A buzz when something needs you. The inbox still has everything either way."
        action={
          push.state === "on" ? (
            <Badge tone="success" size="sm" dot>
              On here
            </Badge>
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-4">
        {push.state === "loading" ? (
          <Skeleton className="h-16 w-full" />
        ) : push.state === "unsupported" ? (
          <Callout tone="info" title="This browser cannot show them">
            Notifications need a browser with push support. On an iPhone, add
            ApproveHR to your home screen first — Safari only allows them for an
            installed app.
          </Callout>
        ) : push.state === "unconfigured" ? (
          <Callout tone="info" title="Not switched on for this company yet">
            Browser notifications need a key set on the server. Ask whoever runs
            your ApproveHR deployment to set <code>VAPID_PUBLIC_KEY</code>,{" "}
            <code>VAPID_PRIVATE_KEY</code> and <code>VAPID_SUBJECT</code>.
            Everything else about notifications works without it.
          </Callout>
        ) : push.state === "blocked" ? (
          <Callout tone="warning" title="This browser is blocking them">
            You have blocked notifications for ApproveHR, and a button here
            cannot undo that — the browser will not ask again. Allow
            notifications for this site in your browser&rsquo;s own settings,
            then come back.
          </Callout>
        ) : (
          <>
            <p className="text-body-sm text-muted">
              A notification says what needs you — &ldquo;a payroll needs
              approving&rdquo; — and never a figure. It is drawn by your
              operating system, so it may appear on a locked screen.
            </p>
            <div>
              {push.state === "on" ? (
                <Button
                  variant="secondary"
                  loading={push.busy}
                  onClick={() => void push.disable()}
                >
                  Turn them off here
                </Button>
              ) : (
                <Button
                  variant="accent"
                  loading={push.busy}
                  onClick={() => void push.enable()}
                >
                  <BellRing aria-hidden="true" className="size-4" />
                  Turn them on here
                </Button>
              )}
            </div>
          </>
        )}

        {push.error && (
          <Callout tone="danger" title="That did not work">
            {push.error}
          </Callout>
        )}

        {push.devices.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-body-sm font-medium text-body">
              Browsers you have allowed
            </p>
            <ul className="flex flex-col gap-1">
              {push.devices.map((device) => (
                <Device key={device.id} device={device} />
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Device({ device }: { device: ApiPushDevice }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-meta">
      <Monitor aria-hidden="true" className="size-3.5 text-faint" />
      <span className="text-body">{browserName(device.userAgent)}</span>
      <span className="text-faint">added {device.createdAt.slice(0, 10)}</span>
      {/* Shown rather than quietly dropped: "why did I stop getting these"
          otherwise has no answer on any screen. */}
      {device.gone && (
        <Badge tone="neutral" size="sm">
          Stopped receiving
        </Badge>
      )}
    </li>
  );
}

/**
 * A user-agent string as something a person recognises.
 *
 * Deliberately crude and deliberately not a parser: the string is unreliable by
 * design and the only job here is to help somebody tell two of their own
 * devices apart. An unrecognised one shows as "A browser" rather than the raw
 * string, which is unreadable and tells them nothing.
 */
function browserName(userAgent: string | null): string {
  if (!userAgent) return "A browser";
  const mobile = /Mobile|Android|iPhone|iPad/.test(userAgent) ? " (phone or tablet)" : "";
  if (/Edg\//.test(userAgent)) return `Edge${mobile}`;
  if (/OPR\//.test(userAgent)) return `Opera${mobile}`;
  if (/Firefox\//.test(userAgent)) return `Firefox${mobile}`;
  if (/Chrome\//.test(userAgent)) return `Chrome${mobile}`;
  if (/Safari\//.test(userAgent)) return `Safari${mobile}`;
  return `A browser${mobile}`;
}
