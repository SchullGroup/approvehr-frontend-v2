"use client";

import { BellRing } from "lucide-react";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import { usePush } from "@/lib/store/push";

/**
 * How a reminder reaches you, and what it does not do.
 *
 * Written from the API's own account of delivery (the wellness reminders
 * handover), and held to what it can promise. The API sends a notification and
 * cannot tell this screen whether a device rang, so nothing here says a reminder
 * was "delivered", and there is no count of reminders, because the design records
 * no act and has none to show. The words to keep out are in
 * `tests/wellness-reminders-delivery.test.tsx`.
 *
 * ## Every line is a limit somebody would otherwise find out by surprise
 *
 * Only while you are at work, only once, only at the clock's minute marks, your
 * own settings first, and nobody at the company can see whether you got one. Each
 * is a thing a person asks about the first time a reminder does not appear, or
 * does, at an odd moment.
 *
 * ## The one live control is turning notifications on in this browser
 *
 * `/settings/notifications` has the same switch, behind the settings permission,
 * so a link there would send an ordinary employee to a refusal. The screen uses
 * the same `usePush` the settings panel does and asks from here, which is the
 * thing a person who has just saved a reminder wants to be able to do. A browser
 * that has blocked notifications is told that only its own site settings can undo
 * it, rather than being offered a button that silently does nothing.
 */

export function ReminderDelivery() {
  return (
    <Card>
      <CardHeader
        level={2}
        title="How reminders reach you"
        description="What to expect once they are saved."
      />
      <CardBody>
        <ul className="flex flex-col divide-y divide-line">
          <Line>
            <p>
              Sent as notifications to your phone and browser, where you have
              allowed them.
            </p>
            <BrowserStatus />
          </Line>
          <Line>
            <p>
              Only while you are at work: inside your company&rsquo;s working
              hours and, if your company records attendance, only while you are
              clocked in. Not on rest days, public holidays or approved leave.
            </p>
          </Line>
          <Line>
            <p>
              Your own settings win. Switching reminders off for yourself stops
              yours, even if your company has them on.
            </p>
          </Line>
          <Line>
            <p>
              Each one comes once, at the minute marks of the clock. A 15-minute
              reminder arrives at :00, :15, :30 and :45, and a named break
              arrives when it starts. A missed one is not sent again.
            </p>
          </Line>
          <Line>
            <p>
              Nobody at your company can see whether you received or opened a
              reminder, and a reminder never says anything about your health.
            </p>
          </Line>
        </ul>
      </CardBody>
    </Card>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 py-3 text-body-sm leading-relaxed text-body first:pt-0 last:pb-0">
      {children}
    </li>
  );
}

/**
 * Whether this browser is set up, said as a fact about the browser and not about
 * any reminder: an `on` here is a subscription, and the API cannot say a device
 * will ring.
 */
function BrowserStatus() {
  const push = usePush();

  switch (push.state) {
    case "off":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted">
            This browser is not set up for them yet.
          </span>
          <Button
            size="sm"
            variant="secondary"
            loading={push.busy}
            onClick={() => void push.enable()}
          >
            <BellRing aria-hidden="true" className="size-4" />
            Turn on in this browser
          </Button>
          {push.error && (
            <span role="alert" className="text-danger-text">
              {push.error}
            </span>
          )}
        </div>
      );
    case "on":
      return <p className="text-muted">This browser is set up for them.</p>;
    case "blocked":
      return (
        <p className="text-muted">
          This browser has blocked notifications for this site. Only the
          browser&rsquo;s own site settings can change that.
        </p>
      );
    case "unsupported":
      return (
        <p className="text-muted">This browser cannot show notifications.</p>
      );
    case "unconfigured":
      return (
        <p className="text-muted">
          Browser notifications are not set up on this server yet. Ask your
          administrator.
        </p>
      );
    default:
      /* Still working it out: say nothing rather than guess. */
      return null;
  }
}
