"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";
import type { ProjectType } from "@/lib/projects/types";
import { keyProblem, normaliseKey, suggestKey } from "@/lib/projects/keys";
import { useDepartments } from "@/lib/store/departments";
import { useCreateProject } from "@/lib/store/projects";
import {
  usePeople,
  useProjectActor,
  type Person,
} from "@/lib/store/project-session";
import { ApiError } from "@/lib/api/client";
import { BoardTypeChoice } from "@/components/projects/board-type-choice";
import { DepartmentField } from "@/components/projects/department-field";
import {
  MoreOptions,
  useMoreOptions,
} from "@/components/projects/more-options";

/** Per browser, like the new-task form's, but its own: two forms, two habits. */
const MORE_OPTIONS_KEY_PROJECT = "projects.newProject.moreOptions";
import { PersonPicker } from "@/components/projects/person";
import { PROGRAM, PROJECT_TYPE_LABEL } from "@/lib/projects/terms";
import { useProgramList } from "@/lib/store/programs";

type Draft = {
  /** Only asked of a sign-in with no staff record, which cannot lead anything itself. */
  leadId: string;
  name: string;
  key: string;
  /** Once the person has typed in the key, it stops following the name. */
  keyTouched: boolean;
  type: ProjectType;
  departmentId: string;
  /** Once the person has chosen a department, their own stops being suggested. */
  departmentTouched: boolean;
  /** Add everybody in the department as members. On, as choosing one always did. */
  seedDepartment: boolean;
  description: string;
  /** The program it starts in; empty for none. */
  programId: string;
};

const BLANK: Draft = {
  leadId: "",
  name: "",
  key: "",
  keyTouched: false,
  /* A simple board, so the first task shows on the board the moment it is
     made. On cycles it waited in Later, and a new project looked broken. */
  type: "KANBAN",
  departmentId: "",
  departmentTouched: false,
  seedDepartment: true,
  description: "",
  programId: "",
};

/** People in a department, by id where the directory has it and by name where it only has that. */
function inDepartment(
  people: readonly Person[],
  department: { id: string; name: string },
): Person[] {
  return people.filter((p) =>
    p.departmentId
      ? p.departmentId === department.id
      : p.department === department.name,
  );
}

/**
 * New project: a name and a department, which starts as the creator's own when
 * the directory knows it. The key, the board type, a program and a line about
 * what it is for are under "More options" (remembered open per browser, and
 * opened by a refused key), because the defaults suit most projects.
 *
 * A program, when the person may start a project in one, is chosen here too, and
 * starts as the one they came from. Only programs that will take the project are
 * offered; the picker is absent when there are none.
 *
 * The key follows the name until the person types in it, the way the design does:
 * "Checkout Revamp" suggests CR. Choosing a department adds its people as members
 * — said on the form, with the number, because adding forty people to a project
 * should not be a surprise. The creator is always the lead and a member.
 *
 * It stays mounted and starts blank every time it opens. A refusal from the API
 * (a key somebody else has) is shown on the key, not in a toast over the dialog.
 */
