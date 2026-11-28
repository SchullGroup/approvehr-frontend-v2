"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  FieldRow,
  IconButton,
  Input,
  LoadState,
  Modal,
  SegmentedControl,
  Select,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type {
  ApiSpecialDay,
  SpecialDayBody,
  SpecialDayPatch,
  SpecialDayScope,
} from "@/lib/api/attendance";
import { useDepartments } from "@/lib/store/departments";
import { useOrgTimezone } from "@/lib/store/session";
import { useSpecialDays } from "@/lib/store/work-schedules";
import { todayIn } from "@/lib/time";
import {
  dayLabel,
  endsAfterStart,
  orderSpecialDays,
  PRECEDENCE,
  specialDayHours,
  specialDayWho,
} from "@/lib/work-schedules";
import { groupByDepartment, usePeopleOptions } from "./audience-picker";
import type { CompanyHours } from "./schedules";

/**
 * Special days: one date that does not follow the usual week.
 *
 * Off, or a custom time range, for everybody, one department or one person. A
 * special day beats every schedule and the company hours, and that is the
 * server's to apply: this only keeps the list.
 *
 * ## Who a day is for is chosen when it is added, and not changed after
 *
 * The API's change takes the same fields as an add, and says nothing about how a
 * department's day becomes a person's. Rather than offer a control that might
 * only be refused, an existing day shows who it is for as plain text, and the
 * way to move it is to remove it and add it again.
 */

const NO_PEOPLE: { id: string; name: string; departmentId: string | null }[] =
  [];

const SCOPES: { value: SpecialDayScope; label: string }[] = [
  { value: "COMPANY", label: "Everybody" },
  { value: "DEPARTMENT", label: "A department" },
  { value: "PERSON", label: "A person" },
];

type Kind = "off" | "custom";

const KINDS: { value: Kind; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "custom", label: "Custom hours" },
];

