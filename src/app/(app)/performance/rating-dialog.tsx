"use client";

import { useMemo, useState } from "react";
import { Button, Field, Modal, Select, Textarea } from "@/components/ui";
import type { RateBody } from "@/lib/api/performance";
import { useFramework } from "@/lib/store/performance";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useSession } from "@/lib/store/session";

/**
 * Recording somebody's level on one skill.
 *
 * ## The signed-in person is not in the picker
 *
 * The API refuses a self-rating outright — a rating is somebody else's
 * assessment or it is not worth storing, and self-assessment belongs on a review
 * form where it is labelled as one. So the option is absent here rather than
 * offered and then rejected.
 *
 * ## The target is asked for at the same time
 *
 * A level with no target produces no gap, and a gap is the only actionable thing
 * on the skills screen. Asking for both in one form is what makes "two levels
 * below target" arithmetic rather than an opinion somebody has to supply later.
 */
export function RecordLevelDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (competencyId: string, body: RateBody) => Promise<void>;
}) {
  const { employees } = useEmployeeDirectory({ pageSize: 200 });
  const { employeeId } = useSession();
  const framework = useFramework();

  const [person, setPerson] = useState("");
  const [competency, setCompetency] = useState("");
  const [level, setLevel] = useState("");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () => employees.filter((one) => one.id !== employeeId),
    [employees, employeeId],
  );

  const chosen = framework.competencies.find((one) => one.id === competency);
  const scaleMax = chosen?.scaleMax ?? 5;
  const steps = Array.from({ length: scaleMax }, (_, index) => index + 1);

  const submit = async () => {
    const found: Record<string, string> = {};
    if (!person) found["person"] = "Pick who this is about.";
    if (!competency) found["competency"] = "Pick the skill.";
    if (!level) found["level"] = "Pick the level they are at.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const body: RateBody = { employeeId: person, level: Number(level) };
      if (target) body.target = Number(target);
      if (note.trim()) body.note = note.trim();
      await onSave(competency, body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record a level"
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={saving}
            onClick={() => void submit()}
          >
            Save it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Who is this about"
          required
          {...(errors["person"] ? { error: errors["person"] } : {})}
        >
          <Select
            value={person}
            placeholder="Pick a person"
            onChange={(event) => setPerson(event.target.value)}
          >
            {options.map((one) => (
              <option key={one.id} value={one.id}>
                {one.firstName} {one.lastName} · {one.jobTitle}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Which skill"
          required
          {...(errors["competency"] ? { error: errors["competency"] } : {})}
        >
          <Select
            value={competency}
            placeholder="Pick a skill"
            onChange={(event) => {
              setCompetency(event.target.value);
              setLevel("");
              setTarget("");
            }}
          >
            {framework.groups.map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.competencies.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Where they are now"
            required
            {...(errors["level"] ? { error: errors["level"] } : {})}
          >
            <Select
              value={level}
              placeholder="Pick a level"
              onChange={(event) => setLevel(event.target.value)}
            >
              {steps.map((step) => (
                <option key={step} value={String(step)}>
                  {step} of {scaleMax}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            optional
            label="Where they should be"
            help="This is what makes a gap."
          >
            <Select
              value={target}
              placeholder="No target"
              onChange={(event) => setTarget(event.target.value)}
            >
              {steps.map((step) => (
                <option key={step} value={String(step)}>
                  {step} of {scaleMax}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field optional label="Anything to add" help="They will see it.">
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
