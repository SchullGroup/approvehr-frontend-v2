"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  Tabs,
  Tag,
  useToast,
  LoadState,
} from "@/components/ui";
import type { TabItem } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiCompetencyRow } from "@/lib/api/performance";
import { KIND_BADGE, answerKindOf } from "@/lib/performance/answer-kind";
import {
  CATEGORY_ORDER,
  useGaps,
  useRating,
  useSkills,
} from "@/lib/store/performance";
import { DepartmentCard } from "@/components/ui/department-card";
import { useDepartments } from "@/lib/store/departments";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useSession } from "@/lib/store/session";
import { useUrlTab } from "@/hooks/use-url-tab";
import { RecordLevelDialog } from "./rating-dialog";
import { SKILLS_TABS, type SkillsTabId } from "./skills/tabs";

/**
 * Competency ratings: levels against the targets the company set.
 *
 * ## A gap is arithmetic, not an opinion
 *
 * `target - level`, from the latest assessment only. That is why the target is
 * stored beside the rating rather than inferred from a job title, and it is why
 * a row with a level but no target shows no gap instead of assuming one.
 *
 * ## Only what has been recorded is listed
 *
 * A person's own list shows the competencies somebody has rated, and nothing
 * else. A list of every competency, most of them "not assessed", said nothing
 * twenty times. "Not assessed" is still not zero, so a person with nothing
 * rated reads one calm "Not recorded", never a row of nought, and a company with
 * no framework reads nothing at all.
 *
 * ## Two tabs, and the second only when it has somebody in it
 *
 * Where am I against my levels, and who is below target. They share no row.
 * The second is offered only to somebody the API would answer for it, and only
 * while somebody is below target: an empty tab is a tab that can only say
 * nothing. A reader who may see only their own competencies, or whom nobody is
 * below, gets the one panel with no tab strip.
 */
