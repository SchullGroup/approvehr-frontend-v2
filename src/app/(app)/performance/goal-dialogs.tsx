"use client";

import { useState } from "react";
import {
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import {
  SuggestButton,
  SuggestionPanel,
} from "@/components/performance/suggestions";
import {
  currentQuarter,
  parseMeasure,
  type CreateGoalBody,
  type CreateKeyResultBody,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useObjectiveSuggestions } from "@/lib/store/ai";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useSession } from "@/lib/store/session";
import { TODAY } from "@/lib/today";

/**
 * The three KPI forms.
 *
 * Every label here is what a shop owner would say out loud. "Key result" is the
 * word the schema uses and it does not appear on screen — the thing is a
 * *measure*, and it is a number with a target.
 */

/** The current quarter and the three after it, plus the one just gone. */
function quarterOptions(): string[] {
  const now = currentQuarter(TODAY);
  const [yearPart = "2026", quarterPart = "Q1"] = now.split("-");
  let year = Number(yearPart);
  let quarter = Number(quarterPart.replace("Q", ""));

  /* Start one quarter back: a KPI is often written up after the period opened. */
  quarter -= 1;
  if (quarter === 0) {
    quarter = 4;
    year -= 1;
  }

  const out: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    out.push(`${year}-Q${quarter}`);
    quarter += 1;
    if (quarter === 5) {
      quarter = 1;
      year += 1;
    }
  }
  return out;
}

const quarterText = (quarter: string) => {
  const [year, part] = quarter.split("-");
  return `${part} ${year}`;
};

/* -------------------------------------------------------------------------- */

