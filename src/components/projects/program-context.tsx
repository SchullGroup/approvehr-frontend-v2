"use client";

import { createContext, useContext } from "react";
import type { Program } from "@/lib/projects/programs";
import type { ProgramActions } from "@/lib/store/programs";
import type { People } from "@/lib/store/project-session";

/**
 * What a view of a program is handed.
 *
 * The program screen loads one program and provides it here, so every view of
 * it (Overview, Projects, Board, Tasks, Workload, Timeline, People & access,
 * Settings) is a component with **no props** that calls `useProgram()`. A new
 * view needs a registry entry in `app/(app)/projects/programs/[id]/program-views.tsx`
 * and nothing else, as a project's views do (`project-context.tsx`).
 *
 * - `program` is the card the API sent for this person: its `access`,
 *   `canManage` and `canCreateProject` are what to draw from. Nothing here
 *   works a level out again.
 * - `unassigned` is the bucket of projects in no program. It has no people, no
 *   settings and no lead; `program` then carries only a name and the person's
 *   own reach.
 * - `reach` is how far a list of projects may go: `all` is the whole company,
 *   which only people who hold the Master grant or manage records are allowed.
 */
export type ProgramContextValue = {
  program: Program;
  unassigned: boolean;
  actions: ProgramActions;
  people: People;
  /** Ask for the program again. */
  reload: () => void;
  /** HR and the Master grant may ask for every project in none; everybody else for their own. */
  reach: "mine" | "all";
  /** The signed-in person's employee id, if they have one. */
  meId: string | null;
};

const ProgramContext = createContext<ProgramContextValue | null>(null);

export const ProgramProvider = ProgramContext.Provider;

export function useProgram(): ProgramContextValue {
  const value = useContext(ProgramContext);
  if (!value) {
    throw new Error("useProgram must be used inside a program screen.");
  }
  return value;
}
