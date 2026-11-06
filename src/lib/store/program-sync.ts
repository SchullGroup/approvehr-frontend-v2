/**
 * "Something about the projects changed", for the programs store to hear.
 *
 * A program's card counts its projects and open tasks, so making or deleting a
 * project makes those counts stale. `store/projects.ts` says so here and
 * `store/programs.ts` listens; neither imports the other, so the two can use
 * each other's answers without a cycle between them.
 */

const listeners = new Set<() => void>();

export function onProjectsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function projectsChanged(): void {
  listeners.forEach((listener) => listener());
}
