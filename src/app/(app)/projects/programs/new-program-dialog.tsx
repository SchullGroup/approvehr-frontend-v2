"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  FieldRow,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { PersonPicker } from "@/components/projects/person";
import { ColorChoice } from "@/components/projects/program-parts";
import { LEVEL_LABEL, NEW_PROGRAM, PROGRAM } from "@/lib/projects/terms";
import { PROJECT_COLORS } from "@/lib/projects/types";
import { useDepartments } from "@/lib/store/departments";
import { useProgramActions } from "@/lib/store/programs";
import { usePeople, useProjectActor } from "@/lib/store/project-session";

type Seed = "none" | "READ" | "WRITE";

type Draft = {
  name: string;
  description: string;
  color: string;
  leadId: string;
  departmentId: string;
  seed: Seed;
};

const blank = (leadId: string): Draft => ({
  name: "",
  description: "",
  color: PROJECT_COLORS[0],
  leadId,
  departmentId: "",
  seed: "none",
});

/**
 * New program: a name, a colour, who leads it, and (if it is a department's) that
 * department and what to do about its people.
 *
 * The department link grants nothing by itself, and the form says so beside the
 * choice that does something: "Add this department's people as" nobody, Read, or
 * Read and write. Choosing a level adds everybody in the department once, at
 * that level; people who join the department later are not added. The creator
 * leads it unless somebody else is chosen.
 *
 * It stays mounted and starts blank every time it opens. A name somebody else
 * has (409) is shown on the name, not in a toast over the dialog.
 */
export function NewProgramDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const actions = useProgramActions();
  const people = usePeople();
  const actor = useProjectActor();
  const departments = useDepartments();
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const me = actor.employeeId ?? "";
  const [draft, setDraft] = useState<Draft>(() => blank(me));
  const [wasOpen, setWasOpen] = useState(open);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [leadError, setLeadError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(blank(me));
      setBusy(false);
      setNameError(undefined);
      setLeadError(undefined);
      setFailure(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const live = departments.flat.filter((d) => !d.archived);
  const department = live.find((d) => d.id === draft.departmentId);
  const inDepartment = department
    ? people.people.filter((p) =>
        p.departmentId
          ? p.departmentId === department.id
          : p.department === department.name,
      )
    : [];
  const others = inDepartment.filter(
    (p) => p.id !== (draft.leadId || actor.employeeId),
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = draft.name.trim();
    const nameProblem =
      name.length < 2 ? `Give the ${PROGRAM.one} a name.` : undefined;
    const leadProblem = !draft.leadId ? "Choose who will lead it." : undefined;
    setNameError(nameProblem);
    setLeadError(leadProblem);
    if (nameProblem || leadProblem) return;

    setBusy(true);
    setFailure(null);
    const created = await actions.createProgram(
      {
        name,
        description: draft.description,
        color: draft.color,
        leadId: draft.leadId,
        ...(department
          ? { departmentId: department.id, departmentName: department.name }
          : {}),
      },
      { quiet: true },
    );
    if (!created.ok) {
      setBusy(false);
      const error = created.error;
      const own =
        error instanceof ApiError
          ? (error.messageFor("name") ??
            (error.status === 409 ? created.message : undefined))
          : /already called/i.test(created.message)
            ? created.message
            : undefined;
      if (own) setNameError(own);
      else setFailure(created.message);
      return;
    }

    let note: string | null = null;
    if (department && draft.seed !== "none") {
      const seeded = await actions.addDepartment(
        { id: created.value.id, name },
        department,
        draft.seed,
        others.map((p) => p.id),
        { quiet: true },
      );
      if (!seeded.ok) {
        note = `${name} was created, but ${department.name} could not be added: ${seeded.message}`;
      }
    }
    setBusy(false);
    toast.push(
      note
        ? { tone: "warning", title: `${name} created`, detail: note }
        : { tone: "success", title: `${name} created` },
    );
    onClose();
    router.push(`/projects/programs/${created.value.id}`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={NEW_PROGRAM}
      description="A program holds the projects of a department or team. People you give access to see every project in it."
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            Create {PROGRAM.one}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        <Field
          label="Name"
          required
          {...(nameError ? { error: nameError } : {})}
        >
          <Input
            ref={nameRef}
            value={draft.name}
            maxLength={80}
            placeholder="Operations"
            autoComplete="off"
            onChange={(event) => {
              setDraft((d) => ({ ...d, name: event.target.value }));
              if (nameError) setNameError(undefined);
            }}
          />
        </Field>

        <Field label="Description" optional>
          <Textarea
            value={draft.description}
            rows={2}
            placeholder={`What is this ${PROGRAM.one} for?`}
            onChange={(event) =>
              setDraft((d) => ({ ...d, description: event.target.value }))
            }
          />
        </Field>

        <div className="space-y-1.5">
          <span
            id={`${formId}-colour`}
            className="text-body-sm font-medium text-ink"
          >
            Colour
          </span>
          <ColorChoice
            value={draft.color}
            labelledBy={`${formId}-colour`}
            onChange={(color) => setDraft((d) => ({ ...d, color }))}
          />
        </div>

        <Field
          label="Lead"
          required
          help={`The lead manages the ${PROGRAM.one}: who has access, its projects and its settings.`}
          {...(leadError ? { error: leadError } : {})}
        >
          <PersonPicker
            people={people}
            value={draft.leadId}
            placeholder="Choose a person"
            aria-label="Lead"
            onChange={(id) => {
              setDraft((d) => ({ ...d, leadId: id }));
              if (leadError) setLeadError(undefined);
            }}
          />
        </Field>

        {live.length > 0 && (
          <FieldRow>
            <Field label="Department" optional>
              <Select
                value={draft.departmentId}
                onChange={(event) =>
                  setDraft((d) => ({
                    ...d,
                    departmentId: event.target.value,
                    seed: event.target.value ? d.seed : "none",
                  }))
                }
              >
                <option value="">None</option>
                {live.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Add this department's people as">
              <Select
                value={draft.seed}
                disabled={!department}
                onChange={(event) =>
                  setDraft((d) => ({
                    ...d,
                    seed: event.target.value as Seed,
                  }))
                }
              >
                <option value="none">Nobody</option>
                <option value="READ">{LEVEL_LABEL.READ}</option>
                <option value="WRITE">{LEVEL_LABEL.WRITE}</option>
              </Select>
            </Field>
          </FieldRow>
        )}
        {department && (
          <p className="text-body-sm text-muted" role="status">
            {draft.seed === "none"
              ? `Linking ${department.name} gives nobody access by itself. You can add its people later from People & access.`
              : `${others.length} ${others.length === 1 ? "person" : "people"} in ${department.name} will be added now, once, with ${LEVEL_LABEL[draft.seed].toLowerCase()} access. People who join the department later are not added.`}
          </p>
        )}

        {failure && (
          <p role="alert" className="text-body-sm text-danger-text">
            {failure}
          </p>
        )}
      </form>
    </Modal>
  );
}
