"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  Button,
  Checkbox,
  Field,
  Input,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui";
import { BigChoice, WizardShell } from "@/components/performance/wizard-shell";
import {
  PRESETS,
  defaultDueDate,
  presetDates,
  presetName,
  type PresetId,
} from "@/lib/performance/period-presets";
import { actionMessage } from "@/lib/use-action";
import { useCan } from "@/lib/permissions";
import { useDepartments } from "@/lib/store/departments";
import { useFeatures } from "@/lib/store/features";
import { useAssistantAvailable } from "@/lib/store/ai";
import { useCycleMutations } from "@/lib/store/performance";
import { useOrgTimezone } from "@/lib/store/session";
import { todayIn } from "@/lib/time";

/**
 * Starting an appraisal period, from wherever somebody had the thought.
 *
 * One wizard, several buttons: the act is one component and the entries are
 * many, so the one somebody finds is always the one that was fixed.
 * `StartPeriodButton` renders nothing when appraisals are off or the reader
 * cannot run one.
 *
 * ## One question to a screen
 *
 * Which period, when it is due, whether it is the whole company, whether to
 * remind people, whether managers may add questions. Everything else has a sensible
 * default and lives in the period's own Settings. Nothing is written until the
 * last answer, and the period is created, not started: the questions are asked
 * of everybody the moment it starts, so starting is its own deliberate step on
 * the period page.
 *
 * ## "Period", not "cycle"
 *
 * `ReviewCycle` is the model's name. An appraisal period is what it is called to
 * a person.
 */

const STEPS = 5;

