"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  FieldRow,
  FieldSet,
  IconButton,
  Input,
  LoadState,
  Modal,
  Switch,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiWorkSchedule, WorkScheduleBody } from "@/lib/api/attendance";
import { useDepartments } from "@/lib/store/departments";
import { useWorkSchedules } from "@/lib/store/work-schedules";
import {
  endsAfterStart,
  PRECEDENCE,
  scheduleAudience,
  summariseDays,
  WEEKDAYS,
} from "@/lib/work-schedules";
import {
  DepartmentChecklist,
  PeopleChecklist,
  usePeopleOptions,
} from "./audience-picker";

/**
 * Schedules: a named week, and who works it.
 *
 * ## What this screen does not decide
 *
 * Whose hours apply on a given day is the server's, in one order: a person's own
 * schedule, then their department's, then the company's hours, with a special day
 * above all of them. Nothing here works that out, and the one line that says it
 * is behind the info icon rather than on the page.
 *
 * ## One editor per opening
 *
 * The editor stays mounted so the dialog can animate out, so its form is made
 * again, with a new key, every time it is opened. A form that copied its props
 * into state once would open every schedule as whichever one was edited first.
 */

/** The company's own day, which a newly switched-on day starts from. */
export type CompanyHours = {
  start: string;
  end: string;
  /** ISO weekdays the company works, so a new schedule starts as the usual week. */
  weekdays: readonly number[];
};

type DayDraft = { iso: number; on: boolean; start: string; end: string };

function initialDays(
  schedule: ApiWorkSchedule | null,
  hours: CompanyHours,
): DayDraft[] {
  return WEEKDAYS.map(({ iso }) => {
    const found = schedule?.days.find((day) => day.weekday === iso);
    if (found) return { iso, on: true, start: found.start, end: found.end };
    return {
      iso,
      /* A new schedule starts as the company's usual week, so Saturday is one
         switch away. An existing one is exactly what it was saved as. */
      on: schedule === null && hours.weekdays.includes(iso),
      start: hours.start,
      end: hours.end,
    };
  });
}

const NO_PEOPLE: ApiWorkSchedule["people"] = [];

