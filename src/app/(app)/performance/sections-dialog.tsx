"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  Disclosure,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Spinner,
} from "@/components/ui";
import { weightLabel } from "@/lib/api/performance";
import type { ApiCompetency, ApiSection } from "@/lib/api/performance";
import {
  useFramework,
  useFrameworkActions,
  useSections,
} from "@/lib/store/performance";
import { actionMessage } from "@/lib/use-action";
import { useCan } from "@/lib/permissions";
import { NoticeLine } from "@/components/portal/notice-line";

/**
 * The appraisal framework: sections, and the subsections filed under them.
 *
 * ## Why this exists
 *
 * The four sections a company starts with — Core competency, Behavioural
 * competency, Key result area, Leadership — and every subsection under them
 * were readable everywhere and editable nowhere. `useFrameworkActions`
 * exposed `createSection` and `createCompetency` and nothing else, while
 * `performanceApi.updateSection`, `deleteSection`, `updateCompetency` and
 * `archiveCompetency` had existed the whole time with no caller in the
 * product. So a company could add to its framework and never correct it: a
 * section named wrongly on day one stayed named wrongly.
 *
 * **There is no such thing as a section this refuses to edit.** The API never
 * protected the ones it seeds, and `modules/performance/framework.ts` says so
 * in as many words — the four are "a starting point, not a model". A rename is
 * safe because the engine stopped resolving a section by its name:
 * `AppraisalSection.component` names the scored component instead, precisely
 * so renaming "Leadership" could not silently stop every rating under it
 * counting towards the mark.
 *
 * ## Read first, edit on purpose
 *
 * Every section is collapsed to a line — its name, what it is worth, how much
 * is filed under it. Opening one is the act that turns it into a form. That is
 * the shape asked for, and it is also the safer one: this framework is shared
 * across **every** appraisal period, past and future, so nothing here is a
 * change to the period somebody happens to be looking at. The note at the top
 * says that before anything is opened.
 *
 * ## Three things it refuses to render as a number
 *
 * - A section outside `ScoreComponent` reads **"Not weighted"**, never 0%. Its
 *   ratings are recorded and excluded from the mark, which is a different fact
 *   from a section somebody weighted at nothing.
 * - Archiving names how many ratings it kept, in the API's own sentence. A
 *   subsection is never deleted: a past rating is the evidence somebody
 *   improved.
 * - Deleting a section says what happens to the subsections under it — they
 *   survive, unfiled — because `Competency.sectionId` is `onDelete: SetNull`
 *   and the alternative reading is that they go with it.
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

  /* Which section is open. One at a time: this is a list somebody reads, and
     two open forms invite an edit in the one nobody was looking at. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [renamingSub, setRenamingSub] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The API's own sentence after an archive — it is the one that carries how
     many ratings were kept, which is the whole reason this is not a delete. */
  const [notice, setNotice] = useState<string | null>(null);
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

  /* `expand`, not `open`: `open` is the dialog's own prop now, and a section
     row expanding is a different thing from the dialog being on screen. */
  const expand = (section: ApiSection) => {
    setOpenId(section.id);
    setNameDraft(section.name);
    setAddingSubTo(null);
    setRenamingSub(null);
    setError(null);
  };

  const toggle = (section: ApiSection) => {
    if (openId === section.id) setOpenId(null);
    else expand(section);
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

    const moved = next.filter(
      (section, position) => section.order !== position,
    );
    await run("the new order", async () => {
      for (const [position, section] of next.entries()) {
        if (section.order !== position) {
          await actions.updateSection(section.id, { order: position });
        }
      }
      return moved;
    });
  };

  const rename = async (section: ApiSection) => {
    const name = nameDraft.trim();
    if (name.length < 2) {
      setError("Give the section a name.");
      return;
    }
    if (name === section.name) return;
    await run("the new name", () =>
      actions.updateSection(section.id, { name }),
    );
  };

  const addSection = async () => {
    const name = newSectionName.trim();
    if (name.length < 2) {
      setError("Give the section a name.");
      return;
    }
    /* Ordered last rather than left at the column default of 0, which every
       section created through this API otherwise shares — see `move`. */
    const ok = await run("the section", () =>
      actions.createSection({ name, order: sections.length }),
    );
    if (ok) {
      setNewSectionName("");
      setAddingSection(false);
    }
  };

  const addSubsection = async (sectionId: string | null) => {
    const name = newSubName.trim();
    if (name.length < 2) {
      setError("Give the subsection a name.");
      return;
    }
    const ok = await run("the subsection", () =>
      actions.createCompetency({
        name,
        scaleMax: 5,
        ...(sectionId ? { sectionId } : {}),
      }),
    );
    if (ok) {
      setNewSubName("");
      setAddingSubTo(null);
    }
  };

  const renameSub = async (competency: ApiCompetency) => {
    const name = subDraft.trim();
    if (name.length < 2) {
      setError("Give the subsection a name.");
      return;
    }
    if (name === competency.name) {
      setRenamingSub(null);
      return;
    }
    const ok = await run("the new name", () =>
      actions.updateCompetency(competency.id, { name }),
    );
    if (ok) setRenamingSub(null);
  };

  const refile = async (competency: ApiCompetency, sectionId: string) =>
    run("the new section", () =>
      actions.updateCompetency(competency.id, {
        sectionId: sectionId === "" ? null : sectionId,
      }),
    );

  const remove = async (section: ApiSection) => {
    const ok = await run("the removal", () =>
      actions.deleteSection(section.id),
    );
    if (ok) {
      setConfirmDelete(null);
      if (openId === section.id) setOpenId(null);
    }
  };

  const archive = async (competency: ApiCompetency) => {
    setBusy(true);
    setError(null);
    try {
      const result = await actions.archiveCompetency(competency.id);
      /* The API says how many ratings it kept. That sentence is the reason
         this is an archive, so it is shown rather than swallowed. */
      setNotice(result.note);
      setConfirmArchive(null);
      refresh();
    } catch (caught) {
      setError(actionMessage(caught, "the archive"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sections and subsections"
      description="What an appraisal is made of"
      size="lg"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col gap-5">
        {/* Said once, before anything is opened. This is not the period's own
            form — it is the framework every period is built from. */}
        <NoticeLine tone="muted">
          <span>
            These are shared across every appraisal period, past and future.
            Renaming one here renames it everywhere.
          </span>
        </NoticeLine>

        {!actions.editable ? (
          <Callout tone="neutral" title="This needs the API">
            Sections are shared across every appraisal period, and one kept in
            this browser would not reach any of them.
          </Callout>
        ) : !canManage ? (
          <Callout tone="neutral" title="You can read these, not change them">
            Changing the framework needs the Manage settings permission, because
            it decides how everybody in the company is scored.
          </Callout>
        ) : null}

        {error && (
          <Callout tone="danger" title="That did not go through">
            {error}
          </Callout>
        )}

        {notice && (
          <Callout tone="success" title="Archived">
            {notice}
          </Callout>
        )}

        {loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading the framework
          </span>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {sections.map((section, index) => {
                const subs = subsectionsOf(section.id);
                return (
                  <li key={section.id}>
                    <Disclosure
                      dense
                      level={4}
                      open={openId === section.id}
                      onToggle={() => toggle(section)}
                      title={section.name}
                      meta={
                        <span className="flex flex-wrap items-center gap-2">
                          {/* Null is "not weighted", never 0%. A section
                              outside ScoreComponent has its ratings recorded
                              and excluded; 0% would read as a weight somebody
                              chose. */}
                          <Badge
                            tone={
                              section.weightBp === null ? "neutral" : "accent"
                            }
                            size="sm"
                          >
                            {section.weightBp === null
                              ? "Not weighted"
                              : `${weightLabel(section.weightBp)} of the mark`}
                          </Badge>
                          <Badge tone="neutral" size="sm">
                            {subs.length === 1
                              ? "1 subsection"
                              : `${String(subs.length)} subsections`}
                          </Badge>
                        </span>
                      }
                      hint={
                        editable ? "Open it to rename or re-file it" : undefined
                      }
                    >
                      <div className="flex flex-col gap-4">
                        {editable && (
                          <div className="flex flex-wrap items-end gap-2">
                            <Field label="Section name" className="flex-1">
                              <Input
                                value={nameDraft}
                                onChange={(event) =>
                                  setNameDraft(event.target.value)
                                }
                              />
                            </Field>
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={busy}
                              disabled={nameDraft.trim() === section.name}
                              onClick={() => void rename(section)}
                            >
                              Save the name
                            </Button>
                            <span className="flex gap-1">
                              <IconButton
                                label="Move up"
                                disabled={index === 0 || busy}
                                onClick={() => void move(index, -1)}
                              >
                                <ArrowUp aria-hidden="true" />
                              </IconButton>
                              <IconButton
                                label="Move down"
                                disabled={index === sections.length - 1 || busy}
                                onClick={() => void move(index, 1)}
                              >
                                <ArrowDown aria-hidden="true" />
                              </IconButton>
                            </span>
                          </div>
                        )}

                        <Subsections
                          items={subs}
                          sections={sections}
                          editable={editable}
                          busy={busy}
                          renamingSub={renamingSub}
                          subDraft={subDraft}
                          onStartRename={(competency) => {
                            setRenamingSub(competency.id);
                            setSubDraft(competency.name);
                          }}
                          onDraft={setSubDraft}
                          onCancelRename={() => setRenamingSub(null)}
                          onRename={(competency) => void renameSub(competency)}
                          onRefile={(competency, id) =>
                            void refile(competency, id)
                          }
                          onArchive={setConfirmArchive}
                        />

                        {editable && (
                          <div className="flex flex-col gap-2">
                            {addingSubTo === section.id ? (
                              <div className="flex flex-wrap items-end gap-2">
                                <Field
                                  label="New subsection"
                                  className="flex-1"
                                >
                                  <Input
                                    value={newSubName}
                                    onChange={(event) =>
                                      setNewSubName(event.target.value)
                                    }
                                    placeholder="Communication"
                                  />
                                </Field>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  loading={busy}
                                  onClick={() => void addSubsection(section.id)}
                                >
                                  Add it
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => setAddingSubTo(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap justify-between gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setAddingSubTo(section.id);
                                    setNewSubName("");
                                  }}
                                >
                                  <Plus
                                    aria-hidden="true"
                                    className="size-3.5"
                                  />
                                  Add a subsection
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => setConfirmDelete(section)}
                                >
                                  <Trash2
                                    aria-hidden="true"
                                    className="size-3.5"
                                  />
                                  Remove this section
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </Disclosure>
                  </li>
                );
              })}
            </ul>

            {/* Its own group, and deliberately not called "Other" — the
                framework read groups an absent section under that word, which
                reads as a section somebody named. These are filed under
                nothing, which is a state rather than a place. */}
            {unfiled.length > 0 && (
              <Disclosure
                dense
                level={4}
                open={openId === UNFILED}
                onToggle={() => setOpenId(openId === UNFILED ? null : UNFILED)}
                title="Not filed under a section"
                meta={
                  <Badge tone="warning" size="sm">
                    {unfiled.length === 1
                      ? "1 subsection"
                      : `${String(unfiled.length)} subsections`}
                  </Badge>
                }
                hint="Answers to these count towards no part of the mark"
              >
                <Subsections
                  items={unfiled}
                  sections={sections}
                  editable={editable}
                  busy={busy}
                  renamingSub={renamingSub}
                  subDraft={subDraft}
                  onStartRename={(competency) => {
                    setRenamingSub(competency.id);
                    setSubDraft(competency.name);
                  }}
                  onDraft={setSubDraft}
                  onCancelRename={() => setRenamingSub(null)}
                  onRename={(competency) => void renameSub(competency)}
                  onRefile={(competency, id) => void refile(competency, id)}
                  onArchive={setConfirmArchive}
                />
              </Disclosure>
            )}

            {editable &&
              (addingSection ? (
                <div className="flex flex-wrap items-end gap-2 rounded-md border border-line bg-canvas p-3">
                  <Field label="New section" className="flex-1">
                    <Input
                      value={newSectionName}
                      onChange={(event) =>
                        setNewSectionName(event.target.value)
                      }
                      placeholder="Behavioural competency"
                    />
                  </Field>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busy}
                    onClick={() => void addSection()}
                  >
                    Add it
                  </Button>
                  <IconButton
                    label="Cancel"
                    onClick={() => setAddingSection(false)}
                  >
                    <X aria-hidden="true" />
                  </IconButton>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    setAddingSection(true);
                    setNewSectionName("");
                  }}
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  Add a section
                </Button>
              ))}

            {/* A new section is outside `ScoreComponent`, so it is recorded
                and not scored until somebody maps it. Said here rather than
                discovered when a mark comes out lower than expected. */}
            {editable && (
              <NoticeLine tone="muted">
                <span>
                  A section you invent counts towards no part of the mark until
                  it is weighted. Its ratings are still recorded.
                </span>
              </NoticeLine>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void remove(confirmDelete);
        }}
        title={`Remove ${confirmDelete?.name ?? "this section"}?`}
        confirmLabel="Remove the section"
        loading={busy}
        body={
          <>
            <p>
              The heading goes. The{" "}
              {subsectionsOf(confirmDelete?.id ?? "").length === 1
                ? "subsection"
                : `${String(subsectionsOf(confirmDelete?.id ?? "").length)} subsections`}{" "}
              filed under it stay, and every rating against them stays — they
              are left without a section until somebody re-files them.
            </p>
            <p>
              While they are unfiled, answers to them count towards no part of
              the mark.
            </p>
          </>
        }
      />

      <ConfirmDialog
        open={confirmArchive !== null}
        onClose={() => setConfirmArchive(null)}
        onConfirm={() => {
          if (confirmArchive) void archive(confirmArchive);
        }}
        title={`Archive ${confirmArchive?.name ?? "this subsection"}?`}
        confirmLabel="Archive it"
        loading={busy}
        body={
          <p>
            It stops being offered on new forms. Every rating already recorded
            against it is kept — a past rating is the evidence somebody
            improved, so this is never a delete.
          </p>
        }
      />
    </Modal>
  );
}

/** The id the unfiled group opens under. Not a section, so not a section id. */
const UNFILED = "__unfiled__";

/**
 * The subsections of one section: rename in place, move to another section,
 * archive.
 *
 * Shared by a real section and the unfiled group, because the three acts are
 * the same in both and a second copy is how one of them quietly stops
 * offering the move.
 */
function Subsections({
  items,
  sections,
  editable,
  busy,
  renamingSub,
  subDraft,
  onStartRename,
  onDraft,
  onCancelRename,
  onRename,
  onRefile,
  onArchive,
}: {
  items: ApiCompetency[];
  sections: ApiSection[];
  editable: boolean;
  busy: boolean;
  renamingSub: string | null;
  subDraft: string;
  onStartRename: (competency: ApiCompetency) => void;
  onDraft: (value: string) => void;
  onCancelRename: () => void;
  onRename: (competency: ApiCompetency) => void;
  onRefile: (competency: ApiCompetency, sectionId: string) => void;
  onArchive: (competency: ApiCompetency) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="text-body-sm text-muted">
        Nothing is filed under this yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((competency) => (
        <li
          key={competency.id}
          className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2.5"
        >
          {renamingSub === competency.id ? (
            <>
              <Input
                value={subDraft}
                onChange={(event) => onDraft(event.target.value)}
                className="flex-1"
                aria-label={`Rename ${competency.name}`}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={() => onRename(competency)}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={onCancelRename}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
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
                <span className="flex flex-wrap items-center gap-1">
                  <Select
                    value={competency.sectionId ?? ""}
                    disabled={busy}
                    aria-label={`Section for ${competency.name}`}
                    onChange={(event) =>
                      onRefile(competency, event.target.value)
                    }
                  >
                    <option value="">Not filed</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                  </Select>
                  <IconButton
                    label={`Rename ${competency.name}`}
                    disabled={busy}
                    onClick={() => onStartRename(competency)}
                  >
                    <Pencil aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`Archive ${competency.name}`}
                    disabled={busy}
                    onClick={() => onArchive(competency)}
                  >
                    <Archive aria-hidden="true" />
                  </IconButton>
                </span>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
