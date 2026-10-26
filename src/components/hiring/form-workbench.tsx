"use client";

import { useState } from "react";
import { Eye, Pencil, Save } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  SegmentedControl,
  Skeleton,
  useToast,
} from "@/components/ui";
import { FormBuilder } from "@/components/hiring/form-builder";
import { FormPreview } from "@/components/hiring/form-preview";
import { LoadFailure } from "@/components/portal/load-failure";
import { sameDefinition } from "@/lib/hiring/form-wire";
import {
  validateDefinition,
  type FormDefinition,
} from "@/lib/marketing/apply-form";
import { usePostingForm } from "@/lib/store/careers-form";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";

/**
 * An advert's application form: edit it, see it, save it.
 *
 * ## Explicit save, and a guard on the way out
 *
 * Nothing is written while somebody is typing. The form is a public statement
 * that applicants are answering right now, and a half-typed question is not
 * something to publish on a keystroke. So there is a Save button, an "Unsaved
 * changes" note beside it, a Discard, and a guard on leaving the page
 * (`useUnsavedGuard`). This is how the company profile, the roles editor and the
 * performance weights already behave.
 *
 * ## The preview is not a picture of the form
 *
 * It is the applicant's own form component, given the draft as it stands this
 * moment — see `form-preview.tsx`. Side by side on a wide screen; on a phone, a
 * switch between Edit and Preview, because two columns at 375px is neither.
 *
 * ## A live form can be edited
 *
 * The API allows it and makes it safe: an answer keeps the question as it was
 * asked, a question that has been answered is archived rather than deleted when it
 * comes off the form, and its kind is fixed. The screen says all three, once, at
 * the top, when there are applications to protect.
 */
export function FormWorkbench({
  postingId,
  roleTitle,
  company,
  live,
}: {
  postingId: string;
  roleTitle: string;
  company: string;
  /** Whether the advert is published, for the wording about applications taken. */
  live: boolean;
}) {
  const form = usePostingForm(postingId);
  const toast = useToast();
  const [draft, setDraft] = useState<FormDefinition | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverProblems, setServerProblems] = useState<{
    questions: Record<string, string>;
    form: string | null;
  }>({ questions: {}, form: null });
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [discarding, setDiscarding] = useState(false);

  const saved = form.definition;
  const effective = draft ?? saved;
  const dirty =
    draft !== null && saved !== null && !sameDefinition(draft, saved);
  useUnsavedGuard(dirty);

  if (form.error && !saved) {
    return (
      <LoadFailure
        subject="this form"
        error={form.error}
        onRetry={form.reload}
      />
    );
  }

  if (!effective || !saved) {
    return (
      <Card>
        <CardBody>
          <Skeleton className="h-48 w-full" />
          <span className="sr-only-focusable">Loading the form</span>
        </CardBody>
      </Card>
    );
  }

  const checked = validateDefinition(effective);
  const problems = {
    questions: showProblems
      ? { ...checked.questions, ...serverProblems.questions }
      : serverProblems.questions,
    form: showProblems
      ? (checked.form ?? serverProblems.form)
      : serverProblems.form,
  };
  const problemCount =
    Object.keys(checked.questions).length + (checked.form ? 1 : 0);

  const edit = (next: FormDefinition) => {
    setDraft(next);
    setServerProblems({ questions: {}, form: null });
  };

  async function save() {
    if (!draft) return;
    if (problemCount > 0) {
      setShowProblems(true);
      toast.push({
        title: "Not saved yet",
        tone: "warning",
        detail:
          problemCount === 1
            ? "One question needs fixing first."
            : `${problemCount} things need fixing first.`,
      });
      return;
    }
    setSaving(true);
    const result = await form.save(draft);
    setSaving(false);
    if (result.ok) {
      setDraft(null);
      setShowProblems(false);
      setServerProblems({ questions: {}, form: null });
      toast.push({
        title:
          DEMO_ENABLED && form.local
            ? "Form saved in this browser"
            : "Form saved",
        tone: "success",
        detail:
          DEMO_ENABLED && form.local
            ? "Demo mode keeps it here. Nothing was published."
            : "Applicants see it from now on.",
      });
    } else {
      setServerProblems(result.problems);
      setShowProblems(true);
      toast.push({
        title: "Not saved",
        tone: "danger",
        detail: result.message,
      });
    }
  }

  const answeredAny = form.applications > 0;

  return (
    <Card>
      <CardHeader
        title="Application form"
        description="What an applicant is asked, and how it reads to them."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <Badge tone="warning" size="sm" dot>
                Unsaved changes
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => setDiscarding(true)}
            >
              Discard
            </Button>
            <Button
              variant="accent"
              size="sm"
              loading={saving}
              disabled={!dirty}
              onClick={() => void save()}
            >
              {!saving && <Save aria-hidden="true" className="size-3.5" />}
              Save form
            </Button>
          </div>
        }
      />
      <CardBody className="flex flex-col gap-5">
        {DEMO_ENABLED && form.local && (
          <Callout tone="warning" title="Demo data, this browser only">
            Your changes are kept on this device and are not published anywhere.
          </Callout>
        )}

        {answeredAny && (
          <Callout
            tone="info"
            title={
              live ? "This advert is live" : "This advert has applications"
            }
          >
            {form.applications === 1
              ? "One person has applied."
              : `${form.applications} people have applied.`}{" "}
            Changes apply to the next applicant. Answers already given keep the
            question as it was asked. A question somebody answered cannot change
            its kind, and taking it off the form keeps their answers.
          </Callout>
        )}

        {dirty && (
          <Callout tone="info" title="Unsaved changes">
            Nothing is published until you save.
          </Callout>
        )}

        <div className="lg:hidden">
          <SegmentedControl
            label="Show the editor or the preview"
            options={[
              { value: "edit", label: "Edit" },
              { value: "preview", label: "Preview" },
            ]}
            value={pane}
            onChange={setPane}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className={pane === "preview" ? "hidden lg:block" : undefined}>
            <h3 className="mb-3 hidden items-center gap-2 text-body-sm font-semibold text-muted lg:flex">
              <Pencil aria-hidden="true" className="size-3.5" />
              Editor
            </h3>
            <FormBuilder
              value={effective}
              onChange={edit}
              problems={problems.questions}
              formProblem={problems.form}
              filesAvailable={form.filesAvailable}
            />
          </div>
          <div
            className={
              pane === "edit"
                ? "hidden lg:sticky lg:top-20 lg:block"
                : "lg:sticky lg:top-20"
            }
          >
            <h3 className="mb-3 hidden items-center gap-2 text-body-sm font-semibold text-muted lg:flex">
              <Eye aria-hidden="true" className="size-3.5" />
              What an applicant sees
            </h3>
            <FormPreview
              definition={effective}
              company={company}
              roleTitle={roleTitle}
              filesAvailable={form.filesAvailable}
            />
          </div>
        </div>
      </CardBody>

      <ConfirmDialog
        open={discarding}
        onClose={() => setDiscarding(false)}
        title="Throw away your changes?"
        confirmLabel="Discard changes"
        tone="danger"
        body="The form goes back to how it was when you last saved it."
        onConfirm={() => {
          setDraft(null);
          setShowProblems(false);
          setServerProblems({ questions: {}, form: null });
          setDiscarding(false);
        }}
      />
    </Card>
  );
}
