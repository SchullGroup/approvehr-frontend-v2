"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import {
  Callout,
  Card,
  CardBody,
  Disclosure,
  EmptyState,
  LoadState,
  Stat,
  StatGrid,
  Switch,
  Tabs,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  providerName,
  sentThisWeek,
  statusHeadline,
  type ApiSmsStatus,
} from "@/lib/api/sms";
import { FEATURE_COPY, useFeatureSettings } from "@/lib/store/features";
import { useSession } from "@/lib/store/session";
import { useSmsStatus } from "@/lib/store/sms";
import { PeopleTab } from "./people-tab";

/**
 * Text messages, for whoever manages settings.
 *
 * ## One question per tab
 *
 * **Overview** answers "is this working": whether a provider is connected, whether
 * the weekly text is on, how many people have opted in, and what went out this
 * week, with the switch beside it. **People** answers "who has agreed, and how".
 * The two were one long page, and the second is a table that does not belong
 * under a switch.
 *
 * ## What the overview must say first
 *
 * That nothing is sent until a text provider is connected, whenever that is true,
 * and whatever the switch says. The line is quiet and not a banner, with the API's
 * own account of what is and is not happening behind the icon beside it. A switch
 * that is on while nothing can leave must not read as a working feature.
 *
 * ## The switch is the one every other flag uses
 *
 * `smsDigest` is written through `useFeatureSettings().setFeature`, so the sidebar,
 * the settings page and this screen share one answer, and the status is asked again
 * after it changes. It is not on `/settings/features`: switching the digest on does
 * nothing for anybody until a person opts in, and the people who have are here.
 *
 * ## Offline, there is nothing to show
 *
 * A subscription that this browser made up would be a claim that somebody agreed to
 * be texted. See `lib/store/sms.ts`.
 */

type SmsTab = "overview" | "people";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "people", label: "People" },
];

export function SmsScreen() {
  const { isConnected } = useSession();
  const [tab, setTab] = useState<SmsTab>("overview");
  const status = useSmsStatus();

  return (
    <>
      <PageHeader
        title="Text messages"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
      />
      <PageBody className="flex flex-col gap-6">
        {!isConnected ? (
          <EmptyState
            icon={<MessageSquare aria-hidden="true" />}
            title="Not available offline"
            description="Text messages need a signed-in company account."
          />
        ) : (
          <Tabs
            items={TABS}
            value={tab}
            onChange={(next) => setTab(next as SmsTab)}
          >
            <div className="flex flex-col gap-6">
              {tab === "overview" && <Overview status={status} />}
              {tab === "people" && <PeopleTab onChanged={status.reload} />}
            </div>
          </Tabs>
        )}
      </PageBody>
    </>
  );
}

function Overview({ status }: { status: ReturnType<typeof useSmsStatus> }) {
  return (
    <LoadState
      loading={status.loading}
      error={status.error}
      subject="the text message status"
      onRetry={status.reload}
      missingMeans="module"
    >
      {status.data && (
        <div className="flex flex-col gap-6">
          <Figures status={status.data} />
          <DigestSwitch status={status.data} onChanged={status.reload} />
          <Rules />
        </div>
      )}
    </LoadState>
  );
}

/** The four figures, and the one line that says whether this can work at all. */
function Figures({ status }: { status: ApiSmsStatus }) {
  const headline = statusHeadline(status);
  const segments = status.thisWeek.segments;
  return (
    <div className="flex flex-col gap-4">
      <StatGrid>
        <Stat
          label="Provider"
          value={status.transport.sends ? "Connected" : "Not connected"}
          hint={
            status.transport.sends ? providerName(status) : "Nothing is sent"
          }
        />
        <Stat label="Weekly text" value={status.enabled ? "On" : "Off"} />
        <Stat
          label="Opted in"
          value={String(status.subscribers.optedIn)}
          hint={`${String(status.subscribers.optedOut)} opted out`}
        />
        <Stat
          label="Sent this week"
          value={String(sentThisWeek(status))}
          hint={`${String(segments)} ${segments === 1 ? "segment" : "segments"} used`}
        />
      </StatGrid>

      {/* A quiet line and not a banner: the first thing it says is the one that
          matters, and the API's own account of the rest is behind the icon. */}
      {headline && (
        <Callout
          tone={headline.attention ? "warning" : "neutral"}
          title={headline.text}
        >
          {status.notes.join(" ")}
        </Callout>
      )}
    </div>
  );
}

/** The company's switch, written the way every other one is. */
function DigestSwitch({
  status,
  onChanged,
}: {
  status: ApiSmsStatus;
  onChanged: () => void;
}) {
  const features = useFeatureSettings();
  const toast = useToast();

  async function set(next: boolean) {
    try {
      await features.setFeature("smsDigest", next);
      onChanged();
      toast.push({
        title: next ? "Weekly text is on" : "Weekly text is off",
        /* On with nothing to send it is a thing to look at, and the toast says
           so rather than leaving a green light over nothing. */
        tone: next && !status.transport.sends ? "warning" : "success",
        detail: next
          ? status.transport.sends
            ? "Only people who opted in are texted."
            : "Nothing is sent until a text provider is connected."
          : "Nobody is texted. Opting out still works.",
      });
    } catch (error) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    }
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <Switch
          label={FEATURE_COPY.smsDigest.label}
          description={FEATURE_COPY.smsDigest.line}
          checked={features.flags.smsDigest}
          disabled={
            !features.editable ||
            features.loading ||
            features.saving === "smsDigest"
          }
          onChange={(event) => void set(event.target.checked)}
        />
        {!features.editable && (
          <p className="text-body-sm text-muted">
            Changing this needs the Manage settings permission.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * The rules, behind a click.
 *
 * Five short lines, closed by default: they are reference, and the two that matter
 * most in the moment (nothing is sent without a provider, HR cannot undo a person's
 * own opt-out) are said where they apply, on the overview line and in the menu.
 */
function Rules() {
  return (
    <Disclosure title="What gets sent, and to whom" level={3}>
      <ul className="flex flex-col gap-2 text-body-sm text-body">
        <li>Only people who opted in are texted, one by one.</li>
        <li>
          They opt in themselves in the app, or you record a signed form for
          them.
        </li>
        <li>The text has counts and a link, never pay or health details.</li>
        <li>
          They can stop it from the link in the text or in the app. HR cannot
          undo that.
        </li>
        <li>Nothing is sent until a text provider is connected.</li>
      </ul>
    </Disclosure>
  );
}
