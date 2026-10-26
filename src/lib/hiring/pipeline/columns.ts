import type { BoardCard, BoardColumn, BoardStage } from "./model";

/**
 * The columns of a board, and which one a card is in.
 *
 * Connected, the server draws the columns and the screen draws what it is given.
 * This file is for the two things that need the answer *without* a round trip: the
 * demo, which has no server to ask, and a card that has to find its own column
 * after an optimistic move.
 *
 * ## The two ends are columns whether or not they are stages
 *
 * A person is rejected by an **outcome** and hired by an accepted offer, so the
 * Hired and Rejected columns exist for every pipeline. When the pipeline has a
 * stage of that type, its name is the column's name (it is what the company called
 * it) and its key is the stage's; when it has none — every pipeline made before
 * stage types — the column is keyed by the outcome alone.
 *
 * No React, no state.
 */

const endsFor = (type: BoardStage["type"]): BoardColumn["ends"] =>
  type === "HIRED" ? "HIRED" : type === "REJECTED" ? "REJECTED" : null;

export function columnsFor(stages: readonly BoardStage[]): BoardColumn[] {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const columns: BoardColumn[] = ordered.map((stage) => ({
    key: `stage:${stage.id}`,
    label: stage.name,
    stageId: stage.id,
    type: stage.type,
    ends: endsFor(stage.type),
    order: stage.order,
  }));
  const last = columns.length;
  if (!columns.some((column) => column.ends === "HIRED")) {
    columns.push({
      key: "outcome:HIRED",
      label: "Hired",
      stageId: null,
      type: null,
      ends: "HIRED",
      order: last,
    });
  }
  if (!columns.some((column) => column.ends === "REJECTED")) {
    columns.push({
      key: "outcome:REJECTED",
      label: "Rejected",
      stageId: null,
      type: null,
      ends: "REJECTED",
      order: last + 1,
    });
  }
  return columns;
}

/** Which column a card is in right now, among the columns on screen. */
export function columnKeyOf(
  card: Pick<BoardCard, "outcome" | "stageId">,
  columns: readonly BoardColumn[],
): string | null {
  const ends =
    card.outcome === "HIRED"
      ? "HIRED"
      : card.outcome === "REJECTED" || card.outcome === "WITHDRAWN"
        ? "REJECTED"
        : null;
  if (ends) return columns.find((column) => column.ends === ends)?.key ?? null;
  if (card.stageId) {
    const own = columns.find((column) => column.stageId === card.stageId);
    if (own) return own.key;
  }
  return columns.find((column) => column.key === "stage:none")?.key ?? null;
}

/** The stage id behind a `stage:<id>` key, or `null` for an outcome-only column. */
export const stageIdOf = (key: string): string | null =>
  key.startsWith("stage:") && key !== "stage:none"
    ? key.slice("stage:".length)
    : null;