export function StartPeriodDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** The new period. The caller decides what to show next. */
  onCreated: (period: { id: string; name: string }) => void;
}) {
  const periods = useCycleMutations();
  const assistant = useAssistantAvailable();
  const departments = useDepartments();

  const timeZone = useOrgTimezone();
  const today = () => todayIn(timeZone);
  const [step, setStep] = useState(0);
  const [year, setYear] = useState(() => Number(todayIn(timeZone).slice(0, 4)));
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [custom, setCustom] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [wholeCompany, setWholeCompany] = useState(true);
  const [scope, setScope] = useState<string[]>([]);
  const [remind, setRemind] = useState(false);
  const [managersAdd, setManagersAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (id: PresetId, forYear: number) => {
    const dates = presetDates(id, forYear);
    setPreset(id);
    setYear(forYear);
    setPeriodStart(dates.start);
    setPeriodEnd(dates.end);
    setName(presetName(id, forYear));
    setDueDate(defaultDueDate(dates.end, today()));
  };

  const datesOk =
    periodStart !== "" && periodEnd !== "" && periodStart <= periodEnd;
  const canNext =
    step === 0
      ? datesOk && name.trim().length >= 3
      : step === 2
        ? wholeCompany || scope.length > 0
        : true;

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await periods.createCycle(
        name.trim(),
        dueDate || undefined,
        {
          periodStart,
          periodEnd,
          ...(!wholeCompany && scope.length > 0
            ? { departmentIds: scope }
            : {}),
          ...(remind ? { remindDaysBefore: 3 } : {}),
          ...(managersAdd ? { managersCanAddQuestions: true } : {}),
        },
      );
      onCreated({ id: created.id, name: created.name });
    } catch (caught) {
      setError(actionMessage(caught, "the period"));
    } finally {
      setSaving(false);
    }
  };

  const next = () => (step === STEPS - 1 ? void create() : setStep(step + 1));
  const answer = (set: () => void) => {
    set();
    setStep((current) => current + 1);
  };

  const titles = [
    "Which period is this for?",
    "When should reviews be in by?",
    "Is this for the whole company?",
    "Remind people who haven't finished?",
    "Can managers add their own questions?",
  ];

  return (
    <WizardShell
      open={open}
      onClose={onClose}
      step={step}
      total={STEPS}
      title={titles[step] ?? ""}
      onBack={() => setStep(step - 1)}
      onNext={next}
      canNext={canNext}
      busy={saving}
      error={error}
      nextLabel={step === STEPS - 1 ? "Create period" : "Continue"}
      hideNext={step === 3 || (step === 2 && wholeCompany) || false}
    >
      {step === 0 && (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() =>
                preset ? pick(preset, year - 1) : setYear(year - 1)
              }
              className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:text-ink"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <span className="min-w-12 text-center text-body-md font-medium text-ink">
              {year}
            </span>
            <button
              type="button"
              aria-label="Next year"
              onClick={() =>
                preset ? pick(preset, year + 1) : setYear(year + 1)
              }
              className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:text-ink"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((one) => (
              <button
                key={one.id}
                type="button"
                aria-pressed={!custom && preset === one.id}
                onClick={() => {
                  setCustom(false);
                  pick(one.id, year);
                }}
                className={
                  "rounded-full border px-4 py-2 text-body-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 " +
                  (!custom && preset === one.id
                    ? "border-accent bg-accent-soft text-accent-text"
                    : "border-line bg-surface text-ink hover:border-accent")
                }
              >
                {one.label}
              </button>
            ))}
          </div>
          <Checkbox
            label="Use custom dates"
            checked={custom}
            onChange={(event) => setCustom(event.target.checked)}
          />
          {custom && (
            <div
              role="group"
              aria-label="Period dates"
              className="flex items-center gap-2"
            >
              <Input
                type="date"
                aria-label="From"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
              />
              <span aria-hidden="true" className="text-muted">
                –
              </span>
              <Input
                type="date"
                aria-label="To"
                value={periodEnd}
                onChange={(event) => {
                  setPeriodEnd(event.target.value);
                  if (periodStart && !dueDate) {
                    setDueDate(defaultDueDate(event.target.value, today()));
                  }
                }}
              />
            </div>
          )}
          <Field label="Name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Q4 2026 appraisal"
            />
          </Field>
          {assistant.available && (
            <Link
              href="/performance/periods/new"
              className="inline-flex items-center gap-1 self-start text-body-sm text-accent-text hover:underline"
            >
              <Sparkles aria-hidden="true" className="size-3.5" />
              Draft it from a description
            </Link>
          )}
        </>
      )}

      {step === 1 && (
        <Field label="Due date">
          <Input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
      )}

      {step === 2 && (
        <>
          <div className="flex gap-3">
            <BigChoice
              selected={wholeCompany}
              onClick={() => {
                setWholeCompany(true);
                setScope([]);
                setStep(3);
              }}
            >
              Yes
            </BigChoice>
            <BigChoice
              selected={!wholeCompany}
              onClick={() => setWholeCompany(false)}
            >
              No, some departments
            </BigChoice>
          </div>
          {!wholeCompany && (
            <div className="flex flex-col gap-2">
              {departments.flat.map((department) => (
                <Checkbox
                  key={department.id}
                  label={department.name}
                  checked={scope.includes(department.id)}
                  onChange={(event) =>
                    setScope(
                      event.target.checked
                        ? [...scope, department.id]
                        : scope.filter((id) => id !== department.id),
                    )
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {step === 3 && (
        <div className="flex gap-3">
          <BigChoice
            selected={remind}
            onClick={() => answer(() => setRemind(true))}
          >
            Yes
          </BigChoice>
          <BigChoice
            selected={!remind}
            onClick={() => answer(() => setRemind(false))}
          >
            No
          </BigChoice>
        </div>
      )}

      {step === 4 && (
        <div className="flex gap-3">
          <BigChoice
            selected={managersAdd}
            onClick={() => setManagersAdd(true)}
          >
            Yes
          </BigChoice>
          <BigChoice
            selected={!managersAdd}
            onClick={() => setManagersAdd(false)}
          >
            No
          </BigChoice>
        </div>
      )}
    </WizardShell>
  );
}

/**
 * What the two settings add up to, in the words the checkboxes use.
 *
 * Read by the surfaces that show who is appraised, so the summary and the
 * controls under it cannot come to describe different states.
 */
export function appraiserSummary(
  owner: boolean,
  hr: boolean,
): string | undefined {
  if (owner && hr) return "Both";
  if (owner) return "Owner only";
  if (hr) return "HR manager only";
  return undefined;
}

/**
 * The button, wherever it is wanted.
 *
 * `variant` defaults to secondary on purpose: on a person's record or the
 * dashboard it is one of several things somebody might do. After the period is
 * made, a success moment offers to open it or to close.
 */
export function StartPeriodButton({
  variant = "secondary",
  size = "sm",
  block = false,
  label = "New appraisal period",
  withIcon = false,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  label?: string;
  withIcon?: boolean;
}) {
  const features = useFeatures();
  const canManage = useCan("MANAGE_SETTINGS");
  const router = useRouter();

  const [open, setOpen] = useState(false);

  /* Absent, not disabled. A company that has not turned appraisals on has no
     business being shown the door to them, and somebody who cannot run one
     would only find out by clicking. */
  if (features.loading || !features.appraisals || !canManage) return null;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        block={block}
        onClick={() => setOpen(true)}
      >
        {withIcon && <CalendarRange aria-hidden="true" className="size-3.5" />}
        {label}
      </Button>

      {open && (
        <StartPeriodDialog
          open
          onClose={() => setOpen(false)}
          onCreated={(period) => {
            setOpen(false);
            /* The wizard goes on: the usual questions are already in, and
               the next screens check them group by group. */
            router.push(`/performance/periods/${period.id}/questions`);
          }}
        />
      )}
    </>
  );
}
