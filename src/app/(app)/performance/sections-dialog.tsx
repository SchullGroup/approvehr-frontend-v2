"use client";

import { useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  Modal,
  RowActions,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import type { RowActionItem } from "@/components/ui";
import { weightLabel } from "@/lib/api/performance";
import type {
  ApiCompetency,
  ApiSection,
  ScoreComponent,
} from "@/lib/api/performance";
import { answerKindOf } from "@/lib/performance/answer-kind";
import {
  useFramework,
  useFrameworkActions,
  useScoringWeights,
  useSections,
} from "@/lib/store/performance";
import { actionMessage } from "@/lib/use-action";
import { useCan } from "@/lib/permissions";
import { NoticeLine } from "@/components/portal/notice-line";
import { KindTag } from "./subsection-title";

/**
 * The appraisal framework: sections, and the competencies filed under them.
 *
 * ## Why this exists
 *
 * The four sections a company starts with — Core competency, Behavioural
 * competency, Key result area, Leadership — and every competency under them
 * were readable everywhere and editable nowhere. A company could add to its
 * framework and never correct it: a section named wrongly on day one stayed
 * named wrongly.
 *
 * **There is no such thing as a section this refuses to edit.** The API never
 * protected the ones it seeds, and `modules/performance/framework.ts` says so
 * in as many words — the four are "a starting point, not a model". A rename is
 * safe because the engine stopped resolving a section by its name:
 * `AppraisalSection.component` names the scored component instead, precisely
 * so renaming "Leadership" could not silently stop every rating under it
 * counting towards the mark.
 *
 * ## A flat list, edited where it is read
 *
 * Every section is a heading with its competencies beneath it, all on screen at
 * once. Nothing is a form until it is touched:
 *
 * - **A pencil renames**, in place. Enter or leaving the field saves, Escape
 *   puts the old name back. There is no Save button to find, and nothing waits.
 * - **A menu holds the rare acts.** On a section: move up, move down, what it
 *   counts towards, remove. On a competency: move it to another section,
 *   archive it. An act that cannot be done (move up from the top) is not listed.
 * - **A small plus adds**: a competency to a section, a section at the foot.
 *
 * One noun each: **section** and **competency**, here and everywhere the
 * framework is edited.
 *
 * ## Three things it refuses to render as a number
 *
 * - A section outside `ScoreComponent` reads **"Not scored"**, never 0%. Its
 *   ratings are recorded and excluded from the mark, which is a different fact
 *   from a section somebody weighted at nothing.
 * - Archiving keeps every rating, and says how many in the API's own sentence.
 *   A competency is never deleted: a past rating is the evidence somebody
 *   improved.
 * - Removing a section leaves its competencies, unfiled, because
 *   `Competency.sectionId` is `onDelete: SetNull`.
 */
export function SectionsDialog({
  open,
  onClose,
}: {
  /* The open/closed signal, rather than a mount guard, so `Modal` can see it
     go false and play its exit animation. Same contract as `QuestionsDialog`. */
  open: boolean;
  onClose: () => void;
}) {
  const canManage = useCan("MANAGE_SETTINGS");
  const actions = useFrameworkActions();
  const toast = useToast();
  const {
    sections,
    loading: sectionsLoading,
    reload: reloadSections,
  } = useSections();
  const {
    competencies,
    loading: frameworkLoading,
    reload: reloadFramework,
  } = useFramework();

  /* What is being edited in place: one name at a time. */
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [renamingSub, setRenamingSub] = useState<string | null>(null);
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);
  /* Bumped after each add, so the field starts empty again and keeps the
     cursor: the next name can be typed the moment the last one is sent. */
  const [addRound, setAddRound] = useState(0);
  const [addingSection, setAddingSection] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countingFor, setCountingFor] = useState<ApiSection | null>(null);
  const [movingSub, setMovingSub] = useState<ApiCompetency | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ApiSection | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<ApiCompetency | null>(
    null,
  );

  const editable = actions.editable && canManage;
  const loading = sectionsLoading || frameworkLoading;

  const refresh = () => {
    reloadSections();
    reloadFramework();
  };

  /** Runs a write, reports its refusal in the server's words, and reloads. */
  const run = async (what: string, act: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await act();
      refresh();
      return true;
    } catch (caught) {
      setError(actionMessage(caught, what));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const subsectionsOf = (sectionId: string | null) =>
    competencies.filter((competency) => competency.sectionId === sectionId);

  const unfiled = subsectionsOf(null);

  /**
   * Move a section one place, then renumber every one of them.
   *
   * Not a swap of two `order` values, because `createSection` on the API does
   * not compute an order at all — every section made since the seed carries
   * the column default of 0, so a swap between two zeroes moves nothing.
   * Renumbering 0..n-1 in the order on screen is idempotent, fixes the
   * collisions on the first move, and writes only the rows that actually
   * changed.
   */
  const move = async (index: number, delta: number) => {
    const next = [...sections];
    const row = next[index];
    const target = next[index + delta];
    if (!row || !target) return;
    next.splice(index, 1);
    next.splice(index + delta, 0, row);

    await run("the new order", async () => {
      for (const [position, section] of next.entries()) {
        if (section.order !== position) {
          await actions.updateSection(section.id, { order: position });
        }
      }
    });
  };

  /* A name that is blank leaves things as they were; one that is too short says
     so. Either way the field closes: it is saved on leaving, never held open. */
  const renameSection = async (section: ApiSection, typed: string) => {
    setRenamingSection(null);
    const name = typed.trim();
    if (name === "" || name === section.name) return;
    if (name.length < 2) {
      setError("Give the section a name.");
      return;
    }
    await run("the new name", () =>
      actions.updateSection(section.id, { name }),
    );
  };

  const setComponent = async (
    section: ApiSection,
    component: ScoreComponent | "",
  ) => {
    setCountingFor(null);
    await run("what it counts towards", () =>
      actions.updateSection(section.id, { component: component || null }),
    );
  };

  const addSection = async (typed: string) => {
    const name = typed.trim();
    if (name === "") {
      setAddingSection(false);
      return;
    }
    if (name.length < 2) {
      setError("Give the section a name.");
      setAddingSection(false);
      return;
    }
    /* Ordered last rather than left at the column default of 0, which every
       section created through this API otherwise shares — see `move`. It counts
       towards nothing until somebody chooses a part for it, which its row says. */
    const ok = await run("the section", () =>
      actions.createSection({ name, order: sections.length }),
    );
    if (ok) setAddingSection(false);
    return ok;
  };

  const addSubsection = async (sectionId: string, typed: string) => {
    const name = typed.trim();
    if (name === "") {
      setAddingSubTo(null);
      return;
    }
    if (name.length < 2) {
      setError("Give the competency a name.");
      setAddingSubTo(null);
      return;
    }
    const ok = await run("the competency", () =>
      actions.createCompetency({ name, scaleMax: 5, sectionId }),
    );
    if (ok) setAddRound((round) => round + 1);
    return ok;
  };

  const renameSub = async (competency: ApiCompetency, typed: string) => {
    setRenamingSub(null);
    const name = typed.trim();
    if (name === "" || name === competency.name) return;
    if (name.length < 2) {
      setError("Give the competency a name.");
      return;
    }
    await run("the new name", () =>
      actions.updateCompetency(competency.id, { name }),
    );
  };

  const refile = async (competency: ApiCompetency, sectionId: string) => {
    setMovingSub(null);
    await run("the new section", () =>
      actions.updateCompetency(competency.id, {
        sectionId: sectionId === "" ? null : sectionId,
      }),
    );
  };

  const remove = async (section: ApiSection) => {
    const ok = await run("the removal", () =>
      actions.deleteSection(section.id),
    );
    if (ok) setConfirmDelete(null);
  };

  const archive = async (competency: ApiCompetency) => {
    setBusy(true);
    setError(null);
    try {
      const result = await actions.archiveCompetency(competency.id);
      /* The API says how many ratings it kept. That sentence is the reason
         this is an archive, so it is shown rather than swallowed. */
      toast.push({
        tone: "success",
        title: `${competency.name} archived`,
        detail: result.note,
      });
      setConfirmArchive(null);
      refresh();
    } catch (caught) {
      setError(actionMessage(caught, "the archive"));
    } finally {
      setBusy(false);
    }
  };

  const sectionMenu = (
    section: ApiSection,
    index: number,
  ): readonly RowActionItem[] => [
    {
      label: "Move up",
      onSelect: () => void move(index, -1),
      available: index > 0,
    },
    {
      label: "Move down",
      onSelect: () => void move(index, 1),
      available: index < sections.length - 1,
    },
    { label: "Counts towards", onSelect: () => setCountingFor(section) },
    "separator",
    {
      label: "Remove",
      tone: "danger",
      onSelect: () => setConfirmDelete(section),
    },
  ];

  const subsectionMenu = (
    competency: ApiCompetency,
  ): readonly RowActionItem[] => [
    {
      label: "Move to another section",
      onSelect: () => setMovingSub(competency),
    },
    "separator",
    {
      label: "Archive",
      tone: "danger",
      onSelect: () => setConfirmArchive(competency),
    },
  ];

  const competencyRows = (items: ApiCompetency[], sectionId: string | null) => (
    <ul className="mt-1 flex flex-col divide-y divide-line">
      {items.map((competency) => (
        <li key={competency.id} className="flex items-center gap-2 py-2">
          {renamingSub === competency.id ? (
            <NameInput
              value={competency.name}
              label={`Rename ${competency.name}`}
              onSave={(name) => void renameSub(competency, name)}
              onCancel={() => setRenamingSub(null)}
            />
          ) : (
            <>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {/* In front of the name, as in By section, so two that read
                    alike are told apart here as well. */}
                <KindTag kind={answerKindOf(competency)} />
                <span className="text-body-sm font-medium text-ink">
                  {competency.name}
                </span>
                {competency.isCore && (
                  <Badge tone="neutral" size="sm">
                    Everybody
                  </Badge>
                )}
                {/* Recorded ratings, so somebody can see what a move or an
                    archive is actually carrying with it. */}
                {competency.ratingCount > 0 && (
                  <Badge tone="neutral" size="sm">
                    {competency.ratingCount === 1
                      ? "1 rating"
                      : `${String(competency.ratingCount)} ratings`}
                  </Badge>
                )}
              </span>
              {editable && (
                <span className="flex items-center gap-0.5">
                  <IconButton
                    label={`Rename ${competency.name}`}
                    size="sm"
                    disabled={busy}
                    onClick={() => setRenamingSub(competency.id)}
                  >
                    <Pencil aria-hidden="true" />
                  </IconButton>
                  <RowActions
                    label={`More actions for ${competency.name}`}
                    items={subsectionMenu(competency)}
                    disabled={busy}
                  />
                </span>
              )}
            </>
          )}
        </li>
      ))}
      {sectionId !== null && addingSubTo === sectionId && (
        <li key={`add-${String(addRound)}`} className="py-2">
          <NameInput
            value=""
            label="New competency"
            placeholder="Communication"
            onSave={(name) => addSubsection(sectionId, name)}
            onCancel={() => setAddingSubTo(null)}
          />
        </li>
      )}
    </ul>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Competencies"
      size="lg"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col gap-5">
        {!actions.editable && (
          <NoticeLine tone="muted">
            <span>Editing needs a connection to the server.</span>
          </NoticeLine>
        )}

        {error && (
          <Callout tone="danger" title="That did not go through">
            {error}
          </Callout>
        )}

        {loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading the framework
          </span>
        ) : (
          <>
            <ul className="flex flex-col gap-6">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <div className="flex items-center gap-1.5">
                    {renamingSection === section.id ? (
                      <NameInput
                        value={section.name}
                        label={`Rename ${section.name}`}
                        onSave={(name) => void renameSection(section, name)}
                        onCancel={() => setRenamingSection(null)}
                      />
                    ) : (
                      <>
                        <h3 className="min-w-0 text-body-md font-semibold text-ink">
                          {section.name}
                        </h3>
                        {editable && (
                          <IconButton
                            label={`Rename ${section.name}`}
                            size="sm"
                            disabled={busy}
                            onClick={() => setRenamingSection(section.id)}
                          >
                            <Pencil aria-hidden="true" />
                          </IconButton>
                        )}
                        {/* Null is "not scored", never 0%. A section outside
                            ScoreComponent has its ratings recorded and
                            excluded; 0% would read as a weight somebody
                            chose. */}
                        <span className="tabular text-meta text-muted">
                          {section.weightBp === null
                            ? "Not scored"
                            : weightLabel(section.weightBp)}
                        </span>
                        {editable && (
                          <span className="ml-auto flex items-center gap-0.5">
                            <IconButton
                              label={`Add a competency to ${section.name}`}
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                setAddingSubTo(section.id);
                                setAddRound((round) => round + 1);
                              }}
                            >
                              <Plus aria-hidden="true" />
                            </IconButton>
                            <RowActions
                              label={`More actions for ${section.name}`}
                              items={sectionMenu(section, index)}
                              disabled={busy}
                            />
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {competencyRows(subsectionsOf(section.id), section.id)}
                </li>
              ))}

              {/* Its own group, and deliberately not called "Other" — the
                  framework read groups an absent section under that word, which
                  reads as a section somebody named. These are filed under
                  nothing, which is a state rather than a place. */}
              {unfiled.length > 0 && (
                <li>
                  <h3 className="text-body-md font-semibold text-ink">
                    No section
                  </h3>
                  {competencyRows(unfiled, null)}
                </li>
              )}
            </ul>

            {editable &&
              (addingSection ? (
                <NameInput
                  value=""
                  label="New section"
                  placeholder="Behavioural competency"
                  onSave={(name) => addSection(name)}
                  onCancel={() => setAddingSection(false)}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setAddingSection(true)}
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  Add a section
                </Button>
              ))}
          </>
        )}
      </div>

      <Modal
        open={countingFor !== null}
        onClose={() => setCountingFor(null)}
        title={countingFor?.name ?? "Section"}
        size="sm"
        footer={<Button onClick={() => setCountingFor(null)}>Done</Button>}
      >
        {countingFor && (
          <CountsTowards
            value={countingFor.component ?? ""}
            disabled={busy}
            label={`What ${countingFor.name} counts towards`}
            onChange={(value) => void setComponent(countingFor, value)}
          />
        )}
      </Modal>

      <Modal
        open={movingSub !== null}
        onClose={() => setMovingSub(null)}
        title={movingSub?.name ?? "Competency"}
        size="sm"
        footer={<Button onClick={() => setMovingSub(null)}>Done</Button>}
      >
        {movingSub && (
          <Field label="Section">
            <Select
              value={movingSub.sectionId ?? ""}
              disabled={busy}
              aria-label={`Section for ${movingSub.name}`}
              onChange={(event) => void refile(movingSub, event.target.value)}
            >
              <option value="">No section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void remove(confirmDelete);
        }}
        title={`Remove ${confirmDelete?.name ?? "this section"}?`}
        confirmLabel="Remove"
        loading={busy}
        body="Its competencies and their ratings stay, with no section."
      />

      <ConfirmDialog
        open={confirmArchive !== null}
        onClose={() => setConfirmArchive(null)}
        onConfirm={() => {
          if (confirmArchive) void archive(confirmArchive);
        }}
        title={`Archive ${confirmArchive?.name ?? "this competency"}?`}
        confirmLabel="Archive"
        loading={busy}
        body="Its ratings are kept."
      />
    </Modal>
  );
}

