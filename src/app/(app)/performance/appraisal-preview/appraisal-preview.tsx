"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Checkbox,
  Field,
  RatingLegend,
  RatingScale,
  Textarea,
} from "@/components/ui";
import { WizardShell } from "@/components/performance/wizard-shell";
import { ratingWords } from "@/lib/api/performance";

/**
 * A mock-up of the employee's appraisal as steps (owner request, 24 Nov 2026).
 *
 * Real components, example answers, nothing sent or saved. One screen per
 * step with a progress bar ("Step 2 of 4"): the questions, then Core,
 * Behavioural and (for people who manage somebody) Leadership competencies,
 * then Review and submit. Employees rate their own competencies; their manager
 * sees both side by side. Self ratings do not count towards the score unless a
 * company weights Self-assessment. Each step is kept as you go, so it can be
 * left and resumed.
 */

const LEVELS = [1, 2, 3, 4, 5].map((level) => ({
  level,
  label: ratingWords(level) ?? String(level),
}));

type Competency = { id: string; name: string; about: string };
type Group = {
  id: "core" | "behavioural" | "leadership";
  title: string;
  items: Competency[];
};

const QUESTIONS = [
  "What are you most proud of this period?",
  "What got in the way, and what would help?",
];

const GROUPS: Group[] = [
  {
    id: "core",
    title: "Core competencies",
    items: [
      {
        id: "c1",
        name: "Quality of work",
        about: "Accurate, complete, on time.",
      },
      {
        id: "c2",
        name: "Knowing the job",
        about: "Understands what the role needs.",
      },
      {
        id: "c3",
        name: "Teamwork",
        about: "Helps others and shares what they know.",
      },
    ],
  },
  {
    id: "behavioural",
    title: "Behavioural competencies",
    items: [
      { id: "b1", name: "Communication", about: "Clear, timely, respectful." },
      { id: "b2", name: "Initiative", about: "Acts without being asked." },
    ],
  },
  {
    id: "leadership",
    title: "Leadership",
    items: [
      {
        id: "l1",
        name: "Developing people",
        about: "Coaches and gives feedback.",
      },
      {
        id: "l2",
        name: "Making decisions",
        about: "Decides, explains, owns it.",
      },
    ],
  },
];

export function AppraisalPreview() {
  const router = useRouter();
  const [manages, setManages] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(["", ""]);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [sent, setSent] = useState(false);

  const groups = GROUPS.filter((group) => group.id !== "leadership" || manages);
  /* questions, each group, then review */
  const total = groups.length + 2;
  const at = Math.min(step, total - 1);
  const group = at >= 1 && at <= groups.length ? groups[at - 1] : undefined;
  const review = at === total - 1;

  const unrated = (g: Group) => g.items.filter((item) => !levels[item.id]);
  const needs = group ? unrated(group).length : 0;

  const title = review
    ? "Review and submit"
    : group
      ? group.title
      : "Answer the questions";

  return (
    <WizardShell
      open
      onClose={() => router.push("/performance")}
      step={at}
      total={total}
      title={sent ? "Sent" : title}
      {...(at > 0 && !sent ? { onBack: () => setStep(at - 1) } : {})}
      onNext={() => (review ? setSent(true) : setStep(at + 1))}
      nextLabel={review ? "Submit" : "Continue"}
      canNext={needs === 0}
      done={
        sent ? (
          <div className="flex flex-col items-start gap-3">
            <h1 className="text-h2 font-semibold text-ink">
              Your self review is with your manager
            </h1>
            <p className="text-body-sm text-muted">
              This is a preview, so nothing was sent.
            </p>
          </div>
        ) : undefined
      }
    >
      <p className="text-body-sm text-muted">
        Preview with example answers. Saved as you go, so you can leave and come
        back.
      </p>
      <Checkbox
        label="I manage people (adds the Leadership step)"
        checked={manages}
        onChange={(event) => setManages(event.target.checked)}
      />

      {at === 0 &&
        QUESTIONS.map((question, index) => (
          <Field key={question} label={question}>
            <Textarea
              rows={3}
              value={answers[index] ?? ""}
              onChange={(event) => {
                const next = [...answers];
                next[index] = event.target.value;
                setAnswers(next);
              }}
            />
          </Field>
        ))}

      {group && (
        <div className="flex flex-col gap-5">
          <RatingLegend levels={LEVELS} />
          <p className="text-body-sm text-muted">
            Rate yourself on each. Your manager rates you too and sees both side
            by side.
          </p>
          {group.items.map((item) => (
            <fieldset key={item.id} className="flex flex-col gap-2">
              <legend className="text-body-md font-medium text-ink">
                {item.name}
              </legend>
              <p className="text-body-sm text-muted">{item.about}</p>
              <RatingScale
                name={item.id}
                label={item.name}
                legend={false}
                levels={LEVELS}
                value={levels[item.id] ?? null}
                onChange={(level) => setLevels({ ...levels, [item.id]: level })}
              />
            </fieldset>
          ))}
        </div>
      )}

      {review && (
        <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
          <div className="px-4 py-3 text-body-sm">
            <dt className="text-muted">Questions answered</dt>
            <dd className="text-ink">
              {answers.filter((a) => a.trim()).length} of {QUESTIONS.length}
            </dd>
          </div>
          {groups.map((g) => (
            <div key={g.id} className="px-4 py-3 text-body-sm">
              <dt className="text-muted">{g.title}</dt>
              <dd className="text-ink">
                {g.items.length - unrated(g).length} of {g.items.length} rated
              </dd>
            </div>
          ))}
        </dl>
      )}
    </WizardShell>
  );
}
