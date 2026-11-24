/**
 * Which step a payroll opens on once its run is known (U79, PAY-23).
 *
 * The wizard used to open every run on Period & review, so an approver landed
 * on the preparer's screen (an editable month and pay date, "Run again", a
 * warning that they cannot run payroll) and had to press Continue to reach the
 * one thing they came for. An approved run reopened there too, under "Preparing
 * again replaces the payslips", one click short of its pay card.
 *
 * A link that names a step (`?step=`) still wins: somebody sent there meant it.
 * Decided once, when the run first arrives, so changing the month on the first
 * step never moves the person off the screen they are working on.
 */
export function opensOnApprove(input: {
  /** `?step=` named a step the wizard knows. */
  stepRequested: boolean;
  /** The month has a run that is approved or paid. */
  approved: boolean;
  canPrepare: boolean;
  canApprove: boolean;
}): boolean {
  if (input.stepRequested) return false;
  if (input.approved) return true;
  return input.canApprove && !input.canPrepare;
}
