"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PauseCircle,
  Plus,
  Search,
  Webhook,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
  Tag,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { hostOf, pathOf, type ApiWebhook } from "@/lib/api/webhooks";
import { fullStamp } from "@/lib/audit/language";
import { usePermissions } from "@/lib/permissions";
import {
  useWebhookActions,
  useWebhookCatalogue,
  useWebhooks,
} from "@/lib/store/webhooks";
import { AddWebhookModal } from "./add-webhook";

/**
 * Webhooks — the endpoints, and whether each one is working.
 *
 * ## Why this ships when the integrations page does not
 *
 * Every card on `/settings/integrations` says "not available yet", because
 * connecting to a bank or an accounting system means holding somebody else's
 * credential and there is no credential store. A webhook is the opposite: the
 * customer owns the endpoint and supplies the URL, and nothing here holds a
 * third party's secret. So it is the one integration that can be shipped without
 * anything pretending.
 *
 * ## The permission gate sits above the hooks
 *
 * Every route in this module needs `MANAGE_SETTINGS`, the events catalogue
 * included — a webhook decides where a copy of the payroll goes. Checking inside
 * the screen and returning early would still have run the hooks, firing three
 * requests the API is right to refuse.
 */
export function WebhooksScreen() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <Header />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only">Loading your endpoints</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_SETTINGS")) {
    return (
      <>
        <Header />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Webhook aria-hidden="true" />}
              title="You cannot manage webhooks"
              description="A webhook sends a copy of payroll data to another server, so it is kept to the people who manage company settings. Ask whoever handles access to add that permission to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Endpoints />;
}

function Header({ action }: { action?: React.ReactNode }) {
  return (
    <PageHeader
      title="Webhooks"
      description="Tell your own server the moment something happens here."
      breadcrumb={[{ href: "/settings", label: "Settings" }]}
      action={action}
    />
  );
}

