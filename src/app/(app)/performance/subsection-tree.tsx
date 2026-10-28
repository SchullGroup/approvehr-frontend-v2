"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { weightLabel } from "@/lib/api/performance";
import {
  Badge,
  Button,
  Disclosure,
  Field,
  Input,
  Select,
  Spinner,
  Tabs,
} from "@/components/ui";
import type { TabItem } from "@/components/ui";
import { NoticeLine } from "@/components/portal/notice-line";
import type {
  AnswerKind,
  ApiCompetency,
  ApiSection,
  ScoreComponent,
} from "@/lib/api/performance";
import {
  ANSWER_KINDS,
  KIND_BADGE,
  answerKindOf,
  kindOptionLabel,
} from "@/lib/performance/answer-kind";
import { useFrameworkActions } from "@/lib/store/performance";
import type { FrameworkGroup } from "@/lib/store/performance";
import { actionMessage } from "@/lib/use-action";
import { DirectAnswerPanel } from "./direct-answer-panel";
import { CountsTowards } from "./sections-dialog";

/**
 * The company's sections and subsections, and how each subsection is answered.
 *
 * ## Why it lives in the Questions dialog
 *
 * The person writing a period's questions is already deciding, subsection by
 * subsection, how each one is to be answered: by questions the form asks, or
 * directly, by a manager recording a level, a yes or no or a pick under
 * Competency ratings. Making them leave for another screen to say so, and come
 * back, was the complaint. So the two are two tabs on one subsection, and a view
 * of the dialog.
 *
 * What the dialog is *about* and what the tree is about differ, and the tree says
 * so: the questions are this period's, and sections, subsections and how each is
 * answered belong to the company and are shared by every period. `SectionsDialog`
 * is still where a subsection is renamed, moved or archived; this adds the
 * things that dialog has no place for.
 *
 * ## The two tabs are a view switch, never a choice
 *
 * A subsection can be answered directly and also carry questions on the form, and
 * neither affects the other: the mark's competency parts come only from what is
 * recorded on the subsection itself, and a question's answer is never read by the
 * score register. So switching tabs changes what is on screen and nothing that is
 * stored, and both may be fully populated at once.
 *
 * ## Several at a time
 *
 * The add forms stay open after each add, keep the cursor in the name, and clear
 * it, so a company setting up its framework can type ten subsections in a row.
 * A new subsection is not opened for you for the same reason: the next thing
 * somebody wants is the next name, not a panel.
 */

/** A section as a picker or the tree lists it. */
export type SectionOption = {
  id: string;
  name: string;
  /**
   * `null` is a section that is not weighted, never 0%. `undefined` is the API
   * not having said, which is what the framework's own groups carry.
   */
  weightBp: number | null | undefined;
};

/**
 * The sections to list: the API's own list when it has answered, because it
 * carries the order the company chose and what each one is worth, and the
 * framework's groups otherwise, so this still works with no API. A group with no
 * section id is the unfiled bucket, which is not a section.
 */
export function sectionOptionsOf(
  sections: readonly ApiSection[],
  groups: readonly FrameworkGroup[],
): SectionOption[] {
  if (sections.length > 0) {
    return sections.map((section) => ({
      id: section.id,
      name: section.name,
      weightBp: section.weightBp,
    }));
  }
  return groups
    .filter((group) => group.sectionId)
    .map((group) => ({
      id: group.sectionId ?? "",
      name: group.sectionName,
      weightBp: undefined,
    }));
}

/** The one rule for a subsection's name, so every place that makes one says it alike. */
export function subsectionNameProblem(name: string): string | null {
  return name.trim().length < 2 ? "Give it a name." : null;
}

/**
 * What a new subsection is made from.
 *
 * `scaleMax` is required whatever the kind and means nothing for a yes or no and
 * a pick: 5 is the company scale. An absent `answerKind` is a level, which is what
 * a body that never mentions it has always meant, so it is left out rather than
 * sent as `RATING`, and a server that predates kinds never hears the word.
 */
export function newSubsectionBody(input: {
  name: string;
  sectionId: string | null | undefined;
  answerKind?: AnswerKind;
}) {
  return {
    name: input.name.trim(),
    scaleMax: 5,
    ...(input.sectionId ? { sectionId: input.sectionId } : {}),
    ...(input.answerKind && input.answerKind !== "RATING"
      ? { answerKind: input.answerKind }
      : {}),
  };
}

type PanelTab = "direct" | "questions";

/**
 * Which tab a subsection opens on, until somebody chooses.
 *
 * A level-rated subsection that already has questions filed under it is one
 * somebody is working on the questions of; every other is a subsection whose next
 * decision is how it is answered. Derived from what exists, so nothing has to be
 * remembered, and replaced the moment somebody picks a tab themselves.
 */
function defaultTab(competency: ApiCompetency, questions: number): PanelTab {
  return answerKindOf(competency) === "RATING" && questions > 0
    ? "questions"
    : "direct";
}

