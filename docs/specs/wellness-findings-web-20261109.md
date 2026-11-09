# Wellness findings, web side (9 Nov 2026)

Four things from the Wellness review, on branch `fix/wellness-findings-web-20261109`, cut from `origin/staging` at `07fe208c`. The backend half is `fix/wellness-findings-20261109` in `approvehr-api`, written in parallel. Wellness still has no demo mode (`src/lib/store/wellness.ts`), and none was added.

## What changed

1. **Report a kudos.**
   - Any kudos you did not give has a quiet "Report" under it. It opens a dialog that says what happens ("This hides it from you and sends it to your company's administrators. They will see what it says, who gave it, who it was for and that you reported it."), shows which kudos it is, and takes an optional reason (500 characters).
   - "Reported" is said only when the API answers 204. The kudos then leaves the list in front of the person. A 404, a 5xx or no connection says "Reporting isn't available right now." in the dialog, claims nothing, and leaves the kudos where it was. The API's own sentence is shown for any other refusal.
   - People who hold `MANAGE_SETTINGS` get a "Reports" pill in Recognition (with the open count) listing open reports: the words, giver, recipient, who reported it and what they wrote, with **Remove kudos** and **Dismiss report**, each behind a confirm that names the effect. The pill is drawn only when the permission is held **and** the API answered the list. A person without the permission never asks. A 403 or 404 on the list leaves nothing, not a greyed tab. Any other failure draws the pill and shows the failure card with Try again.
   - Files: `src/lib/api/wellness.ts` (types, `reportRecognition`, `kudosReports`, `resolveKudosReport`, `reportingUnavailable`), `src/lib/store/wellness.ts` (`useKudosReports`, two actions), `recognition-screen.tsx`, new `kudos-reports.tsx`. Nothing is stored in the browser.
2. **Lowering the privacy floor asks first.** A lower number opens a confirm ("Fewer people will be needed before a team result is shown. It is N now, and it can never go below 3. Anyone who joined a challenge under a higher number keeps that one."). Raising it saves straight away. The minimum of 3 is unchanged, and a number the form refuses never reaches the confirm.
3. **Delivery no longer says "N other people logged nothing this week" company-wide.** It is drawn only for scope `REPORTS` ("Your team"). For `ALL` ("Everyone") it counts everybody with no objectives and read like blame, so it is not drawn, and the empty-week line says "There is nothing to show for this week." The API still sends the figure. The mobile app got the same change in its own branch. This is the answer to decision 3 in `wellness-fixes.md`. No existing test pinned the line for `ALL`; two new ones in `tests/wellness-delivery.test.tsx` now hold its absence (checked: they fail with the change taken out).
4. **Privacy policy** (`PRIVACY` in `src/lib/marketing/legal.ts` only), `updated` is 9 November 2026 and the "what changed" note says what is new. It now says a person can report a kudos, what that shows administrators, and that a private kudos is the one thing it makes readable by anybody else. It also says the app-use figures follow the company's own floor (never below 3), and that a company-wide "logged nothing" count is not shown. See `privacy-policy-update-2026-11.md`. Terms, security, the DPA and every consent wording are untouched.

## Decisions made

- **No Report on a kudos you gave.** You can delete it. Everything else, including a private kudos you received, can be reported.
- **A Reports pill, not a separate page.** Recognition already switches lists with pills, so the fourth one fits.
- **Only open reports are listed.** The adapter takes `status=RESOLVED`, no screen asks for it.
- **A report on an already-removed kudos offers only "Close report"**, and a removed kudos with no words shows no empty box.
- **Strict 204.** `wellnessApi.reportRecognition` and `resolveKudosReport` treat any other 2xx as not done, so the screen cannot say "Reported" on an answer it did not expect.
- **Wording of the confirms** follows what the backend branch says it does: Remove deletes the kudos for everybody, Dismiss leaves it and it stays hidden from the reporter.

## Tests

`tests/wellness-kudos-reports-api.test.ts` (new, the real client over a stubbed `fetch`: request shape, 204 only, 404 / 502 / dead connection / refusal), `tests/wellness-recognition.test.tsx` (report dialog and every state; the Reports pill present, absent, absent on 403 and 404, not drawn while loading, drawn on a 500; the list, both confirms, success, failure, 404 on resolve, empty, already removed), `tests/wellness-settings-and-shell.test.tsx` (lowering, raising, minimum, cancel, refusal, Enter), `tests/wellness-delivery.test.tsx` (the two new absences).

## Checked in a browser

Real staging API (`origin/staging` at `2093864`, a scratch database, Wellness switched on, the existing floor and delivery routes for real) behind a small proxy that **stood in for the three new report routes**, with a mode switch for ok, 404, 500 and a dead connection. As a plain employee (Chidi): Report on kudos from others and not on his own, the dialog, the 404 and dead-connection messages, then a 204 and the kudos leaving the list. As an administrator (Amara): the Reports pill and count, the list, both confirms, dismiss and remove, the pill absent on a 404, the failure card on a 500, the empty state. The floor lowering (real `PATCH`) and the Delivery screen as HR (`ALL`) and as a line manager (`REPORTS`). Light and dark, 1280 and 375 wide, no horizontal overflow.

## Not verified

- **The report routes against the real backend.** They were not deployed (the CI runner disk is full), so the three routes were a mock. The request and response shapes are the brief's, not read off deployed code. If the backend's rows differ (for example no `message` on a removed kudos), the cards will show less, not break.
- **What a Dismiss does for the reporter beyond "stays hidden"**, and whether Remove on a report whose kudos is already gone is refused, are read from the backend branch's schema comments, not run.
- **A screen reader**, a real phone, iOS Safari. The 375 width is the browser's emulation.
- **The Reports pill count after another administrator acts**, which is only seen on the next refresh.
- **The app-open sentence in the policy.** See `privacy-policy-update-2026-11.md`.
