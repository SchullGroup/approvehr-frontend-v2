"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  Checkbox,
  EmptyState,
  Field,
  FieldSet,
  IconButton,
  Input,
  Modal,
  Money,
  Picker,
  RadioCard,
  Select,
  Skeleton,
  StepIndicator,
  Switch,
  Textarea,
  TextLink,
  useStepper,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { FormBuilder } from "@/components/hiring/form-builder";
import { FormPreview } from "@/components/hiring/form-preview";
import { SourceBadge } from "@/components/hiring/source-badge";
import { careersApi } from "@/lib/api/careers";
import { ApiError } from "@/lib/api/client";
import { putBodyFromDefinition } from "@/lib/hiring/form-wire";
import { useTemplates } from "@/lib/hiring/pipeline/use-pipeline";
import {
  defaultDefinition,
  validateDefinition,
  type FormDefinition,
} from "@/lib/marketing/apply-form";
import { useCareersSettings } from "@/lib/store/careers-form";
import { kobo } from "@/lib/api/recruitment";
import { usePermissions } from "@/lib/permissions";
import { useAdvertCreation } from "@/lib/store/hiring";
import {
  useRequisitionMutations,
  useStageMutations,
} from "@/lib/store/recruitment";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useDepartments } from "@/lib/store/departments";
import { useSession } from "@/lib/store/session";
import { STAGES, fullName, type StageId } from "@/lib/types";

const BREADCRUMB = [
  { href: "/hiring", label: "Hiring" },
  { href: "/hiring/requisitions/new", label: "New requisition" },
];

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
  departmentId: string;
  /** The department's name, kept in sync with `departmentId` — see `setDepartment`
   *  below. This is what the advert copy sentences actually read, since they are
   *  words for a candidate rather than a foreign key. */
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
  /** The pipeline template the role copies. Empty: the company's default. */
  templateId: string;
  /** The advert's application form: standard boxes and the screening questions. */
  form: FormDefinition;
  hiringManagerId: string;
  recruiterId: string;
  notes: string;
  /** A confidential search: only the people on its list can see its applicants. */
  restricted: boolean;
};

const EMPTY: Draft = {
  title: "",
  departmentId: "",
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
  activeStages: [
    "sourced",
    "shortlisted",
    "prescreen",
    "interview",
    "selection",
  ],
  templateId: "",
  form: defaultDefinition(),
  hiringManagerId: "",
  recruiterId: "",
  notes: "",
  restricted: false,
};

const LOCKED_STAGES: StageId[] = ["sourced", "selection"];

/** The wizard's own words for an employment type, and the API's. */
const ADVERT_TYPE = {
  full_time: "FULL_TIME",
  contract: "CONTRACT",
  internship: "INTERN",
} as const;

/**
 * The advert this draft can actually become.
 *
 * The parts of a role that belong to the requisition — the pipeline stages and
 * the hiring manager — are written to it by `submit` when connected. The note for
 * approvers is collected and sent nowhere: nothing in the API stores it. What an
 * advert carries is the job itself, so that is what gets written, as a draft, and
 * then its application form — the screening questions — is saved onto it.
 * Publishing is a separate press on the adverts screen, because that is the
 * moment the words go public.
 *
 * Composing the description here rather than in `lib/api/hiring.ts` is
 * deliberate: this is presentation — the shape of a job advert — and the next
 * person to rewrite the house style should find it beside the form that collects
 * it, not behind the money boundary.
 */