function Endpoints() {
  const [state, setState] = useState<"all" | "active" | "off">("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  /* One request per pause, not one per keystroke. */
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /* The page belongs to the filter it was read under. Deriving it during render
     is what stops "page 3 of all endpoints" surviving into a search with two
     results — without an effect that resets it. */
  const filterKey = `${state}|${query}`;
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;

  const list = useWebhooks({ state, q: query, page });
  const { catalogue } = useWebhookCatalogue();
  const { update, editable } = useWebhookActions();
  const toast = useToast();

  const setActive = async (webhook: ApiWebhook, active: boolean) => {
    try {
      await update(webhook.id, { active });
      toast.push({
        title: active
          ? `${hostOf(webhook.url)} is on again`
          : `${hostOf(webhook.url)} is off`,
        tone: active ? "success" : "info",
        ...(active
          ? { detail: "Send a test event to check it before the next real one." }
          : {}),
      });
      list.reload();
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    }
  };

  return (
    <>
      <Header
        action={
          editable ? (
            <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Add endpoint
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {!editable && (
          <Callout tone="warning" title="Worked examples, read-only">
            Nothing in this browser can post to your server. Connect the API to
            add an endpoint or send a test.
          </Callout>
        )}

        {list.error && (
          <LoadFailure subject="your endpoints" error={list.error} />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Show"
            value={state}
            onChange={setState}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <Input
              icon={<Search aria-hidden="true" />}
              type="search"
              placeholder="Find a URL"
              aria-label="Find an endpoint by URL"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {list.loading ? (
          <Skeleton className="h-48 w-full" />
        ) : list.rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Webhook aria-hidden="true" />}
              title={
                search || state !== "all"
                  ? "Nothing matches that"
                  : "No endpoints yet"
              }
              description="Give us a URL and we POST signed JSON to it when something happens. Unlike the other integrations, this one needs no credential of anybody else's — the server is yours."
              action={
                editable && !search && state === "all" ? (
                  <Button variant="accent" onClick={() => setAdding(true)}>
                    <Plus aria-hidden="true" className="size-4" />
                    Add endpoint
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <ul className="flex flex-col gap-4">
            {list.rows.map((webhook) => (
              <li key={webhook.id}>
                <EndpointCard
                  webhook={webhook}
                  editable={editable}
                  onSetActive={(active) => void setActive(webhook, active)}
                />
              </li>
            ))}
          </ul>
        )}

        {(page > 1 || list.hasMore) && (
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPaging({ key: filterKey, page: page - 1 })}
            >
              Newer
            </Button>
            <span className="text-body-sm tabular text-muted">
              {list.total === 1 ? "1 endpoint" : `${list.total} endpoints`} · page{" "}
              {page}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!list.hasMore}
              onClick={() => setPaging({ key: filterKey, page: page + 1 })}
            >
              Older
            </Button>
          </div>
        )}

        {list.rows.length > 0 && (
          <p className="text-body-sm text-body">
            An endpoint that fails repeatedly is switched off and a notice goes to{" "}
            <Link
              href="/notifications"
              className="font-medium text-accent-text underline decoration-accent-line underline-offset-2"
            >
              Notifications
            </Link>
            . Nothing is emailed — email delivery is not wired yet.
          </p>
        )}
      </PageBody>

      <AddWebhookModal
        open={adding}
        onClose={() => setAdding(false)}
        catalogue={catalogue}
        onCreated={list.reload}
      />
    </>
  );
}

/* ------------------------------------------------------------------- one row */

function EndpointCard({
  webhook,
  editable,
  onSetActive,
}: {
  webhook: ApiWebhook;
  editable: boolean;
  onSetActive: (active: boolean) => void;
}) {
  /* Switched itself off, rather than somebody switching it off: the API records
     the reason either way, and the wording it uses for a manual switch-off is
     the sentence "Switched off in Settings." */
  const gaveUp =
    !webhook.active &&
    webhook.disabledReason !== null &&
    webhook.disabledReason !== "Switched off in Settings.";

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-body-sm font-semibold text-ink">
              {hostOf(webhook.url)}
            </p>
            <p className="mt-0.5 truncate font-mono text-meta text-body">
              {pathOf(webhook.url) || "/"}
            </p>
          </div>
          <StateBadge webhook={webhook} gaveUp={gaveUp} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {webhook.events.map((event) => (
            <Tag key={event}>{event}</Tag>
          ))}
        </div>

        {webhook.notRaisedYet.length > 0 && (
          <p className="flex items-start gap-1.5 text-body-sm text-body">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-warning-text"
            />
            <span>
              {webhook.notRaisedYet.length} of these are not raised by anything
              yet, so this endpoint will be quiet until they ship.
            </span>
          </p>
        )}

        {gaveUp && webhook.disabledReason && (
          <Callout
            tone="danger"
            title="Switched itself off"
            icon={<XCircle aria-hidden="true" />}
          >
            {webhook.disabledReason}
          </Callout>
        )}

        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm">
          <Count label="Delivered" value={webhook.health.delivered} />
          <Count label="Waiting to retry" value={webhook.health.pending} />
          <Count label="Given up on" value={webhook.health.failed} />
          <div className="flex gap-1.5">
            <dt className="text-muted">Last delivered</dt>
            <dd className="tabular text-ink">
              {webhook.health.lastDeliveredAt
                ? fullStamp(webhook.health.lastDeliveredAt)
                : "Never"}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink
            href={`/settings/webhooks/${webhook.id}`}
            variant="accent"
            size="sm"
          >
            Open delivery log
          </ButtonLink>
          {editable &&
            (webhook.active ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSetActive(false)}
              >
                Turn off
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onSetActive(true)}
              >
                Turn back on
              </Button>
            ))}
        </div>
      </CardBody>
    </Card>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular font-medium text-ink">{value}</dd>
    </div>
  );
}

/**
 * The state, as a word and a shape.
 *
 * Four states and four icons, because a colour on its own is not a state
 * anybody can read: off and failing are both "not delivering", and which one it
 * is decides what you do next.
 */
function StateBadge({
  webhook,
  gaveUp,
}: {
  webhook: ApiWebhook;
  gaveUp: boolean;
}) {
  if (gaveUp) {
    return (
      <Badge tone="danger" icon={<XCircle aria-hidden="true" />}>
        Switched itself off
      </Badge>
    );
  }
  if (!webhook.active) {
    return (
      <Badge tone="neutral" icon={<PauseCircle aria-hidden="true" />}>
        Off
      </Badge>
    );
  }
  if (webhook.health.pending > 0) {
    return (
      <Badge tone="warning" icon={<Clock aria-hidden="true" />}>
        {webhook.health.pending} waiting to retry
      </Badge>
    );
  }
  return (
    <Badge tone="success" icon={<CheckCircle2 aria-hidden="true" />}>
      On
    </Badge>
  );
}
