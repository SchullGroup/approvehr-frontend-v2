"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Star } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Skeleton,
  Switch,
  TextLink,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { EmailTemplateEditor } from "@/components/hiring/email-template-editor";
import type {
  EmailDraft,
  EmailKind,
  EmailTemplate,
} from "@/lib/hiring/comms/model";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import {
  useEmailCatalog,
  useEmailReadiness,
} from "@/lib/hiring/pipeline/use-comms";
import { usePipelineGateway } from "@/lib/hiring/pipeline/use-pipeline";
import { HiringSettingsShell } from "../settings-shell";

/**
 * The company's emails to candidates.
 *
 * ## Nothing here sends anything
 *
 * This is the wording and the settings. An email goes only when a person asks: by
 * moving somebody into a stage that has one, by ticking "send a decline email" when
 * they reject, or by choosing to invite or to tell somebody about an offer. The page
 * says so at the top, because "will this email everybody" is the first question.
 *
 * ## Whose name it is
 *
 * The sender line is shown, not edited: it is the company's registered name, and the
 * reply-to address is set with the careers page. If either is missing the page says
 * what would stop an email going out, in the API's words.
 */

export function EmailsScreen() {
  const gateway = usePipelineGateway();
  const catalog = useEmailCatalog();
  const readiness = useEmailReadiness();
  const toast = useToast();
  const [editing, setEditing] = useState<{
    template: EmailTemplate | null;
    kind: EmailKind;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(
    what: () => Promise<unknown>,
    done: string,
  ): Promise<boolean> {
    setBusy(true);
    try {
      await what();
      catalog.reload();
      readiness.reload();
      toast.push({ title: done, tone: "success" });
      return true;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail: sentenceOf(error),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const state = readiness.data;
  const data = catalog.data;

  return (
    <HiringSettingsShell
      active="/hiring/settings/emails"
      title="Emails to candidates"
      description="The wording of what candidates are sent. Nothing here sends anything on its own: an email goes only when somebody on your team asks for it, and says so on the screen where they do."
      action={
        data && (
          <Button
            variant="accent"
            size="sm"
            onClick={() => setEditing({ template: null, kind: "STAGE_UPDATE" })}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            New email
          </Button>
        )
      }
    >
      {catalog.loading ? (
        <>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading the emails</span>
        </>
      ) : catalog.error || !data ? (
        <LoadFailure
          subject="email to candidates"
          error={catalog.error}
          onRetry={catalog.reload}
          missingMeans="module"
        />
      ) : (
        <>
          <Card>
            <CardBody className="flex flex-col gap-4">
              {state ? (
                <Switch
                  label="Send emails to candidates"
                  description="Your company's own switch. Off, an email somebody asks for is recorded as not sent."
                  checked={state.enabled}
                  disabled={busy}
                  onChange={(event) => {
                    const on = event.target.checked;
                    void act(
                      () => gateway.emails.setEnabled(on),
                      on
                        ? "Emails to candidates are on"
                        : "Emails to candidates are off",
                    );
                  }}
                />
              ) : (
                <Skeleton className="h-10 w-full" />
              )}

              <div className="border-t border-line pt-3 text-body-sm">
                {data.sender ? (
                  <p className="text-body">
                    Emails are sent as{" "}
                    <span className="font-medium text-ink">
                      {data.sender.name}
                    </span>
                    .{" "}
                    {data.sender.replyTo
                      ? `Replies go to ${data.sender.replyTo}.`
                      : "There is no reply-to address yet."}{" "}
                    <TextLink href="/hiring/postings/settings">
                      Change the reply-to address in Careers settings
                    </TextLink>
                    .
                  </p>
                ) : (
                  <p className="text-muted">
                    Emails are sent in your company&apos;s registered name.
                  </p>
                )}
                {state?.sender?.note && (
                  <p className="mt-1 text-meta text-muted">
                    {state.sender.note}
                  </p>
                )}
              </div>

              {state && state.blockedBy.length > 0 && (
                <Callout
                  tone="warning"
                  title="An email asked for now would not be sent"
                >
                  <ul className="flex list-disc flex-col gap-1 pl-5">
                    {state.blockedBy.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </Callout>
              )}
            </CardBody>
          </Card>

          {data.kinds.map((kind) => {
            const rows = data.templates.filter((t) => t.kind === kind.kind);
            const live = rows.filter((t) => !t.archived);
            const archived = rows.filter((t) => t.archived);
            const hasDefault = live.some((t) => t.isDefault);
            return (
              <Card key={kind.kind}>
                <CardHeader
                  title={kind.label}
                  description={kind.when}
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        setEditing({ template: null, kind: kind.kind })
                      }
                    >
                      <Plus aria-hidden="true" className="size-3.5" />
                      New
                    </Button>
                  }
                />
                <CardBody>
                  <ul className="flex flex-col gap-2">
                    {live.map((template) => (
                      <li
                        key={template.id}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line p-3"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                            {template.name}
                            {template.isDefault && (
                              <Badge tone="accent" size="sm" icon={<Star />}>
                                Used by default
                              </Badge>
                            )}
                          </p>
                          <p className="mt-0.5 truncate text-meta text-muted">
                            {template.subject}
                          </p>
                          <p className="mt-0.5 text-meta text-faint">
                            {template.usedByStages === 0
                              ? "No stage sends it"
                              : `Sent by ${String(template.usedByStages)} ${template.usedByStages === 1 ? "stage" : "stages"}`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {!template.isDefault && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void act(
                                  () =>
                                    gateway.emails.update(template.id, {
                                      isDefault: true,
                                    }),
                                  `${template.name} is the default for ${kind.label.toLowerCase()}`,
                                )
                              }
                            >
                              Use by default
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              setEditing({ template, kind: template.kind })
                            }
                          >
                            <Pencil aria-hidden="true" className="size-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void act(
                                () => gateway.emails.archive(template.id),
                                `${template.name} archived`,
                              )
                            }
                          >
                            <Archive aria-hidden="true" className="size-3.5" />
                            Archive
                          </Button>
                        </div>
                      </li>
                    ))}

                    {!hasDefault && (
                      <li className="rounded-md border border-dashed border-line-strong p-3">
                        <p className="text-body-sm font-medium text-ink">
                          Built-in wording
                        </p>
                        <p className="mt-0.5 text-meta text-muted">
                          Used when no email of this kind is the default:{" "}
                          {kind.builtIn.subject}
                        </p>
                      </li>
                    )}
                  </ul>

                  {archived.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-body-sm text-muted">
                        Archived ({archived.length})
                      </summary>
                      <ul className="mt-2 flex flex-col gap-2">
                        {archived.map((template) => (
                          <li
                            key={template.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
                          >
                            <span className="text-body-sm text-muted">
                              {template.name}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void act(
                                  () => gateway.emails.restore(template.id),
                                  `${template.name} restored`,
                                )
                              }
                            >
                              <ArchiveRestore
                                aria-hidden="true"
                                className="size-3.5"
                              />
                              Restore
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </CardBody>
              </Card>
            );
          })}

          <EmailTemplateEditor
            open={editing !== null}
            onClose={() => setEditing(null)}
            template={editing?.template ?? null}
            kind={editing?.kind ?? "STAGE_UPDATE"}
            catalog={data}
            onSave={async (draft: EmailDraft, existing) => {
              const saved = existing
                ? await gateway.emails.update(existing.id, {
                    name: draft.name,
                    subject: draft.subject,
                    body: draft.body,
                    isDefault: draft.isDefault,
                  })
                : await gateway.emails.create(draft);
              catalog.reload();
              setEditing(null);
              toast.push({ title: `${saved.name} saved`, tone: "success" });
            }}
          />
        </>
      )}
    </HiringSettingsShell>
  );
}
