import type { ApiSection } from "@/lib/api/performance";
import type { FrameworkGroup } from "@/lib/store/performance";

/**
 * The competency groups a level can be recorded under, split by whether they
 * count towards the score (UAT 23 Nov, U39).
 *
 * A group is left out when its section is known and counts towards no part
 * (`component` null, such as "Key result area") or towards a part weighted at
 * nothing: a level recorded there moves nobody's score. A group whose section
 * is not in the list, and every group while the sections are not known, is
 * kept: an unknown weight is not a zero.
 */
export function splitScoredGroups(
  groups: FrameworkGroup[],
  sections: ApiSection[],
): { offered: FrameworkGroup[]; hidden: string[] } {
  if (sections.length === 0) return { offered: groups, hidden: [] };
  const byId = new Map(sections.map((one) => [one.id, one]));
  const offered: FrameworkGroup[] = [];
  const hidden: string[] = [];
  for (const group of groups) {
    const known = group.sectionId ? byId.get(group.sectionId) : undefined;
    const countsForNothing =
      known !== undefined && (known.component === null || known.weightBp === 0);
    if (countsForNothing) hidden.push(group.sectionName);
    else offered.push(group);
  }
  return { offered, hidden };
}

/** "A", "A and B", "A, B and C". */
export function namesInWords(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
