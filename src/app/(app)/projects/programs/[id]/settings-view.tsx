"use client";

import { useState } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { PersonPicker } from "@/components/projects/person";
import { useProgram } from "@/components/projects/program-context";
import { ColorChoice } from "@/components/projects/program-parts";
import type { Program } from "@/lib/projects/programs";
import { PROGRAM } from "@/lib/projects/terms";
import { useDepartments } from "@/lib/store/departments";

/**
 * A program's details: name, colour, department link, lead, and archiving.
 *
 * For the lead and for people who manage records; absent for everybody else.
 * Saving is one button, so a half-edited form is never written. The department
 * link grants nothing, and the form says so; to give a department's people
 * access, use People & access.
 */
export function ProgramSettingsView() {
  const { program } = useProgram();
  /* Keyed on what was saved, so the draft starts again from the saved program
     rather than from a stale edit. */
  return (
    <Details
      key={`${program.id}:${program.updatedAt}:${program.name}:${program.leadId}`}
      program={program}
    />
  );
}

function Details({ program }: { program: Program }) {
  const { actions, people } = useProgram();
  const departments = useDepartments();
  const toast = useToast();
  const [name, setName] = useState(program.name);
  const [description, setDescription] = useState(program.description);
  const [color, setColor] = useState(program.color);
  const [departmentId, setDepartmentId] = useState(program.departmentId ?? "");
  const [leadId, setLeadId] = useState(program.leadId);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [archiving, setArchiving] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const live = departments.flat.filter((d) => !d.archived);
  const department = live.find((d) => d.id === departmentId);
  const dirty =
    name.trim() !== program.name ||
    description.trim() !== program.description ||
    color.toLowerCase() !== program.color.toLowerCase() ||
    departmentId !== (program.departmentId ?? "") ||
    leadId !== program.leadId;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setNameError(`Give the ${PROGRAM.one} a name.`);
      return;
    }
    setNameError(undefined);
    setBusy(true);
    const result = await actions.updateProgram(
      program,
      {
        ...(name.trim() !== program.name ? { name: name.trim() } : {}),
        ...(description.trim() !== program.description
          ? { description: description.trim() }
          : {}),
        ...(color.toLowerCase() !== program.color.toLowerCase()
          ? { color }
          : {}),
        ...(departmentId !== (program.departmentId ?? "")
          ? {
              departmentId: departmentId || null,
              departmentName: department?.name ?? null,
            }
          : {}),
        ...(leadId !== program.leadId ? { leadId } : {}),
      },
      { quiet: true },
    );
    setBusy(false);
    if (!result.ok) {
      const error = result.error;
      const own =
        error instanceof ApiError
          ? (error.messageFor("name") ??
            (error.status === 409 ? result.message : undefined))
          : /already called/i.test(result.message)
            ? result.message
            : undefined;
      if (own) setNameError(own);
      else
        toast.push({
          tone: "danger",
          title: `Could not save ${program.name}`,
          detail: result.message,
        });
      return;
    }
    toast.push({ tone: "success", title: `${name.trim()} saved` });
  }

  async function archive() {
    setArchiveBusy(true);
    const result = await actions.archiveProgram(program, !program.archived);
    setArchiveBusy(false);
    setArchiving(false);
    if (result.ok) {
      toast.push({
        tone: "success",
        title: program.archived
          ? `${program.name} restored`
          : `${program.name} archived`,
      });
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <form onSubmit={save} noValidate className="space-y-4">
            <Field
              label="Name"
              required
              {...(nameError ? { error: nameError } : {})}
            >
              <Input
                value={name}
                maxLength={80}
                autoComplete="off"
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError(undefined);
                }}
              />
            </Field>
            <Field label="Description" optional>
              <Textarea
                value={description}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <div className="space-y-1.5">
              <span
                id="program-colour"
                className="text-body-sm font-medium text-ink"
              >
                Colour
              </span>
              <ColorChoice
                value={color}
                labelledBy="program-colour"
                onChange={setColor}
              />
            </div>
            <Field
              label="Lead"
              help={`The lead manages this ${PROGRAM.one}: who has access, its projects and these settings.`}
            >
              <PersonPicker
                people={people}
                value={leadId}
                aria-label="Lead"
                onChange={(id) => id && setLeadId(id)}
              />
            </Field>
            <Field
              label="Department"
              optional
              help="A label for which department this belongs to. It gives nobody access by itself; use People & access to add its people."
            >
              <Select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">None</option>
                {live.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
                {program.departmentId &&
                  !live.some((d) => d.id === program.departmentId) && (
                    <option value={program.departmentId}>
                      {program.departmentName ?? "Archived department"}
                    </option>
                  )}
              </Select>
            </Field>
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={!dirty}
                loading={busy}
              >
                Save changes
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={program.archived ? "Restore" : "Archive"}
          description={
            program.archived
              ? `Restoring brings ${program.name} back into the lists and lets it take new projects and people.`
              : `An archived ${PROGRAM.one} leaves the lists and takes no new projects or people. Everybody keeps the access they have, and you can restore it.`
          }
        />
        <CardBody>
          <Button
            variant={program.archived ? "secondary" : "danger"}
            onClick={() =>
              program.archived ? void archive() : setArchiving(true)
            }
            loading={archiveBusy && program.archived}
          >
            {program.archived ? (
              <ArchiveRestore aria-hidden="true" className="size-4" />
            ) : (
              <Archive aria-hidden="true" className="size-4" />
            )}
            {program.archived
              ? `Restore ${PROGRAM.one}`
              : `Archive ${PROGRAM.one}`}
          </Button>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        onConfirm={() => void archive()}
        title={`Archive ${program.name}?`}
        body={`It will leave the lists and take no new projects or people. Everybody keeps the access they have, and you can restore it from here.`}
        confirmLabel={`Archive ${PROGRAM.one}`}
        loading={archiveBusy}
      />
    </div>
  );
}