export function NewProjectDialog({
  open,
  onClose,
  takenKeys,
  defaultProgramId = null,
}: {
  open: boolean;
  onClose: () => void;
  takenKeys: readonly string[];
  /** The program the person came from, which the new project starts in. */
  defaultProgramId?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateProject();
  const people = usePeople();
  const actor = useProjectActor();
  const departments = useDepartments();
  const [justAdded, setJustAdded] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const programList = useProgramList();
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<Draft>(BLANK);
  const [wasOpen, setWasOpen] = useState(open);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [keyError, setKeyError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [leadError, setLeadError] = useState<string | undefined>();
  const [departmentError, setDepartmentError] = useState<string | undefined>();
  const more = useMoreOptions(MORE_OPTIONS_KEY_PROJECT, open);
  /* Set when the key is refused, and kept until the section is closed by hand,
     so it does not fold away under the person while they fix it. */
  const [moreForced, setMoreForced] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft({ ...BLANK, programId: defaultProgramId ?? "" });
      setBusy(false);
      setNameError(undefined);
      setKeyError(undefined);
      setLeadError(undefined);
      setDepartmentError(undefined);
      setFailure(null);
      setMoreForced(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const programs = (programList.data?.programs ?? []).filter(
    (p) => p.canCreateProject && !p.archived,
  );
  const liveDepartments = departments.flat.filter((d) => !d.archived);
  /* The creator's own department is the likely one, so it starts chosen; with
     none known the field starts empty, and is still required. Matched by id,
     or by name where the directory only has that. */
  const me = actor.employeeId
    ? people.people.find((p) => p.id === actor.employeeId)
    : undefined;
  const ownDepartmentId =
    (me?.departmentId &&
      liveDepartments.find((d) => d.id === me.departmentId)?.id) ||
    (me?.department &&
      liveDepartments.find((d) => d.name === me.department)?.id) ||
    "";
  const departmentId = draft.departmentTouched
    ? draft.departmentId
    : draft.departmentId || ownDepartmentId;
  /* A department added from the field below is chosen at once, before this
     dialog's own list has reloaded and heard of it; it is used from here until then. */
  const department: { id: string; name: string } | undefined =
    liveDepartments.find((d) => d.id === departmentId) ??
    (justAdded?.id === departmentId ? justAdded : undefined);
  const seeded =
    department && draft.seedDepartment
      ? inDepartment(people.people, department)
      : [];
  /* An account with no staff record behind it has nobody to be the lead. */
  const needsLead = actor.employeeId === null;
  /* Who the creator is already counts as a member, so say how many are *added*. */
  const added = seeded.filter(
    (p) => p.id !== (draft.leadId || actor.employeeId),
  );

  /* The key is the one field under More options that can be refused; its
     error opens the section, whatever was remembered. */
  const moreOpen = more.remembered || moreForced;
  const programName = programs.find((p) => p.id === draft.programId)?.name;
  const summary = [
    draft.key && `Key: ${draft.key.toUpperCase()}`,
    draft.type !== "KANBAN" && PROJECT_TYPE_LABEL[draft.type],
    programName && `${PROGRAM.One}: ${programName}`,
    draft.description.trim() !== "" && "Description added",
  ].filter((line): line is string => typeof line === "string");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = draft.name.trim();
    const key = draft.key.trim().toUpperCase();
    const nameProblem = name ? undefined : "Give the project a name.";
    const keyIssue = keyProblem(key, takenKeys) ?? undefined;
    const leadProblem =
      needsLead && !draft.leadId ? "Choose who will lead it." : undefined;
    setNameError(nameProblem);
    setKeyError(keyIssue);
    if (keyIssue) setMoreForced(true);
    setLeadError(leadProblem);
    const departmentProblem = department ? undefined : "Choose a department.";
    setDepartmentError(departmentProblem);
    if (nameProblem || keyIssue || leadProblem || !department) return;

    setBusy(true);
    setFailure(null);
    const result = await create(
      {
        name,
        key,
        type: draft.type,
        departmentId: department.id,
        description: draft.description.trim(),
        seedMembersFromDepartment: draft.seedDepartment,
        memberIds: seeded.map((p) => p.id),
        ...(needsLead ? { leadId: draft.leadId } : {}),
        programId: draft.programId || null,
      },
      { quiet: true },
    );
    setBusy(false);
    if (!result.ok) {
      /* A key somebody else has (409), or one the API finds malformed, says so
         beside the key; anything else goes under the form. */
      const error = result.error;
      const keyMessage =
        error instanceof ApiError
          ? (error.messageFor("key") ??
            (error.status === 409 ? result.message : undefined))
          : /key/i.test(result.message)
            ? result.message
            : undefined;
      if (keyMessage) {
        setKeyError(keyMessage);
        setMoreForced(true);
      } else setFailure(result.message);
      return;
    }
    toast.push({ tone: "success", title: `${name} created` });
    onClose();
    router.push(`/projects/${result.value.id}`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      description="You will be its lead, and you can add people once it exists."
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            Create project
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
            placeholder="Mobile app v3"
            autoComplete="off"
            onChange={(event) => {
              const name = event.target.value;
              setDraft((d) => ({
                ...d,
                name,
                key: d.keyTouched ? d.key : suggestKey(name),
              }));
              if (nameError) setNameError(undefined);
              if (keyError && !draft.keyTouched) setKeyError(undefined);
            }}
          />
        </Field>

        <DepartmentField
          onAdded={(made) => {
            setJustAdded(made);
            departments.reload();
          }}
          value={departmentId}
          error={departmentError}
          onChange={(id) => {
            setDraft((d) => ({
              ...d,
              departmentId: id,
              departmentTouched: true,
            }));
            setDepartmentError(undefined);
          }}
        />
        {department && (
          <Switch
            checked={draft.seedDepartment}
            onChange={(event) =>
              setDraft((d) => ({ ...d, seedDepartment: event.target.checked }))
            }
            label={`Add everyone in ${department.name} as members`}
            description={
              draft.seedDepartment
                ? added.length > 0
                  ? `${added.length} other ${added.length === 1 ? "person" : "people"} will be added.`
                  : `Nobody else is listed there, so it starts with ${needsLead ? "its lead" : "you"} alone.`
                : `It starts with ${needsLead ? "its lead" : "you"} alone. Add people from the project's settings.`
            }
          />
        )}

        {needsLead && (
          <Field
            label="Project lead"
            required
            help="This sign-in is not linked to a staff record, so somebody else has to lead the project."
            {...(leadError ? { error: leadError } : {})}
          >
            <PersonPicker
              people={people}
              value={draft.leadId}
              placeholder="Choose a person"
              aria-label="Project lead"
              onChange={(id) => {
                setDraft((d) => ({ ...d, leadId: id }));
                if (leadError) setLeadError(undefined);
              }}
            />
          </Field>
        )}

        <MoreOptions
          open={moreOpen}
          onToggle={(next) => {
            more.toggle(next);
            if (!next) setMoreForced(false);
          }}
          summary={summary}
        >
          <Field
            label="Key"
            required
            help="2 to 6 letters or digits. It starts every task number, like MOB-12, and cannot change later."
            {...(keyError ? { error: keyError } : {})}
          >
            <Input
              value={draft.key}
              maxLength={6}
              placeholder="MOB"
              autoComplete="off"
              spellCheck={false}
              className="uppercase"
              onChange={(event) => {
                setDraft((d) => ({
                  ...d,
                  key: normaliseKey(event.target.value),
                  keyTouched: true,
                }));
                if (keyError) setKeyError(undefined);
              }}
            />
          </Field>

          <BoardTypeChoice
            value={draft.type}
            onChange={(type) => setDraft((d) => ({ ...d, type }))}
          />

          {programs.length > 0 && (
            <Field
              label={PROGRAM.One}
              optional
              help={`People with access to the ${PROGRAM.one} can see this project.`}
            >
              <Select
                value={draft.programId}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, programId: event.target.value }))
                }
              >
                <option value="">No {PROGRAM.one}</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Description" optional>
            <Textarea
              value={draft.description}
              rows={3}
              placeholder="What is this project for?"
              onChange={(event) =>
                setDraft((d) => ({ ...d, description: event.target.value }))
              }
            />
          </Field>
        </MoreOptions>

        {failure && (
          <p role="alert" className="text-body-sm text-danger-text">
            {failure}
          </p>
        )}
      </form>
    </Modal>
  );
}
