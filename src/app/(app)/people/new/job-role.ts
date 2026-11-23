/**
 * What the job title becomes when somebody chooses a job role (U47).
 *
 * The title stays free text: a role is "Accountant" and a person can be
 * "Senior Accountant, Abuja". So choosing a role fills the title only when it
 * is empty or still reads the previously chosen role's title, never over what
 * somebody typed themselves.
 */
export function titleForRole(
  currentTitle: string,
  previousRoleTitle: string,
  nextRoleTitle: string,
): string {
  const typed = currentTitle.trim();
  return typed === "" || typed === previousRoleTitle.trim()
    ? nextRoleTitle
    : currentTitle;
}
