"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Button,
  Callout,
  Card,
  CardBody,
  Checkbox,
  Field,
  FieldSet,
  IconButton,
  Input,
  Money,
  RadioCard,
  Select,
  StepIndicator,
  Textarea,
  useStepper,
  useToast,
} from "@/components/ui";
import { EMPLOYEES } from "@/lib/mock/people";
import { STAGES, fullName, type StageId } from "@/lib/types";

/*
 * Creating a role is five decisions, not one long form:
 *   what the role is → what it pays → how you will assess → who assesses →
 *   confirm.
 *
 * Each step asks for one kind of thing, Continue is blocked until that step is
 * genuinely answered, and the running summary on the right means the last step
 * confirms rather than reveals.
 */

type Draft = {
  title: string;
  department: string;
  location: string;
  employmentType: "full_time" | "contract" | "internship";
  workMode: "onsite" | "hybrid" | "remote";
  openings: number;
  targetStartDate: string;
  salaryMin: string;
  salaryMax: string;
  mustHaves: string[];
  niceToHaves: string[];
  activeStages: StageId[];
  screeningQuestions: { id: string; question: string; knockout: boolean }[];
  hiringManagerId: string;
  recruiterId: string;
  notes: string;
};

const EMPTY: Draft = {
  title: "",
  department: "",
  location: "",
  employmentType: "full_time",
  workMode: "hybrid",
  openings: 1,
  targetStartDate: "",
  salaryMin: "",
  salaryMax: "",
  mustHaves: [""],
  niceToHaves: [""],
  /* Sourcing and selection are structural — you cannot have a pipeline without
     an entry and an exit — so they are always on and rendered as locked. */
  activeStages: ["sourced", "shortlisted", "prescreen", "interview", "selection"],
  screeningQuestions: [],
  hiringManagerId: "",
  recruiterId: "emp-06",
  notes: "",
};

const LOCKED_STAGES: StageId[] = ["sourced", "selection"];

