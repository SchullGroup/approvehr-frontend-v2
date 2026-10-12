"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Skeleton,
  useToast,
  type BadgeTone,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import {
  connectFailureText,
  connectionIdOf,
  workTrackersApi,
  type ApiWorkTrackerConnection,
  type ApiWorkTrackerProvider,
  type WorkTrackerStatus,
} from "@/lib/api/work-trackers";
import { useOrgTimezone } from "@/lib/store/session";
import { useWorkTrackerProviders } from "@/lib/store/work-trackers";
import { formatDateTimeShort } from "@/lib/time";
import { useAction } from "@/lib/use-action";

/**
 * Work trackers: a card for each of the five tools, Connect, Manage or Reconnect
 * according to its state, and "Coming soon" for one the API has no adapter for.
 *
 * The first part of the integrations page that really connects. Connect asks
 * the API for the tool's consent URL and sends the browser there; the tool
 * sends it back through the API to this page with `?workTracker=…`, which
 * `returnStatus` carries in from the server page.
 */

export type WorkTrackerReturn = {
  status: "connected" | "error" | null;
  reason: string | null;
  connectionId: string | null;
};

const STATUS: Record<WorkTrackerStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: "Connected", tone: "success" },
  NEEDS_REAUTH: { label: "Needs reconnecting", tone: "warning" },
  DISCONNECTED: { label: "Disconnected", tone: "neutral" },
};

export function WorkTrackersSection({
  returnStatus,
}: {
  returnStatus: WorkTrackerReturn;
}) {
  const { providers, loading, error, reload, connected } =
    useWorkTrackerProviders();
  const toast = useToast();
  const router = useRouter();
  const announced = useRef(false);

  /* Once, on the way back from the tool: say what happened, take the flag
     out of the address bar so a refresh does not say it again, and go
     straight to the new connection — it reads nothing until projects are
     picked there. */
  useEffect(() => {
    if (announced.current || !returnStatus.status) return;
    announced.current = true;
    const url = new URL(window.location.href);
    for (const key of ["workTracker", "reason", "connectionId"]) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", url);

    if (returnStatus.status === "connected") {
      toast.push({
        title: "Connected",
        tone: "success",
        detail: "Pick which projects to read next. Nothing syncs until you do.",
      });
      /* From the address bar, so only a real id is followed. */
      const connectionId = connectionIdOf(returnStatus.connectionId);
      if (connectionId) {
        router.push(`/settings/integrations/work-trackers/${connectionId}`);
      }
    } else {
      toast.push({
        title: "Not connected",
        tone: "danger",
        detail: connectFailureText(returnStatus.reason),
      });
    }
  }, [returnStatus, toast, router]);

  if (!connected) return null;

  return (
    <Card>
      <CardHeader
        title="Work trackers"
        level={3}
        description="Bring finished tickets into the weekly task log, where a manager confirms them before they count towards anyone's objectives."
      />
      <CardBody className="flex flex-col gap-3">
        <LoadFailure
          subject="the work trackers"
          error={error}
          onRetry={reload}
        />
        {loading ? (
          <Skeleton className="h-36 w-full" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {providers.map((provider) => (
              <ProviderCard key={provider.slug} provider={provider} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ProviderCard({ provider }: { provider: ApiWorkTrackerProvider }) {
  const { run, pending } = useAction();
  const live = provider.connections.filter((c) => c.status !== "DISCONNECTED");

  async function connect() {
    const outcome = await run(() => workTrackersApi.connect(provider.slug), {
      subject: `the ${provider.name} connection`,
    });
    if (outcome.ok) window.location.assign(outcome.value.url);
  }

  const badge = !provider.available
    ? { label: "Coming soon", tone: "neutral" as BadgeTone }
    : !provider.configured
      ? { label: "Not set up on this server", tone: "warning" as BadgeTone }
      : live.length > 0
        ? STATUS[live[0]!.status]
        : { label: "Not connected", tone: "neutral" as BadgeTone };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-md bg-sunken text-faint [&>svg]:size-[18px]"
        >
          <ListChecks aria-hidden="true" />
        </span>
        <Badge tone={badge.tone} size="sm" dot={badge.tone === "success"}>
          {badge.label}
        </Badge>
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{provider.name}</p>
        {live.length > 0 ? (
          live.map((c) => <ConnectionLine key={c.id} connection={c} />)
        ) : (
          <p className="mt-1 text-body-sm leading-relaxed text-body">
            {provider.available
              ? "Read-only. You choose which projects are read."
              : "On the way. It will work exactly like Jira."}
          </p>
        )}
      </div>

      {live.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {live.map((c) => (
            <ButtonLink
              key={c.id}
              href={`/settings/integrations/work-trackers/${c.id}`}
              size="sm"
              variant={c.status === "NEEDS_REAUTH" ? "secondary" : "primary"}
            >
              Manage
            </ButtonLink>
          ))}
          {live.some((c) => c.status === "NEEDS_REAUTH") && (
            <Button
              size="sm"
              variant="secondary"
              loading={pending}
              onClick={() => void connect()}
            >
              Reconnect
            </Button>
          )}
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={!provider.available || !provider.configured}
          loading={pending}
          onClick={() => void connect()}
        >
          Connect {provider.name}
        </Button>
      )}
    </div>
  );
}

function ConnectionLine({
  connection,
}: {
  connection: ApiWorkTrackerConnection;
}) {
  const timeZone = useOrgTimezone();
  return (
    <p className="mt-1 text-body-sm leading-relaxed text-body">
      {connection.site.name ?? connection.site.url}
      {" · "}
      {connection.lastSyncedAt
        ? `last synced ${formatDateTimeShort(connection.lastSyncedAt, timeZone)}`
        : "not synced yet"}
    </p>
  );
}
