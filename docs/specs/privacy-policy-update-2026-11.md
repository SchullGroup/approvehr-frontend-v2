# Privacy policy update, 8 November 2026

The mobile app now has the same Wellness features as the web app (recognition, the weekly delivery report, the employer screens, step sync, push). The public policy was last written on 20 August 2026 and knew about none of it. This note records what changed in `src/lib/marketing/legal.ts` (`PRIVACY`), where every claim comes from, what the change makes untrue elsewhere, what could not be verified and was left out, and what counsel has to decide.

I am not counsel. The policy states facts read in code and specs, invents no legal basis, retention period, contact, certification or promise, and no consent wording was touched (the wording is the server's, versioned `2026-10-20.2`, and counsel's).

## Second pass, 9 November 2026

Three things became true after the first pass, and the policy now says them. `updated` is `9 November 2026` and the `statusNote` leads with them. Nothing else in `PRIVACY` moved except the sentences listed here; `terms`, `security`, `dpa` and every consent wording are untouched.

| # | Where in `PRIVACY` | What it now says | Source |
| --- | --- | --- | --- |
| a | Kudos (new paragraph, and one clause in the one before) | Anybody who can see a kudos can report it. Reporting hides it from the reporter and sends it to administrators (people who manage company settings): what it says, who gave it, who it was for, when it was sent, who reported it, what the reporter wrote. That includes a private kudos, the only way anybody but its two people can read one. An administrator can remove it (deleted for everybody) or dismiss the report (left as it is, and still hidden from the reporter). The reporter is told this before confirming. | Web: `recognition-screen.tsx` (`ReportDialog`), `kudos-reports.tsx`. Backend branch `fix/wellness-findings-20261109` (`RecognitionReport` in `schema.prisma`, read from the working tree before it was committed): one report per person per kudos, hidden from the reporter whatever is decided, `MANAGE_SETTINGS` only. |
| b | What we collect: Kudos, What your employer can and cannot see: Kudos and "What administrators can change" | The report (reporter, reason, decision) is a thing we hold. A private kudos is visible to its two people unless somebody who can see it reports it. Administrators can decide what happens to a reported one. | same |
| c | Whether you opened the app, Challenges, What your employer can and cannot see: App use | The app-use total appears only when at least as many people are counted as the company's privacy floor, never below 3, not a fixed 3. | Backend branch: `engagement/floor.ts` now returns `privacyFloorOf(db)`, which clamps to the hard minimum. This removes the mismatch recorded below in "Statements elsewhere that this makes inaccurate" (the `docs/store/app-privacy.md` row about the floor). |
| d | The weekly delivery report | HR sees everybody who logged tasks, and the report no longer says how many people in the whole company logged nothing. A line manager's or department head's team still gets that count. | Web `delivery-screen.tsx` and the mobile `DeliveryScreen.tsx` both stopped drawing it for scope `ALL`. The API still sends it. |

### Held back, and why

- **RESOLVED 2026-11-09 (was: the app-open sentence is unchanged).** The backend (`staging` 8a6db2a, migration `20261109090100_app_open_day_only`) now drops the time column; the sentence says "your account and the company's calendar day, and nothing else". It is TRUE only once that backend is deployed (the CI runner disk has blocked backend deploys); the page is not public until exported. It used to say the record holds "the time the record was created". The backend branch has a migration that drops that column (`20261109090100_app_open_day_only`) and a schema change, but its findings document (`docs/backend/wellness-findings-20261109.md`) was not on `origin` when this pass finished, so nothing confirmed it had merged or would. When it does, the sentence in `app-open` becomes "The record holds your account and the company's calendar day, and nothing else", and the "what we collect" row needs no change.

### What this changes about the questions for counsel

- **Question 9 (kudos moderation) is no longer hypothetical.** A report route now exists, and by design it puts a private kudos in front of an administrator when somebody who can see it reports it. The policy says so in plain words and the reporter is told in the dialog. Counsel should decide whether that is acceptable for a private kudos, and whether the report record (reporter, reason, decision) needs a stated retention period. The policy states none: no deletion of reports was read in code.
- **Question 7 and the "Kudos: no report path" finding above are out of date.** There is now a path.
- Reports are not audited per person on the backend (the audit trail records that one was resolved, not who reported what), per the schema comment. Not verified here, and the policy does not claim it.

