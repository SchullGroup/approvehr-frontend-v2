"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Field,
  RatingLegend,
  RatingScale,
  Select,
  Tabs,
  Textarea,
} from "@/components/ui";
import { TeamAppraisals } from "@/components/performance/team-appraisals";
import { ProgressMeter } from "@/components/ui/progress";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { WizardShell } from "@/components/performance/wizard-shell";
import { ratingWords } from "@/lib/api/performance";

/**
 * A mock-up of the manager's side of the appraisal (owner request, 24 Nov
 * 2026): the team list with a progress bar per person and overall, filters,
 * locked rows that say why with a Nudge, then the steps for one person (read
 * their self review, Core with their rating beside the self rating,
 * Behavioural, Leadership, the overall rating and a recommendation, submit),
 * plus a small HR view of the period. Example data; nothing is sent or saved.
 *
 * The manager's step is locked until the person has sent their self review, so
 * the manager reads it first and rates beside it. A locked row says so and
 * offers a reminder.
 */

type Status = "done" | "in-progress" | "ready" | "locked";
type Person = {
  id: string;
  name: string;
  department: string;
  status: Status;
  /** Steps of 6 the manager has finished. */
  steps: number;
  manages: boolean;
};

const PEOPLE: Person[] = [
  {
    id: "p1",
    name: "Team member A",
    department: "Sales",
    status: "done",
    steps: 6,
    manages: false,
  },
  {
    id: "p2",
    name: "Team member B",
    department: "Sales",
    status: "done",
    steps: 6,
    manages: false,
  },
  {
    id: "p3",
    name: "Team member C",
    department: "Finance",
    status: "in-progress",
    steps: 3,
    manages: true,
  },
  {
    id: "p4",
    name: "Team member D",
    department: "Finance",
    status: "ready",
    steps: 0,
    manages: false,
  },
  {
    id: "p5",
    name: "Team member E",
    department: "Operations",
    status: "locked",
    steps: 0,
    manages: false,
  },
  {
    id: "p6",
    name: "Team member F",
    department: "Operations",
    status: "locked",
    steps: 0,
    manages: false,
  },
];

const STATUS_WORDS: Record<Status, string> = {
  done: "Done",
  "in-progress": "In progress",
  ready: "Ready to start",
  locked: "Waiting for their self review",
};

const LEVELS = [1, 2, 3, 4, 5].map((level) => ({
  level,
  label: ratingWords(level) ?? String(level),
}));

const GROUPS = [
  {
    id: "core",
    title: "Core competencies",
    items: ["Quality of work", "Teamwork"],
  },
  {
    id: "behavioural",
    title: "Behavioural competencies",
    items: ["Communication", "Initiative"],
  },
  {
    id: "leadership",
    title: "Leadership",
    items: ["Developing people", "Making decisions"],
  },
];

export function ManagerPreview() {
  const router = useRouter();
  const [open, setOpen] = useState<Person | null>(null);
  const [tab, setTab] = useState("team");

  if (open) return <PersonSteps person={open} onClose={() => setOpen(null)} />;
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title="Appraisals"
        meta={<span>Preview with example data. Nothing is saved.</span>}
      />
      <PageBody className="flex flex-col gap-4">
        <Tabs
          items={[
            { id: "team", label: "My team" },
            { id: "hr", label: "HR view" },
          ]}
          value={tab}
          onChange={setTab}
        >
          {tab === "team" ? (
            <Team onOpen={setOpen} />
          ) : (
            <HrView onBack={() => router.push("/performance")} />
          )}
        </Tabs>
      </PageBody>
    </>
  );
}

function Team({ onOpen }: { onOpen: (person: Person) => void }) {
  return (
    <TeamAppraisals
      people={PEOPLE.map((person) => ({
        id: person.id,
        name: person.name,
        department: person.department,
        status: person.status,
        stepsDone: person.steps,
        stepsTotal: 6,
        lockedReason: "Their self review has not been sent yet.",
      }))}
      onOpen={(row) => {
        const person = PEOPLE.find((one) => one.id === row.id);
        if (person) onOpen(person);
      }}
      onNudge={() => Promise.resolve()}
    />
  );
}

