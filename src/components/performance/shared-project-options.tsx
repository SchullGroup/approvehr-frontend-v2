import type { SharedColleague } from "@/lib/api/shared-projects";
import {
  orderBySharedProjects,
  sharedLabel,
} from "@/lib/performance/work-in-answers";

/**
 * The people in a `<select>`, with the ones who shared a project with somebody listed first.
 *
 * `colleagues` is what the server said, or `null` when it said nothing (the setting is off, the
 * reader is not one it answers, the request failed, or the person has not touched the list yet):
 * then this is exactly the plain list it replaces, in the order it came in, with no group heading and
 * no label. When it did say, and somebody on the list shared a project, they come first under one
 * heading and each says how many; everybody else follows under another, in their own order. Nobody
 * is added, dropped or chosen: this only orders a list the person still picks from.
 *
 * Nothing is said about the work: a count of shared projects and no project's name, no task.
 */
export function SharedProjectOptions({
  people,
  colleagues,
  text,
}: {
  people: readonly { id: string; name: string; jobTitle: string }[];
  colleagues: readonly SharedColleague[] | null;
  /** The option's words for one person, before any shared-project label. */
  text: (person: { id: string; name: string; jobTitle: string }) => string;
}) {
  const ordered = orderBySharedProjects(people, colleagues);
  const shared = ordered.filter((one) => one.shared > 0);
  if (shared.length === 0) {
    return (
      <>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {text(person)}
          </option>
        ))}
      </>
    );
  }
  const rest = ordered.filter((one) => one.shared === 0);
  return (
    <>
      <optgroup label="Shared a project">
        {shared.map(({ person, shared: count }) => (
          <option key={person.id} value={person.id}>
            {`${text(person)} — ${sharedLabel(count)}`}
          </option>
        ))}
      </optgroup>
      {rest.length > 0 && (
        <optgroup label="Everybody else">
          {rest.map(({ person }) => (
            <option key={person.id} value={person.id}>
              {text(person)}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
