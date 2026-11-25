"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  Input,
  Modal,
  SearchPicker,
  Select,
  useToast,
  type PickerOption,
} from "@/components/ui";
import { QUERY_LIMITS } from "@/lib/api/queries";
import { useCan } from "@/lib/permissions";
import { useEmployeeSearch } from "@/lib/store/employees-api";
import {
  useQueriesSwitch,
  useQueryActions,
  useQueryTemplates,
} from "@/lib/store/queries";
import { useSession } from "@/lib/store/session";
import { actionMessage } from "@/lib/use-action";
import { useOpenSession } from "@/lib/use-open-session";

/**
 * Start a letter.
 *
 * ## Why this is two fields and not the whole letter
 *
 * A query is written over more than one sitting (what happened, the rules relied on, the files,
 * how it will be served), and the same fields are edited again on the draft's own page. Two copies
 * of that form, one here and one there, is how they come to disagree about a limit. So this makes
 * the draft (a person and a subject line, the only two things the API needs to start one) and the
 * draft's page is the one place the letter is written. Nothing is sent to anybody: a draft is
 * readable only by people who work queries, and nobody is told until it is issued.
 *
 * A person is found by typing, from the lookup rows, so it works for somebody who holds only
 * `ISSUE_QUERIES` (the full rows go to `EDIT_RECORDS` alone). **Yourself is left out**: a query
 * about the person writing it is not one they work.
 */
export function StartQueryButton() {
  const canIssue = useCan("ISSUE_QUERIES");
  const canDraft = useCan("DRAFT_QUERIES");
  const queries = useQueriesSwitch();
  const { isConnected } = useSession();
  const [open, setOpen] = useState(false);

  /* A line manager drafts and does not issue: the same dialog, said as what it is for them. */
  const drafting = !canIssue && canDraft;
  if ((!canIssue && !canDraft) || !queries.on || !isConnected) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        {drafting ? "Draft a query" : "Issue a query"}
      </Button>
      <StartQueryDialog
        open={open}
        drafting={drafting}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function StartQueryDialog(props: {
  open: boolean;
  /** A line manager drafting: HR reviews and issues what they write. */
  drafting?: boolean;
  onClose: () => void;
}) {
  const session = useOpenSession(props.open);
  return <StartQueryForm key={session} {...props} />;
}

function StartQueryForm({
  open,
  drafting = false,
  onClose,
}: {
  open: boolean;
  drafting?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const actions = useQueryActions();
  const { employeeId } = useSession();
  const search = useEmployeeSearch({ excludeId: employeeId });

  const [person, setPerson] = useState<PickerOption | null>(null);
  const [subjectLine, setSubjectLine] = useState("");
  /* A template's id, or "" for a blank draft. */
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /* With a template the subject line is optional: the template's own is used, and what is typed
     here wins over it. */
  const subjectOk =
    subjectLine.trim().length <= QUERY_LIMITS.subjectLine.max &&
    (templateId !== "" || subjectLine.trim().length >= 3) &&
    (subjectLine.trim() === "" || subjectLine.trim().length >= 3);
  const ready = person !== null && subjectOk;

  /* Not while the request is out: closing would leave the draft made and nothing on screen to
     say where it is. */
  function close() {
    if (!busy) onClose();
  }

  async function start() {
    if (!person) return;
    setBusy(true);
    setProblem(null);
    try {
      const typed = subjectLine.trim();
      const draft = await actions.create(
        templateId !== ""
          ? {
              subjectId: person.value,
              templateId,
              ...(typed !== "" ? { subjectLine: typed } : {}),
            }
          : { subjectId: person.value, subjectLine: typed },
      );
      /* The toast says an act was done and never what the letter is about. */
      toast.push({ tone: "success", title: "Draft started" });
      onClose();
      router.push(`/people/queries/${draft.id}`);
    } catch (error) {
      setProblem(actionMessage(error, "the draft"));
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={drafting ? "Draft a query" : "Issue a query"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void start()} disabled={!ready} loading={busy}>
            Start the letter
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-body">
          {drafting
            ? "This starts a draft about somebody who reports to you. You write the letter and HR reviews and issues it. Nobody is told anything until then."
            : "This starts a draft. Only people who work queries can read it, and nobody is told anything until you issue it."}
        </p>
        <Field label="Who is it for" required>
          <SearchPicker
            selected={person}
            onSelect={setPerson}
            onQueryChange={search.search}
            options={search.options}
            pending={search.pending}
            failed={search.failed}
            onRetry={search.retry}
            more={search.more}
            placeholder="Search for somebody"
            aria-label="Who is it for"
          />
        </Field>
        <TemplatePicker value={templateId} onChange={setTemplateId} />
        <Field
          label="Subject line"
          required={templateId === ""}
          optional={templateId !== ""}
          help={
            templateId !== ""
              ? "Leave it blank to use the template's own. What you type here is used instead. It is never shown in a notification or an email."
              : "A short title, printed on the letter. It is never shown in a notification or an email."
          }
        >
          <Input
            value={subjectLine}
            onChange={(event) => setSubjectLine(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && ready && !busy) {
                event.preventDefault();
                void start();
              }
            }}
          />
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

/**
 * "Start from a template", from the company's own list.
 *
 * Its own component, rendered inside the dialog, so the list is read when the dialog is open and
 * not each time the register is. **There is no wording of ours here**: the options are the names a
 * company wrote, and the sentence beside them is the server's (counsel should read whatever a
 * company adopts). A company with no templates sees no picker at all, never an empty one.
 */
function TemplatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const templates = useQueryTemplates(false);
  const rows = templates.data?.rows ?? [];
  if (rows.length === 0) return null;
  return (
    <Field
      label="Start from a template"
      optional
      help={
        templates.data?.note ??
        "These are your company's own words. Have counsel read them before they are used."
      }
    >
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">A blank draft</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