## Where this goes live (read this first)

- Changed: `src/lib/marketing/legal.ts`, the `PRIVACY` block only. `updated` is now `8 November 2026`, and the `statusNote` (rendered by the existing `LegalDocument` aside, no new UI) carries the visible "what changed" line. `terms`, `security` and `dpa` are untouched.
- **Pushing this to web staging does not publish the policy.** The web app 308-redirects `/privacy`, `/terms`, `/security`, `/dpa` to `https://approvehr.io` (`src/proxy.ts`, `src/lib/marketing/redirected.ts`). The public page is the copy of `legal.ts` inside the separate `approvehr-marketing` repo, regenerated from this one with `scripts/export-marketing.ts`. That repo's `legal.ts` still says `20 August 2026` (read only; I did not touch it). Publishing means exporting into it and deploying it.
- To look at the page locally I removed `/privacy` from `REDIRECTED_PATHS` in an uncommitted edit, read the rendered page (20 sections, all in order, no horizontal overflow at 342 px, the note and the tables render), and reverted it.

## Sources read

| Source | At |
| --- | --- |
| Mobile app, `approvehr-mobile` | `origin/main` `7ae6223`: `docs/spec/mobile-v0.md`, `docs/spec/mobile-parity.md`, `docs/store/app-privacy.md`, `docs/store/audit.md`, `docs/NOT-VERIFIED.md`, `docs/HUMAN-STEPS.md`, `app.config.ts`, `package.json`, `src/**` |
| API, `approvehr-api` | `origin/staging` `2093864`: `docs/superpowers/specs/2026-10-20-wellness-design.md`, `docs/backend/mobile-push-registration.md`, `src/modules/{wellness,delivery-report,engagement,push,notifications,attendance,me,admin}`, `src/lib/expo-push.ts`, `prisma/schema.prisma` |
| Web, this repo | `origin/staging` `e5db548c`: `legal.ts`, the wellness screens, `app-open-beacon.tsx`, `geolocation.ts` |

Nothing here was run against a production API, and the app has never run on a physical phone or on Android (`docs/NOT-VERIFIED.md`). Where a fact is "the code does X", it was read, not observed live.

## What changed, and where each claim comes from

Paths are `approvehr-mobile` (M) at `origin/main`, `approvehr-api` (A) at `origin/staging`, or this repo (W). "Spec" means `docs/superpowers/specs/2026-10-20-wellness-design.md` (A), rules P1 to P22.