/**
 * A name that is typed in place and saved when it is done: Enter saves, leaving
 * the field saves, Escape puts things back. There is no Save button to find.
 *
 * It tells the dialog's own Escape not to close the whole dialog while it has the
 * cursor (`data-escape-to-popup`, the opt-out `useFocusTrap` reads), so the first
 * Escape cancels the edit and the second closes the dialog. Saved once: Enter
 * and the blur that follows it are one act.
 */
function NameInput({
  value,
  label,
  placeholder,
  onSave,
  onCancel,
}: {
  value: string;
  label: string;
  placeholder?: string;
  /** `false` from a write that was refused keeps the field, with what was typed. */
  onSave: (name: string) => void | Promise<boolean | void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const finished = useRef(false);

  const save = () => {
    if (finished.current) return;
    finished.current = true;
    void Promise.resolve(onSave(draft)).then((result) => {
      if (result === false) finished.current = false;
    });
  };

  return (
    <span data-escape-to-popup="" className="min-w-0 flex-1">
      <Input
        autoFocus
        value={draft}
        aria-label={label}
        {...(placeholder ? { placeholder } : {})}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finished.current = true;
            onCancel();
          }
        }}
      />
    </span>
  );
}

/**
 * Which part of the mark a section's ratings feed.
 *
 * Every one of the company's own parts that ratings can feed is listed, from
 * Settings under Appraisal scoring, by the names it gave them, so the list
 * matches Settings. The competency and leadership parts are made of the
 * manager's ratings on the sections filed under them. A Self-assessment part is
 * made of the person's own answers to the sections filed under it, which is how
 * a company writes its self-appraisal questions.
 *
 * The others are **not listed**: Tasks done comes from graded tasks, Delivery
 * against objectives from the objectives themselves and Manager appraisal from
 * the appraisers' overall mark, so a rating filed under a section could not
 * reach any of them, and an option that can only be refused is absent rather
 * than greyed. A source the company has no part for is not listed either: a
 * section filed under it would count for nothing. A section that feeds the same
 * part as another is averaged in with it.
 */