export function RequisitionWizard() {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const min = Number(draft.salaryMin.replace(/\D/g, "")) || 0;
  const max = Number(draft.salaryMax.replace(/\D/g, "")) || 0;
  const bandInvalid = min > 0 && max > 0 && min > max;

  const complete = {
    role: Boolean(draft.title && draft.department && draft.location),
    pay: min > 0 && max > 0 && !bandInvalid,
    process: draft.activeStages.length >= 2,
    team: Boolean(draft.hiringManagerId && draft.recruiterId),
    review: true,
  };

  const stepper = useStepper([
    { id: "role", label: "Role", hint: "Title, team, location" },
    { id: "pay", label: "Compensation", hint: "Band and openings" },
    { id: "process", label: "Process", hint: "Stages and screening" },
    { id: "team", label: "Hiring team", hint: "Who decides" },
    { id: "review", label: "Review", hint: "Confirm and open" },
  ]);

  /* A step only reads as done once it has been visited AND satisfied. Some
     steps start satisfied by their defaults, and ticking those before the
     user has seen them would claim a decision they never made. */
  const doneFlags = [complete.role, complete.pay, complete.process, complete.team, false];
  const displaySteps = stepper.steps.map((step, i) => ({
    ...step,
    isComplete: i <= stepper.furthest && doneFlags[i],
  }));

  const canContinue = [
    complete.role,
    complete.pay,
    complete.process,
    complete.team,
    true,
  ][stepper.index];

  function submit() {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      toast.push({
        title: `${draft.title} sent for approval`,
        tone: "success",
        detail: "You will be notified when the hiring manager approves it.",
      });
      router.push("/hiring");
    }, 900);
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator
        steps={displaySteps}
        index={stepper.index}
        furthest={stepper.furthest}
        onStepSelect={stepper.goTo}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardBody className="flex flex-col gap-5">
            {stepper.index === 0 && (
              <>
                <Field label="Job title" required help="What a candidate would search for.">
                  <Input
                    value={draft.title}
                    onChange={(e) => set("title", e.currentTarget.value)}
                    placeholder="Senior Backend Engineer"
                    autoFocus
                  />
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Department" required>
                    <Select
                      value={draft.department}
                      onChange={(e) => set("department", e.currentTarget.value)}
                      placeholder="Select a department"
                    >
                      {["Engineering", "Finance", "Product", "Operations", "People", "Sales"].map(
                        (d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ),
                      )}
                    </Select>
                  </Field>

                  <Field label="Location" required>
                    <Select
                      value={draft.location}
                      onChange={(e) => set("location", e.currentTarget.value)}
                      placeholder="Select a location"
                    >
                      {["Lagos, NG", "Abuja, NG", "Port Harcourt, NG", "Remote, NG"].map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <FieldSet legend="Employment type">
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    {(
                      [
                        ["full_time", "Full time", "PAYE and pension apply"],
                        ["contract", "Contract", "Withholding tax applies"],
                        ["internship", "Internship", "Fixed term, stipend"],
                      ] as const
                    ).map(([value, label, description]) => (
                      <RadioCard
                        key={value}
                        name="employmentType"
                        value={value}
                        checked={draft.employmentType === value}
                        onChange={() => set("employmentType", value)}
                        label={label}
                        description={description}
                      />
                    ))}
                  </div>
                </FieldSet>

                <FieldSet legend="Work mode">
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    {(
                      [
                        ["onsite", "On-site"],
                        ["hybrid", "Hybrid"],
                        ["remote", "Remote"],
                      ] as const
                    ).map(([value, label]) => (
                      <RadioCard
                        key={value}
                        name="workMode"
                        value={value}
                        checked={draft.workMode === value}
                        onChange={() => set("workMode", value)}
                        label={label}
                      />
                    ))}
                  </div>
                </FieldSet>
              </>
            )}

            {stepper.index === 1 && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Band minimum"
                    required
                    help="Gross monthly, in naira."
                  >
                    <Input
                      inputMode="numeric"
                      value={draft.salaryMin}
                      onChange={(e) => set("salaryMin", e.currentTarget.value)}
                      placeholder="1,200,000"
                    />
                  </Field>
                  <Field
                    label="Band maximum"
                    required
                    error={bandInvalid ? "Maximum must be higher than minimum." : undefined}
                  >
                    <Input
                      inputMode="numeric"
                      value={draft.salaryMax}
                      onChange={(e) => set("salaryMax", e.currentTarget.value)}
                      placeholder="1,800,000"
                    />
                  </Field>
                </div>

                {min > 0 && max > 0 && !bandInvalid && (
                  <Callout tone="info" title="Annual cost estimate">
                    At the midpoint, one hire costs about{" "}
                    <Money amount={((min + max) / 2) * 12} className="font-medium" />{" "}
                    per year in gross salary, before employer pension.
                  </Callout>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Number of openings" required>
                    <Input
                      type="number"
                      min={1}
                      value={draft.openings}
                      onChange={(e) =>
                        set("openings", Math.max(1, Number(e.currentTarget.value)))
                      }
                    />
                  </Field>
                  <Field label="Target start date" help="When you need them in seat.">
                    <Input
                      type="date"
                      value={draft.targetStartDate}
                      onChange={(e) => set("targetStartDate", e.currentTarget.value)}
                    />
                  </Field>
                </div>
              </>
            )}

            {stepper.index === 2 && (
              <>
                <FieldSet
                  legend="Pipeline stages"
                  help="Turn off any stage this role does not need. Sourcing and selection cannot be removed."
                >
                  <div className="flex flex-col gap-2.5">
                    {STAGES.map((s) => {
                      const locked = LOCKED_STAGES.includes(s.id);
                      const on = draft.activeStages.includes(s.id);
                      return (
                        <div
                          key={s.id}
                          className={cn(
                            "rounded-lg border p-3 transition-colors",
                            on ? "border-accent-line bg-accent-soft" : "border-line",
                          )}
                        >
                          <Checkbox
                            label={s.label}
                            description={s.blurb}
                            checked={on}
                            disabled={locked}
                            onChange={(e) => {
                              const next = e.currentTarget.checked
                                ? [...draft.activeStages, s.id]
                                : draft.activeStages.filter((x) => x !== s.id);
                              set(
                                "activeStages",
                                STAGES.filter((x) => next.includes(x.id)).map(
                                  (x) => x.id,
                                ) as StageId[],
                              );
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </FieldSet>

                <ListBuilder
                  legend="Must have"
                  help="A candidate without these is rejected at shortlisting."
                  values={draft.mustHaves}
                  onChange={(v) => set("mustHaves", v)}
                  placeholder="5+ years building production APIs"
                />

                <ListBuilder
                  legend="Nice to have"
                  values={draft.niceToHaves}
                  onChange={(v) => set("niceToHaves", v)}
                  placeholder="Fintech or payroll domain"
                />

                <FieldSet
                  legend="Screening questions"
                  help="Asked at pre-screening. Knockout questions auto-flag a failing answer."
                >
                  <div className="flex flex-col gap-2.5">
                    {draft.screeningQuestions.map((q, i) => (
                      <div key={q.id} className="flex items-start gap-2">
                        <div className="flex-1">
                          <Input
                            value={q.question}
                            placeholder="Do you have the right to work in Nigeria?"
                            onChange={(e) => {
                              const next = [...draft.screeningQuestions];
                              next[i] = { ...q, question: e.currentTarget.value };
                              set("screeningQuestions", next);
                            }}
                          />
                          <div className="mt-1.5">
                            <Checkbox
                              label="Knockout question"
                              checked={q.knockout}
                              onChange={(e) => {
                                const next = [...draft.screeningQuestions];
                                next[i] = { ...q, knockout: e.currentTarget.checked };
                                set("screeningQuestions", next);
                              }}
                            />
                          </div>
                        </div>
                        <IconButton
                          label={`Remove question ${i + 1}`}
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            set(
                              "screeningQuestions",
                              draft.screeningQuestions.filter((x) => x.id !== q.id),
                            )
                          }
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </IconButton>
                      </div>
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="self-start"
                      onClick={() =>
                        set("screeningQuestions", [
                          ...draft.screeningQuestions,
                          {
                            id: `q${draft.screeningQuestions.length + 1}`,
                            question: "",
                            knockout: false,
                          },
                        ])
                      }
                    >
                      <Plus aria-hidden="true" className="size-4" />
                      Add question
                    </Button>
                  </div>
                </FieldSet>
              </>
            )}

            {stepper.index === 3 && (
              <>
                <Field
                  label="Hiring manager"
                  required
                  help="Approves the requisition and makes the final call."
                >
                  <Select
                    value={draft.hiringManagerId}
                    onChange={(e) => set("hiringManagerId", e.currentTarget.value)}
                    placeholder="Select a hiring manager"
                  >
                    {EMPLOYEES.map((e) => (
                      <option key={e.id} value={e.id}>
                        {fullName(e)} — {e.jobTitle}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Recruiter" required help="Runs the pipeline day to day.">
                  <Select
                    value={draft.recruiterId}
                    onChange={(e) => set("recruiterId", e.currentTarget.value)}
                  >
                    {EMPLOYEES.map((e) => (
                      <option key={e.id} value={e.id}>
                        {fullName(e)} — {e.jobTitle}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Note for approvers"
                  help="Why this role, why now. Shown in the approval request."
                >
                  <Textarea
                    rows={3}
                    value={draft.notes}
                    onChange={(e) => set("notes", e.currentTarget.value)}
                    placeholder="Backfill for Chidi, who moves to the platform team in September."
                  />
                </Field>
              </>
            )}

            {stepper.index === 4 && (
              <div className="flex flex-col gap-5">
                <Callout tone="accent" title="This goes to the hiring manager for approval">
                  Nothing is published until they approve. You can keep editing
                  while it is pending.
                </Callout>

                <ReviewBlock
                  title="Role"
                  onEdit={() => stepper.goTo(0)}
                  rows={[
                    ["Title", draft.title || "—"],
                    ["Department", draft.department || "—"],
                    ["Location", draft.location || "—"],
                    [
                      "Type",
                      `${draft.employmentType.replace("_", " ")} · ${draft.workMode}`,
                    ],
                  ]}
                />
                <ReviewBlock
                  title="Compensation"
                  onEdit={() => stepper.goTo(1)}
                  rows={[
                    [
                      "Band",
                      min && max ? (
                        <>
                          <Money amount={min} /> – <Money amount={max} />
                        </>
                      ) : (
                        "—"
                      ),
                    ],
                    ["Openings", String(draft.openings)],
                    ["Target start", draft.targetStartDate || "—"],
                  ]}
                />
                <ReviewBlock
                  title="Process"
                  onEdit={() => stepper.goTo(2)}
                  rows={[
                    [
                      "Stages",
                      STAGES.filter((s) => draft.activeStages.includes(s.id))
                        .map((s) => s.label)
                        .join(" → "),
                    ],
                    [
                      "Must haves",
                      String(draft.mustHaves.filter(Boolean).length),
                    ],
                    [
                      "Screening questions",
                      String(draft.screeningQuestions.filter((q) => q.question).length),
                    ],
                  ]}
                />
                <ReviewBlock
                  title="Hiring team"
                  onEdit={() => stepper.goTo(3)}
                  rows={[
                    [
                      "Hiring manager",
                      EMPLOYEES.find((e) => e.id === draft.hiringManagerId)
                        ? fullName(EMPLOYEES.find((e) => e.id === draft.hiringManagerId)!)
                        : "—",
                    ],
                    [
                      "Recruiter",
                      EMPLOYEES.find((e) => e.id === draft.recruiterId)
                        ? fullName(EMPLOYEES.find((e) => e.id === draft.recruiterId)!)
                        : "—",
                    ],
                  ]}
                />
              </div>
            )}
          </CardBody>
        </Card>

        {/* Running summary. Makes the final step a confirmation, not a reveal. */}
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <Card>
            <CardBody className="flex flex-col gap-3">
              <h2 className="text-[0.75rem] font-semibold tracking-wide text-muted">
                Summary
              </h2>
              <p className="text-h4 text-ink">
                {draft.title || "Untitled role"}
              </p>
              <p className="text-[0.875rem] text-body">
                {[draft.department, draft.location].filter(Boolean).join(" · ") ||
                  "Department and location not set"}
              </p>

              {min > 0 && max > 0 && !bandInvalid && (
                <p className="tabular text-[0.875rem] font-medium text-ink">
                  <Money amount={min} compact /> – <Money amount={max} compact />
                  <span className="font-normal text-muted"> gross monthly</span>
                </p>
              )}

              <div className="border-t border-line pt-3">
                <p className="mb-1.5 text-[0.75rem] uppercase tracking-wide text-faint">
                  Pipeline
                </p>
                <ol className="flex flex-col gap-1">
                  {STAGES.filter((s) => draft.activeStages.includes(s.id)).map(
                    (s, i) => (
                      <li
                        key={s.id}
                        className="flex items-center gap-2 text-[0.75rem] text-body"
                      >
                        <span className="tabular flex size-4 shrink-0 items-center justify-center rounded-full bg-sunken text-[0.75rem] font-semibold text-muted">
                          {i + 1}
                        </span>
                        {s.label}
                      </li>
                    ),
                  )}
                </ol>
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>

      {/* Actions never scroll out of reach. */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface px-1 py-3">
        <Button variant="ghost" onClick={() => router.push("/hiring")}>
          Save &amp; exit
        </Button>
        <div className="flex items-center gap-2">
          {!stepper.isFirst && (
            <Button variant="secondary" onClick={stepper.back}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </Button>
          )}
          {stepper.isLast ? (
            <Button variant="approve" onClick={submit} loading={busy}>
              {!busy && <Check aria-hidden="true" className="size-4" />}
              Send for approval
            </Button>
          ) : (
            <Button
              variant="accent"
              onClick={stepper.next}
              disabled={!canContinue}
            >
              Continue
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ListBuilder({
  legend,
  help,
  values,
  onChange,
  placeholder,
}: {
  legend: string;
  help?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  return (
    <FieldSet legend={legend} help={help}>
      <div className="flex flex-col gap-2">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={v}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.currentTarget.value;
                onChange(next);
              }}
            />
            {values.length > 1 && (
              <IconButton
                label={`Remove item ${i + 1}`}
                variant="ghost"
                size="sm"
                onClick={() => onChange(values.filter((_, x) => x !== i))}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            )}
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => onChange([...values, ""])}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add
        </Button>
      </div>
    </FieldSet>
  );
}

function ReviewBlock({
  title,
  rows,
  onEdit,
}: {
  title: string;
  rows: [string, React.ReactNode][];
  onEdit: () => void;
}) {
  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
        <h3 className="text-[0.875rem] font-semibold text-ink">{title}</h3>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <dl className="divide-y divide-line">
        {rows.map(([term, value]) => (
          <div
            key={term}
            className="flex items-baseline justify-between gap-4 px-3.5 py-2.5"
          >
            <dt className="text-[0.75rem] text-muted">{term}</dt>
            <dd className="min-w-0 text-right text-[0.875rem] text-ink">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
