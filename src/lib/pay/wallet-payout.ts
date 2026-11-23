/**
 * Whether a payroll is paid from the wallet (U30).
 *
 * The company setting alone said yes for a company with no funding account and
 * no payment provider, which put a "Pay ₦… to 62 people" button on screen that
 * did nothing. It counts only where the API says a payout could actually run;
 * an older API that does not say leaves the bank file, the path certain to
 * work.
 */
export function paysFromWallet(
  walletSetting: boolean,
  run: { payoutAvailable?: boolean },
): boolean {
  return walletSetting && run.payoutAvailable === true;
}