| # | Section | Old | New | Source |
| --- | --- | --- | --- | --- |
| 1 | Header | description without the app; `updated` 20 August 2026; no note | description names the web and the app and "who can see it"; `updated` 8 November 2026; `statusNote` lists the new topics | task; `LegalDoc.statusNote` in `legal.ts:48-49` |
| 2 | 1. Who is responsible | two paragraphs | adds: the Wellness features are the exception, what you log is yours to keep or delete and your employer cannot read it. Says nothing about controller or processor for it | Spec P3, "The one rule"; counsel question 2 |
| 3 | 2. What we collect | five rows | adds five: Clock-in location, Wellness records, Kudos, App-open mark, Notification address | rows 5, 6, 9, 10, 12 below |
| 4 | 3. The mobile app (new) | none | who it is for; accounts made by the employer, no sign-up or delete in the app; one server; no ad, analytics or crash SDK, no advertising identifier, no tracking; the three permissions and that refusing leaves the rest working | M `package.json` (no such dependency), `src/architecture.test.ts:68,83`, `app.config.ts:61` (`NSPrivacyTracking: false`), M `docs/store/audit.md` rows 7, 19, 21, `docs/store/app-privacy.md` "two top-level questions" |
| 5 | 4. What the app keeps on your phone (new) | none | refresh token in secure storage (iPhone: unlocked only, no backup, not moved); access token in memory; step-sync note with no figures; push token; local reminder notifications; nothing else saved; sign-out wipes and removes the token from the server first; screen snapshot caveat | M `src/auth/platform.ts:15`, `src/auth/token-store.ts:32`, `src/features/device-sync/state.ts:10`, `src/features/push/state.ts:5`, `src/services.tsx:51` (`queryClient.clear`), `src/auth/session.ts` (`onWipe`, `beforeSignOut`), spec `mobile-v0.md` sections 1, 4, 7.3, 8.2, rule C5 and C9 |
| 6 | 5. Your location when you clock in (new) | none | one read, at the tap, only while open, never in the background; browser asks only on the button; what is sent; what is stored on success (position, accuracy, distance); a refused clock-in stores nothing; no product screen shows it; no separate retention period | M `src/features/clock/location.expo.ts:28`, `flow.ts:76`, `app.config.ts:133`; W `src/lib/geolocation.ts` header; A `attendance/service.ts:1053-1081` (verdict first, then write; "recorded whenever both halves exist"), `schema.prisma` `AttendanceEntry` (`clockInLatitude`, `clockInLongitude`, `clockInAccuracyMetres`, `clockInDistanceMetres`); the four columns appear in no other file under A `src/`, so no route returns them; M `docs/NOT-VERIFIED.md` (refusal wrote nothing, live run) |
| 7 | 6. Wellness: water and steps (new) | none | off until the company switches it on; nothing stored until agreed, per purpose, nothing pre-ticked; two purposes and their order; versioned wording and a consent record only the person reads; what step sync reads and when it sends; read only, steps only, no background; a phone total replaces typed steps; who can read it; not for advertising or marketing; not reachable by report builder or assistant; access control, not a separate key; stopping, keep or delete, no default; stopping tracking leaves every challenge; stopping sync alone does not, and kept totals keep counting; erase always open | A `wellness/consent.ts:39-60,223-270`; Spec P1, P2, P3, P10, P11, P18, "What this still does not do"; A `admin/registry.ts:46-67` (`WellnessLog`, `WellnessConsent`, `Participation`, `Recognition`, `ReminderSend` hidden); A `wellness/logs.ts:306-340` (`dailyRowsFor` reads device rows with no consent filter); M `docs/spec/mobile-v0.md` 7.1, 7.2, 9.2 to 9.4 (look-back clamp 2 to 31 days, 15-minute foreground floor, no background sync, zero never sent), `app.config.ts:153-158` (steps only, no write, no background); A `device.ts` (replace, never add) |
| 8 | 7. Break reminders (new) | none | no consent needed; own settings private, including "turned off"; server delivery rules (saved policy only, at work, once); or phone-local delivery, never both; fixed catalogue or your own break name; slot note kept two days with no content; nobody can see receipt | A `wellness/reminder-sweep.ts:53,89,200-216,320-345`; Spec "Reminder delivery"; M `docs/spec/mobile-v0.md` 7.3, `src/config/env.ts:45` (`parseDelivery`); W `reminders-delivery.tsx` |
| 9 | 8. Challenges (new) | none | joining; individual board shows names and totals to participants, a joining manager or HR included; team board; floor of at least 3 (company up to 50); highest floor anyone joined under; floor is not a guarantee in a very small team | A `wellness/boards.ts:93,188-330`, `consent.ts:72-90` (join statement), `privacy.ts:42` (50), Spec P7, P14 to P17, P19, P20; M `docs/spec/mobile-v0.md` 7.4 |
| 10 | 9. Kudos (new) | none | 500 characters; shared goes on the company feed, private only to the two people, hidden from admin console; who can delete (giver, or an administrator for a shared one); deleting removes the notification; typed colleague search goes to our server; no Contacts access; no points or leaderboard | A `wellness/recognition.ts:58,71,132-141,209-236`, `schemas.ts:214`; M `docs/spec/mobile-parity.md` section 1 (Recognition), `docs/store/app-privacy.md` "Shown, not collected" |
| 11 | 10. The weekly delivery report (new) | none | task grading data, not wellness; own week for all; manager sees direct reports, department head the department, HR everyone plus the "logged nothing" count; listed by name; only where Wellness is on | A `delivery-report/service.ts:94-203` (`isHr`, `ledTeamOf`, scope, `silent`, name sort at 156), `delivery-report/router.ts:27` (`requireWellnessOn`); M `docs/spec/mobile-parity.md` section 3 item 2 |
| 12 | 11. Whether you opened the app (new) | none | off until the company turns it on; one record per person per day, web and app; what the record holds; administrators see a company-wide total only, at least 3 counted, no names, no team cut; "analytics" in Apple's sense | A `engagement/app-open.ts:30-72`, `schema.prisma:5500` (`appOpenTracking @default(false)`) and `10603-10617` (`AppOpen`), `engagement/weekly.ts` (header, the floor check and the `groupBy`), `engagement/floor.ts:23`; W `components/portal/app-open-beacon.tsx`; M `src/features/app-open/reporter.ts`, `docs/store/app-privacy.md` judgement call 1 |
| 13 | 12. What your employer can and cannot see (new) | none | one table: entries, joining, results, app use, delivery report, kudos, clock-in position, what administrators can change; who counts as an administrator | A `wellness/access.ts` (`canSeeEmployerResults` is `MANAGE_SETTINGS`), `setup/router.ts:77-90` (features switch, audited), Spec "Who sees what" and P9, P13, P14; `docs/store/app-privacy.md` section 3 |
| 14 | 13. Notifications (new) | none | headline and link only, no body, because Expo, Apple and Google can read it; headlines can name a person; no water or step figure; what the server stores (token, platform, dates), ten phones, token moves to the last person to sign in, removed at sign-out, dead tokens marked; browsers work the same with a short text line | A `push/native.ts:49-60,95-170`, `lib/expo-push.ts`, `modules/me/router.ts` (token routes, 30 per 15 minutes), `docs/backend/mobile-push-registration.md`, `notifications/service.ts:324-375` (`inAppOnly` skips email only, `pushEveryone` is not gated by it), `wellness/recognition.ts:132-141` (headline is the giver's name); M `docs/spec/mobile-v0.md` 8.1 to 8.3, `src/features/push/NotificationsCard.tsx` |
| 15 | 14. Why we are allowed to hold it | consent bullet: the demo form and any marketing email; "no effect on the service itself" | adds "and the optional Wellness features, which store nothing about your water or steps until you agree"; "the rest of the service" | A `consent.ts` (opt-in per purpose is what the code does); see counsel question 1 before this bullet goes public |
| 16 | 15. Who else sees it | "four situations only" | "five", adding notification services (token, headline and link, never a body) | row 14 |
| 17 | 16. Whether it leaves Nigeria | two paragraphs | adds one: the notification services are run by companies based outside Nigeria, and what they receive | row 14; "based outside Nigeria" is general knowledge, not code (counsel question 4) |
| 18 | 17. How long we keep it | two paragraphs | adds two: wellness records until deleted, with the leaver rule; kudos until deleted; position and app-open mark with no separate period; reminder slot note two days; token removed at sign-out when reachable | A `consent.ts`, `recognition.ts:209-236`, `reminder-sweep.ts:53,213`, Spec P11 and "Retention after exit"; no deletion job or `deleteMany` for `AppOpen` or the clock-in columns exists under A `src/` (grep), `native.ts:122,138` are the only token deletes; Prisma `onDelete: Cascade` from `Employee` on `Recognition` |

Sections left as they were: Your rights, Cookies, Changes to this policy. The policy has no children or security section, so there was nothing to leave or change there (counsel question 5). House style: no em dashes in the copy.

## Statements elsewhere that this makes inaccurate, or that need the same edit

I did not edit any of these.

| Where | What | Why |
| --- | --- | --- |
| DPA, `legal.ts` `DPA` | "Categories of personal data" has no clock-in position, wellness records, kudos, app-open marks or push tokens. "Sensitive personal data: only where you choose to record it, for example medical evidence" does not describe wellness data a person logs about themselves | new data is now processed |
| DPA, sub-processors | Expo (and Apple and Google as the push carriers) are not listed. The DPA promises 30 days' notice before adding one | the policy now names them as recipients |
| DPA, roles | "you are the data controller and we are the processor" for employee data | not obviously true for wellness records or the app-open mark (counsel question 2) |
| Security page | nothing is false. It says production access is limited and support access is recorded, which the new policy sentence relies on. It could usefully say wellness tables are hidden from the admin console and have no separate encryption key | consistency, not accuracy |
| Terms | nothing is false. The app is not mentioned (the policy says it is another way into the same account) | gap |
| App location string, `app.config.ts:133`, and the in-app clock explanation (`src/features/clock/ClockActions.tsx:114-118`) | "does not track you and never reads your location in the background" is true, but it does not say the position is stored with the clock-in | `docs/store/audit.md` item 5 |
| App Health string, `app.config.ts:153` | "Nobody at your company can see it" is not true once a person joins a steps challenge, whose board shows participants a total that includes synced steps | `docs/store/audit.md` item 4 |
| Server DEVICE_SYNC wording, `consent.ts:54-58` | "only you can see it" has the same edge. SELF_TRACKING (`:46-52`) says "Nobody at your company can see these entries", which an individual board qualifies | server, versioned `2026-10-20.2`, counsel's |
| `docs/store/app-privacy.md` | (a) says employers see app-open totals "above a floor the server sets": for app use the floor is fixed at 3 (`engagement/floor.ts:23`) and the company's 3 to 50 setting is not read there; (b) does not say app-open is off by default per company, or that the web sends it too; (c) "What the privacy policy must say" asks for "never used for advertising, marketing or data mining": the policy says advertising and marketing only (see below); (d) judgement call 5 (access logs and the typed `q`) is still open | the policy and the answers must agree |
| In-app notifications card, `NotificationsCard.tsx` | says a notification is a title and a place to open "never details". A kudos headline names the giver (`recognition.ts:132`) | minor |
| `docs/spec/mobile-v0.md` section 4 | says sign-out clears "the app-open marker". The code has none (`reporter.ts`, `platform.ts` write only the install marker file) | stale spec |
| API `engagement/app-open.ts` header | says `AppOpen` "has no device, no time of day and no count". `AppOpen.createdAt` is `@default(now())` (`schema.prisma:10608`), so the time the record was created is stored. The policy says so | comment and schema disagreed; **fixed in the API on 2026-11-09** (column dropped, policy now says day only) |

## Left out of the policy because it could not be verified

- What the Expo SDK sends to Expo when the app asks for a token, and where Expo stores it. The policy says only that Expo receives the token and the headline and link.
- Whether push is on in production. `EXPO_PUSH_ENABLED` is unset and the app has no EAS project id, so today a build never contacts Expo (`docs/NOT-VERIFIED.md`, milestone 6; `HUMAN-STEPS.md` items 4, 17, 18). The policy is conditional: "when notifications are switched on".
- Whether API access logs keep the query string of the colleague search (`q`), and for how long (`docs/store/app-privacy.md` judgement call 5). The policy says the app sends what you type to our server.
- Every notification headline in the product. Only the wellness sources were checked (reminders are a fixed catalogue, kudos carries the giver's name), and `pushToUser` has no other wellness caller. The policy claims "no water or step figure", not "no amount".
- Whether the platform admin console can read clock-in positions, app-open marks and push tokens. Only the wellness models, kudos and a birthday-greeting table are hidden (`admin/registry.ts:46-67`); `AttendanceEntry`, `AppOpen` and `DevicePushToken` are not. The policy claims hiding only for wellness and kudos.
- Whether the real API behaves as the mock for recognition, the delivery report and the employer routes: never run against a real API (`docs/spec/mobile-parity.md` section 5).
- Android: Health Connect was never compiled or run here (`mobile-v0.md` 9.1).
- "No data mining" wording. I did not write a promise I cannot test. The policy says nothing logged is used for advertising or marketing, that no report builder or assistant can read it (Spec P10 and its test), and nothing is sold (already in the policy).
- The delivery report "adds no new access". This is the API's own design claim (`delivery-report/service.ts` header), not something tested here.
- Apple and Google crash reports that a person shares through their phone's settings. The app has nothing that sends them; I left the platform programmes out.
- A web-only detail: `approvehr.app-open.<userId>` in `localStorage` holds the last day the mark was sent (`app-open-beacon.tsx:57`). The Cookies section already covers local storage in general, and I did not extend it.

## Things I found that are not in the brief

- **Kudos: no report path.** The recipient cannot delete or report a kudos they were sent, and the API has no route, table or field for reporting one (`recognition.ts`: give, list, mine, remove only; `docs/spec/mobile-parity.md` section 6 item 6; `docs/store/audit.md` item 6). The policy states who can delete and does not mention reporting. No report mechanism is promised anywhere.
- **Existing gap, same list I edited:** the "who else sees it" list says "only" but does not name the AI drafting providers (Google, Anthropic) or the email providers that the DPA names. Not caused by this change, not edited.
- **Existing gap:** browser Web Push subscriptions (`push_subscriptions`) were never in the policy. I covered browsers in one sentence under Notifications because the reminders text would otherwise be incomplete.
- **Web clock-in position** is stored exactly as the app's is (same API), and the old policy never mentioned location at all.
- **Spec drift on the floor:** the app-use measure ignores the company's floor setting (above).
- **Judgement calls in the policy text** you may want to cut: the sentence that records are protected by access control and not a separate encryption key, so direct database access could read them (Spec "What this still does not do", counsel's column-encryption question); "Nothing you log is used for advertising or marketing"; and the statement that no product screen shows the saved clock-in position.

## Open legal questions for counsel

None of these is answered in the policy.

1. **Health data.** Are water, steps, break habits and challenge participation health data under the NDPA 2023, and if so which lawful basis and which sensitive-data condition applies? The product is built to the strictest reading (D16) and the policy now lists the Wellness features under the consent bullet in "Why we are allowed to hold it". Is consent the right basis, and may that bullet be published as written?
2. **Controller or processor.** For wellness records (the employer cannot read them), kudos, the app-open mark, the stored clock-in position and the delivery report: is the employer the controller and ApproveHR the processor, or is ApproveHR a controller for any of it? Section 1 of the policy and the DPA currently say processor for all employee data.
3. **Retention.** There is no period and no deletion job for: the stored clock-in position, kudos (private ones included), app-open marks, a consent record after erase, a dead push token row (`goneAt` is stamped, the row stays), and wellness rows of a leaver whose record is archived (Spec open question 1: erase on exit?). What periods, and should a deletion job exist?
4. **Cross-border transfer.** Push tokens and headlines go to Expo, Apple and Google. Which Part VIII condition do we rely on, where does Expo process them, and do they belong in the DPA sub-processor list with 30 days' notice? The policy says only "companies based outside Nigeria".
5. **Children.** The policy has no section on children. The app is for employees, and the store age rating is expected to come out at 9+ (`docs/store/audit.md` item 23). Does the policy need one?
6. **Consent wording `2026-10-20.2` is unreviewed.** Specifically "only you can see it" (step sync) and "Nobody at your company can see these entries" (tracking) against an individual board that shows participants a named total, including to a manager or HR who joins. The join statement already says so.
7. **Employer roles joining an individual challenge.** HR can read named totals by joining, and with one or two joiners bypass the floor (Spec "What this still does not do", owner's top open question). The policy states the fact and decides nothing.
8. **Differencing and small teams.** Snapshots of released results, and teammates inferring a figure in a team of three (Spec). The policy says the floor is a safeguard, not a guarantee, in one sentence. Is more needed?
9. **Kudos moderation.** A recipient can neither delete nor report. A report route for a private kudos would put its words in front of an administrator, which the privacy design says never happens, so the policy would need to say so (`mobile-parity.md` section 6 item 6).
10. **App-open mark.** Basis, and whether employees must be told by their employer, given the aggregate is the only read but individual days are stored with a creation time.
11. **Clock-in position.** Basis for storing latitude, longitude, accuracy and distance on every clock-in made with a position, including at an unfenced location ("the audit trail is the point", `service.ts:1058`), and whether employers must tell employees.
12. **Delivery report on a phone.** It names people, new on a phone, and for HR counts the whole company's silent people. Work data, no consent. Does it need an employee notice?
13. **Colleague search.** The typed name fragment is a URL query string and may sit in API access logs; an `EDIT_RECORDS` caller's directory rows carry more fields than the picker keeps, and they do transit the phone (`mobile-parity.md` section 3 items 3 and 5).
14. **Publishing the limits.** Should the policy say records have no separate encryption key and that database access could read them?
15. **Store forms.** The App Store answers and the Play data-safety form must match this text once counsel has read both.

## Checks

Run on this branch on 8 November 2026, on the final `legal.ts`:

- `NODE_OPTIONS=--no-experimental-webstorage npx vitest run`: 432 files, 6393 passed, 2 skipped. No test pins the legal copy or the `updated` date.
- `npm run check`: green (typecheck, lint, prettier, and every `verify-*` script).
- `npm run docs -- --check`: both web inventories current; the landing and backend inventories were skipped because no sibling checkout is present.
- `npm run verify-demo:build`: green.
- `npm run verify-marketing` (not one of the four): the marketing export is self-contained, which is the step that carries this text to the public repo.
