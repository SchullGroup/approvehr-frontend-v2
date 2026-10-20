"use client";

import { useRef, useState } from "react";
import {
  Button,
  Callout,
  Field,
  Input,
  Modal,
  Select,
  Switch,
  TextLink,
  Textarea,
} from "@/components/ui";
import { EmailPreviewPane } from "@/components/hiring/email-preview";
import { ApiError } from "@/lib/api/client";
import type {
  EmailCatalog,
  EmailDraft,
  EmailKind,
  EmailTemplate,
  FieldProblem,
} from "@/lib/hiring/comms/model";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import { usePipelineGateway } from "@/lib/hiring/pipeline/use-pipeline";
import { useDebounced } from "@/lib/use-debounced";
import { useLoaded } from "@/lib/use-loaded";

/**
 * Writing, or changing, an email to candidates.
 *
 * ## What a person can put in it
 *
 * Words, and a handful of fields in curly braces that are filled in for each person:
 * `{candidate_first_name}`, `{job_title}` and a few more. The buttons under the text
 * insert them where the cursor is, and only the ones that exist at the moment this
 * kind of email is sent are offered: an acknowledgement has no interview time.
 *
 * ## It is checked as it is typed, by whoever will check it when it is saved
 *
 * A preview is asked for a moment after the typing stops. It is the API's own
 * answer (offline, the same rules written down), so a field that is not allowed is
 * marked under the box it is in, in the API's words, before Save is pressed. Save
 * still sends it, and a refusal there is put under the same box.
 *
 * ## Who it is from is not typed here
 *
 * It goes in the company's registered name and replies go to the careers reply-to
 * address. Both are shown, and neither can be edited from this dialog, because
 * "from" is the one line in an email a stranger uses to decide whether to trust it.
 */

const DEBOUNCE_MS = 400;

type Target = "subject" | "body";

