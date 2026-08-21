"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, RefreshCw, Trash2, Webhook, XCircle } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  Modal,
  Skeleton,
  Tag,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { hostOf, retryWindowLabel } from "@/lib/api/webhooks";
import { fullStamp } from "@/lib/audit/language";
import { usePermissions } from "@/lib/permissions";
import {
  useDeliveryLog,
  useWebhook,
  useWebhookActions,
  useWebhookCatalogue,
} from "@/lib/store/webhooks";
import { CodeBlock, CopyButton } from "../code";
import { EventPicker } from "../add-webhook";
import { SignatureDoc } from "../signature-doc";
import { DeliveryLog, type LogFilters } from "./log";
import { TestPanel } from "./test-panel";

/**
 * One endpoint: send a test, read the log, fix it, document it.
 *
 * ## The order on the page is the order somebody needs it
 *
 * Test first, because the question that brings anybody here is "why is my server
 * not hearing anything". Then what it is subscribed to, then every attempt with
 * its error, then the secret, then how to verify a signature. A person setting up
 * a receiver reads it top to bottom; a person debugging one stops at the log.
 *
 * ## Nothing on this page claims a delivery happened
 *
 * Every state comes from the API's own count or from the response to a request
 * made in front of you. There is no optimistic "sent" — a test that has not come
 * back yet shows a spinner on the button and nothing else.
 */
export function WebhookDetailScreen({ id }: { id: string }) {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader
          title="Endpoint"
          breadcrumb={[
            { href: "/settings", label: "Settings" },
            { href: "/settings/webhooks", label: "Webhooks" },
          ]}
        />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only">Loading this endpoint</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_SETTINGS")) {
    return (
      <>
        <PageHeader
          title="Endpoint"
          breadcrumb={[
            { href: "/settings", label: "Settings" },
            { href: "/settings/webhooks", label: "Webhooks" },
          ]}
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Webhook aria-hidden="true" />}
              title="You cannot manage webhooks"
              description="A delivery log contains payroll data that was sent to another server, so it is kept to the people who manage company settings."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Endpoint id={id} />;
}

