"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Modal,
  Select,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { DraftInput, DraftTextarea } from "@/components/projects/draft-fields";
import { ProjectKeyChip } from "@/components/projects/glyphs";
import { ProjectObjectiveField } from "@/components/projects/objective-link";
import { PersonAvatar, PersonPicker } from "@/components/projects/person";
import { useProject } from "@/components/projects/project-context";
import { MANAGE_REASON } from "@/lib/projects/access";
import { removalHolders, removalRefusal } from "@/lib/projects/members";
import {
  PROJECT_COLORS,
  PROJECT_COLOR_NAMES,
  PROJECT_TYPES,
  PROJECT_TYPE_LABEL,
  type ProjectType,
} from "@/lib/projects/types";
import { boardTypeChangeBlocker } from "@/lib/projects/workflow";
import { useDepartments } from "@/lib/store/departments";
import { WorkflowEditor } from "./workflow-editor";

/**
 * Project settings: details, workflow, members, and the danger zone.
 *
 * Open to everyone on the project to read, and to the lead and people who manage
 * employee records to change. Everybody else sees the same page with every
 * control off and the reason at the top, rather than a page that is missing.
 * The API is the authority; this only stops offering what will be refused.
 */
export function SettingsView() {
  const { canManage } = useProject();
  return (
    <div className="max-w-3xl space-y-6">
      {!canManage && (
        <Callout tone="neutral" title="You can read these, not change them">
          {MANAGE_REASON}
        </Callout>
      )}
      <DetailsCard editable={canManage} />
      <Card>
        <CardHeader
          title="Workflow"
          description="The board's columns, in order. A status's category decides whether an issue in it counts as done. A WIP limit turns a column's count red when it has more than that many issues; nothing is blocked."
        />
        <CardBody>
          <WorkflowEditor editable={canManage} />
        </CardBody>
      </Card>
      <MembersCard editable={canManage} />
      {canManage && <DangerCard />}
    </div>
  );
}

/* ----------------------------------------------------------------- details -- */