function advertText(draft: Draft): { summary: string; description: string } {
  const musts = draft.mustHaves.filter((line) => line.trim() !== "");
  const nices = draft.niceToHaves.filter((line) => line.trim() !== "");
  const where = draft.location.trim();

  const summary = [
    draft.title,
    draft.department ? `in ${draft.department}` : "",
    where ? `· ${where}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const description = [
    `We are hiring ${draft.openings === 1 ? "one" : draft.openings} for this role${draft.department ? ` in ${draft.department}` : ""}, reporting into the hiring manager.`,
    ...(musts.length > 0
      ? ["", "What you need:", ...musts.map((line) => `- ${line}`)]
      : []),
    ...(nices.length > 0
      ? ["", "Nice to have:", ...nices.map((line) => `- ${line}`)]
      : []),
    ...(draft.targetStartDate
      ? ["", `We would like you to start around ${draft.targetStartDate}.`]
      : []),
  ].join("\n");

  return { summary: summary || draft.title, description };
}

/**
 * Gated, like every sibling hiring screen.
 *
 * Step four picks a hiring manager and a recruiter from the **full employee
 * roster**, and the backend write this wizard eventually calls needs
 * `MANAGE_HIRING` on its own — so letting the form itself render for anybody
 * without it would make a five-step wizard discoverable and fillable by
 * somebody who can only ever get a 403 at the end. See `candidate-screen.tsx`
 * for the pattern this copies.
 */
export function RequisitionWizard() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader breadcrumb={BREADCRUMB} title="Open a new role" />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading this form</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader breadcrumb={BREADCRUMB} title="Open a new role" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot open a new role"
              description="Opening a role sets its salary band and picks a hiring team from the full employee roster, so it is kept to whoever hires. Ask whoever manages access to add hiring to your role."
              action={
                <ButtonLink href="/hiring" variant="secondary" size="sm">
                  Back to hiring
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader breadcrumb={BREADCRUMB} title="Open a new role" />
      <PageBody>
        <Wizard />
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Wizard() {
  const router = useRouter();
  const toast = useToast();
  const adverts = useAdvertCreation();
  const { isConnected } = useSession();
  const requisitions = useRequisitionMutations();
  const stages = useStageMutations();
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const departments = useDepartments();
  const templates = useTemplates();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  /* A company with templates picks one; one without (an older API, or none made
     yet) is offered the five fixed stages it always had. */
  const chosenTemplate =
    templates.items.length > 0
      ? (templates.items.find((t) => t.id === draft.templateId) ??
        templates.items.find((t) => t.isDefault) ??
        templates.items[0] ??
        null)
      : null;
  const [busy, setBusy] = useState(false);
  const careers = useCareersSettings();
  const [previewing, setPreviewing] = useState(false);
  const [showFormProblems, setShowFormProblems] = useState(false);
  const filesAvailable = careers.settings?.deployment.fileUploads ?? true;
  const formProblems = validateDefinition(draft.form);
  const formValid =
    Object.keys(formProblems.questions).length === 0 &&
    formProblems.form === null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /* `departmentId` is what gets sent to the API; `department` is the name the
     advert copy sentences read. Kept in sync here rather than re-derived at
     every call site, so the four places that already thread `department`
     through as a plain string need no change. */
  const setDepartment = (id: string) => {
    const name = departments.flat.find((d) => d.id === id)?.name ?? "";
    setDraft((d) => ({ ...d, departmentId: id, department: name }));
  };

  const min = Number(draft.salaryMin.replace(/\D/g, "")) || 0;
  const max = Number(draft.salaryMax.replace(/\D/g, "")) || 0;
  const bandInvalid = min > 0 && max > 0 && min > max;

  /* A company without Core HR has no departments and no staff list: it hires with
     recruitment alone. Neither is asked for where there is nothing to choose from,
     because a required box with no options is a wizard that cannot be finished. The
     people who will hire are invited to the role afterwards, by email. */
  const noDepartments =
    isConnected && !departments.loading && departments.flat.length === 0;
  const noStaff =
    isConnected && !directory.loading && directory.employees.length === 0;

  const complete = {
    role: Boolean(
      draft.title && (draft.departmentId || noDepartments) && draft.location,
    ),
    pay: min > 0 && max > 0 && !bandInvalid,
    process:
      (chosenTemplate !== null || draft.activeStages.length >= 2) && formValid,
    team: noStaff || Boolean(draft.hiringManagerId && draft.recruiterId),
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
  const doneFlags = [
    complete.role,
    complete.pay,
    complete.process,
    complete.team,
    false,
  ];
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

  /**
   * Save the role.
   *
   * Connected, this now writes a real `Requisition` first — with a stage per
   * active pipeline step, in order, the Interview stage requiring scorecards
   * — and links the advert to it, so `careersApi.advance()` has somewhere
   * real to screen a candidate into. Disconnected, only the advert half ever
   * existed; the requisition, its stages, and the hiring team are collected
   * and shown on the review step but sent nowhere, same as before.
   */
  async function submit() {
    setBusy(true);
    const { summary, description } = advertText(draft);
    /* The requisition keeps the yes-or-no questions as the role's own screening
       questions, and the API copies them onto the draft advert it is linked to.
       The form saved onto the advert afterwards replaces that copy with the whole
       form as built here, so nothing is asked twice; if that second write fails,
       the copy is what the advert still carries. */
    const screening = draft.form.questions
      .filter((q) => q.kind === "YES_NO" && q.label.trim() !== "")
      .slice(0, 10)
      .map((q) => ({
        id: q.id,
        question: q.label.trim(),
        knockout: q.knockout,
      }));
    try {
      let requisitionId: string | undefined;

      if (isConnected) {
        const requisition = await requisitions.create({
          jobTitle: draft.title,
          employmentType: ADVERT_TYPE[draft.employmentType],
          headcount: draft.openings,
          ...(draft.location.trim() ? { location: draft.location.trim() } : {}),
          ...(min > 0 ? { bandMinKobo: kobo(min) } : {}),
          ...(max > 0 ? { bandMaxKobo: kobo(max) } : {}),
          description,
          ...(draft.departmentId ? { departmentId: draft.departmentId } : {}),
          ...(draft.hiringManagerId
            ? { hiringManagerId: draft.hiringManagerId }
            : {}),
          ...(screening.length > 0 ? { screeningQuestions: screening } : {}),
          /* Restricted in the same request, with the person making it put on the
             list, so a confidential search is never open for a moment. */
          ...(draft.restricted ? { restricted: true } : {}),
          /* The API copies the template's stages onto the role, so none are
             made one at a time here. */
          ...(chosenTemplate ? { pipelineTemplateId: chosenTemplate.id } : {}),
        });
        requisitionId = requisition.id;

        if (!chosenTemplate) {
          const active = STAGES.filter((s) =>
            draft.activeStages.includes(s.id),
          );
          for (const [index, s] of active.entries()) {
            await stages.create(requisition.id, {
              name: s.label,
              order: index,
              requiresScorecards: s.id === "interview",
            });
          }
        }
      }

      const created = await adverts.create({
        title: draft.title,
        summary,
        description,
        employmentType: ADVERT_TYPE[draft.employmentType],
        showSalary: true,
        ...(draft.location.trim() ? { location: draft.location.trim() } : {}),
        ...(min > 0 ? { salaryMin: min } : {}),
        ...(max > 0 ? { salaryMax: max } : {}),
        ...(requisitionId ? { requisitionId } : {}),
      });

      /* The form goes onto the advert once it exists. An untouched form is the
         API's own default already, so it is not sent. If this write fails the
         role and the advert are real and stay: say so, and send them to the
         advert, where the form can be set up again. */
      let formSaved = true;
      if (isConnected && !isDefaultForm(draft.form)) {
        try {
          await careersApi.putForm(
            created.id,
            putBodyFromDefinition(draft.form),
          );
        } catch (error) {
          formSaved = false;
          toast.push({
            title: "The advert was saved, its form was not",
            tone: "warning",
            detail:
              (error instanceof ApiError ? `${error.message} ` : "") +
              "Open the advert to set the questions up again.",
          });
        }
      }

      if (!formSaved) {
        router.push(`/hiring/postings/${created.id}`);
      } else if (requisitionId) {
        toast.push({
          title: `${draft.title} opened`,
          tone: "success",
          detail:
            "The role, its pipeline, its draft advert and the advert's form are all real. Publish the advert when you are ready.",
        });
        router.push(`/hiring/requisitions/${requisitionId}`);
      } else {
        toast.push({
          title: `${created.title} saved as a draft advert`,
          tone: "success",
          detail: "Publish it when you are ready and candidates can apply.",
        });
        router.push("/hiring/postings");
      }
    } catch (error) {
      toast.push({
        title: "Not saved",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
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
                <Field
                  label="Job title"
                  required
                  help="What a candidate would search for."
                >
                  <Input
                    value={draft.title}
                    onChange={(e) => set("title", e.currentTarget.value)}
                    placeholder="Senior Backend Engineer"
                    autoFocus
                  />
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Department"
                    required={!noDepartments}
                    {...(noDepartments
                      ? {
                          help: "Your company has no departments set up, so there is nothing to choose. Leave this blank.",
                        }
                      : departments.error
                        ? {
                            help: `${departments.error.message} Departments are unavailable.`,
                          }
                        : {})}
                  >
                    <Picker
                      value={draft.departmentId}
                      onChange={setDepartment}
                      placeholder="Select a department"
                      loading={departments.loading}
                      options={departments.flat.map((d) => ({
                        value: d.id,
                        label: d.name,
                      }))}
                    />
                  </Field>

                  <Field label="Location" required>
                    <Select
                      value={draft.location}
                      onChange={(e) => set("location", e.currentTarget.value)}
                      placeholder="Select a location"
                    >
                      {[
                        "Lagos, NG",
                        "Abuja, NG",
                        "Port Harcourt, NG",
                        "Remote, NG",
                      ].map((l) => (
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
                    error={
                      bandInvalid
                        ? "Maximum must be higher than minimum."
                        : undefined
                    }
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
                    <Money
                      amount={((min + max) / 2) * 12}
                      className="font-medium"
                    />{" "}
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
                        set(
                          "openings",
                          Math.max(1, Number(e.currentTarget.value)),
                        )
                      }
                    />
                  </Field>
                  <Field
                    label="Target start date"
                    help="When you need them in seat."
                  >
                    <Input
                      type="date"
                      value={draft.targetStartDate}
                      onChange={(e) =>
                        set("targetStartDate", e.currentTarget.value)
                      }
                    />
                  </Field>
                </div>
              </>
            )}

            {stepper.index === 2 && (
              <>
                {chosenTemplate ? (
                  <FieldSet
                    legend="Pipeline"
                    help="The role copies this pipeline when it is created. You can change the role's own stages afterwards, and changing the template later does not change this role."
                  >
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {templates.items.map((template) => (
                        <RadioCard
                          key={template.id}
                          name="pipeline-template"
                          label={
                            template.isDefault
                              ? `${template.name} (default)`
                              : template.name
                          }
                          description={template.stages
                            .map((stage) => stage.name)
                            .join(" → ")}
                          checked={chosenTemplate.id === template.id}
                          onChange={() => set("templateId", template.id)}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-meta text-muted">
                      Templates are made in{" "}
                      <TextLink href="/hiring/settings/pipelines">
                        Hiring settings
                      </TextLink>
                      .
                    </p>
                  </FieldSet>
                ) : (
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
                              on
                                ? "border-accent-line bg-accent-soft"
                                : "border-line",
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
                                  : draft.activeStages.filter(
                                      (x) => x !== s.id,
                                    );
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
                )}

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
                  legend="The application form"
                  help="What applicants are asked when they apply. Questions marked as a knockout flag the application for a person to review. Nobody is rejected by one."
                >
                  <div className="flex flex-col gap-3">
                    <FormBuilder
                      value={draft.form}
                      onChange={(form) => set("form", form)}
                      problems={showFormProblems ? formProblems.questions : {}}
                      formProblem={showFormProblems ? formProblems.form : null}
                      filesAvailable={filesAvailable}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="self-start"
                      onClick={() => setPreviewing(true)}
                    >
                      <Eye aria-hidden="true" className="size-4" />
                      Preview the form
                    </Button>
                  </div>
                </FieldSet>
              </>
            )}

            {stepper.index === 3 && (
              <>
                {noStaff ? (
                  <Callout
                    tone="info"
                    title="There is no staff list to choose from"
                  >
                    The hiring manager and the recruiter are chosen from your
                    staff, and your company has none on file. Make the role now,
                    then invite the people who will hire for it, by email, under
                    Who can see this job on the role&apos;s page.
                  </Callout>
                ) : (
                  <>
                    <Field
                      label="Hiring manager"
                      required
                      help="Approves the requisition and makes the final call."
                    >
                      <Select
                        value={draft.hiringManagerId}
                        onChange={(e) =>
                          set("hiringManagerId", e.currentTarget.value)
                        }
                        placeholder="Select a hiring manager"
                      >
                        {directory.employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {fullName(e)} — {e.jobTitle}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field
                      label="Recruiter"
                      required
                      help="Runs the pipeline day to day."
                    >
                      <Select
                        value={draft.recruiterId}
                        onChange={(e) =>
                          set("recruiterId", e.currentTarget.value)
                        }
                        placeholder="Select a recruiter"
                      >
                        {directory.employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {fullName(e)} — {e.jobTitle}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </>
                )}

                {isConnected && (
                  <Switch
                    label="Confidential search"
                    description="On: only the people you add to this job, its hiring manager and whoever holds the Restricted jobs permission can see this job, and everybody else is not told it exists. You are added, so you keep access. Off: everybody who can see applicants in Hiring can. You can change it later under Who can see this job."
                    checked={draft.restricted}
                    onChange={(e) => set("restricted", e.target.checked)}
                  />
                )}

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
                <div className="flex flex-col gap-2">
                  <SourceBadge live={adverts.editable} />
                  {isConnected ? (
                    <p className="text-body-sm text-body">
                      This saves a real <strong>requisition</strong> — title,
                      location, type, pay range, department, hiring manager and
                      its pipeline stages — plus a <strong>draft advert</strong>{" "}
                      with its application form. Nothing is public until you
                      publish it. The note for approvers stays on this screen;
                      there is no field for it yet.
                    </p>
                  ) : (
                    <p className="text-body-sm text-body">
                      This saves the job (title, location, type, pay range and
                      the text below) as a <strong>draft advert</strong>.
                      Nothing is public until you publish it. Stages, the hiring
                      team and the application form all need a connected company
                      to save; there is nowhere to put them offline.
                    </p>
                  )}
                </div>

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
                          <Money amount={min} decimals /> –{" "}
                          <Money amount={max} decimals />
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
                      chosenTemplate
                        ? `${chosenTemplate.name}: ${chosenTemplate.stages
                            .map((stage) => stage.name)
                            .join(" → ")}`
                        : STAGES.filter((s) =>
                            draft.activeStages.includes(s.id),
                          )
                            .map((s) => s.label)
                            .join(" → "),
                    ],
                    [
                      "Must haves",
                      String(draft.mustHaves.filter(Boolean).length),
                    ],
                    ["Form questions", String(draft.form.questions.length)],
                  ]}
                />
                <ReviewBlock
                  title="Hiring team"
                  onEdit={() => stepper.goTo(3)}
                  rows={[
                    [
                      "Hiring manager",
                      directory.employees.find(
                        (e) => e.id === draft.hiringManagerId,
                      )
                        ? fullName(
                            directory.employees.find(
                              (e) => e.id === draft.hiringManagerId,
                            )!,
                          )
                        : "—",
                    ],
                    [
                      "Recruiter",
                      directory.employees.find(
                        (e) => e.id === draft.recruiterId,
                      )
                        ? fullName(
                            directory.employees.find(
                              (e) => e.id === draft.recruiterId,
                            )!,
                          )
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
              <h2 className="text-meta font-semibold text-muted">Summary</h2>
              <p className="text-h4 text-ink">
                {draft.title || "Untitled role"}
              </p>
              <p className="text-body-sm text-body">
                {[draft.department, draft.location]
                  .filter(Boolean)
                  .join(" · ") || "Department and location not set"}
              </p>

              {min > 0 && max > 0 && !bandInvalid && (
                <p className="tabular text-body-sm font-medium text-ink">
                  <Money amount={min} decimals /> –{" "}
                  <Money amount={max} decimals />
                  <span className="font-normal text-muted"> gross monthly</span>
                </p>
              )}

              <div className="border-t border-line pt-3">
                <p className="mb-1.5 text-meta text-faint">Pipeline</p>
                <ol className="flex flex-col gap-1">
                  {(chosenTemplate
                    ? chosenTemplate.stages.map((stage) => ({
                        id: stage.id,
                        label: stage.name,
                      }))
                    : STAGES.filter((s) =>
                        draft.activeStages.includes(s.id),
                      ).map((s) => ({ id: s.id, label: s.label }))
                  ).map((stage, i) => (
                    <li
                      key={stage.id}
                      className="flex items-center gap-2 text-meta text-body"
                    >
                      <span className="tabular flex size-4 shrink-0 items-center justify-center rounded-full bg-sunken text-meta font-semibold text-muted">
                        {i + 1}
                      </span>
                      {stage.label}
                    </li>
                  ))}
                </ol>
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>

      <Modal
        open={previewing}
        onClose={() => setPreviewing(false)}
        size="lg"
        title="What an applicant sees"
        description="Nothing you do here is sent or saved."
        footer={
          <Button variant="secondary" onClick={() => setPreviewing(false)}>
            Close
          </Button>
        }
      >
        <FormPreview
          definition={draft.form}
          company={careers.settings?.branding.name ?? "Your company"}
          roleTitle={draft.title}
          filesAvailable={filesAvailable}
        />
      </Modal>

      {/* Actions never scroll out of reach. */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface px-1 py-3">
        {/* It said "Save & exit" and saved nothing. */}
        <Button variant="ghost" onClick={() => router.push("/hiring")}>
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          {!stepper.isFirst && (
            <Button variant="secondary" onClick={stepper.back}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </Button>
          )}
          {stepper.isLast ? (
            <Button
              variant="approve"
              onClick={() => void submit()}
              loading={busy}
            >
              {!busy && <Check aria-hidden="true" className="size-4" />}
              Save as draft advert
            </Button>
          ) : (
            <Button
              variant="accent"
              onClick={() => {
                /* The process step is blocked by an unfinished question, and a
                   disabled button cannot say which. Pressing it marks them. */
                if (stepper.index === 2 && !formValid) {
                  setShowFormProblems(true);
                  return;
                }
                stepper.next();
              }}
              disabled={
                stepper.index === 2
                  ? !(draft.activeStages.length >= 2)
                  : !canContinue
              }
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

/** Has the form been left exactly as the API would start it? */
function isDefaultForm(form: FormDefinition): boolean {
  const base = defaultDefinition();
  return (
    form.questions.length === 0 &&
    form.standard.phone === base.standard.phone &&
    form.standard.cv === base.standard.cv &&
    form.standard.coverNote === base.standard.coverNote
  );
}

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
        <h3 className="text-body-sm font-semibold text-ink">{title}</h3>
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
            <dt className="text-meta text-muted">{term}</dt>
            <dd className="min-w-0 text-right text-body-sm text-ink">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