function Endpoint({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();

  const webhook = useWebhook(id);
  const { catalogue } = useWebhookCatalogue();
  const { update, remove, retryDelivery, rotateSecret, editable } =
    useWebhookActions();

  const [filters, setFilters] = useState<LogFilters>({
    status: "all",
    event: "",
    page: 1,
  });
  const log = useDeliveryLog(id, filters);

  const [showSecret, setShowSecret] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingEvents, setEditingEvents] = useState<string[] | null>(null);
  const [savingEvents, setSavingEvents] = useState(false);

  const detail = webhook.detail;

  const fail = (error: unknown) =>
    toast.push({
      title: "That did not work",
      tone: "danger",
      detail:
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
    });

  if (webhook.loading) {
    return (
      <>
        <PageHeader
          title="Endpoint"
          breadcrumb={[
            { href: "/settings", label: "Settings" },
            { href: "/settings/webhooks", label: "Webhooks" },
          ]}
        />
        <PageBody>
          <Skeleton className="h-64 w-full" />
          <span className="sr-only">Loading this endpoint</span>
        </PageBody>
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <PageHeader
          title="Endpoint"
          breadcrumb={[
            { href: "/settings", label: "Settings" },
            { href: "/settings/webhooks", label: "Webhooks" },
          ]}
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Webhook aria-hidden="true" />}
              title="This endpoint is not here"
              description={
                webhook.error ??
                "It may have been deleted, or the link may belong to another company."
              }
              action={
                <ButtonLink href="/settings/webhooks" variant="accent">
                  Back to webhooks
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  const gaveUp =
    !detail.active &&
    detail.disabledReason !== null &&
    detail.disabledReason !== "Switched off in Settings.";

  const setActive = async (active: boolean) => {
    try {
      await update(id, { active });
      webhook.reload();
      toast.push({
        title: active ? "Switched back on" : "Switched off",
        tone: active ? "success" : "info",
        ...(active
          ? { detail: "Send a test event to check it before the next real one." }
          : { detail: "Events raised from now on are not queued for it." }),
      });
    } catch (error) {
      fail(error);
    }
  };

  const saveEvents = async (chosen: string[]) => {
    setSavingEvents(true);
    try {
      await update(id, { events: chosen });
      webhook.reload();
      setEditingEvents(null);
      toast.push({ title: "Events updated", tone: "success" });
    } catch (error) {
      fail(error);
    } finally {
      setSavingEvents(false);
    }
  };

  const rotate = async () => {
    setRotating(true);
    try {
      const result = await rotateSecret(id);
      webhook.reload();
      setShowSecret(true);
      setConfirmRotate(false);
      toast.push({
        title: "New signing secret",
        tone: "success",
        detail:
          result.queuedWithOldSecret > 0
            ? `${result.queuedWithOldSecret} queued deliveries were signed with the old one and will be rejected.`
            : "Put it in your server before the next event.",
      });
    } catch (error) {
      fail(error);
    } finally {
      setRotating(false);
    }
  };

  const destroy = async () => {
    setDeleting(true);
    try {
      await remove(id);
      toast.push({ title: "Endpoint deleted", tone: "info" });
      router.push("/settings/webhooks");
    } catch (error) {
      fail(error);
      setDeleting(false);
    }
  };

  const retry = async (deliveryId: string) => {
    try {
      const result = await retryDelivery(deliveryId);
      log.reload();
      webhook.reload();
      toast.push({
        title: result.ok ? "It landed this time" : "Still not delivered",
        tone: result.ok ? "success" : "warning",
        detail: result.ok
          ? `HTTP ${result.delivery.statusCode ?? 200}.`
          : (result.delivery.error ??
            `HTTP ${result.delivery.statusCode ?? "no response"}.`),
      });
    } catch (error) {
      fail(error);
    }
  };

  return (
    <>
      <PageHeader
        title={hostOf(detail.url)}
        description={detail.url}
        breadcrumb={[
          { href: "/settings", label: "Settings" },
          { href: "/settings/webhooks", label: "Webhooks" },
        ]}
        meta={
          detail.active ? (
            <Badge tone="success">On</Badge>
          ) : (
            <Badge tone="neutral">Off</Badge>
          )
        }
        action={
          editable ? (
            <div className="flex flex-wrap items-center gap-2">
              {detail.active ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void setActive(false)}
                >
                  Turn off
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void setActive(true)}
                >
                  Turn back on
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Delete
              </Button>
            </div>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {gaveUp && detail.disabledReason && (
          <Callout
            tone="danger"
            title="This endpoint switched itself off"
            icon={<XCircle aria-hidden="true" />}
          >
            <p>{detail.disabledReason}</p>
            {editable && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void setActive(true)}
                >
                  Turn back on
                </Button>
              </div>
            )}
          </Callout>
        )}

        <TestPanel
          webhookId={id}
          catalogue={catalogue}
          events={detail.events}
          editable={editable}
          onSent={() => {
            log.reload();
            webhook.reload();
          }}
        />

        <Card>
          <CardHeader
            title="This endpoint"
            level={2}
            action={
              editable ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingEvents(detail.events)}
                >
                  Change events
                </Button>
              ) : undefined
            }
          />
          <CardBody className="flex flex-col gap-4">
            <DescriptionList
              columns={2}
              items={[
                { term: "URL", value: <span className="break-all">{detail.url}</span> },
                {
                  term: "Events",
                  value: (
                    <span className="flex flex-wrap gap-1.5">
                      {detail.events.map((event) => (
                        <Tag key={event}>{event}</Tag>
                      ))}
                    </span>
                  ),
                },
                {
                  term: "Delivered",
                  value: String(detail.health.delivered),
                },
                {
                  term: "Waiting to retry",
                  value: String(detail.health.pending),
                },
                {
                  term: "Given up on",
                  value: String(detail.health.failed),
                },
                {
                  term: "Last delivered",
                  value: detail.health.lastDeliveredAt
                    ? fullStamp(detail.health.lastDeliveredAt)
                    : "Never",
                },
                {
                  term: "Retries",
                  value: catalogue
                    ? detail.delivery.retriesRunning
                      ? `Automatic — ${catalogue.retries.attempts} attempts over ${retryWindowLabel(catalogue.retries.backoffMinutes)}`
                      : "Manual only — press Retry on a delivery"
                    : detail.delivery.retriesRunning
                      ? "Automatic"
                      : "Manual only — press Retry on a delivery",
                },
                { term: "Added", value: fullStamp(detail.createdAt) },
              ]}
            />

            {detail.notRaisedYet.length > 0 && (
              <p className="text-body-sm text-body">
                {detail.notRaisedYet.join(", ")}{" "}
                {detail.notRaisedYet.length === 1 ? "is" : "are"} not raised by
                anything yet. Your endpoint stays quiet for{" "}
                {detail.notRaisedYet.length === 1 ? "it" : "them"} until the module
                that raises {detail.notRaisedYet.length === 1 ? "it" : "them"}{" "}
                ships.
              </p>
            )}
          </CardBody>
        </Card>

        <DeliveryLog
          log={log}
          filters={filters}
          onFilters={setFilters}
          events={detail.events}
          editable={editable}
          retriesRunning={detail.delivery.retriesRunning}
          onRetry={retry}
        />

        <Card>
          <CardHeader
            title="Signing secret"
            description="The key your server uses to check a request really came from us."
            level={2}
          />
          <CardBody className="flex flex-col gap-3">
            {detail.secret ? (
              <>
                {showSecret ? (
                  <>
                    <CodeBlock className="whitespace-pre-wrap break-all">
                      {detail.secret}
                    </CodeBlock>
                    <div className="flex flex-wrap items-center gap-2">
                      <CopyButton value={detail.secret} label="Copy secret" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSecret(false)}
                      >
                        <EyeOff aria-hidden="true" className="size-4" />
                        Hide
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-body-sm text-ink">
                      {detail.secretHint}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowSecret(true)}
                    >
                      <Eye aria-hidden="true" className="size-4" />
                      Show secret
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="font-mono text-body-sm text-ink">
                {detail.secretHint}
              </p>
            )}

            {editable && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmRotate(true)}
                >
                  <RefreshCw aria-hidden="true" className="size-4" />
                  Replace secret
                </Button>
                <span className="text-body-sm text-body">
                  The old one stops working immediately.
                </span>
              </div>
            )}
          </CardBody>
        </Card>

        {catalogue && <SignatureDoc catalogue={catalogue} />}
      </PageBody>

      <ConfirmDialog
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        onConfirm={() => void rotate()}
        loading={rotating}
        tone="danger"
        title="Replace the signing secret?"
        confirmLabel="Replace it"
        body={
          detail.health.pending > 0
            ? `Every request from now on is signed with the new secret, so update your server first. ${detail.health.pending} deliveries are already queued with the old one and your server will reject them.`
            : "Every request from now on is signed with the new secret. Any server still checking against the old one will reject them."
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void destroy()}
        loading={deleting}
        tone="danger"
        title="Delete this endpoint?"
        confirmLabel="Delete it"
        body="The URL and its delivery log go with it. Nothing about your payroll or your people is affected — a webhook is only a line of configuration."
      />

      <Modal
        open={editingEvents !== null}
        onClose={() => setEditingEvents(null)}
        title="Change events"
        description="Which things should we tell this endpoint about?"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingEvents(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              loading={savingEvents}
              disabled={(editingEvents ?? []).length === 0}
              onClick={() => void saveEvents(editingEvents ?? [])}
            >
              Save events
            </Button>
          </>
        }
      >
        <EventPicker
          catalogue={catalogue}
          chosen={editingEvents ?? []}
          onToggle={(name) =>
            setEditingEvents((current) => {
              const chosen = current ?? [];
              return chosen.includes(name)
                ? chosen.filter((item) => item !== name)
                : [...chosen, name];
            })
          }
        />
      </Modal>
    </>
  );
}
