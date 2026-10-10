import {
  formatMeasure,
  quarterLabel,
  type ApiGoal,
  type ApiKeyResult,
} from "@/lib/api/performance";

/**
 * What is said when an objective or a KPI is saved, sent, agreed or finished.
 *
 * Kept apart from the screens because every sentence has to be true of what
 * just happened, and that is worth being able to test without rendering
 * anything. The rules it keeps:
 *
 * - **A toast names the thing and carries the figure.** "KPI added" says that
 *   something happened; it does not say which, under what, for whom or what
 *   state it is in, and the person who clicked already knew the first part.
 * - **Nobody "has been told" unless the API said so.** `submit`, `agree`,
 *   `sendBack` and `reject` all notify the other person and none of them reports
 *   whether it reached anyone, so no sentence here claims it. `share` does
 *   report a count, and it is the one place a count of people told is quoted.
 * - **Only what is known.** Demo mode answers the writes that work offline with
 *   nothing at all, so everything that comes from a response is optional and a
 *   sentence built on it is left out rather than guessed.
 * - **Nothing here is celebratory.** No exclamation marks and no "success".
 *   The title says what happened, in the past tense; the rest says what is now
 *   true or what happens next.
 */

/** What a toast says. `tone` defaults to success. */
export type Said = {
  title: string;
  detail?: string;
  tone?: "success" | "info" | "warning";
};

/** The wording of a moment (`SuccessMoment`): title, one proving line, ticked facts. */
export type MomentCopy = {
  title: string;
  lead: string;
  details: string[];
};

/** The parts of an objective these sentences read. */
export type GoalFacts = Pick<
  ApiGoal,
  | "title"
  | "ownerId"
  | "ownerName"
  | "level"
  | "departmentName"
  | "reviewCycleName"
  | "dueQuarter"
  | "approval"
  | "parentTitle"
> & { keyResults: readonly unknown[] };

/** The period an objective is scored in, or null when it has none to name. */
export function periodOf(
  goal: Pick<GoalFacts, "reviewCycleName" | "dueQuarter">,
): string | null {
  if (goal.reviewCycleName) return goal.reviewCycleName;
  return goal.dueQuarter ? quarterLabel(goal.dueQuarter) : null;
}

/**
 * Whose it is, as a possessive that can sit in front of a noun.
 *
 * "Your" when the reader is the owner, so the person who just wrote their own
 * KPI is not told it is "Adaeze Okonkwo's". A company objective has no owner
 * and a department's belongs to the department.
 */
export function possessive(
  goal: Pick<GoalFacts, "level" | "ownerId" | "ownerName" | "departmentName">,
  viewerId?: string | null,
): string {
  if (goal.level === "company") return "The company's";
  if (goal.level === "department") {
    return goal.departmentName
      ? `${goal.departmentName}'s`
      : "The department's";
  }
  if (viewerId && goal.ownerId === viewerId) return "Your";
  return goal.ownerName ? `${goal.ownerName}'s` : "This";
}

/** "1 measure", "3 measures", "no measure". The noun goes with the number. */
export function measuresPhrase(count: number): string {
  if (count === 0) return "no measure";
  return count === 1 ? "1 measure" : `${String(count)} measures`;
}

/**
 * "Chidi Nwosu's objective for Q3 2026, with 2 measures."
 *
 * The line under a title that says which objective, whose, for when, and what
 * it is measured by — the facts an agreement is about. The period is left out
 * when there is none rather than saying "No quarter set" in the middle of a
 * sentence.
 */
export function describeObjective(
  goal: GoalFacts,
  viewerId?: string | null,
): string {
  const period = periodOf(goal);
  return (
    `${possessive(goal, viewerId)} objective` +
    (period ? ` for ${period}` : "") +
    `, with ${measuresPhrase(goal.keyResults.length)}.`
  );
}

/**
 * "A", "A and B", "A, B and C", "A, B and 2 others".
 *
 * Capped at three names because a toast that lists eleven people is a column,
 * and the count is what somebody scanning it wants.
 */
