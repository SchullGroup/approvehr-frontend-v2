"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  Input,
  Modal,
  SearchPicker,
  useToast,
  type PickerOption,
} from "@/components/ui";
import { QUERY_LIMITS } from "@/lib/api/queries";
import { useCan } from "@/lib/permissions";
import { useEmployeeSearch } from "@/lib/store/employees-api";
import { useQueriesSwitch, useQueryActions } from "@/lib/store/queries";
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
  const queries = useQueriesSwitch();
  const { isConnected } = useSession();
  const [open, setOpen] = useState(false);

  if (!canIssue || !queries.on || !isConnected) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>Issue a query</Button>
      <StartQueryDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function StartQueryDialog(props: {
  open: boolean;
  onClose: () => void;
}) {
  const session = useOpenSession(props.open);
  return <StartQueryForm key={session} {...props} />;
}

function StartQueryForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const actions = useQueryActions();
  const { employeeId } = useSession();
  const search = useEmployeeSearch({ excludeId: employeeId });

  const [person, setPerson] = useState<PickerOption | null>(null);
  const [subjectLine, setSubjectLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const ready =
    person !== null &&
    subjectLine.trim().length >= 3 &&
    subjectLine.trim().length <= QUERY_LIMITS.subjectLine.max;

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
      const draft = await actions.create({
        subjectId: person.value,
        subjectLine: subjectLine.trim(),
      });
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
      title="Issue a query"
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
          This starts a draft. Only people who work queries can read it, and
          nobody is told anything until you issue it.
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
        <Field
          label="Subject line"
          required
          help="A short title, printed on the letter. It is never shown in a notification or an email."
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