const SECTION_SOURCES: readonly ScoreComponent[] = [
  "CORE_COMPETENCY",
  "BEHAVIOURAL_COMPETENCY",
  "LEADERSHIP",
  "SELF_ASSESSMENT",
];

export function CountsTowards({
  value,
  disabled,
  label,
  onChange,
}: {
  value: ScoreComponent | "";
  disabled: boolean;
  label: string;
  onChange: (value: ScoreComponent | "") => void;
}) {
  const { weights: settings } = useScoringWeights();
  const offered = (settings?.rows ?? []).filter(
    (row) => row.isPart !== false && SECTION_SOURCES.includes(row.component),
  );
  const known = offered.some((part) => part.component === value);
  /* A section filed under something that is not one of the company's parts
     counts for nothing, which is what "Not scored" says, so it reads that. Only
     while the parts are still on their way is its own value kept, so it is not
     shown as unscored for a moment it is not. */
  const reading = value !== "" && !known && settings === null;
  return (
    <Field label="Counts towards">
      <Select
        value={known || reading ? value : ""}
        disabled={disabled}
        aria-label={label}
        onChange={(event) =>
          onChange(event.target.value as ScoreComponent | "")
        }
      >
        <option value="">Not scored</option>
        {offered.map((part) => (
          <option key={part.component} value={part.component}>
            {part.label}
          </option>
        ))}
        {reading && <option value={value}>Loading…</option>}
      </Select>
    </Field>
  );
}