export function namesPhrase(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] as string;
  if (names.length <= 3) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] as string}`;
  }
  const rest = names.length - 2;
  return `${names.slice(0, 2).join(", ")} and ${String(rest)} others`;
}

const DRAFT_NOTE = "It is a draft until it is sent to be agreed.";

/* ------------------------------------------------------------------ toasts */

/**
 * An objective was made. Its detail opens next, which is where KPIs go under
 * it, so the toast names it and says what state it is in.
 */
export function objectiveCreatedSaid(
  goal: GoalFacts,
  viewerId?: string | null,
): Said {
  const period = periodOf(goal);
  const lead =
    `${possessive(goal, viewerId)} objective` +
    (period ? ` for ${period}.` : ".");
  return {
    title: `"${goal.title}" created`,
    detail:
      goal.approval === "DRAFT"
        ? `${lead} It is a draft, so add KPIs under it and send it to be agreed.`
        : lead,
  };
}

/** A KPI was added under an objective, or on its own. */
export function kpiAddedSaid(goal: GoalFacts, viewerId?: string | null): Said {
  const period = periodOf(goal);
  const lead =
    `${possessive(goal, viewerId)} KPI` +
    (goal.parentTitle ? ` under "${goal.parentTitle}"` : "") +
    (period ? `, for ${period}` : "") +
    ".";
  return {
    title: `"${goal.title}" added`,
    detail: goal.approval === "DRAFT" ? `${lead} ${DRAFT_NOTE}` : lead,
  };
}

/**
 * One KPI given to several people.
 *
 * "Already had it" is a perfectly good outcome and not an error, so a call that
 * made nothing says so in a neutral tone rather than a success one. Somebody
 * who picked eight people and saw six appear is owed the two names, which is
 * why `alreadyHad` always comes back named.
 */
export function kpisAssignedSaid({
  owners,
  alreadyHad,
  parentTitle,
}: {
  /** The people who now have one, from the rows that were made. */
  owners: readonly string[];
  /** The people who were skipped because they already had it. */
  alreadyHad: readonly string[];
  parentTitle: string | null;
}): Said {
  const skipped =
    alreadyHad.length > 0 ? `${namesPhrase(alreadyHad)} already had it.` : "";

  if (owners.length === 0) {
    return {
      title: "No new KPI made",
      ...(skipped ? { detail: skipped } : {}),
      tone: "info",
    };
  }

  const where = parentTitle ? ` under "${parentTitle}"` : "";
  const sentence =
    owners.length === 1
      ? `It sits${where}, for them to update and send to be agreed.`
      : `Each has their own copy${where}, to update and send to be agreed.`;

  return {
    title:
      owners.length <= 3
        ? `KPI given to ${namesPhrase(owners)}`
        : `KPI given to ${String(owners.length)} people`,
    detail: skipped ? `${sentence} ${skipped}` : sentence,
  };
}

/** A measure was added. Its figures are what prove which one. */
export function measureAddedSaid(
  measure: Pick<
    ApiKeyResult,
    "label" | "unit" | "startValue" | "targetValue" | "lowerIsBetter"
  >,
  goalTitle?: string | null,
): Said {
  return {
    title: goalTitle
      ? `"${measure.label}" added to "${goalTitle}"`
      : `"${measure.label}" added`,
    detail:
      `${formatMeasure(measure.startValue, measure.unit)} to ` +
      `${formatMeasure(measure.targetValue, measure.unit)}` +
      `${measure.lowerIsBetter ? ", counting down" : ""}.`,
  };
}

/**
 * An objective was marked done.
 *
 * Done is a judgement and the measures may disagree with it, and the API says
 * how many do, so that is said here rather than leaving a green tick over a
 * figure that is short. Progress is 100 whichever it is: `completeGoal` sets it
 * unconditionally.
 */
export function markedDoneSaid({
  title,
  measures,
  shortOfTarget,
}: {
  title: string;
  /** How many measures it has. */
  measures: number;
  /** How many of them are short of target. */
  shortOfTarget: number;
}): Said {
  let detail: string;
  if (shortOfTarget > 0) {
    const short =
      shortOfTarget === measures
        ? measures === 1
          ? "Its measure is short of target"
          : `All ${String(measures)} of its measures are short of target`
        : `${String(shortOfTarget)} of its ${String(measures)} measures ${shortOfTarget === 1 ? "is" : "are"} short of target`;
    detail = `${short}. The numbers stay as they are.`;
  } else if (measures > 0) {
    detail = `${measures === 1 ? "Its measure is" : "Every measure is"} at target. Progress is 100%, and it has left the tracked list.`;
  } else {
    detail = "Progress is 100%, and it has left the tracked list.";
  }
  return { title: `"${title}" is marked done`, detail };
}

/**
 * An objective was shared. `shared` is how many people the API actually told,
 * so this is the one place a number of people told may be said out loud.
 */
export function sharedSaid(title: string, shared: number | undefined): Said {
  if (typeof shared !== "number") return { title: `"${title}" shared` };
  return {
    title: `"${title}" shared`,
    detail:
      shared === 0
        ? "No one was told."
        : shared === 1
          ? "1 person was told."
          : `${String(shared)} people were told.`,
  };
}

/** An agreed objective was reopened, which is the one way a frozen target moves. */
export function reopenedSaid(title: string): Said {
  return {
    title: `"${title}" reopened`,
    detail: "It has to be agreed again. Your reason is on the record.",
  };
}

/** An objective was sent back, with the reason kept beside it. */
export function sentBackSaid(
  goal: Pick<GoalFacts, "title" | "ownerName">,
): Said {
  return {
    title: `"${goal.title}" sent back`,
    detail: goal.ownerName
      ? `Your reason is kept with it. ${goal.ownerName} can change it and send it again.`
      : "Your reason is kept with it. It can be changed and sent again.",
  };
}

/** An objective was refused, which is terminal. */
export function refusedSaid(goal: Pick<GoalFacts, "title">): Said {
  return {
    title: `"${goal.title}" refused`,
    detail:
      "Your reason is on the record. A refused objective cannot be sent again.",
  };
}

/* ----------------------------------------------------------------- moments */

/**
 * Sending an objective to be agreed.
 *
 * `sentTo` is who the API addressed it to, **not who it reached**: it is the
 * line manager, or the department head, or everybody who can edit records, less
 * the person sending. The API reports it as a list of employee ids (the type
 * used to say a nullable string, and nothing read it). So the count is quoted
 * and nobody is named or said to have been told.
 *
 * An empty list is not a success, and the API says so in as many words: it used
 * to sit in "waiting to be agreed" for ever under a toast saying it had been
 * sent. It comes back as a notice instead of a moment, because a green check
 * over an objective nobody else was asked to agree is the wrong picture. It can
 * still be agreed by whoever is allowed to — a line manager who sent it for
 * their own report is one — so the notice says who was *not* asked rather than
 * that nobody can.
 *
 * `undefined` is demo mode, which answers with nothing. No line about who it
 * went to then, and no claim in its place.
 */
export function sentToAgreeCopy({
  goal,
  sentTo,
  viewerId,
}: {
  goal: GoalFacts;
  sentTo: readonly string[] | undefined;
  viewerId?: string | null;
}): { kind: "moment"; copy: MomentCopy } | { kind: "notice"; said: Said } {
  if (sentTo && sentTo.length === 0) {
    return {
      kind: "notice",
      said: {
        title: `"${goal.title}" is waiting to be agreed`,
        detail:
          "Nobody else was asked to agree it. Anybody who can will find it under Objectives to agree.",
        tone: "warning",
      },
    };
  }

  const details: string[] = [];
  if (sentTo) {
    details.push(
      sentTo.length === 1
        ? "Sent to 1 person who can agree it."
        : `Sent to ${String(sentTo.length)} people who can agree it.`,
    );
  }
  details.push("Once it is agreed the target is fixed. Progress still moves.");

  return {
    kind: "moment",
    copy: {
      title: `"${goal.title}" is waiting to be agreed`,
      lead: describeObjective(goal, viewerId),
      details,
    },
  };
}

/**
 * Agreeing an objective, the one-way door for its target.
 *
 * Says what was agreed and what is now fixed, in the words the confirmation
 * and the API already use. It does not say the owner was told: the API
 * notifies them and does not report whether it reached them.
 */
export function agreedCopy(goal: GoalFacts): MomentCopy {
  return {
    title: `"${goal.title}" is agreed`,
    lead: describeObjective(goal),
    details: [
      "The target is fixed. Progress still moves.",
      "Changing it now takes a revision, which is recorded.",
    ],
  };
}
