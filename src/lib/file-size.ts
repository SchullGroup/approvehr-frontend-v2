/**
 * `5 MB`, `1.2 MB`.
 *
 * Whole megabytes print whole and anything else with one decimal, so a size in
 * a sentence is the size in the list beside it. One copy: a sentence that says
 * "7 MB" under a row that reads "6.0 MB" is two copies drifting.
 */
export function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? String(mb) : mb.toFixed(1)} MB`;
}
