"use client";

import { Button, Disclosure } from "@/components/ui";
import { dayLabel } from "@/lib/api/performance";
import {
  WEEKLY_LINE_NO_ROOM,
  WEEKLY_LINE_ONE_AT_A_TIME,
  lineFits,
} from "@/lib/performance/weekly-line";
import { useFeatureSettings } from "@/lib/store/features";
import { useTaskSuggestions } from "@/lib/store/work-assists";

/**
 * The tasks a person finished this week under an objective, offered as text for a weekly line.
 *
 * ## It offers text. It writes nothing.
 *
 * Choosing one puts its words in the box the person is typing a weekly line into, and that is all. They
 * read it, change it, add to it or throw it away, and nothing is logged, filed, submitted or graded
 * until they press Save it themselves, as they always have. A manager grades what the person sent, not
 * what the tool offered. The caption says so in one line, where it is needed: a button that adds text to
 * a box could be mistaken for one that logs a task.
 *
 * ## It is the owner's own finished work, and nobody else's
 *
 * The API answers only the owner of the objective, on an agreed objective, and lists their own tasks
 * finished in this submission week (Monday to Sunday) under it. The titles in the text are read live
 * and sent only to them, and are not stored by this or by anything else.
 *
 * ## It draws nothing it was not told
 *
 * Nothing for a company that has not switched the assists on (and then no request is made), a server
 * with no such route, a failed read, or a week with nothing finished under this objective. A week with
 * nothing is not worth a control that opens to a sentence saying so, and an absent control claims
 * nothing about the person's week. When there are more than the API sends, the list says how many it
 * shows of how many there are.
 *
 * It is asked for only while the box is open, so a screen of objectives opens no request per card.
 */
export function TaskSuggestions({
  goalId,
  text,
  onAdd,
  disabled = false,
}: {
  goalId: string;
  /** What is in the box now, so a line already there is shown as added and not offered again. */
  text: string;
  /** Puts one line of text in the box. The caller owns the box and decides how it is joined. */
  onAdd: (line: string) => void;
  disabled?: boolean;
}) {
  const features = useFeatureSettings();
  const { suggestions } = useTaskSuggestions(
    goalId,
    features.workAssists === true,
  );
  if (!suggestions || suggestions.items.length === 0) return null;

  /* The week and the day a task was finished are the company's calendar days: `dayLabel` never puts
     one through a zone, where reading it as an instant makes it the day before west of Greenwich. */
  const day = dayLabel;
  /* A weekly line is one line of at most 300 characters. A task that would take the box past that is
     not offered, and says why on its own row, so adding several is never a surprise at Save. */
  const noRoom = suggestions.items.some(
    (item) => !text.includes(item.text) && !lineFits(text, item.text),
  );

  return (
    <Disclosure
      title="Add from my finished work"
      meta={String(suggestions.total)}
      level={4}
      dense
    >
      <p className="pb-1 text-meta text-muted">
        Finished {day(suggestions.week.start)} to {day(suggestions.week.end)},
        under this objective. Adding one puts its words in the box above and
        nothing else.
      </p>
      <ul className="divide-y divide-line">
        {suggestions.items.map((item) => {
          const added = text.includes(item.text);
          const fits = added || lineFits(text, item.text);
          return (
            <li
              key={item.issueId}
              className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2"
            >
              <span className="min-w-0 flex-1 text-body-sm text-body">
                <span className="break-words">{item.text}</span>
                <span className="ml-2 text-meta text-muted">
                  {day(item.finishedOn)}
                </span>
                {!fits && (
                  <span className="mt-0.5 block text-meta text-muted">
                    {WEEKLY_LINE_NO_ROOM}
                  </span>
                )}
              </span>
              <Button
                size="sm"
                disabled={disabled || added || !fits}
                onClick={() => onAdd(item.text)}
              >
                {added ? "Added" : "Add"}
                <span className="sr-only"> {item.key}</span>
              </Button>
            </li>
          );
        })}
      </ul>
      {noRoom && (
        <p className="pt-1 text-meta text-muted">{WEEKLY_LINE_ONE_AT_A_TIME}</p>
      )}
      {suggestions.truncated && (
        <p className="pt-1 text-meta text-muted">
          Showing {suggestions.items.length} of {suggestions.total}.
        </p>
      )}
    </Disclosure>
  );
}
