"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadState,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  TEMPLATE_LIMITS,
  type ApiQueryTemplate,
  type MergeField,
  type TemplateBody,
} from "@/lib/api/query-ties";
import { counter } from "@/lib/queries/draft";
import { useQueryActions, useQueryTemplates } from "@/lib/store/queries";
import { actionMessage } from "@/lib/use-action";
import { useOpenSession } from "@/lib/use-open-session";

/**
 * The company's own letter templates.
 *
 * ## There is no wording of ours
 *
 * Nothing here is pre-written and nothing is offered as an example: counsel has not read any letter
 * wording, so the list starts empty and the only starter is a blank draft. A company writes its
 * own, and the line the server sends beside the list says whose words they are and that counsel
 * should read them before they are used with real staff.
 *
 * ## What a template is
 *
 * A subject line and, if the company wishes, what happened, the rules relied on and the question.
 * `{{employee_name}}` and the other merge fields (the server's list, shown as it came) are filled
 * from the person **when a draft is started**, and the draft is then ordinary text the issuer
 * edits: changing a template changes no draft that already exists. A template is archived and
 * never deleted, and an archived name is free again.
 *
 * Typed text is shown as text. The list shows names and subject lines only; the wording is read in
 * the dialog that edits it.
 */
export function TemplatesCard({ editable }: { editable: boolean }) {
  const [showArchived, setShowArchived] = useState(false);
  const templates = useQueryTemplates(showArchived);
  const toast = useToast();
  const actions = useQueryActions();
  const [editing, setEditing] = useState<ApiQueryTemplate | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function toggle(row: ApiQueryTemplate) {
    setBusyId(row.id);
    setProblem(null);
    try {
      if (row.archived) await actions.restoreTemplate(row.id);
      else await actions.archiveTemplate(row.id);
      toast.push({
        tone: "info",
        title: row.archived ? "Template restored" : "Template archived",
        ...(row.archived
          ? {}
          : {
              detail:
                "Drafts already started from it are unchanged. Nothing was deleted.",
            }),
      });
      templates.reload();
    } catch (error) {
      /* The server's own sentence, including its refusal to restore a name that is now taken. */
      setProblem(actionMessage(error, "that template"));
    } finally {
      setBusyId(null);
    }
  }

  const rows = templates.data?.rows ?? [];
  const mergeFields = templates.data?.mergeFields ?? [];

  return (
    <>
      <Card>
        <CardHeader
          title="Letter templates"
          level={2}
          description="Your company's own starting points for a letter. Start a draft from one and the person's name and number are filled in; the issuer then edits it like any draft."
          action={
            editable ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditing("new")}
              >
                <Plus aria-hidden="true" className="size-3.5" />
                Add a template
              </Button>
            ) : undefined
          }
        />
        <CardBody className="flex flex-col gap-4">
          <p className="text-body-sm text-body">
            {templates.data?.note ??
              "These are your company's own words. Have counsel read them before they are used."}
          </p>

          <LoadState
            loading={templates.loading}
            error={templates.error}
            subject="the templates"
            onRetry={templates.reload}
            hasData={templates.data !== null}
            skeleton="list"
          >
            {rows.length === 0 ? (
              <EmptyState
                plain
                title="No templates yet"
                description="Nothing is pre-written. Without a template a draft starts blank, which is how it works now."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="break-words text-body-sm font-medium text-ink">
                          {row.name}
                        </span>
                        {row.archived && (
                          <Badge tone="neutral" size="sm">
                            Archived
                          </Badge>
                        )}
                      </p>
                      <p className="break-words text-meta text-muted">
                        {row.subjectLine}
                      </p>
                    </div>
                    {editable && (
                      <div className="flex gap-2">
                        {!row.archived && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(row)}
                          >
                            Edit
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void toggle(row)}
                          loading={busyId === row.id}
                        >
                          {row.archived ? "Restore" : "Archive"}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </LoadState>

          {editable && (
            <Checkbox
              label="Show archived"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
          )}
          {problem && (
            <p role="alert" className="text-body-sm text-danger-text">
              {problem}
            </p>
          )}
          {!editable && (
            <p className="text-body-sm text-muted">
              Read-only: changing templates needs the Manage settings
              permission.
            </p>
          )}
        </CardBody>
      </Card>

      {editable && (
        <TemplateDialog
          open={editing !== null}
          template={editing === "new" ? null : editing}
          mergeFields={mergeFields}
          onClose={() => setEditing(null)}
          onSaved={templates.reload}
        />
      )}
    </>
  );
}

function TemplateDialog(props: {
  open: boolean;
  template: ApiQueryTemplate | null;
  mergeFields: MergeField[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const session = useOpenSession(props.open, props.template?.id ?? "new");
  return <TemplateForm key={session} {...props} />;
}

function TemplateForm({
  open,
  template,
  mergeFields,
  onClose,
  onSaved,
}: {
  open: boolean;
  template: ApiQueryTemplate | null;
  mergeFields: MergeField[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const [name, setName] = useState(template?.name ?? "");
  const [subjectLine, setSubjectLine] = useState(template?.subjectLine ?? "");
  const [whatHappened, setWhatHappened] = useState(
    template?.whatHappened ?? "",
  );
  const [rulesRelied, setRulesRelied] = useState(template?.rulesRelied ?? "");
  const [question, setQuestion] = useState(template?.question ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const L = TEMPLATE_LIMITS;
  const within = (value: string, min: number, max: number) =>
    value.trim().length >= min && value.trim().length <= max;
  const valid =
    within(name, L.name.min, L.name.max) &&
    within(subjectLine, L.subjectLine.min, L.subjectLine.max) &&
    whatHappened.trim().length <= L.whatHappened.max &&
    rulesRelied.trim().length <= L.rulesRelied.max &&
    question.trim().length <= L.question.max;

  async function save() {
    const body: TemplateBody = {
      name: name.trim(),
      subjectLine: subjectLine.trim(),
      whatHappened: whatHappened.trim(),
      rulesRelied: rulesRelied.trim() === "" ? null : rulesRelied.trim(),
      question: question.trim(),
    };
    setBusy(true);
    setProblem(null);
    try {
      if (template) await actions.updateTemplate(template.id, body);
      else await actions.createTemplate(body);
      toast.push({
        tone: "success",
        title: template ? "Template saved" : "Template added",
      });
      onSaved();
      onClose();
    } catch (error) {
      /* The server's own sentence: a name that is taken, or a {{field}} it does not know and the
         ones it does. */
      setProblem(actionMessage(error, "the template"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={template ? "Edit this template" : "Add a template"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!valid} loading={busy}>
            {template ? "Save the template" : "Add the template"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-body">
          Write it in your company&apos;s own words. Have counsel read it before
          it is used with real staff. A draft started from it is ordinary text
          that the issuer edits, and changing a template later changes no draft
          that already exists.
        </p>
        {mergeFields.length > 0 && (
          <p className="text-body-sm text-muted">
            Fields filled in from the person when a draft is started:{" "}
            {mergeFields
              .map((field) => `${field.token} (${field.label})`)
              .join(", ")}
            .
          </p>
        )}
        <Field
          label="Template name"
          required
          help="Only people choosing a template read this."
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Subject line" required>
          <Input
            value={subjectLine}
            onChange={(event) => setSubjectLine(event.target.value)}
          />
        </Field>
        <Field label="What happened" optional>
          <Textarea
            rows={5}
            value={whatHappened}
            onChange={(event) => setWhatHappened(event.target.value)}
          />
          <CounterLine value={whatHappened} max={L.whatHappened.max} />
        </Field>
        <Field label="Rules or policies relied on" optional>
          <Textarea
            rows={3}
            value={rulesRelied}
            onChange={(event) => setRulesRelied(event.target.value)}
          />
          <CounterLine value={rulesRelied} max={L.rulesRelied.max} />
        </Field>
        <Field label="The question" optional>
          <Textarea
            rows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <CounterLine value={question} max={L.question.max} />
        </Field>
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}

function CounterLine({ value, max }: { value: string; max: number }) {
  const text = counter(value, max);
  if (!text) return null;
  const over = value.trim().length > max;
  return (
    <span
      className={over ? "text-meta text-danger-text" : "text-meta text-muted"}
    >
      {text}
    </span>
  );
}