const NO_PART = "Not weighted";

export function SubsectionTree({
  periodName,
  sections,
  competencies,
  loading,
  questionCounts,
  unfiledQuestionCount,
  editable,
  whyNot,
  selectedId,
  onSelect,
  onChanged,
  renderQuestions,
}: {
  periodName: string;
  sections: readonly SectionOption[];
  competencies: readonly ApiCompetency[];
  /** True until the framework has answered once. */
  loading: boolean;
  /** Questions in this period, by the subsection they are filed under. */
  questionCounts: ReadonlyMap<string, number>;
  /** Questions in this period that are filed under no subsection. */
  unfiledQuestionCount: number;
  /** Connected, and allowed to manage settings. */
  editable: boolean;
  /** Said once when `editable` is false. */
  whyNot: string | null;
  selectedId: string | null;
  onSelect: (competency: ApiCompetency | null) => void;
  /** Re-ask the sections and the framework. */
  onChanged: () => void;
  /** What the "Answered by questions" tab holds for a subsection. */
  renderQuestions: (competency: ApiCompetency) => React.ReactNode;
}) {
  const baseId = useId();
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ id: string; tab: PanelTab } | null>(
    null,
  );

  const unfiled = competencies.filter((one) => !one.sectionId);
  const sectionById = new Map(sections.map((one) => [one.id, one]));
  const UNFILED = "__unfiled__";

  const subsectionsOf = (sectionId: string) =>
    competencies.filter((one) => one.sectionId === sectionId);

  const listOf = (items: readonly ApiCompetency[]) => (
    <ul className="flex flex-col gap-2">
      {items.map((competency) => {
        const selected = competency.id === selectedId;
        const kind = answerKindOf(competency);
        const questions = questionCounts.get(competency.id) ?? 0;
        const panelId = `${baseId}-${competency.id}`;
        const section = competency.sectionId
          ? (sectionById.get(competency.sectionId) ?? null)
          : null;
        const tab =
          picked && picked.id === competency.id
            ? picked.tab
            : defaultTab(competency, questions);
        const tabs: TabItem[] = [
          { id: "direct", label: "Rated directly" },
          {
            id: "questions",
            label: "Answered by questions",
            ...(questions > 0 ? { count: questions } : {}),
          },
        ];
        return (
          <li
            key={competency.id}
            className={cn(
              "rounded-md border",
              selected ? "border-accent-line bg-accent-soft" : "border-line",
            )}
          >
            <button
              type="button"
              aria-expanded={selected}
              aria-controls={panelId}
              onClick={() => onSelect(selected ? null : competency)}
              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md p-2.5 text-left transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
            >
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="text-body-sm font-medium text-ink">
                  {competency.name}
                </span>
                <Badge tone="neutral" size="sm">
                  {KIND_BADGE[kind]}
                </Badge>
                {questions > 0 && (
                  <Badge tone="neutral" size="sm">
                    {questions === 1 ? "1 question" : `${String(questions)} questions`}
                  </Badge>
                )}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-muted transition-transform duration-200",
                  selected && "rotate-180",
                )}
              />
            </button>

            <div id={panelId} hidden={!selected} className="px-3 pb-3">
              {selected && (
                <Tabs
                  items={tabs}
                  value={tab}
                  onChange={(id) =>
                    setPicked({ id: competency.id, tab: id as PanelTab })
                  }
                >
                  {tab === "direct" ? (
                    <DirectAnswerPanel
                      competency={competency}
                      section={
                        section
                          ? { name: section.name, weightBp: section.weightBp }
                          : null
                      }
                      editable={editable}
                      whyNot={whyNot}
                      onChanged={onChanged}
                    />
                  ) : (
                    renderQuestions(competency)
                  )}
                </Tabs>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );

  const nothingYet =
    !loading && sections.length === 0 && unfiled.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-muted">
        Sections, their subsections and how each is answered are shared by every
        appraisal period. The questions under them are {periodName}&rsquo;s own.
      </p>

      {editable ? (
        <AddSection sectionCount={sections.length} onAdded={onChanged} />
      ) : (
        whyNot && (
          <NoticeLine tone="muted">
            <span>{whyNot}</span>
          </NoticeLine>
        )
      )}

      {loading && competencies.length === 0 && sections.length === 0 ? (
        <span className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading the sections
        </span>
      ) : nothingYet ? (
        <p className="text-body-sm text-muted">
          There are no sections yet.
          {editable ? " Add one above to start." : ""}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sections.map((section) => {
            const items = subsectionsOf(section.id);
            return (
              <Disclosure
                key={section.id}
                dense
                level={4}
                open={openId === section.id}
                onToggle={() =>
                  setOpenId(openId === section.id ? null : section.id)
                }
                title={section.name}
                meta={<SectionMeta section={section} count={items.length} />}
              >
                <div className="flex flex-col gap-3">
                  {items.length === 0 ? (
                    <p className="text-body-sm text-muted">
                      Nothing is filed under this yet.
                    </p>
                  ) : (
                    listOf(items)
                  )}
                  {editable && (
                    <AddSubsection sectionId={section.id} onAdded={onChanged} />
                  )}
                </div>
              </Disclosure>
            );
          })}

          {unfiled.length > 0 && (
            <Disclosure
              dense
              level={4}
              open={openId === UNFILED}
              onToggle={() => setOpenId(openId === UNFILED ? null : UNFILED)}
              title="Not filed under a section"
              meta={
                <Badge tone="neutral" size="sm">
                  {unfiled.length === 1
                    ? "1 subsection"
                    : `${String(unfiled.length)} subsections`}
                </Badge>
              }
            >
              {listOf(unfiled)}
            </Disclosure>
          )}
        </div>
      )}

      {unfiledQuestionCount > 0 && (
        <p className="text-meta text-muted">
          {unfiledQuestionCount === 1
            ? "1 question in this period is not filed under a subsection."
            : `${String(unfiledQuestionCount)} questions in this period are not filed under a subsection.`}{" "}
          They are in All questions.
        </p>
      )}
    </div>
  );
}

function SectionMeta({
  section,
  count,
}: {
  section: SectionOption;
  count: number;
}) {
  return (
    <>
      <Badge tone="neutral" size="sm">
        {count === 1 ? "1 subsection" : `${String(count)} subsections`}
      </Badge>
      {section.weightBp === undefined ? null : (
        <Badge tone="neutral" size="sm">
          {section.weightBp === null
            ? NO_PART
            : `${weightLabel(section.weightBp)} of the mark`}
        </Badge>
      )}
    </>
  );
}

/**
 * A new section, named and mapped to what it counts towards.
 *
 * It asks what the section counts towards at the moment it is made, with the
 * same picker the sections dialog uses, because a section that counts towards
 * nothing is recorded and never scored. A company that makes one here, adds a
 * yes-or-no subsection and has it answered for a year would otherwise move no
 * mark and see no sign of why. The default is still "No part of the mark": that
 * is a real choice for a section kept for the record, and the picker says so in
 * its own words.
 */
function AddSection({
  sectionCount,
  onAdded,
}: {
  sectionCount: number;
  onAdded: () => void;
}) {
  const { createSection } = useFrameworkActions();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [component, setComponent] = useState<ScoreComponent | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden="true" className="size-3.5" />
        Add a section
      </Button>
    );
  }

  const add = async () => {
    const clean = name.trim();
    if (clean.length < 2) {
      setError("Give the section a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      /* Ordered last rather than left at the column default of 0, which every
         section created through the API otherwise shares. */
      await createSection({
        name: clean,
        order: sectionCount,
        ...(component ? { component } : {}),
      });
      setName("");
      setComponent("");
      onAdded();
      input.current?.focus();
    } catch (caught) {
      setError(actionMessage(caught, "the section"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Field
          label="New section"
          className="min-w-0 flex-1 basis-48"
          {...(error ? { error } : {})}
        >
          <Input
            ref={input}
            autoFocus
            value={name}
            disabled={busy}
            placeholder="Behavioural competency"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <div className="min-w-0 flex-1 basis-64">
          <CountsTowards
            value={component}
            disabled={busy}
            label="What the new section counts towards"
            onChange={setComponent}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" size="sm" loading={busy}>
          Add section
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Done
        </Button>
      </div>
    </form>
  );
}

/**
 * A new subsection, with the way it is answered chosen as it is made.
 *
 * The kind is picked here so a company can make a yes-or-no subsection in one
 * step rather than making a level one and changing it. It can be changed until
 * the first rating exists, from the subsection's own panel.
 */
function AddSubsection({
  sectionId,
  onAdded,
}: {
  sectionId: string;
  onAdded: () => void;
}) {
  const { createCompetency } = useFrameworkActions();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AnswerKind>("RATING");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const add = async () => {
    const problem = subsectionNameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createCompetency(
        newSubsectionBody({ name, sectionId, answerKind: kind }),
      );
      setName("");
      onAdded();
      input.current?.focus();
    } catch (caught) {
      setError(actionMessage(caught, "the subsection"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-wrap items-start gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <Field
        label="New subsection"
        className="min-w-0 flex-1 basis-48"
        {...(error ? { error } : {})}
      >
        <Input
          ref={input}
          value={name}
          disabled={busy}
          placeholder="Communication"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Answered by" className="min-w-0 flex-1 basis-48">
        <Select
          value={kind}
          disabled={busy}
          onChange={(event) => setKind(event.target.value as AnswerKind)}
        >
          {ANSWER_KINDS.map((option) => (
            <option key={option} value={option}>
              {kindOptionLabel(option, 5)}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={busy}
        className="sm:mt-6"
      >
        Add subsection
      </Button>
    </form>
  );
}