function DetailsCard({ editable }: { editable: boolean }) {
  const { project, issues, sprints, actions, people } = useProject();
  const departments = useDepartments();
  const toast = useToast();
  const [typeNotice, setTypeNotice] = useState<string | null>(null);

  const saved = () =>
    toast.push({ tone: "success", title: "Project details saved" });

  const patch = async (change: Parameters<typeof actions.updateProject>[0]) => {
    const result = await actions.updateProject(change);
    if (result.ok) saved();
  };

  const live = departments.flat.filter((d) => !d.archived);

  return (
    <Card>
      <CardHeader
        title="Details"
        description="How this project appears across ApproveHR. Changes save as you leave a field."
      />
      <CardBody className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name">
            <DraftInput
              value={project.name}
              disabled={!editable}
              maxLength={80}
              clean={(draft) => (draft.trim() ? draft.trim() : null)}
              onCommit={(name) => void patch({ name })}
            />
          </Field>
          <Field
            label="Project lead"
            help="The lead is always a member, and can change everything here."
          >
            <PersonPicker
              people={people}
              value={project.leadId}
              disabled={!editable}
              aria-label="Project lead"
              onChange={(id) => {
                if (id && id !== project.leadId) void patch({ leadId: id });
              }}
            />
          </Field>
        </div>

        <Field label="Description" optional>
          <DraftTextarea
            value={project.description}
            rows={3}
            disabled={!editable}
            placeholder="What is this project for?"
            onCommit={(description) => void patch({ description })}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Board type"
            {...(typeNotice ? { error: typeNotice } : {})}
            help={
              typeNotice
                ? undefined
                : project.type === "SCRUM"
                  ? "Work is planned into sprints and the board shows the active one."
                  : "Work flows through the columns with no sprints."
            }
          >
            <Select
              value={project.type}
              disabled={!editable}
              onChange={(event) => {
                const next = event.target.value as ProjectType;
                const blocker = boardTypeChangeBlocker(
                  project,
                  next,
                  issues,
                  sprints,
                );
                if (blocker) {
                  setTypeNotice(blocker);
                  return;
                }
                setTypeNotice(null);
                void patch({ type: next });
              }}
            >
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROJECT_TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Department"
            optional
            help="For finding the project. It does not change who is on it."
          >
            <Select
              value={project.departmentId ?? ""}
              disabled={!editable}
              onChange={(event) =>
                void patch({ departmentId: event.target.value || null })
              }
            >
              <option value="">None</option>
              {live.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
              {project.departmentId &&
                !live.some((d) => d.id === project.departmentId) && (
                  <option value={project.departmentId}>
                    {project.departmentName ?? "Current department"}
                  </option>
                )}
            </Select>
          </Field>
        </div>

        {editable && <ProjectObjectiveField />}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-body-sm font-medium text-ink">Key</p>
            <p className="flex flex-wrap items-center gap-2 text-body-sm text-muted">
              <ProjectKeyChip project={project} />
              <span>
                Issue keys look like {project.key}-42. The key cannot change
                after the project is created.
              </span>
            </p>
          </div>
          <div className="space-y-1.5">
            <p id="colour-label" className="text-body-sm font-medium text-ink">
              Colour
            </p>
            <div
              role="radiogroup"
              aria-labelledby="colour-label"
              className="flex flex-wrap gap-2"
            >
              {PROJECT_COLORS.map((color) => {
                const on = project.color.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={PROJECT_COLOR_NAMES[color] ?? color}
                    title={PROJECT_COLOR_NAMES[color] ?? color}
                    disabled={!editable}
                    onClick={() => {
                      if (!on) void patch({ color });
                    }}
                    style={{ backgroundColor: color }}
                    className={cn(
                      "size-8 rounded-md ring-2 ring-offset-2 ring-offset-surface transition-shadow",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                      on
                        ? "ring-ink"
                        : "ring-transparent hover:ring-line-strong",
                    )}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/* ----------------------------------------------------------------- members -- */

function MembersCard({ editable }: { editable: boolean }) {
  const { project, issues, people, actions } = useProject();
  const toast = useToast();
  const members = project.memberIds;
  /* Who could not be removed, and why — said under their row on press, the way the
     workflow editor says why a status will not go. */
  const [refused, setRefused] = useState<{ id: string; text: string } | null>(
    null,
  );

  async function set(next: string[], title: string) {
    setRefused(null);
    const result = await actions.setMembers(next, { nameOf: people.nameOf });
    if (result.ok) toast.push({ tone: "success", title });
  }

  function remove(id: string) {
    /* The API will not take somebody off while they hold open issues. Worked
       out here first from the same issues, so the reason arrives with names and
       without a round trip. */
    const holders = removalHolders(project.statuses, issues, [id]);
    if (holders.length > 0) {
      setRefused({ id, text: removalRefusal(holders, people.nameOf) });
      return;
    }
    void set(
      members.filter((m) => m !== id),
      `${people.nameOf(id)} removed`,
    );
  }

  return (
    <Card>
      <CardHeader
        title="Members"
        description="Only members can see this project, and only members can be given its issues."
      />
      <CardBody className="space-y-4">
        <ul className="divide-y divide-line">
          {members.map((id) => (
            <li key={id} className="py-2.5">
              <div className="flex items-center gap-3">
                <PersonAvatar people={people} id={id} size="sm" decorative />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-ink">
                    {people.nameOf(id)}
                  </span>
                  {people.byId.get(id)?.jobTitle && (
                    <span className="block truncate text-meta text-muted">
                      {people.byId.get(id)?.jobTitle}
                    </span>
                  )}
                </span>
                {id === project.leadId && (
                  <Badge tone="accent" size="sm">
                    Lead
                  </Badge>
                )}
                {editable && id !== project.leadId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${people.nameOf(id)}`}
                    onClick={() => remove(id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              {refused?.id === id && (
                <p
                  role="status"
                  className="mt-1.5 pl-11 text-meta text-danger-text"
                >
                  {refused.text}
                </p>
              )}
            </li>
          ))}
          {members.length === 0 && (
            <li className="py-3 text-body-sm text-muted">No members yet.</li>
          )}
        </ul>
        {editable && (
          <div className="max-w-sm">
            <PersonPicker
              people={people}
              value=""
              exclude={members}
              placeholder="Add a person"
              aria-label="Add a member"
              onChange={(id) => {
                if (id) {
                  void set([...members, id], `${people.nameOf(id)} added`);
                }
              }}
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ danger -- */

function DangerCard() {
  const { project, issues, sprints, actions } = useProject();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  /* A fresh box every time it opens. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTyped("");
  }

  const matches = typed.trim().toUpperCase() === project.key;

  async function remove() {
    if (!matches) return;
    setBusy(true);
    const name = project.name;
    const result = await actions.deleteProject();
    setBusy(false);
    if (!result.ok) return;
    toast.push({ tone: "success", title: `${name} deleted` });
    setOpen(false);
    router.push("/projects");
  }

  return (
    <Card className="border-danger-line">
      <CardHeader
        title="Delete this project"
        description={`Removes ${project.name} with all ${issues.length} ${issues.length === 1 ? "issue" : "issues"} and ${sprints.length} ${sprints.length === 1 ? "sprint" : "sprints"}. This cannot be undone.`}
      />
      <CardBody>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete project
        </Button>
      </CardBody>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${project.name}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!matches}
              onClick={() => void remove()}
            >
              Delete forever
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-body-sm leading-relaxed text-body">
            Every issue, comment and sprint in {project.name} goes with it.
          </p>
          <Field label={`Type ${project.key} to confirm`}>
            <Input
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void remove();
                }
              }}
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