export function SkillsTab({
  canSeeCompany,
  isManager,
  initialTab = "mine",
  recording: controlled,
  onRecordingChange,
}: {
  canSeeCompany: boolean;
  isManager: boolean;
  initialTab?: SkillsTabId;
  /** The page header holds the Record a level button, so the dialog is opened from there. */
  recording?: boolean;
  onRecordingChange?: (next: boolean) => void;
}) {
  const { isConnected, employeeId, actingId } = useSession();
  const me = isConnected ? employeeId : actingId;

  const mine = useSkills(me);
  const gaps = useGaps(canSeeCompany || isManager);
  const rating = useRating();
  const toast = useToast();

  const [own, setOwn] = useState(false);
  const recording = controlled ?? own;
  const setRecording = onRecordingChange ?? setOwn;
  const [tab, changeTab] = useUrlTab<SkillsTabId>(initialTab, SKILLS_TABS);

  const grouped = useMemo(() => {
    /* Only what has been recorded: `ratedAt` is null only when nothing has. */
    const rows = (mine.skills?.rows ?? []).filter(
      (row) => row.ratedAt !== null,
    );
    const bucket = new Map<string, ApiCompetencyRow[]>();
    for (const row of rows) {
      const section = row.sectionName ?? "Other";
      bucket.set(section, [...(bucket.get(section) ?? []), row]);
    }
    const known = CATEGORY_ORDER.filter((section) => bucket.has(section));
    const rest = [...bucket.keys()]
      .filter((section) => !CATEGORY_ORDER.includes(section))
      .sort();
    return [...known, ...rest].map((section) => ({
      category: section,
      rows: bucket.get(section) ?? [],
    }));
  }, [mine.skills]);

  /* The tab is there while the answer is on its way, and when it failed, so
     there is something to retry, and then only if somebody is below target. */
  const showGaps =
    (canSeeCompany || isManager) &&
    (gaps.loading || Boolean(gaps.error) || gaps.gaps.length > 0);
  const items: TabItem[] = [
    { id: "mine", label: "Your competencies" },
    ...(showGaps
      ? [
          {
            id: "gaps",
            label: "Below target",
            /* A count on a tab is a count, so it waits for the answer. */
            count: gaps.loading ? undefined : gaps.gaps.length,
          },
        ]
      : []),
  ];
  /* A `?tab=` for something this reader may not see falls back to their own
     skills rather than an empty panel. */
  const shown = items.some((item) => item.id === tab) ? tab : "mine";

  const panels = (
    <>
      {shown === "mine" && (
        <LoadState
          loading={mine.loading}
          error={mine.error}
          subject="your competency framework"
          onRetry={mine.reload}
          hasData={(mine.skills?.rows.length ?? 0) > 0}
          skeleton="list"
        >
          {grouped.length > 0 ? (
            <div className="flex flex-col gap-8">
              {grouped.map((group) => (
                <section key={group.category}>
                  <p className="text-body-md font-semibold text-ink">
                    {group.category}
                  </p>
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {group.rows.map((row) => (
                      <SkillRow key={row.competencyId} row={row} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (mine.skills?.rows.length ?? 0) > 0 ? (
            <p className="text-body-sm text-muted">Not recorded</p>
          ) : null}
        </LoadState>
      )}
      {shown === "gaps" && showGaps && (
        <LoadState
          loading={gaps.loading}
          error={gaps.error}
          subject="the competency gaps"
          onRetry={gaps.reload}
          skeleton="table"
        >
          {gaps.gaps.length > 0 && <GapsByDepartment gaps={gaps.gaps} />}
        </LoadState>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      {DEMO_ENABLED && mine.source === "demo" && (
        <div>
          <Badge tone="warning" size="sm">
            Demo · seeded assessments
          </Badge>
        </div>
      )}

      {items.length > 1 ? (
        <Tabs items={items} value={shown} onChange={changeTab}>
          {panels}
        </Tabs>
      ) : (
        panels
      )}

      <RecordLevelDialog
        open={recording}
        onClose={() => setRecording(false)}
        onSave={async (competencyId, body) => {
          try {
            await rating.rate(competencyId, body);
            /* A level is the only answer with a level in it. */
            toast.push({
              title:
                body.level === undefined ? "Answer recorded" : "Level recorded",
              tone: "success",
            });
            /* Both reads, not one. `mine` is the signed-in person's own
               skills and `rateCompetency` refuses a self-rating, so it is the
               one panel on this screen a save here can never change — while
               the gap table is exactly what a new level moves. Reloading only
               `mine` left it showing the figures from before the save until
               somebody refreshed. */
            mine.reload();
            gaps.reload();
            setRecording(false);
          } catch (error) {
            /* Rated inside a period before the person has sent their self
               review: the dialog says so calmly, with a reminder, instead of a
               refusal here. */
            if (
              error instanceof ApiError &&
              error.status === 409 &&
              body.reviewCycleId
            ) {
              throw error;
            }
            toast.push({
              title: "That did not work",
              tone: "danger",
              detail:
                error instanceof ApiError
                  ? error.message
                  : "Something went wrong. Try again.",
            });
          }
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One competency on somebody's own list, in the words that are true of how it is
 * answered.
 *
 * ## Only an answered row is drawn
 *
 * `ratedAt` is `null` only when nothing has been recorded, so that is what
 * decides, and a row nobody has answered is **absent**: a list of rows that all
 * say "not assessed" said nothing. It is `ratedAt`, not `level`, because a yes
 * or no and a pick have no level, so their rows carry `level: null` whether or
 * not anybody has answered them.
 *
 * ## What is drawn for each kind
 *
 * | Kind | Drawn |
 * |---|---|
 * | A level | the segments and "4 of 5" |
 * | Yes or no | the word, "Yes" or "No" |
 * | A pick | the label of the choice |
 * | In their own words | the words, in full, and **Written** |
 *
 * **The level is said once.** The segments carry the target as well: the ghost
 * segment is what is missing, so "target 5" in words would say it twice.
 *
 * **No segments for the last three.** They are a scale, and none of the answers is
 * on one. The pick shows its label and not a score: what it is worth is set on the
 * competency and worked out on the API, and a figure here would be a second
 * implementation of it.
 *
 * **Words are never cut off without a way to read the rest.** A long written
 * answer is folded to three lines with **Read all** under it (`WrittenAnswer`),
 * and a short one is not folded at all. It is never a score, a percentage or a
 * nought: a written answer is read by people. An answered row whose words did not
 * arrive (a server one deploy behind) says **Answered** and claims nothing about
 * what it said.
 *
 * `answerKind` is optional on the row, and absent means a level, which is what a
 * server that predates answer kinds sends and what it means.
 */
export function SkillRow({ row }: { row: ApiCompetencyRow }) {
  const kind = answerKindOf(row);
  if (row.ratedAt === null) return null;
  /* The words, or nothing. Spaces alone are not an answer, and an absent field
     is not one either. */
  const words = kind === "TEXT" ? (row.textValue?.trim() ?? "") : "";

  /* The right-hand side: the answer as a word for a yes or no and a pick, the
     segments for a level. A level-kind row that is answered with no level cannot
     be produced by the API, and there is nothing true to draw for one. */
  const answer =
    kind === "BOOLEAN" ? (
      <Badge tone="neutral" size="sm">
        {row.boolValue == null ? "Answered" : row.boolValue ? "Yes" : "No"}
      </Badge>
    ) : kind === "CHOICE" ? (
      <Badge tone="neutral" size="sm">
        {row.choiceOptionLabel ?? "Answered"}
      </Badge>
    ) : kind === "TEXT" ? (
      <Badge tone="neutral" size="sm">
        {words ? KIND_BADGE.TEXT : "Answered"}
      </Badge>
    ) : row.level === null ? null : (
      <>
        <Pips level={row.level} target={row.target} scaleMax={row.scaleMax} />
        <span className="tabular text-body-sm text-muted">
          {row.level} of {row.scaleMax}
          {/* The target is drawn as the ghost segment; this is for a screen
              reader, which cannot see it. */}
          {row.target !== null && (
            <span className="sr-only">, target {row.target}</span>
          )}
        </span>
      </>
    );

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
      {/* Words need the width of the row to be read in, so theirs takes it and the
          badge wraps below only on a narrow screen. */}
      <div className={cn("min-w-0", words && "flex-1 basis-56")}>
        <p className="text-body-sm font-medium text-ink">{row.name}</p>
        {words && <WrittenAnswer text={words} />}
      </div>

      {answer && (
        <div className="flex flex-wrap items-center gap-3">{answer}</div>
      )}
    </li>
  );
}

/**
 * A written answer's words, folded when they are long and never cut off for good.
 *
 * Folded to three lines past `LONG_WRITTEN` characters or three lines of its own, with
 * a button that says what it will do, and not at all below that: an answer that
 * fits is not hidden behind a control. The paragraphs somebody wrote are kept
 * (`whitespace-pre-line`) and a long unbroken string (a link) wraps instead of
 * running out of the row.
 *
 * Whether the fold actually hides anything cannot be measured without layout, so the
 * rule is the length, as `recognition-screen.tsx` and the requisition description
 * make it: at worst the button is offered for words that were already in view, which
 * costs a press and misleads nobody.
 */
const LONG_WRITTEN = 240;

function WrittenAnswer({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG_WRITTEN || text.split("\n").length > 3;
  return (
    <div className="mt-1.5">
      <p
        className={cn(
          "whitespace-pre-line break-words text-body-sm text-body",
          long && !open && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
          className="mt-0.5 text-meta font-medium text-accent-text underline underline-offset-2"
        >
          {open ? "Show less" : "Read all"}
        </button>
      )}
    </div>
  );
}

/**
 * The level as a row of segments, with the shortfall shown rather than outlined.
 *
 * Decoration only — `aria-hidden`, because the "4 of 5" beside it already says
 * the level, and the same line carries the target for a screen reader.
 *
 * ## Why it was redesigned
 *
 * It was five `h-4 w-2.5` blocks, each with a border, filled in
 * `bg-fill-strong` — near-black — at a 4px gap. Four of those in a row read as
 * a barcode rather than a level, and Kene said so: *"this competency rating
 * looks very ugly when filled."* Three rows of it down a page is a wall of
 * black dominoes beside the sentence that already said the number.
 *
 * The target used to be an `outline-2 outline-offset-1` ring on one segment,
 * which needs 6px of clearance in a 4px gap — so the ring overlapped its
 * neighbours, which is most of what made it look broken.
 *
 * ## The shortfall is the information, so the shortfall is what is drawn
 *
 * Three states instead of two, and no ring:
 *
 * | Segment | Meaning | Weight |
 * |---|---|---|
 * | up to the level | what they have | solid accent |
 * | level → target | **what is missing** | accent at a third |
 * | past the target | not asked for | a hairline |
 *
 * So a level of 4 against a target of 5 is four solid segments and one ghost, and the
 * gap is legible without reading the badge. At target it is a clean unbroken
 * run with nothing ghosted — which is the state that should look calmest,
 * and previously looked heaviest.
 *
 * Slimmer, too: capsules rather than blocks, so a column of these down the
 * page reads as a scale instead of a row of switches.
 */
function Pips({
  level,
  target,
  scaleMax,
}: {
  level: number | null;
  target: number | null;
  scaleMax: number;
}) {
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
      {Array.from({ length: scaleMax }).map((_, index) => {
        const step = index + 1;
        const reached = level !== null && step <= level;
        /* Between what they have and what was asked for. Drawn as a ghost of
           the filled colour, so the gap is the thing the eye lands on. */
        const shortfall =
          !reached && target !== null && step <= target && level !== null;
        return (
          <span
            key={step}
            className={cn(
              "h-1.5 w-5 rounded-full",
              reached ? "bg-accent" : shortfall ? "bg-accent/30" : "bg-line",
            )}
          />
        );
      })}
    </span>
  );
}

type Gap = ReturnType<typeof useGaps>["gaps"][number];

/**
 * Who is below target, by department.
 *
 * A list of everybody below target is long, so it opens on one card for each
 * department that has somebody, and a card opens that department's people: one
 * row each, with their initials in a colour of their own, and the competencies
 * they are below on as small chips ("Planning 2/4": level, then target). A
 * person with three gaps is one row, not three.
 */
function GapsByDepartment({ gaps }: { gaps: Gap[] }) {
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const { flat: departmentList } = useDepartments();
  const [open, setOpen] = useState<string | null | undefined>(undefined);

  const departmentOf = useMemo(
    () => new Map(directory.people.map((p) => [p.id, p.departmentId ?? null])),
    [directory.people],
  );
  const nameOf = (id: string | null) =>
    id === null
      ? "No department"
      : (departmentList.find((one) => one.id === id)?.name ?? "No department");

  const groups = useMemo(() => {
    const by = new Map<string | null, Map<string, Gap[]>>();
    for (const gap of gaps) {
      const key = departmentOf.get(gap.employeeId) ?? null;
      const people = by.get(key) ?? new Map<string, Gap[]>();
      people.set(gap.employeeId, [...(people.get(gap.employeeId) ?? []), gap]);
      by.set(key, people);
    }
    return [...by.entries()]
      .map(([id, people]) => ({
        id,
        people: [...people.entries()].map(([employeeId, rows]) => ({
          employeeId,
          name: rows[0]?.employeeName ?? "",
          rows,
        })),
      }))
      .sort((a, b) => b.people.length - a.people.length);
  }, [gaps, departmentOf]);

  if (open === undefined) {
    return (
      <ul className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <li key={group.id ?? "none"} className="min-w-0">
            <DepartmentCard
              name={nameOf(group.id)}
              onClick={() => setOpen(group.id)}
              line={`${String(group.people.length)} below target`}
              members={group.people.map((person) => person.name)}
            />
          </li>
        ))}
      </ul>
    );
  }

  const shown = groups.find((group) => group.id === open)?.people ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-start gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => setOpen(undefined)}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          All departments
        </Button>
        <h2 className="text-h4 font-semibold text-ink">{nameOf(open)}</h2>
      </div>
      <TableWrap caption="People below target">
        <THead>
          <TH>Person</TH>
          <TH>Below target</TH>
        </THead>
        <TBody>
          {shown.map((person) => (
            <TR key={person.employeeId}>
              <TDPrimary avatar={person.name} title={person.name} />
              <TD>
                <ul className="flex flex-wrap gap-1.5">
                  {person.rows.map((gap) => (
                    <li key={gap.competencyId}>
                      <Tag
                        title={`Level ${String(gap.level)} of ${String(gap.scaleMax)}, target ${String(gap.target)}`}
                      >
                        {gap.competencyName}
                        <span className="tabular text-muted">
                          {gap.level}/{gap.target}
                        </span>
                      </Tag>
                    </li>
                  ))}
                </ul>
              </TD>
            </TR>
          ))}
        </TBody>
      </TableWrap>
    </div>
  );
}