export function SpecialDaysPanel({ hours }: { hours: CompanyHours }) {
  const state = useSpecialDays();
  const toast = useToast();
  const timeZone = useOrgTimezone();
  const today = todayIn(timeZone);

  const [session, setSession] = useState<{
    id: number;
    day: ApiSpecialDay | null;
  } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<ApiSpecialDay | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const ordered = useMemo(
    () => orderSpecialDays(state.days, today),
    [state.days, today],
  );

  const openEditor = (day: ApiSpecialDay | null) => {
    setSession((previous) => ({ id: (previous?.id ?? 0) + 1, day }));
    setEditorOpen(true);
  };

  const save = async (
    body: SpecialDayBody,
    patch: SpecialDayPatch,
  ): Promise<boolean> => {
    try {
      if (session?.day) await state.update(session.day.id, patch);
      else await state.create(body);
      toast.push({ tone: "success", title: "Saved" });
      setEditorOpen(false);
      return true;
    } catch (caught) {
      toast.push({
        tone: "danger",
        title: "That did not save",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await state.remove(deleting.id);
      toast.push({ tone: "success", title: "Deleted" });
      setDeleteOpen(false);
    } catch (caught) {
      toast.push({
        tone: "danger",
        title: "That did not delete",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const add = (
    <Button variant="secondary" size="sm" onClick={() => openEditor(null)}>
      <Plus aria-hidden="true" className="size-4" />
      Add a special day
    </Button>
  );

  return (
    <>
      <Card>
        <CardHeader
          title="Special days"
          info={PRECEDENCE}
          action={state.editable && ordered.length > 0 ? add : undefined}
        />
        <LoadState
          loading={state.loading}
          error={state.error}
          subject="the special days"
          onRetry={state.reload}
          hasData={ordered.length > 0}
          skeleton="list"
        >
          {ordered.length === 0 ? (
            <CardBody>
              {state.editable ? (
                <button
                  type="button"
                  onClick={() => openEditor(null)}
                  className="text-body-sm font-medium text-accent-text underline-offset-4 hover:underline"
                >
                  Add a special day
                </button>
              ) : (
                <p className="text-body-sm text-muted">No special days</p>
              )}
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {ordered.map((day) => (
                <li key={day.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        day.date < today
                          ? "tabular text-body-sm font-medium text-muted"
                          : "tabular text-body-sm font-medium text-ink"
                      }
                    >
                      {dayLabel(day.date)}
                    </p>
                    <p className="mt-0.5 text-meta text-muted">
                      {specialDayWho(day)} · {specialDayHours(day)}
                    </p>
                    {day.note && (
                      <p className="text-meta text-muted">{day.note}</p>
                    )}
                  </div>
                  {state.editable && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <IconButton
                        label={`Edit ${dayLabel(day.date)}`}
                        size="sm"
                        onClick={() => openEditor(day)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                      </IconButton>
                      <IconButton
                        label={`Delete ${dayLabel(day.date)}`}
                        size="sm"
                        onClick={() => {
                          setDeleting(day);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </IconButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </LoadState>
      </Card>

      {session && (
        <SpecialDayEditor
          key={session.id}
          open={editorOpen}
          day={session.day}
          hours={hours}
          onClose={() => setEditorOpen(false)}
          onSave={save}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        loading={busy}
        title={`Delete ${deleting ? dayLabel(deleting.date) : "this day"}?`}
        confirmLabel="Delete"
        body="It goes back to the usual hours."
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

export function SpecialDayEditor({
  open,
  day,
  hours,
  onClose,
  onSave,
}: {
  open: boolean;
  /** Null when adding. */
  day: ApiSpecialDay | null;
  hours: Pick<CompanyHours, "start" | "end">;
  onClose: () => void;
  /**
   * Both bodies are built, and the caller sends the one that fits: the whole
   * day when adding, the part that can change when editing. Resolves false when
   * the API refused, so the dialog stays open.
   */
  onSave: (body: SpecialDayBody, patch: SpecialDayPatch) => Promise<boolean>;
}) {
  const editing = day !== null;
  const [date, setDate] = useState(day?.date ?? "");
  const [scope, setScope] = useState<SpecialDayScope>(day?.scope ?? "COMPANY");
  const [departmentId, setDepartmentId] = useState(day?.departmentId ?? "");
  const [employeeId, setEmployeeId] = useState(day?.employeeId ?? "");
  const [kind, setKind] = useState<Kind>(
    day ? (day.working ? "custom" : "off") : "off",
  );
  const [start, setStart] = useState(day?.start ?? hours.start);
  const [end, setEnd] = useState(day?.end ?? hours.end);
  const [note, setNote] = useState(day?.note ?? "");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  /* Only asked for when a person or a department is being picked: an existing
     day is read-only about who, and "everybody" needs neither list. */
  const choosing = !editing && scope !== "COMPANY";
  const departments = useDepartments().flat;

  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const whoOk =
    editing ||
    scope === "COMPANY" ||
    (scope === "DEPARTMENT" ? departmentId !== "" : employeeId !== "");
  const hoursOk = kind === "off" || endsAfterStart(start, end);
  const valid = dateOk && whoOk && hoursOk;

  const save = async () => {
    setAttempted(true);
    if (!valid) return;
    const trimmed = note.trim();
    const hoursBody =
      kind === "custom"
        ? ({ working: true, start, end } as const)
        : ({ working: false } as const);
    const body: SpecialDayBody = {
      date,
      ...(scope === "DEPARTMENT" ? { departmentId } : {}),
      ...(scope === "PERSON" ? { employeeId } : {}),
      ...hoursBody,
      ...(trimmed ? { note: trimmed } : {}),
    };
    /* What can change on an existing day. A note that was there and is now empty
       is sent as an empty string, which is the one way to say "clear it" that
       needs no new type; absent would leave the old one. */
    const patch: SpecialDayPatch = {
      date,
      ...hoursBody,
      ...(trimmed ? { note: trimmed } : day?.note ? { note: "" } : {}),
    };
    setBusy(true);
    try {
      await onSave(body, patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={editing ? "Edit special day" : "Add a special day"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Date"
          required
          error={attempted && !dateOk ? "Choose a date" : undefined}
        >
          <Input
            type="date"
            value={date}
            autoFocus={!editing}
            onChange={(event) => {
              const next = event.target.value;
              setDate(next);
            }}
          />
        </Field>

        {editing ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-ink">Who</span>
            <span className="text-body-sm text-body">
              {day ? specialDayWho(day) : ""}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <span className="text-body-sm font-medium text-ink">Who</span>
            <SegmentedControl
              label="Who"
              options={SCOPES}
              value={scope}
              onChange={setScope}
              className="self-start"
            />
            {choosing && scope === "DEPARTMENT" && (
              <Field
                label="Department"
                required
                hideLabel
                error={
                  attempted && departmentId === ""
                    ? "Choose a department"
                    : undefined
                }
              >
                <Select
                  value={departmentId}
                  placeholder="Choose one"
                  onChange={(event) => {
                    const next = event.target.value;
                    setDepartmentId(next);
                  }}
                >
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {choosing && scope === "PERSON" && (
              <PersonSelect
                value={employeeId}
                onChange={setEmployeeId}
                error={
                  attempted && employeeId === "" ? "Choose a person" : undefined
                }
              />
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <SegmentedControl
            label="Hours"
            options={KINDS}
            value={kind}
            onChange={setKind}
            className="self-start"
          />
          {kind === "custom" && (
            <>
              <FieldRow cols={2} phone="pair">
                <Field label="Starts">
                  <Input
                    type="time"
                    value={start}
                    onChange={(event) => {
                      const next = event.target.value;
                      setStart(next);
                    }}
                  />
                </Field>
                <Field label="Ends">
                  <Input
                    type="time"
                    value={end}
                    onChange={(event) => {
                      const next = event.target.value;
                      setEnd(next);
                    }}
                  />
                </Field>
              </FieldRow>
              {!hoursOk && (
                <p className="text-meta text-warning-text">
                  End must be after start
                </p>
              )}
            </>
          )}
        </div>

        <Field label="Note" optional>
          <Input
            value={note}
            maxLength={200}
            placeholder="Stock count"
            onChange={(event) => {
              const next = event.target.value;
              setNote(next);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Everybody, under their department. A native select with groups, so there is no
 * search box on a list this short and nothing here to learn.
 */
function PersonSelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error: string | undefined;
}) {
  const { people, loading } = usePeopleOptions(NO_PEOPLE);
  const groups = useMemo(() => groupByDepartment(people), [people]);
  return (
    <Field label="Person" required hideLabel {...(error ? { error } : {})}>
      <Select
        value={value}
        placeholder={loading ? "Loading" : "Choose one"}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
        }}
      >
        {groups.map((group) => (
          <optgroup key={group.name} label={group.name}>
            {group.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </Field>
  );
}
