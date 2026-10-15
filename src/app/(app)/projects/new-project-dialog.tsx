"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  PROJECT_TYPES,
  PROJECT_TYPE_LABEL,
  type ProjectType,
} from "@/lib/projects/types";
import { keyProblem, normaliseKey, suggestKey } from "@/lib/projects/keys";
import { useDepartments } from "@/lib/store/departments";
import { useCreateProject } from "@/lib/store/projects";
import {
  usePeople,
  useProjectActor,
  type Person,
} from "@/lib/store/project-session";
import { ApiError } from "@/lib/api/client";
import { PersonPicker } from "@/components/projects/person";

type Draft = {
  /** Only asked of a sign-in with no staff record, which cannot lead anything itself. */
  leadId: string;
  name: string;
  key: string;
  /** Once the person has typed in the key, it stops following the name. */
  keyTouched: boolean;
  type: ProjectType;
  departmentId: string;
  description: string;
};

const BLANK: Draft = {
  leadId: "",
  name: "",
  key: "",
  keyTouched: false,
  type: "SCRUM",
  departmentId: "",
  description: "",
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
 * New project: a name, a key, a board type, a department if there is one, and a
 * line about what it is for.
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
}: {
  open: boolean;
  onClose: () => void;
  takenKeys: readonly string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateProject();
  const people = usePeople();
  const actor = useProjectActor();
  const departments = useDepartments();
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<Draft>(BLANK);
  const [wasOpen, setWasOpen] = useState(open);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [keyError, setKeyError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [leadError, setLeadError] = useState<string | undefined>();

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(BLANK);
      setBusy(false);
      setNameError(undefined);
      setKeyError(undefined);
      setLeadError(undefined);
      setFailure(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const liveDepartments = departments.flat.filter((d) => !d.archived);
  const department = liveDepartments.find((d) => d.id === draft.departmentId);
  const seeded = department ? inDepartment(people.people, department) : [];
  /* An account with no staff record behind it has nobody to be the lead. */
  const needsLead = actor.employeeId === null;
  /* Who the creator is already counts as a member, so say how many are *added*. */
  const added = seeded.filter(
    (p) => p.id !== (draft.leadId || actor.employeeId),
  );

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
    setLeadError(leadProblem);
    if (nameProblem || keyIssue || leadProblem) return;

    setBusy(true);
    setFailure(null);
    const result = await create(
      {
        name,
        key,
        type: draft.type,
        departmentId: department ? department.id : null,
        description: draft.description.trim(),
        seedMembersFromDepartment: department !== undefined,
        memberIds: seeded.map((p) => p.id),
        ...(needsLead ? { leadId: draft.leadId } : {}),
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
      if (keyMessage) setKeyError(keyMessage);
      else setFailure(result.message);
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Key"
            required
            help="2 to 6 letters or digits. It starts every issue number, like MOB-12, and cannot change later."
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
          <Field
            label="Board type"
            help={
              draft.type === "SCRUM"
                ? "Plan work into sprints."
                : "Work flows through the columns."
            }
          >
            <Select
              value={draft.type}
              onChange={(event) =>
                setDraft((d) => ({
                  ...d,
                  type: event.target.value as ProjectType,
                }))
              }
            >
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROJECT_TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {liveDepartments.length > 0 && (
          <Field
            label="Department"
            optional
            help={
              department
                ? added.length > 0
                  ? `${added.length} other ${added.length === 1 ? "person" : "people"} in ${department.name} will be added as members.`
                  : `Nobody else is listed in ${department.name}, so it starts with ${needsLead ? "its lead" : "you"} alone.`
                : "Choose one to start with its people as members."
            }
          >
            <Select
              value={draft.departmentId}
              onChange={(event) =>
                setDraft((d) => ({ ...d, departmentId: event.target.value }))
              }
            >
              <option value="">None</option>
              {liveDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
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

        {failure && (
          <p role="alert" className="text-body-sm text-danger-text">
            {failure}
          </p>
        )}
      </form>
    </Modal>
  );
}