export function NewKpiDialog({
  parentId,
  parentTitle,
  onClose,
  onCreate,
}: {
  parentId?: string;
  parentTitle?: string;
  onClose: () => void;
  onCreate: (body: CreateGoalBody) => Promise<void>;
}) {
  const { employees } = useEmployeeDirectory({ pageSize: 200 });
  const { employeeId } = useSession();
  /* A company KPI has no owner and everybody can read it, which is why the API
     gates it. The option is absent rather than disabled for the same reason. */
  const canSetCompanyWide = useCan("EDIT_RECORDS");

  const quarters = quarterOptions();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState<string>("me");
  const [quarter, setQuarter] = useState(quarters[1] ?? quarters[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Suggestions, only under a parent.
   *
   * A KPI with no parent has nothing to be suggested *from* — this is the
   * "turn the company goal into something my team can be held to" case, and
   * the parent goal is the whole of the grounding. Offering the button on a
   * top-level KPI would be offering to invent a company's objectives, which is
   * not a blank page anybody should have filled for them.
   */
  const suggestions = useObjectiveSuggestions();

  const submit = async () => {
    if (title.trim().length < 3) {
      setError("Give it a title of at least three characters.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const body: CreateGoalBody = { title: title.trim() };
      if (description.trim()) body.description = description.trim();
      if (parentId) body.parentId = parentId;
      if (quarter) body.dueQuarter = quarter;
      if (owner === "company") body.ownerId = null;
      else if (owner !== "me") body.ownerId = owner;
      await onCreate(body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={parentTitle ? `New KPI under "${parentTitle}"` : "New KPI"}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={saving}
            onClick={() => void submit()}
          >
            Create KPI
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="What is being aimed at"
          required
          {...(error ? { error } : {})}
          help="Say it the way you would to the person doing it."
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Fill the two Lagos engineering roles"
          />
        </Field>

        {/* Under the field it fills, not above it: the blank page is the thing
            being helped with, and a suggestion panel above the input would read
            as the primary way to write a KPI. Typing it yourself is. */}
        {parentId && (
          <div className="flex flex-col gap-3">
            <SuggestButton
              loading={suggestions.loading}
              label="Suggest objectives under this goal"
              onClick={() => void suggestions.ask({ goalId: parentId })}
            />
            <SuggestionPanel
              state={suggestions}
              onDismiss={suggestions.clear}
              useLabel="Use this"
              emptyHint="Edit it before you save."
              /* The only path from a suggestion into the form, and it lands in
                 the editable fields rather than in the create call. Measures
                 are shown on the suggestion and deliberately not applied —
                 this dialog cannot create one (`AddMeasureDialog` does), and
                 silently dropping them would be worse than showing them as the
                 next thing to add. */
              onUse={(suggestion) => {
                setTitle(suggestion.title);
                if (suggestion.detail) setDescription(suggestion.detail);
                setError(null);
              }}
            />
          </div>
        )}

        <Field label="Whose KPI is this" required>
          <Select
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          >
            <option value="me">Mine</option>
            {canSetCompanyWide && (
              <option value="company">
                The whole company — everyone sees it
              </option>
            )}
            {employees
              .filter((person) => person.id !== employeeId)
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName} · {person.jobTitle}
                </option>
              ))}
          </Select>
        </Field>

        <Field label="Due by the end of" required>
          <Select
            value={quarter}
            onChange={(event) => setQuarter(event.target.value)}
          >
            {quarters.map((option) => (
              <option key={option} value={option}>
                {quarterText(option)}
              </option>
            ))}
          </Select>
        </Field>

        <Field optional label="Any detail">
          <Textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Adding a measure.
 *
 * The direction check is done here as well as on the server, with the same
 * wording. Not because the server cannot be trusted, but because "the target is
 * below where you started — tick the box if it is meant to come down" is worth
 * saying while somebody is still looking at the two fields.
 */
export function AddMeasureDialog({
  goalTitle,
  onClose,
  onAdd,
}: {
  goalTitle: string;
  onClose: () => void;
  onAdd: (body: CreateKeyResultBody) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [start, setStart] = useState("0");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [countDown, setCountDown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const found: Record<string, string> = {};
    if (label.trim().length < 2)
      found["label"] = "Name what is being measured.";
    if (!target.trim()) found["target"] = "Set the number you are aiming at.";

    const from = parseMeasure(start.trim() || "0");
    const to = parseMeasure(target.trim() || "0");
    if (target.trim() && from === to) {
      found["target"] =
        "That is the same as the starting number, so there is nothing to measure.";
    } else if (target.trim() && countDown && to > from) {
      found["target"] =
        "This one counts down, so the target has to be below the starting number.";
    } else if (target.trim() && !countDown && to < from) {
      found["target"] =
        "The target is below the starting number. Tick the box if it is meant to come down.";
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const body: CreateKeyResultBody = {
        label: label.trim(),
        targetValue: target.trim(),
        startValue: start.trim() || "0",
      };
      if (unit.trim()) body.unit = unit.trim();
      if (current.trim()) body.currentValue = current.trim();
      if (countDown) body.lowerIsBetter = true;
      await onAdd(body);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a measure"
      description={goalTitle}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={saving}
            onClick={() => void submit()}
          >
            Add measure
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="What are you counting"
          required
          {...(errors["label"] ? { error: errors["label"] } : {})}
        >
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Offers accepted"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starting at" required>
            <Input
              inputMode="decimal"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </Field>
          <Field
            label="Aiming at"
            required
            {...(errors["target"] ? { error: errors["target"] } : {})}
          >
            <Input
              inputMode="decimal"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          </Field>
          <Field label="Where it is now" help="Leave blank to use the start.">
            <Input
              inputMode="decimal"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Unit"
          help="₦, %, days, customers — whatever you say out loud."
        >
          <Input
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          />
        </Field>

        <Checkbox
          label="This number should go down"
          description="Cost, days to hire, complaints. Progress is how far it has fallen."
          checked={countDown}
          onChange={(event) => setCountDown(event.target.checked)}
        />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/** Stopping a KPI. The reason is required because it is the only record of it. */
export function StopKpiDialog({
  goalTitle,
  onClose,
  onStop,
}: {
  goalTitle: string;
  onClose: () => void;
  onStop: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 3) {
      setError(
        "Say why in a few words. Everyone working towards this will see it.",
      );
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onStop(reason.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Stop this KPI"
      description={goalTitle}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Keep it</Button>
          <Button
            variant="danger"
            loading={saving}
            onClick={() => void submit()}
          >
            Stop it
          </Button>
        </>
      }
    >
      <Field
        label="Why are you stopping it"
        required
        {...(error ? { error } : {})}
        help="It will show as off track, with this reason against it."
      >
        <Textarea
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </Modal>
  );
}