export function EmailTemplateEditor({
  open,
  onClose,
  template,
  kind,
  catalog,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  /** The template being changed, or `null` for a new one. */
  template: EmailTemplate | null;
  /** The kind a new template starts as. */
  kind: EmailKind;
  catalog: EmailCatalog;
  /** Rejects with the API's refusal. */
  onSave: (draft: EmailDraft, existing: EmailTemplate | null) => Promise<void>;
}) {
  const gateway = usePipelineGateway();
  const [name, setName] = useState("");
  const [chosenKind, setChosenKind] = useState<EmailKind>(kind);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<Target>("body");

  const info = catalog.kinds.find((entry) => entry.kind === chosenKind);

  /* Each time it opens it starts from the template, or from the built-in wording
     for the kind. Derived while rendering rather than in an effect, so there is no
     frame showing the last template's words. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const start = catalog.kinds.find((entry) => entry.kind === kind);
      setName(template?.name ?? "");
      setChosenKind(template?.kind ?? kind);
      setSubject(template?.subject ?? start?.builtIn.subject ?? "");
      setBody(template?.body ?? start?.builtIn.body ?? "");
      setIsDefault(template?.isDefault ?? false);
      setRefused(null);
      setProblems([]);
      setTouched({});
      setTried(false);
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- preview */

  const typed = JSON.stringify([
    chosenKind,
    subject,
    body,
    template?.id ?? null,
  ]);
  const settled = useDebounced(typed, DEBOUNCE_MS);
  const stale = settled !== typed;
  const preview = useLoaded(`email-preview:${settled}`, open, (signal) => {
    const [k, s, b, id] = JSON.parse(settled) as [
      EmailKind,
      string,
      string,
      string | null,
    ];
    return gateway.emails.preview(
      id
        ? { templateId: id, subject: s, body: b }
        : { kind: k, subject: s, body: b },
      signal,
    );
  });

  /* What the preview found wrong, only while it is about the text on screen. */
  const live: FieldProblem[] =
    !stale && preview.data && !preview.data.valid ? preview.data.errors : [];

  const nameProblem =
    name.trim().length < 2
      ? "Give the template a name."
      : name.trim().length > 80
        ? "Keep the name to 80 characters."
        : null;

  const shown = (field: Target): string | undefined => {
    const refusal = problems.find((problem) => problem.field === field);
    if (refusal) return refusal.message;
    if (!tried && !touched[field]) return undefined;
    return live.find((problem) => problem.field === field)?.message;
  };

  /* ----------------------------------------------------------------- fields */

  function insert(field: string) {
    const token = `{${field}}`;
    const target = lastFocus.current;
    const element = target === "subject" ? subjectRef.current : bodyRef.current;
    const value = target === "subject" ? subject : body;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? start;
    const next = value.slice(0, start) + token + value.slice(end);
    if (target === "subject") setSubject(next);
    else setBody(next);
    setProblems((now) => now.filter((p) => p.field !== target));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  /* ------------------------------------------------------------------- save */

  async function save() {
    setTried(true);
    setRefused(null);
    setProblems([]);
    if (nameProblem) return;
    if (!stale && live.length > 0) return;
    setSaving(true);
    try {
      await onSave(
        {
          kind: chosenKind,
          name: name.trim(),
          subject: subject.trim(),
          body: body.trim(),
          isDefault,
        },
        template,
      );
    } catch (error) {
      /* A refusal that names a box goes under that box; anything else is said once. */
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        setProblems(
          error.fieldErrors.flatMap((detail) =>
            detail.field === "subject" ||
            detail.field === "body" ||
            detail.field === "name"
              ? [{ field: detail.field, message: detail.message }]
              : [],
          ),
        );
        if (
          error.fieldErrors.some(
            (detail) =>
              detail.field !== "subject" &&
              detail.field !== "body" &&
              detail.field !== "name",
          )
        )
          setRefused(sentenceOf(error));
      } else {
        setRefused(sentenceOf(error));
      }
    } finally {
      setSaving(false);
    }
  }

  const nameError =
    problems.find((problem) => problem.field === "name")?.message ??
    (tried && nameProblem ? nameProblem : undefined);

  const sender = catalog.sender;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={template ? `Edit ${template.name}` : "New email"}
      description="The words are yours. The sender is always your company's registered name."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="accent" loading={saving} onClick={() => void save()}>
            Save email
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Field
            label="Name"
            required
            help="Only your team sees this. It is how you pick the email on a stage."
            {...(nameError ? { error: nameError } : {})}
          >
            <Input
              value={name}
              maxLength={80}
              placeholder="Interview invitation"
              onChange={(event) => {
                setName(event.target.value);
                setProblems((now) => now.filter((p) => p.field !== "name"));
              }}
            />
          </Field>

          {template ? (
            <p className="text-body-sm text-muted">
              Kind: <span className="text-ink">{template.kindLabel}</span>. It
              cannot be changed, because what it may use depends on it.
            </p>
          ) : (
            <Field label="Kind of email" required>
              <Select
                value={chosenKind}
                onChange={(event) => {
                  const next = event.target.value as EmailKind;
                  /* A body left as the last kind's built-in wording follows the
                     kind; one the person has changed is theirs and stays. */
                  const from = catalog.kinds.find((e) => e.kind === chosenKind);
                  const to = catalog.kinds.find((e) => e.kind === next);
                  if (from && to) {
                    if (subject === from.builtIn.subject)
                      setSubject(to.builtIn.subject);
                    if (body === from.builtIn.body) setBody(to.builtIn.body);
                  }
                  setChosenKind(next);
                }}
              >
                {catalog.kinds.map((entry) => (
                  <option key={entry.kind} value={entry.kind}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {info && <p className="-mt-2 text-meta text-muted">{info.when}</p>}

          <Field label="Subject" required {...errorProp(shown("subject"))}>
            <Input
              ref={subjectRef}
              value={subject}
              onFocus={() => {
                lastFocus.current = "subject";
              }}
              onChange={(event) => {
                setSubject(event.target.value);
                setTouched((now) => ({ ...now, subject: true }));
                setProblems((now) => now.filter((p) => p.field !== "subject"));
              }}
            />
          </Field>

          <Field label="Message" required {...errorProp(shown("body"))}>
            <Textarea
              ref={bodyRef}
              rows={10}
              value={body}
              onFocus={() => {
                lastFocus.current = "body";
              }}
              onChange={(event) => {
                setBody(event.target.value);
                setTouched((now) => ({ ...now, body: true }));
                setProblems((now) => now.filter((p) => p.field !== "body"));
              }}
            />
          </Field>

          {info && (
            <div className="flex flex-col gap-2">
              <p className="text-meta text-muted">
                Insert a detail that is filled in for each person:
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {info.fields.map((field) => {
                  const label =
                    catalog.fields.find((f) => f.name === field)?.label ??
                    field;
                  return (
                    <li key={field}>
                      <Button
                        variant="secondary"
                        size="sm"
                        title={label}
                        aria-label={`Insert ${label}`}
                        onClick={() => insert(field)}
                      >
                        {`{${field}}`}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <Switch
            label={`Use this for ${info ? info.label.toLowerCase() : "this kind of"} emails`}
            description="Sent whenever an email of this kind goes out and no other one is named."
            checked={isDefault}
            onChange={(event) => setIsDefault(event.target.checked)}
          />

          {refused && (
            <Callout tone="danger" title="The server did not accept this">
              {refused}
            </Callout>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-line p-3 text-body-sm">
            <p className="font-medium text-ink">Who it is from</p>
            {sender ? (
              <>
                <p className="mt-1 text-body">
                  Sent as <span className="text-ink">{sender.name}</span>.
                  {sender.replyTo
                    ? ` Replies go to ${sender.replyTo}.`
                    : " There is no reply-to address yet."}
                </p>
                {!sender.replyTo && (
                  <p className="mt-1 text-warning-text">
                    Without one, nothing is sent: an email whose replies go
                    nowhere is not sent.{" "}
                    <TextLink href="/hiring/postings/settings">
                      Add it in Careers settings
                    </TextLink>
                    .
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-muted">
                The sender is your company&apos;s registered name.
              </p>
            )}
          </div>

          <EmailPreviewPane
            preview={preview.data}
            loading={stale || preview.loading}
          />
        </div>
      </div>
    </Modal>
  );
}

/** `error` is only passed when there is one: an empty one would still mark the field. */
const errorProp = (message: string | undefined): { error?: string } =>
  message ? { error: message } : {};
