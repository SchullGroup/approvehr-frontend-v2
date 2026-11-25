import { dayLabel, type ApiCycleParticipants } from "@/lib/api/performance";

/**
 * Who "Nudge who is late" will reach, before it is pressed.
 *
 * The API reminds the author of every form in the period that has not been
 * sent: the person for their self-review, the appraiser for a manager review,
 * and the colleagues asked for peer feedback. Each gets one notification, and an
 * email where the company sends one, saying how many they still owe. So the
 * confirmation names the first two kinds of author, once each, and counts the
 * peer forms without naming who owes them, because peer feedback is anonymous.
 *
 * `null` when the participants are not known to this reader (they need the
 * records permission): the dialog then says who is reached in general terms
 * rather than naming nobody, which would read as "nobody is late".
 */
export type NudgeAudience = {
  /** Authors of unsent self and manager reviews, once each, in A to Z order. */
  names: string[];
  /** Peer feedback forms asked for and not yet answered. */
  peerForms: number;
};

export function nudgeAudience(
  participants: ApiCycleParticipants | null,
): NudgeAudience | null {
  if (!participants) return null;
  const names = new Set<string>();
  let peerForms = 0;
  for (const person of participants.rows) {
    if (person.self && !person.self.submitted) names.add(person.employeeName);
    for (const manager of person.managers) {
      if (!manager.submitted) names.add(manager.managerName);
    }
    peerForms += Math.max(0, person.peers.asked - person.peers.answered);
  }
  return {
    names: [...names].sort((a, b) => a.localeCompare(b)),
    peerForms,
  };
}

/** Whether anybody at all would be reminded. */
export function anybodyToNudge(audience: NudgeAudience): boolean {
  return audience.names.length > 0 || audience.peerForms > 0;
}

/**
 * What the reminder says, described rather than quoted: the count in it is each
 * person's own, so no one sentence is what everybody receives.
 */
export function nudgeMessage(
  cycleName: string,
  dueDate: string | null,
): string {
  const due = dueDate
    ? `, and that it is due ${dayLabel(dueDate.slice(0, 10))}`
    : "";
  return `Each of them gets a reminder in the app, and by email, saying how many reviews they still have to send for ${cycleName}${due}.`;
}

/** The dialog's title. */
export function nudgeTitle(audience: NudgeAudience | null): string {
  if (!audience) return "Nudge who is late?";
  const count = audience.names.length;
  if (count === 0) return "Nudge the colleagues who owe feedback?";
  return count === 1 ? "Nudge 1 person?" : `Nudge ${String(count)} people?`;
}

/** The line about peer feedback, or null when none is owed. */
export function peerLine(audience: NudgeAudience): string | null {
  if (audience.peerForms === 0) return null;
  const forms =
    audience.peerForms === 1
      ? "1 piece of peer feedback"
      : `${String(audience.peerForms)} pieces of peer feedback`;
  return `${audience.names.length > 0 ? "Also the" : "The"} colleagues who owe ${forms}. They are not named here, because peer feedback is anonymous.`;
}
