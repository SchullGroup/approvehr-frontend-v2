"use client";

import { useState } from "react";
import { UserMinus, UsersRound } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  FieldRow,
  LoadState,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import { PersonPicker } from "@/components/projects/person";
import { useProgram } from "@/components/projects/program-context";
import { LevelBadge } from "@/components/projects/program-parts";
import type { ProgramLevel } from "@/lib/projects/access";
import type { ProgramPerson } from "@/lib/projects/programs";
import { LEVEL_LABEL, LEVEL_SENTENCE, PROGRAM } from "@/lib/projects/terms";
import { useDepartments } from "@/lib/store/departments";
import { useProgramPeople } from "@/lib/store/programs";

/**
 * Who has access to a program, and at what level. For its lead and for people who
 * manage records: the API refuses the list to anybody else, so the tab is absent
 * for them, not greyed out.
 *
 * What a level means is said once, in plain words, at the top. A change is
 * applied at once and put back with a toast if the API refuses. Adding a
 * department adds its people *now*, once; nobody is added later because the
 * department grew, and the page says so beside the button.
 */
export function PeopleView() {
  const { program } = useProgram();
  const list = useProgramPeople(program.id, program.canManage);
  const [removing, setRemoving] = useState<ProgramPerson | null>(null);
  const [shown, setShown] = useState<ProgramPerson | null>(null);
  const { actions } = useProgram();
  const toast = useToast();
  const [removingBusy, setRemovingBusy] = useState(false);

  if (removing && removing !== shown) setShown(removing);
  const data = list.data;

  async function confirmRemove() {
    if (!removing) return;
    setRemovingBusy(true);
    const result = await actions.removePerson(program, {
      employeeId: removing.employeeId,
      name: removing.name,
    });
    setRemovingBusy(false);
    if (result.ok) {
      toast.push({
        tone: "success",
        title: `${removing.name} removed from ${program.name}`,
      });
    }
    setRemoving(null);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader
          title="What each level can do"
          description={`A department linked to a ${PROGRAM.one} gives nobody access by itself. Access is only what is listed here.`}
        />
        <CardBody>
          <dl className="space-y-3 text-body-sm">
            {(["READ", "WRITE", "LEAD"] as const).map((level) => (
              <div
                key={level}
                className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"
              >
                <dt className="font-medium text-ink">{LEVEL_LABEL[level]}</dt>
                <dd className="text-muted">{LEVEL_SENTENCE[level]}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <AddPerson />
      <AddDepartment />

      <Card>
        <CardHeader
          title="People with access"
          description="Everyone here can open every project in this program."
        />
        <CardBody>
          <LoadState
            loading={list.status === "loading"}
            error={list.status === "error" ? list.error : null}
            subject="the people"
            onRetry={list.reload}
            skeleton={<Skeleton className="h-32" />}
          >
            {data && (
              <ul className="divide-y divide-line">
                <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-medium text-ink">
                      {data.lead.name}
                    </span>
                    <span className="block text-meta text-muted">
                      Leads this {PROGRAM.one}
                    </span>
                  </span>
                  <LevelBadge level="LEAD" />
                </li>
                {data.people.map((person) => (
                  <li
                    key={person.employeeId}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body-sm font-medium text-ink">
                        {person.name}
                      </span>
                      <span className="block truncate text-meta text-muted">
                        {[person.jobTitle, person.departmentName]
                          .filter(Boolean)
                          .join(" · ") || " "}
                      </span>
                    </span>
                    <span className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                      <Select
                        aria-label={`Access for ${person.name}`}
                        value={person.level}
                        onChange={(event) =>
                          void actions.setLevel(
                            program,
                            {
                              employeeId: person.employeeId,
                              name: person.name,
                            },
                            event.target.value as ProgramLevel,
                          )
                        }
                        className="w-44 max-w-full"
                      >
                        <option value="READ">{LEVEL_LABEL.READ}</option>
                        <option value="WRITE">{LEVEL_LABEL.WRITE}</option>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${person.name}`}
                        onClick={() => setRemoving(person)}
                      >
                        <UserMinus aria-hidden="true" className="size-4" />
                        Remove
                      </Button>
                    </span>
                  </li>
                ))}
                {data.people.length === 0 && (
                  <li className="py-3">
                    <EmptyState
                      compact
                      icon={<UsersRound />}
                      title="Nobody else has access yet"
                      description={`People who are on a project in this ${PROGRAM.one} still see that project. Add a person or a department above to give them the whole ${PROGRAM.one}.`}
                    />
                  </li>
                )}
              </ul>
            )}
          </LoadState>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        title={`Remove ${shown?.name ?? "this person"}?`}
        body={`They will stop seeing ${program.name}'s projects, unless they are a member of one. Their tasks stay where they are.`}
        confirmLabel="Remove"
        loading={removingBusy}
      />
    </div>
  );
}

function AddPerson() {
  const { program, actions, people } = useProgram();
  const list = useProgramPeople(program.id, program.canManage);
  const toast = useToast();
  const [who, setWho] = useState("");
  const [level, setLevel] = useState<ProgramLevel>("READ");
  const [busy, setBusy] = useState(false);
  const onList = (list.data?.people ?? []).map((p) => p.employeeId);

  async function add() {
    if (!who) return;
    setBusy(true);
    const result = await actions.addPeople(program, [who], level);
    setBusy(false);
    if (result.ok) {
      toast.push({
        tone: "success",
        title: `${people.nameOf(who)} added to ${program.name}`,
        detail: `${LEVEL_LABEL[level]} access.`,
      });
      setWho("");
    }
  }

  return (
    <Card>
      <CardHeader title="Add a person" />
      <CardBody>
        <FieldRow>
          <Field label="Person">
            <PersonPicker
              people={people}
              value={who}
              exclude={[program.leadId, ...onList]}
              placeholder="Choose a person"
              aria-label="Person to add"
              onChange={setWho}
            />
          </Field>
          <Field label="Access">
            <Select
              value={level}
              onChange={(event) => setLevel(event.target.value as ProgramLevel)}
            >
              <option value="READ">{LEVEL_LABEL.READ}</option>
              <option value="WRITE">{LEVEL_LABEL.WRITE}</option>
            </Select>
          </Field>
        </FieldRow>
        <div className="mt-3">
          <Button
            variant="primary"
            disabled={!who}
            loading={busy}
            onClick={() => void add()}
          >
            Add person
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function AddDepartment() {
  const { program, actions, people } = useProgram();
  const departments = useDepartments();
  const toast = useToast();
  const [departmentId, setDepartmentId] = useState("");
  const [level, setLevel] = useState<ProgramLevel>("READ");
  const [busy, setBusy] = useState(false);
  const live = departments.flat.filter((d) => !d.archived);
  const department = live.find((d) => d.id === departmentId);
  if (live.length === 0) return null;
  const inDepartment = department
    ? people.people.filter((p) =>
        p.departmentId
          ? p.departmentId === department.id
          : p.department === department.name,
      )
    : [];

  async function add() {
    if (!department) return;
    setBusy(true);
    const result = await actions.addDepartment(
      program,
      department,
      level,
      inDepartment.map((p) => p.id),
    );
    setBusy(false);
    if (result.ok) {
      toast.push({
        tone: "success",
        title: `${department.name} added to ${program.name}`,
        detail: `${result.value.added} ${result.value.added === 1 ? "person" : "people"} added with ${LEVEL_LABEL[level].toLowerCase()} access.`,
      });
      setDepartmentId("");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Add a whole department"
        description="Adds everybody in it now, once. People who join the department later are not added automatically, and anybody already here keeps the level they have."
      />
      <CardBody>
        <FieldRow>
          <Field label="Department">
            <Select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              <option value="">Choose a department</option>
              {live.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Access">
            <Select
              value={level}
              onChange={(event) => setLevel(event.target.value as ProgramLevel)}
            >
              <option value="READ">{LEVEL_LABEL.READ}</option>
              <option value="WRITE">{LEVEL_LABEL.WRITE}</option>
            </Select>
          </Field>
        </FieldRow>
        <div className="mt-3">
          <Button
            variant="secondary"
            disabled={!department}
            loading={busy}
            onClick={() => void add()}
          >
            Add department
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