export function SchedulesPanel({ hours }: { hours: CompanyHours }) {
  const state = useWorkSchedules();
  const toast = useToast();

  const [session, setSession] = useState<{
    id: number;
    schedule: ApiWorkSchedule | null;
  } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<ApiWorkSchedule | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openEditor = (schedule: ApiWorkSchedule | null) => {
    setSession((previous) => ({ id: (previous?.id ?? 0) + 1, schedule }));
    setEditorOpen(true);
  };

  const refused = (caught: unknown) =>
    toast.push({
      tone: "danger",
      title: "That did not save",
      detail:
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
    });

  const save = async (body: WorkScheduleBody): Promise<boolean> => {
    try {
      if (session?.schedule) await state.update(session.schedule.id, body);
      else await state.create(body);
      toast.push({ tone: "success", title: "Saved" });
      setEditorOpen(false);
      return true;
    } catch (caught) {
      refused(caught);
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
      Add schedule
    </Button>
  );

  return (
    <>
      <Card>
        <CardHeader
          title="Schedules"
          info={PRECEDENCE}
          action={
            state.editable && state.schedules.length > 0 ? add : undefined
          }
        />
        <LoadState
          loading={state.loading}
          error={state.error}
          subject="the schedules"
          onRetry={state.reload}
          hasData={state.schedules.length > 0}
          skeleton="list"
        >
          {state.schedules.length === 0 ? (
            <CardBody>
              {state.editable ? (
                <button
                  type="button"
                  onClick={() => openEditor(null)}
                  className="text-body-sm font-medium text-accent-text underline-offset-4 hover:underline"
                >
                  Add schedule
                </button>
              ) : (
                <p className="text-body-sm text-muted">No schedules</p>
              )}
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {state.schedules.map((schedule) => (
                <li
                  key={schedule.id}
                  className="flex items-start gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium text-ink">
                      {schedule.name}
                    </p>
                    <p className="tabular mt-0.5 text-meta text-muted">
                      {summariseDays(schedule.days)}
                    </p>
                    <p className="text-meta text-muted">
                      {scheduleAudience(schedule)}
                    </p>
                  </div>
                  {state.editable && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <IconButton
                        label={`Edit ${schedule.name}`}
                        size="sm"
                        onClick={() => openEditor(schedule)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                      </IconButton>
                      <IconButton
                        label={`Delete ${schedule.name}`}
                        size="sm"
                        onClick={() => {
                          setDeleting(schedule);
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
        <ScheduleEditor
          key={session.id}
          open={editorOpen}
          schedule={session.schedule}
          hours={hours}
          onClose={() => setEditorOpen(false)}
          onSave={save}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        loading={busy}
        title={`Delete ${deleting?.name ?? "this schedule"}?`}
        confirmLabel="Delete"
        body="Everybody on it goes back to the company hours."
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

export function ScheduleEditor({
  open,
  schedule,
  hours,
  onClose,
  onSave,
}: {
  open: boolean;
  /** Null when adding. */
  schedule: ApiWorkSchedule | null;
  hours: CompanyHours;
  onClose: () => void;
  /** Resolves false when the API refused, so the dialog stays open. */
  onSave: (body: WorkScheduleBody) => Promise<boolean>;
}) {
  const [name, setName] = useState(schedule?.name ?? "");
  const [days, setDays] = useState(() => initialDays(schedule, hours));
  const [departmentIds, setDepartmentIds] = useState<string[]>(
    () => schedule?.departments.map((department) => department.id) ?? [],
  );
  const [employeeIds, setEmployeeIds] = useState<string[]>(
    () => schedule?.people.map((person) => person.id) ?? [],
  );
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  const departments = useDepartments().flat;
  const { people, loading } = usePeopleOptions(schedule?.people ?? NO_PEOPLE);

  const setDay = (iso: number, change: Partial<DayDraft>) =>
    setDays((current) =>
      current.map((day) => (day.iso === iso ? { ...day, ...change } : day)),
    );

  const working = days.filter((day) => day.on);
  const nameMissing = name.trim() === "";
  const noDays = working.length === 0;
  const backwards = (day: DayDraft) =>
    day.on && !endsAfterStart(day.start, day.end);
  const valid = !nameMissing && !noDays && !days.some((day) => backwards(day));

  const save = async () => {
    setAttempted(true);
    if (!valid) return;
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        days: working.map((day) => ({
          weekday: day.iso,
          start: day.start,
          end: day.end,
        })),
        departmentIds,
        employeeIds,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={schedule ? "Edit schedule" : "Add schedule"}
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
      <div className="flex flex-col gap-6">
        <Field
          label="Name"
          required
          error={attempted && nameMissing ? "Give it a name" : undefined}
        >
          <Input
            value={name}
            placeholder="Production"
            autoFocus={schedule === null}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
            }}
          />
        </Field>

        <FieldSet legend="Days">
          <ul className="divide-y divide-line">
            {WEEKDAYS.map(({ iso, long }) => {
              const day = days.find((one) => one.iso === iso);
              if (!day) return null;
              const bad = backwards(day);
              return (
                <li
                  key={iso}
                  className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <Switch
                    className="sm:w-48"
                    label={long}
                    checked={day.on}
                    onChange={(event) => {
                      const on = event.target.checked;
                      setDay(iso, { on });
                    }}
                  />
                  {day.on && (
                    <div className="flex flex-col gap-1 sm:w-64">
                      <FieldRow cols={2} phone="pair">
                        <Input
                          type="time"
                          aria-label={`${long} starts`}
                          aria-invalid={bad || undefined}
                          value={day.start}
                          onChange={(event) => {
                            const start = event.target.value;
                            setDay(iso, { start });
                          }}
                        />
                        <Input
                          type="time"
                          aria-label={`${long} ends`}
                          aria-invalid={bad || undefined}
                          value={day.end}
                          onChange={(event) => {
                            const end = event.target.value;
                            setDay(iso, { end });
                          }}
                        />
                      </FieldRow>
                      {bad && (
                        <p className="text-meta text-warning-text">
                          End must be after start
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {attempted && noDays && (
            <p className="text-meta text-warning-text">
              Switch on at least one day
            </p>
          )}
        </FieldSet>

        {(departments.length > 0 || people.length > 0) && (
          <div className="flex flex-col gap-4">
            <p className="text-body-sm font-medium text-ink">Applies to</p>
            {departments.length > 0 && (
              <FieldSet legend="Departments">
                <DepartmentChecklist
                  departments={departments}
                  value={departmentIds}
                  onChange={setDepartmentIds}
                />
              </FieldSet>
            )}
            {(people.length > 0 || loading) && (
              <FieldSet legend="People">
                {loading ? (
                  <p className="text-body-sm text-muted">Loading</p>
                ) : (
                  <PeopleChecklist
                    people={people}
                    value={employeeIds}
                    onChange={setEmployeeIds}
                  />
                )}
              </FieldSet>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