function HrView({ onBack }: { onBack: () => void }) {
  void onBack;
  const rows = [
    { label: "Self reviews", done: 7, total: 9 },
    { label: "Manager reviews", done: 6, total: 9 },
    { label: "Ratings made final", done: 4, total: 9 },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {rows.map((row) => (
        <Card key={row.label} className="p-5">
          <p className="text-body-sm text-muted">{row.label}</p>
          <p className="tabular my-1 text-h3 text-ink">
            {row.done} of {row.total}
          </p>
          <ProgressMeter
            value={row.done}
            max={row.total}
            showValue={false}
            size="sm"
          />
        </Card>
      ))}
    </div>
  );
}

function PersonSteps({
  person,
  onClose,
}: {
  person: Person;
  onClose: () => void;
}) {
  const groups = GROUPS.filter((g) => g.id !== "leadership" || person.manages);
  /* read self review, each group, overall + recommendation, submit */
  const total = groups.length + 3;
  const [step, setStep] = useState(0);
  const [mine, setMine] = useState<Record<string, number>>({});
  const [overall, setOverall] = useState(0);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const group =
    step >= 1 && step <= groups.length ? groups[step - 1] : undefined;
  const isOverall = step === groups.length + 1;
  const isSubmit = step === groups.length + 2;
  const missing = group
    ? group.items.filter((i) => !mine[`${group.id}-${i}`]).length
    : 0;
  const canNext =
    (group ? missing === 0 : true) && (isOverall ? overall > 0 : true);

  const title =
    step === 0
      ? `Read ${person.name}'s self review`
      : group
        ? group.title
        : isOverall
          ? "Overall rating and recommendation"
          : "Review and submit";

  return (
    <WizardShell
      open
      onClose={onClose}
      step={step}
      total={total}
      title={sent ? "Sent" : title}
      {...(step > 0 && !sent ? { onBack: () => setStep(step - 1) } : {})}
      onNext={() => (isSubmit ? setSent(true) : setStep(step + 1))}
      nextLabel={isSubmit ? "Submit" : "Continue"}
      canNext={canNext}
      done={
        sent ? (
          <div className="flex flex-col items-start gap-3">
            <h1 className="text-h2 font-semibold text-ink">
              Your review of {person.name} is sent
            </h1>
            <p className="text-body-sm text-muted">
              This is a preview, so nothing was sent.
            </p>
          </div>
        ) : undefined
      }
    >
      {step === 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 text-body-sm text-body">
          <p className="font-medium text-ink">
            What are you most proud of this period?
          </p>
          <p>Example answer written by the team member.</p>
          <p className="font-medium text-ink">
            What got in the way, and what would help?
          </p>
          <p>Example answer written by the team member.</p>
        </div>
      )}
      {group && (
        <div className="flex flex-col gap-5">
          <RatingLegend levels={LEVELS} />
          {group.items.map((item, index) => {
            const key = `${group.id}-${item}`;
            const theirs = ((index + 2) % 5) + 1;
            return (
              <fieldset key={key} className="flex flex-col gap-2">
                <legend className="text-body-md font-medium text-ink">
                  {item}
                </legend>
                <p className="text-body-sm text-muted">
                  Their own rating: {ratingWords(theirs)}
                </p>
                <RatingScale
                  name={key}
                  label={item}
                  legend={false}
                  levels={LEVELS}
                  value={mine[key] ?? null}
                  onChange={(level) => setMine({ ...mine, [key]: level })}
                />
              </fieldset>
            );
          })}
        </div>
      )}
      {isOverall && (
        <div className="flex flex-col gap-4">
          <RatingScale
            name="overall"
            label="Overall rating"
            levels={LEVELS}
            value={overall || null}
            onChange={setOverall}
          />
          <Field label="Your recommendation">
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
      )}
      {isSubmit && (
        <dl className="divide-y divide-line rounded-lg border border-line bg-surface text-body-sm">
          {groups.map((g) => (
            <div key={g.id} className="px-4 py-3">
              <dt className="text-muted">{g.title}</dt>
              <dd className="text-ink">{g.items.length} rated</dd>
            </div>
          ))}
          <div className="px-4 py-3">
            <dt className="text-muted">Overall rating</dt>
            <dd className="text-ink">{ratingWords(overall)}</dd>
          </div>
        </dl>
      )}
    </WizardShell>
  );
}
