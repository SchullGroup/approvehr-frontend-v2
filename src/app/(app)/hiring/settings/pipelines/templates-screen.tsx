"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { TemplateEditor } from "@/components/hiring/template-editor";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import type { PipelineTemplate } from "@/lib/hiring/pipeline/model";
import {
  STAGE_TYPE_LABEL,
  STAGE_TYPE_TONE,
} from "@/lib/hiring/pipeline/stage-types";
import {
  usePipelineGateway,
  useTemplates,
} from "@/lib/hiring/pipeline/use-pipeline";
import { HiringSettingsShell } from "../settings-shell";

/**
 * The company's pipeline templates.
 *
 * Each is an ordered list of typed stages. A role copies one when it is created —
 * the default unless somebody picks another — and from then on the role's stages
 * are its own. The page says so in a sentence at the top, because the question
 * everybody has is "if I change this, what happens to the roles I already have".
 */

export function TemplatesScreen() {
  const gateway = usePipelineGateway();
  const templates = useTemplates();
  const toast = useToast();
  const [editing, setEditing] = useState<PipelineTemplate | "new" | null>(null);
  const [removing, setRemoving] = useState<PipelineTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(
    what: () => Promise<unknown>,
    done: string,
  ): Promise<boolean> {
    setBusy(true);
    try {
      await what();
      templates.reload();
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

  return (
    <HiringSettingsShell
      active="/hiring/settings/pipelines"
      title="Pipeline templates"
      description="A template is the list of stages a new role starts with. Roles copy it when they are created, so changing a template later does not change roles that are already open."
      action={
        <Button variant="accent" size="sm" onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" className="size-3.5" />
          New template
        </Button>
      }
    >
      {templates.loading ? (
        <>
          <Skeleton className="h-28 w-full" />
          <span className="sr-only-focusable">Loading the templates</span>
        </>
      ) : templates.error ? (
        <LoadFailure
          subject="the templates"
          error={templates.error}
          onRetry={templates.reload}
        />
      ) : templates.items.length === 0 ? (
        <Card>
          <EmptyState
            title="No templates yet"
            description="Make one and new roles will start from it."
            action={
              <Button
                variant="accent"
                size="sm"
                onClick={() => setEditing("new")}
              >
                New template
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {templates.items.map((template) => (
            <li key={template.id}>
              <Card>
                <CardBody className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-ink">
                        {template.name}
                        {template.isDefault && (
                          <Badge tone="accent" size="sm" icon={<Star />}>
                            Default for new roles
                          </Badge>
                        )}
                      </h3>
                      <p className="mt-0.5 text-meta text-muted">
                        {template.stages.length}{" "}
                        {template.stages.length === 1 ? "stage" : "stages"}
                        {template.usedBy !== undefined
                          ? ` · used by ${String(template.usedBy)} ${template.usedBy === 1 ? "role" : "roles"}`
                          : ""}
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
                              () => gateway.templates.makeDefault(template.id),
                              `${template.name} is the default now`,
                            )
                          }
                        >
                          Make default
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => setEditing(template)}
                      >
                        <Pencil aria-hidden="true" className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () => gateway.templates.duplicate(template.id),
                            `${template.name} duplicated`,
                          )
                        }
                      >
                        <Copy aria-hidden="true" className="size-3.5" />
                        Duplicate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setRemoving(template)}
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  <ol
                    aria-label={`Stages in ${template.name}`}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {template.stages.map((stage, index) => (
                      <li key={stage.id} className="flex items-center gap-1.5">
                        {index > 0 && (
                          <span aria-hidden="true" className="text-faint">
                            →
                          </span>
                        )}
                        <Badge
                          tone={STAGE_TYPE_TONE[stage.type]}
                          size="sm"
                          title={STAGE_TYPE_LABEL[stage.type]}
                        >
                          {stage.name}
                        </Badge>
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Callout tone="info" title="Roles you already have">
        Roles keep their own stages. To give an open role a stage from a
        template, change it on the role itself.
      </Callout>

      <TemplateEditor
        open={editing !== null}
        onClose={() => setEditing(null)}
        template={editing === "new" || editing === null ? null : editing}
        onSave={async (draft) => {
          const saved = await gateway.templates.save(draft);
          templates.reload();
          setEditing(null);
          toast.push({
            title: `${saved.name} saved`,
            tone: "success",
            detail: "Roles made from now on start from it.",
          });
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Delete ${removing.name}?` : "Delete template?"}
        body="Roles already made from it are not changed. Nobody loses a stage or a candidate."
        confirmLabel="Delete template"
        loading={busy}
        onConfirm={() => {
          if (!removing) return;
          void act(
            () => gateway.templates.remove(removing.id),
            `${removing.name} deleted`,
          ).then((ok) => {
            if (ok) setRemoving(null);
          });
        }}
      />
    </HiringSettingsShell>
  );
}
