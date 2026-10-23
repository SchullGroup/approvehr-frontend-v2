# Company reports: design

**Status:** decided by the owner on 23 Oct 2026 (see "Decisions made" at the end) and being built in the pieces under (l).
**Replaces:** Explore (`/reports/explore`, the 3D department spheres).
**Written:** 22 and 23 Oct 2026. Every figure quoted as "true today" was read from the
staging demo (`localhost:8600`, company Schulltech, cycle "H2 2026 appraisal") on 23 Oct 2026.
Appendix A lists the call behind each one.

A written report about the people side of the company, worked out from records already in
ApproveHR. It opens on one sentence and one first step, says what was and was not measured,
then lays out findings with their evidence and where to act on them. A department comparison
sits behind a tab.

## Why this replaces Explore

The owner's sample was OWI Labs' report. In that product the report is the product and the 3D
view is a door to it. Explore built the door and left out the report: no evidence, no figures on
the canvas, one sentence behind it. So that it does not repeat:

- **The screen carried no numbers.** Five slate spheres, a caption saying size is headcount, and
  every figure behind a click. A person could not read an answer in five seconds.
- **Colour meant "any one person is bad".** A department of 18 turned ochre for one mark. Bigger
  departments are more likely to contain one low mark, so size was being scored.
- **A metric was mislabelled.** "Task-logging intensity" counted tasks a manager had _graded_, so a
  manager who had not graded looked like staff who had not logged. Its headline rule then named the
  only department where anything had been graded as the weakest. That rule is removed from the API
  headline already (staging, 23 Oct 2026).
- **It skipped the Fairness check's safeguards.** Fairness hides groups under five and tests that a
  gap is real. Explore compared the same marks across departments with neither, and named people.
- **The goal lens could never light.** It read department-owned goals only. In the demo all 54 goals
  belong to individuals, so every sphere stayed grey.
- **Nobody asked what 3D showed that a table could not.** The answer was nothing.

## Rules the whole report follows

These are the constraints a developer should hold to. Most restate rules this codebase already has.

1. **Every figure carries its denominator and its date.** "4 of 6", never "4". The period and its
   stage sit in the header.
2. **Absent is not zero** (ADR 0003). A block the caller may not see has its key omitted from the
   response. A figure that does not exist yet is `null`. A computed zero stays a zero.
3. **No sentence is produced by a cutoff somebody chose.** Where a comparison needs a threshold it
   uses the Fairness check's own constants, imported, not copied: `MIN_GROUP` (5), `MIN_GAP_BP`
   (300) and the likely-range test in `performance/fairness.ts`.
4. **Nothing under five people is averaged or compared.** The department table shows the headcount
   and nothing else for such a row. This follows the Fairness check, including its "protects" rule
   (hiding a group of one to four also hides the next smallest, so nothing can be got by subtraction).
5. **Names only where the owner decided they belong, and only for `EDIT_RECORDS`.** Names appear in
   the department side panel, behind a "See who" link, and on the two named findings (F10 and F11,
   below), each with its basis in one line. They never appear in the headline, the strip, or any
   other finding, and never in one company-wide list.
6. **No free text, ever.** No review answer, comment, objective note or quote appears. This keeps
   the promise on `/settings/ai` that written appraisal comments do not leave the platform.
7. **Worked out by fixed rules, and the page says so.** No model writes any sentence. The rule that
   picked the headline is one click away.
8. **A mark in calibration is a working figure.** While a period is in calibration the header says
   "Marks can still move" and the report never calls a mark final.
9. **Marks are not adjusted for how each manager rates.** Wherever departments are compared, a
   plain line says so and links to the Fairness check, which is where that question is answered.
10. **House look.** Indigo plus one muted ochre. Statuses are plain muted text, not pills. Red only
    for validation, destructive acts and failures. Filters behind the `FilterBar` icon, tabs for long
    pages, `InfoTooltip` rather than banners, `PageHeader` and `PageBody` (1,440 px cap).
11. **No em dashes in visible copy.**

## The page

Route `/reports/company`, nav label and page title **Company reports** (plural, as the owner said it)
under Reports, replacing Explore.
`/reports/explore` redirects to it. Layout, top to bottom:

```
Company reports                        [ Period: H2 2026 appraisal v ]   [ Download PDF ]
In calibration. Marks can still move.  Worked out from ApproveHR records by fixed rules, 23 Oct 2026 09:14.

4 of the 6 marks the Fairness check flagged still need a decision, so H2 2026
results cannot be published yet.                                  <- headline (one sentence)
First step: decide on the 4 open marks. Let each stand, move it, or ask the manager.   <- first step

Marks        Appraisers   Agreed objectives   Fairness check     Nine-box
57 of 61     60 of 62     49 of 61            57 of 61 compared  40 of 61 placed       <- coverage strip
have one     are set      have one            3 groups not shown
   What we did not measure: religion, state of origin. Groups under 5 are not compared.

[ Overview ]  [ Departments ]

Findings   (Results / Process / Fairness, in that order)
What is working
Priority actions   [button] [button] [button]
Method and privacy   (closed, at the foot)
```

Overview holds those four. Departments holds the comparison (see g). Both tabs are
`Tabs` with the period picker and PDF button in the header. The coverage strip is eight cells as built: Marks,
Appraisers, Agreed objectives, Manager reviews, Fairness check, Nine-box, Weekly tasks, Payroll.

The header's period picker defaults to the period in play (`periodInPlay` in
`lib/api/performance.ts`) and falls back to the latest published one. It must **not** default to
"latest due date", which is what Explore did and which put a period still in calibration in front of
people as if it were settled.

## (a) The headline and the first step

One sentence and one first step, picked by a fixed priority order over counts that already exist.
Same discipline as `insights/headline.ts`: ties name everyone tied, nothing is invented, and when
nothing qualifies there is **no headline at all** (the key is omitted and the screen draws nothing,
not a placeholder).

Order, highest first. The order is "blocks something", then "cannot be fixed later", then "weakens
the evidence", then "comparability", then housekeeping.

| #    | Rule fires when                                                                                                        | Headline                                                                                                                    | First step                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| H1   | Marks the Fairness check flagged still need a decision (`publishBlocker`, counted from `reviewFlags` `open + waiting`) | "{n} of the {flagged} marks the Fairness check flagged still need a decision, so {period} results cannot be published yet." | "Decide on the {n} open marks. Let each stand, move it, or ask the manager."                        |
| H2   | People in the period have no appraiser (appraiser map `counts.unassigned`)                                             | "{n} of {people} people have no appraiser, so they will finish {period} with no mark."                                      | "Give each of them an appraiser, or leave them out of this period."                                 |
| H3   | Marks with no agreed objective behind them (`scoreRegister` `counts.withoutAgreedObjectives`)                          | "{n} of {scored} marks have no agreed objective, so the objectives part is left out of them."                               | "Agree objectives for those {n} people."                                                            |
| H4   | A department or manager group flagged by the Fairness check, both groups at least five people                          | "{Group}'s average mark is {x} points above everyone else's." (or below)                                                    | "Open the Fairness check and see whether the gap comes from the work or from how marks were given." |
| H5   | Staff records missing a bank account, pension PIN or tax ID (employees summary `payrollBlocked`)                       | "{n} of {total} staff records are missing a bank account, pension PIN or tax ID."                                           | "Open the incomplete records."                                                                      |
| none | nothing above fires                                                                                                    | no headline                                                                                                                 | none                                                                                                |

Notes a developer needs:

- **H1 and H4 need `VIEW_FAIRNESS`.** Without it they are skipped, not shown as zero, and the
  next rule gets its turn. Absent, not disabled.
- **H4 names a group only when the Fairness check itself flagged it and every group in the
  comparison cleared the minimum.** It never says a department is "weak". It says how far its
  average sits from the rest and nothing about why. A department is a reasonable thing to name here
  because the Fairness check already does, with the same constants.
- **The two rules in today's headline are retired in the new function.** "Most off-track goals" ranks
  departments by a count, not a rate, so a department with more goals wins, and it only sees
  department-owned goals. "Promotion-ready" names one person from a mark that may still be in
  calibration. Neither is a headline. Both survive as findings or as a department panel line (below)
  where their figures and evidence are on screen.
- **The retired task-logging rule does not come back** until the API can tell "did not log" from
  "was not graded" (see (k), `taskCoverage`).

**True today in the demo (H1 fires).** Headline: "4 of the 6 marks the Fairness check flagged still
need a decision, so H2 2026 results cannot be published yet." First step: "Decide on the 4 open
marks. Let each stand, move it, or ask the manager." The figures are `reviewFlags.counts` (below 3,
above 3, decided 2, open 4, waiting 0). The API's own refusal to publish says the same thing in the
same words.

If H1 were cleared, H2 would fire next: "2 of 62 people have no appraiser, so they will finish H2
2026 with no mark." In the demo those two are the administrator and the HR manager, who have nobody
above them. The period has two switches for exactly this (`appraiseOwner`, `appraiseHrManager`), which is
why the first step reads "or leave them out of this period".

Each headline links to an `InfoTooltip`: "Picked from a fixed list of checks, most urgent first. This
was the first one that applied." plus the list in order, with this one marked.

## (b) The coverage strip

What was and was not measured, in one row. Each cell is "N of M" with its own M. **No cell is divided
by another.** `cycleReport` already returns two headcounts (`forms.people` and `marks.people`) for
this reason, and the strip keeps them apart.

| Cell                | Figure today                     | Source                                                               |
| ------------------- | -------------------------------- | -------------------------------------------------------------------- |
| Marks               | 57 of 61 people have one         | `scoreRegister.counts` (`scored`, `people`)                          |
| Appraisers          | 60 of 62 people have one         | appraiser map `counts` (`people`, `unassigned`)                      |
| Agreed objectives   | 49 of 61 have one                | `scoreRegister.counts.withoutAgreedObjectives`                       |
| Reviews written     | 9 of 13 manager reviews in       | `cycleReport.forms` (`managerIn`, `managerOutstanding`)              |
| Fairness check      | 57 of 61 compared                | `fairness` (`compared`, `inPeriod`)                                  |
| Nine-box            | 40 of 61 placed                  | `nineBox` (cells versus `unplaced`)                                  |
| Weekly tasks graded | 1 of 61 people has a graded task | `taskCoverage` (new, see (k))                                        |
| Pay                 | cost shown                       | present only with `VIEW_SALARIES`, otherwise the cell is **omitted** |

Below the strip, one muted line, **What we did not measure**, built from real exclusions:

- Fields the Fairness check does not read: `fairness.notChecked` (today: religion, state of origin).
- Groups left out under the five-person rule, with counts: `dimensions[].hidden` and
  `managers.hidden` (today: Contract 5 people and NYSC 2 people, and 1 manager with 4 people).
- People with no mark (4) and people not compared (4).
- "Marks can still move" while the period is in calibration (12 marks have already moved, 6 up, 6 down:
  `fairness.calibration`).

Each item names _why_ ("fewer than five people", "not recorded"), the way OWI says what it did not quote
and why.

## (c) Three axes

OWI reads everything through People, Processes, Systems and tags every finding with one. Those fit
interviews. Ours is a different body of evidence (marks, objectives, flagged decisions), so the
axes are:

| Axis         | Reads as                          | What sits under it                                                                                |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Results**  | what people delivered             | marks and bands, goal progress, weekly tasks, cost                                                |
| **Process**  | how the marks were produced       | appraisers, agreed objectives, reviews written, flagged marks decided, records complete, nine-box |
| **Fairness** | whether the marks can be compared | group gaps, manager spread, calibration moves, groups not shown                                   |

"People" was rejected because everything in a people product is about people, so the word sorts
nothing. These three answer a question an owner actually asks in order: what came out, how was it
produced, and can I trust the comparison.

**Encoding, without colour.** OWI uses three hues that follow the axis everywhere. We do not.

- On the Overview, findings are **grouped under the three axis headings, in a fixed order**. The axis
  is also written as muted text at the head of each finding ("Process"). Position and words carry it.
- On the Departments tab a `SegmentedControl` called **Lens** (Results, Process, Fairness) chooses
  which columns the table and panel show. The lens selects content, not hue.
- Statuses are plain muted text ("Blocks publishing", "Weakens the evidence", "Worth knowing"), not
  pills. One ochre dot may precede a line that needs a decision. Nothing is red.

## (d) Findings

Each finding is a plain block with four parts. OWI's shape is title, "if there is no action in six
months", probability, impact. We keep the first two and drop the last two: we have no basis for a
probability, and an invented one is the thing this product is sold against.

```
Process
4 of the 6 marks the Fairness check flagged have no decision.           <- title, with its figure
Blocks publishing                                                       <- status, muted text
Evidence: Fairness check, H2 2026 appraisal, 23 Oct 2026. 3 below the evidence, 3 above. 2 decided.
If nothing changes: H2 2026 results cannot be published, so nobody sees a final rating.
Open the Fairness check                                                 <- plain text link to where it is acted on
```

- **Title** is a computed sentence containing the figure.
- **Status** is one of three fixed phrases: _Blocks publishing_ (or _Blocks payroll_, _Blocks a mark_),
  _Weakens the evidence_, _Worth knowing_. It is a fact about what the system will do, not a grade.
- **Evidence** names the source, the period and the date, and carries the denominator. Where a count
  has people behind it, "See who" opens the side panel (names, `EDIT_RECORDS` only).
- **If nothing changes** is a consequence that is true by a rule of the system (for example the
  publish refusal), never a prediction. If no such rule exists, the line is omitted. An omitted line is
  better than a plausible guess.
- **Where to act** is a plain text link to the module, as the lead's brief asks. Buttons are reserved
  for priority actions (f).

Initial catalogue. Order within an axis is by status (blocks first), then by the size of the figure.

| Id  | Axis     | Fires when                                                                | Title today                                                                                                                               | If nothing changes                                                               | Where to act                    | Needs           |
| --- | -------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- | --------------- |
| F1  | Process  | flagged marks undecided                                                   | 4 of the 6 flagged marks have no decision                                                                                                 | results cannot be published                                                      | Fairness check, review queue    | `VIEW_FAIRNESS` |
| F2  | Process  | people with no appraiser                                                  | 2 of 62 people have no appraiser                                                                                                          | they finish the period with no mark                                              | Performance, appraisers         | `EDIT_RECORDS`  |
| F3  | Process  | marks with no agreed objective                                            | 12 of 61 marks have no agreed objective                                                                                                   | the objectives part is left out of those marks, so they are less like the others | Performance, approvals          | `EDIT_RECORDS`  |
| F4  | Process  | people missing from the nine-box                                          | 40 of 61 are on the nine-box. 17 have no potential assessed and 4 have no mark                                                            | a talent decision rests on a partial grid                                        | Performance, nine-box           | `EDIT_RECORDS`  |
| F5  | Process  | staff records incomplete                                                  | 52 of 62 staff records lack a bank account, pension PIN or tax ID                                                                         | payroll cannot file for them                                                     | People, incomplete records      | `EDIT_RECORDS`  |
| F6  | Fairness | department or manager group flagged                                       | Finance's average mark is 16.4 points above everyone else's (likely range 7.1 to 25.6). One manager's group of 11 is flagged the same way | none stated (no rule of the system backs one)                                    | Fairness check, department view | `VIEW_FAIRNESS` |
| F7  | Fairness | groups hidden                                                             | 7 people in two contract types and 1 manager's 4 people are not compared                                                                  | those groups cannot be checked                                                   | Fairness check                  | `VIEW_FAIRNESS` |
| F8  | Results  | people with no mark, or a disputed rating                                 | 4 people have no mark. 1 rating is disputed                                                                                               | they finish with no mark, and the dispute stays open                             | Performance, period             | `EDIT_RECORDS`  |
| F9  | Results  | people who logged weekly tasks have no graded task (**live**, see (k))    | "6 of the 45 people who logged weekly tasks have no graded task"                                                                          | none stated                                                                      | Performance, review tasks       | `EDIT_RECORDS`  |
| F10 | Results  | a department of five or more has marks                                    | Highest mark in each department, with its basis. Engineering: the highest of 17 scored is 85.2%, one appraiser                            | none stated                                                                      | Performance, nine-box           | `EDIT_RECORDS`  |
| F11 | Results  | somebody held the top band two cycles running and meets every role target | 1 person has been in the top band two cycles running and meets 3 of 3 role targets                                                        | none stated                                                                      | Performance, nine-box           | `EDIT_RECORDS`  |

Notes:

- **F6 is a finding about the marks, not about the department.** Both the department and one
  manager's group are flagged by the Fairness check, and they may be the same people. The panel says
  so ("Check whether these are the same people") and does not guess. The manager is named in the
  Fairness check, not in this report's body.
- **F9 is on**, now that `taskCoverageByDepartment` separates logged from graded. Its wording is about
  _grading coverage_ and the owner of the fix is the manager. It never says "yet": `gradeTask` refuses a
  week that has closed, so an ungraded task in a closed week stays ungraded, and the finding says a week can be
  graded only while it is open.
- A finding appears only when its rule fires. There is no "all clear" card per rule. A clean report
  is a short report.

### Named lines: highest marks and promotion-ready (F10, F11)

The owner decided on 23 Oct 2026 to keep "best performer" and "promotion-ready", in the department
panel and in the findings, **with safeguards so they cannot mislead**. This replaces the earlier
recommendation to show them only as flags in the panel. The safeguards are part of the finding, not
decoration:

1. **Each line carries its basis in one sentence.** "Highest of the 17 marks in Engineering, 85.2%,
   one appraiser." "Top band in H1 2026 and H2 2026, meets 3 of 3 role targets."
2. **A mark still in calibration says so on the line.** "H2 2026 is in calibration, so this mark can
   move." It is not left to the header.
3. **Departments are not comparable, and it says so.** One line above F10 and in the panel: "These
   departments are rated by different managers. Marks are not adjusted for that." with a link to the
   Fairness check.
4. **Never a single company-wide ranking.** Lines are grouped by department, sorted by department name
   and then person name, never by score. There is no "top ten". A department's highest mark is only
   ever shown inside that department.
5. **No highest-mark line for a small group.** Only a department with at least five people and five
   marks gets one (the same minimum as the Fairness check). The top of three is not a finding. A tie
   names everyone at the top figure.
6. **`EDIT_RECORDS` only.** The block is absent for anybody else.
7. **The judgement is made elsewhere.** Each block links to the nine-box and to the Fairness check,
   which stay the places those calls are made. Nothing here says "promote".

## (e) What is working

OWI lists strengths to keep. Ours are stated only from what the system itself checked, with a figure,
and only when they are the larger share of what was checked (more than half) or complete. No cutoff is
chosen. Candidates:

- "40 of the 52 marks match the evidence behind them. 6 had too little evidence to say."
  (`reviewFlags.counts`: matches 40; below 3, above 3, unclear 6.)
- "2 of 2 decisions on flagged marks are recorded with who made them and when."
  (`reviewFlags` `resolution` for `moved` and `stands`.)
- "Every group that was compared had at least five people." Always true by construction, so it is not
  shown as a finding about the company. It lives in "What we did not measure".

If nothing qualifies the section is omitted.

## (f) Priority actions

Up to five buttons, ordered with whatever blocks something first. Each label is a verb plus a figure.
The first is the primary button, the rest secondary.

| Button today                   | Goes to                      | Appears for     |
| ------------------------------ | ---------------------------- | --------------- |
| Decide on 4 flagged marks      | Fairness check, review queue | `VIEW_FAIRNESS` |
| Give 2 people an appraiser     | Performance, appraisers      | `EDIT_RECORDS`  |
| Agree objectives for 12 people | Performance, approvals       | `EDIT_RECORDS`  |
| Assess potential for 17 people | Performance, nine-box        | `EDIT_RECORDS`  |
| Complete 52 staff records      | People, incomplete           | `EDIT_RECORDS`  |

An action the caller cannot take is **omitted by the API**, not rendered disabled. Where a finding has
no permitted action, it still appears with its link as text.

## (g) Departments tab

### Table

One row per department, sorted by name (never by score, so the table cannot read as a league). The
**Lens** control picks the columns:

| Lens     | Columns                                                                                                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Results  | People. Mean mark with band mix (`StackedBar`) and "12 of 13 scored". Goal progress (mean of agreed objectives, with N objectives). Weekly tasks graded (N of M people). Cost per head, only with `VIEW_SALARIES`     |
| Process  | People. Have an appraiser (N of M). Agreed objectives (N of M). Reviews written (N of M). Flagged marks decided (N of M)                                                                                              |
| Fairness | People. Gap from everyone else in points with its likely range. Group status ("compared", "fewer than 5", "left out so others cannot be worked out"). One-line manager spread where the manager group is five or more |

**Under five.** A row with fewer than five people shows its name, its headcount and one muted line:
"Fewer than 5 people: figures are not shown." No mean, no band mix, no gap, no cost. The same row
carries no figure keys in the API response, so the screen cannot show one by accident.

**Goal progress is by the owner's department**, not `Goal.departmentId`. `Goal.departmentId` is set only
on department-owned objectives, which is why the old lens was empty. The join is `Goal.ownerId` to the
owner's department. Company-wide objectives are excluded. Only **agreed** objectives count: a target
nobody agreed is not a target. Today: 53 of 54 objectives are agreed, and none is owned by a department.

**No ranking, no verdict words.** There is no "best performer" column, no top-N, and no quadrant
names on the chart. The department's mean mark is shown beside the line from rule 9: "Marks are not
adjusted for how each manager rates. See the Fairness check."

### Bubble chart (Results lens, above the table)

A 2D chart in the house hand-drawn-SVG style (`components/ui/chart.tsx`, new `BubbleChart` beside
`AreaChart` and `StackedBar`). No dependency.

- **x:** cost per head (`VIEW_SALARIES` only). Without it, x is mean goal progress and the title
  changes to match. **y:** mean mark. **Area:** headcount.
- Every bubble carries its name and headcount as a visible label. Thin lines mark the company mean on
  each axis. Axes are labelled with units. No quadrant names.
- Departments under five are not plotted and are listed under the chart: "Not shown: 1 department
  with fewer than 5 people."
- An `InfoTooltip` beside the title: "Cost per head reflects who works in a department as well as how
  well it is rated. It is not a measure of value."
- **Accessibility.** The table is the primary form. The chart is `role="img"` with a label that
  states how many departments are plotted and what the axes are, and every bubble is a focusable
  element with the same text as its table row. Colour is one indigo; a flagged department gets an
  ochre ring and the word "flagged" in its label, so colour is never the only cue.

### Department side panel

OWI's team panel, built on the existing `Drawer`. Opens from a table row or a bubble. Content, top to
bottom:

1. **Breadcrumb:** Company report / {Department}. Back returns to the table.
2. **Who:** "Led by {head}" (or "No head set"), and the people count.
3. **Under five:** if the group is under five, one line, "Fewer than 5 people: figures are not
   shown", and nothing from the three blocks below except the headcount.
4. **Results.** Mean mark and band mix, goal progress, weekly tasks graded, cost per head (permission
   permitting), each with its denominator.
5. **Process.** Appraiser, objective, review and flagged-decision coverage as "N of M".
6. **Fairness.** The gap and its likely range, and the manager spread where there is one.
7. **Related findings:** the findings that name this department (F6 and so on), as plain links. This
   is OWI's "Connections and friction".
8. **People to look at** (`EDIT_RECORDS`, and only when the group is five or more): **everyone** in
   the department, sorted by name, with their mark and a "Why" column. "Why" is a short list of
   criteria flags, each a plain fact: "Highest mark in the department (of 17)", "Top band two cycles
   running, meets 3 of 3 role targets", "Below the evidence by 12 points", "No mark", "No appraiser".
   A mark in calibration carries "can still move". Under the list: "These departments are rated by
   different managers. Marks are not adjusted for that." with links to the nine-box and the Fairness
   check. The list is by name, never by score.

## (h) Privacy, honesty and the PDF

### Method and privacy (the closed section at the foot of the Overview)

Draft copy. No em dashes.

> **What this is.** A count of what is on record in ApproveHR for the period shown, worked out by fixed
> rules. No model writes any of it. It cannot see anything that was never recorded.
>
> **What it leaves out.** Groups of fewer than five people are never averaged or compared, and where
> leaving one out would let another be worked out, that one is left out too. Religion and state of origin
> are not checked. The report lists what it did not measure.
>
> **Marks.** While a period is in calibration, marks can still move. Marks are not adjusted for how each
> manager rates. The Fairness check is where that is looked at.
>
> **Names.** Names appear only in the side panel and only for people who can already open the register.
> No review answers, comments or quotes appear anywhere in this report.
>
> **Use it as a guide, not a verdict.**

The headline carries a short muted line: "Worked out from ApproveHR records by fixed rules, {date and
time}." The footer repeats "Use this as a guide, not a verdict."

### Download PDF

The platform has no PDF renderer and no object storage (HANDOVER, payslip email). So version one is a
**print layout**, not a generated file: a print stylesheet on the Overview and Departments content,
opened by the browser's print dialog, which saves as PDF.

- **What prints:** header (company, period, as-of date), headline, first step, coverage strip,
  findings, what is working, priority actions as plain text (no buttons), the departments table, the
  bubble chart as SVG, method and privacy, footer. The side panel and "People to look at" never print.
  **No names print.**
- **Permission.** Printing what you can see adds nothing new, so what prints follows what the caller
  can see: no cost without `VIEW_SALARIES`.
- **Gate.** The button needs `EXPORT_DATA`, because a PDF is the report leaving the product. That makes
  it the **fourth** export, and the permission's own description names exactly three
  (`permissions/service.ts` and `lib/store/permissions.ts`). **Change the sentence in both, in the
  same commit.** HANDOVER records why: a permission whose sentence does not match what it gates is
  worse than none.
- **Audit.** Before the dialog opens the web calls `POST /exports/company-report/printed`, which
  writes an audit row (period, sections included) and returns 204. A print the product cannot see is a
  hole in the trail the `exports` module exists to close. If the call fails, the button says so and
  does not open the dialog.
- A server-rendered file is a later option and needs a renderer decision of its own.

## (i) What stays 3D

**Nothing now.** Position in a scene encoded the department tree, which in a real company is two or
three levels and in the demo is flat. Size encoded headcount, which a number says better. Orbiting
revealed nothing. The bubble chart is the one picture, and it carries three real encodings.

If the owner wants a hero visual for demos, build it **later and optional**, behind a "View as map"
button on the Departments tab, to these conditions:

- A calm light canvas of dust, **one dot per person**, in one neutral tone.
- Every cluster labelled with its **name and count, always visible** ("Finance, 12 people"), as text
  in the DOM and not floating labels.
- **Never a dot coloured by mark or band.** One dot per person coloured by performance would show each
  person's mark. Dots carry no figure at all.
- Thin lines between departments that share a finding. A legend. "Select a department to see its
  findings". A click opens the same side panel as the table, with the under-five rule.
- The table is its text alternative. Reduced motion shows it still. A 2D canvas is enough and avoids
  three.js (about 940 KB raw, 248 KB gzipped, today, loaded on one route).

## (j) Who sees what

| Thing                                                                                    | Needs                                                 | Without it                                                                         |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Open the report, headline, strip, Process findings, Results findings, department table   | `EDIT_RECORDS`                                        | nav item hidden (absent, not disabled). Direct URL shows the standard refusal      |
| Anything from the Fairness check (H1, H4, F1, F6, F7, the Fairness lens, flagged counts) | `VIEW_FAIRNESS` as well                               | those blocks are omitted from the response. The Fairness axis heading is not drawn |
| Cost per head, payroll cost, the cost axis of the bubble chart                           | `VIEW_SALARIES` as well                               | keys omitted. The chart's x axis becomes goal progress                             |
| Names (side panel, "See who", "People to look at", F10, F11)                             | `EDIT_RECORDS`, and the group has five or more people | counts only                                                                        |
| A priority-action button                                                                 | the permission the destination needs                  | omitted by the API. The finding keeps its link as text                             |
| Download PDF                                                                             | `EXPORT_DATA`                                         | button absent                                                                      |
| Dashboard banner (same headline function)                                                | `EDIT_RECORDS`                                        | no banner                                                                          |

A line manager without `EDIT_RECORDS` does not get this report. The comparative reads (register,
nine-box, report) are gated that way on purpose: a comparison three people wide is not a talent map. They
keep the Performance module.

Someone with `VIEW_FAIRNESS` but not `EDIT_RECORDS` still has the Fairness check and nothing here.

Demo mode (`DEMO_ENABLED`) has no report. It needs the API, and the performance register already
refuses offline for the same reason. The screen shows the standard "needs the API" refusal. In a
production build there is no demo mode at all (ADR 0004).

## (k) API

### One endpoint, not a composition in the browser

**`GET /insights/company-report?cycleId=`**, gated `EDIT_RECORDS`.

The alternative, composing eight existing reads in the browser, is rejected for four reasons:

1. The headline, the findings and their consequences need cross-module counts and one fixed order.
   "A second implementation of a score is how two screens end up disagreeing about the same person"
   applies to a count as much as a score. One function owns them.
2. Permission shaping belongs on the server. Keys are omitted for a caller who may not see them
   (ADR 0003), which a browser cannot do for itself.
3. The print layout needs exactly the same data.
4. Eight requests on a page that a rate limit of 300 in 15 minutes already budgets for is the wrong shape.

It **composes existing service functions and does no new arithmetic on marks**:

| Section                                                      | Built from                                                                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| marks, bands, exceptions                                     | `scoreRegister` in `performance/scoring.ts`, called **once** and passed down                                                |
| flagged marks, decisions, "matches the evidence"             | `reviewFlags` and `publishBlocker` in `performance/review-flags.ts`                                                         |
| appraiser gaps                                               | the appraiser map read behind `GET /cycles/:id/appraisers`                                                                  |
| group gaps, hidden groups, manager spread, calibration moves | `analyseFairness`, `analyseManagers`, `cycleFairness` in `performance/fairness.ts`, with `MIN_GROUP`, `MIN_GAP_BP` imported |
| forms and marks counts                                       | `cycleReport` in `performance/service.ts`                                                                                   |
| nine-box                                                     | `nineBox`                                                                                                                   |
| goal progress by owner's department                          | `listGoals` joined to the owner's department (new, small)                                                                   |
| weekly tasks                                                 | `taskCoverage` (new, below)                                                                                                 |
| cost                                                         | `reports().payrollByDepartment` in `insights/service.ts`, `VIEW_SALARIES` only                                              |
| incomplete records                                           | employees `summary` (`payrollBlocked`)                                                                                      |

### Shape

Sections are **optional by type**, for the reason `ReportsData` already gives: a browser cannot pin the
API version. The web guards each one.

```ts
type ReviewStage = "DRAFT" | "SELF" | "MANAGER" | "CALIBRATION" | "PUBLISHED";

type StageLabel =
  | "Draft"
  | "Self-reviews open"
  | "Manager reviews open"
  | "In calibration"
  | "Published";

type ReportAxis = "results" | "process" | "fairness";

type ReportBand =
  "OUTSTANDING" | "EXCEEDS" | "MEETS" | "PARTIALLY_MEETS" | "BELOW";

type ReportAction = { id: string; label: string; href: string };

type CoverageCell = {
  key: string;
  label: string;
  n: number;
  of: number;
  note?: string;
};

type NotMeasured = { what: string; why: string };

type NamedLine = {
  department: string;
  employeeId: string;
  name: string;
  /** One sentence that says why this person is on the list. */
  basis: string;
  marksMayMove: boolean;
};

type FindingId =
  "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "F8" | "F9" | "F10" | "F11";

type ReportFinding = {
  id: FindingId;
  axis: ReportAxis;
  /** What the system will do about it, not a grade. */
  status: "blocks" | "weakens" | "info";
  statusLabel: string;
  title: string;
  figure: { n: number; of: number };
  /** Source, period and date first, then any detail lines. */
  evidence: string[];
  /** Present only where a rule of the system backs it. Never a prediction. */
  ifNothingChanges?: string;
  act?: { label: string; href: string };
  departments?: string[];
  /** F10 and F11 only. Grouped by department, sorted by name, never by score. */
  lines?: NamedLine[];
  caveats?: string[];
};

type ReportStrength = {
  id: string;
  title: string;
  figure: { n: number; of: number };
  evidence: string;
};

type HeadlineRule = "H1" | "H2" | "H3" | "H4" | "H5";

type ReportHeadline = {
  rule: HeadlineRule;
  sentence: string;
  figure: { n: number; of: number };
  firstStep: { sentence: string; action?: ReportAction };
};

type GoalFigures = {
  objectives: number;
  progressMean: number | null;
  atRiskOrOff: number;
};

type DepartmentRow =
  | {
      id: string;
      name: string;
      headName: string | null;
      people: number;
      shown: false;
      reason: "small" | "protects";
    }
  | {
      id: string;
      name: string;
      headName: string | null;
      people: number;
      shown: true;
      results: {
        /** Basis points. Null when nobody in the department has a mark. */
        markMeanBp: number | null;
        scored: number;
        bands: Record<ReportBand, number>;
        goals: GoalFigures;
        tasks: { people: number; withLogged: number; withGraded: number };
      };
      process: {
        withAppraiser: number;
        withAgreedObjective: number;
        reviewsWritten: number;
        reviewsExpected: number;
        /** Present with `VIEW_FAIRNESS`. */
        flagged?: { open: number; total: number };
      };
      /** Present with `VIEW_FAIRNESS`, and only when the rest of the company is big enough to compare with. */
      fairness?: {
        gapBp: number;
        lowBp: number | null;
        highBp: number | null;
        flagged: boolean;
      };
      /** Present with `VIEW_SALARIES`. Integer kobo. */
      cost?: { perHeadKobo: number; totalKobo: number; paid: number };
    };

type ShownDepartment = Extract<DepartmentRow, { shown: true }>;

type ReportDepartments = {
  rows: DepartmentRow[];
  company: {
    people: number;
    markMeanBp: number | null;
    goalProgressMean: number | null;
    /** `VIEW_SALARIES` only. Integer kobo. */
    perHeadKobo?: number;
  };
  /** Departments left out of the figures by the five-person rule. */
  notShown: number;
  /** The payroll the cost comes from. `VIEW_SALARIES` only. */
  costFrom?: { period: string; status: string };
  /** Said wherever departments are compared. */
  caveat: string;
};

type CompanyReport = {
  asOf: string;
  cycle: {
    id: string;
    name: string;
    stage: ReviewStage;
    stageLabel: StageLabel;
    published: boolean;
    marksMayMove: boolean;
  } | null;
  cycles: {
    id: string;
    name: string;
    stage: ReviewStage;
    stageLabel: StageLabel;
  }[];
  /** **Absent** when nothing qualifies. A clean absence, not a placeholder. */
  headline?: ReportHeadline;
  coverage: { cells: CoverageCell[]; notMeasured: NotMeasured[] };
  findings: ReportFinding[];
  strengths?: ReportStrength[];
  actions: ReportAction[];
  departments?: ReportDepartments;
  rules?: { minGroup: number };
};

type DepartmentPeople = {
  department: { id: string; name: string };
  cycle: { id: string; name: string; marksMayMove: boolean };
  people: {
    employeeId: string;
    name: string;
    jobTitle: string;
    markBp: number | null;
    bandLabel: string | null;
    why: string[];
  }[];
  caveats: string[];
};
```

These are the types the web reads (`src/lib/api/company-report.ts`), which follow the API's response field for
field. Four things differ from the first draft of this spec: `evidence` is a list of lines (source, period and date
first, then detail), `departments` is an object (`rows`, `company`, `notShown`, `costFrom`, `caveat`) and not a
bare list, `rules` carries only the group-size floor, and `seeWho` is gone because the panel decides that itself
(a department of five or more has a list, one under five has a sentence).

A `shown: false` row has **no figure keys at all**. `null` means the figure does not exist yet (nobody
scored). `0` means it was computed and is zero.

### New work in the API

- `taskCoverage(db, cycleId)`: per department, people with any logged task, people with any graded task,
  tasks logged, tasks graded. Today's `taskIntensityByDepartment` filters on `grade: { not: null }`, so it
  cannot tell logged from graded. This is the missing measure behind F9 and the retired headline rule.
- `ownerDepartmentGoals`: agreed objectives and their mean progress by the **owner's** department.
- `buildCompanyReport(db, actor, cycleId)` with a `ReportContext` that loads the register **once**.
  `reviewFlags` and `publishBlocker` each re-run `scoreRegister` (current and earlier cycles), and calling
  them naively here would run it several times. Pass the context in, or memoise per request.
- The headline function is callable on its own so the dashboard banner can use it **without building the
  whole report**. The banner stops riding on `/insights/dashboard` and fetches
  `GET /insights/company-report/headline` after first paint, so a slow report never slows the dashboard.
  `/insights/workforce-headline` stays as a thin alias until Explore is gone, then goes.
- `POST /exports/company-report/printed` (audit row, 204).
- Reads are **sequential** inside the builder, as `cycleReport` is, because a burst of parallel reads is
  exactly what has dropped connections on the local database.

### Performance

The cost is `scoreRegister` plus the Fairness analysis. `npm run load-test` in the API repo measures the
paged reads and `prepare`; add the report at 1,000 and 5,000 people before the web screen ships. The
register is the part to watch. If it is slow, cache the report per organisation and period for sixty
seconds in-process. Do not weaken the rules to make it cheaper.

### Tests (API)

- Each headline rule fires alone, and the order wins when two apply. Ties name everyone.
- With nothing to say, the `headline` key is **absent**, not null and not a placeholder.
- A caller without `VIEW_FAIRNESS` gets no fairness blocks and the next rule gets its turn.
- A caller without `VIEW_SALARIES` has no `cost` key on any row and no cost cell. Not zero, not null.
- A department of four has `shown: false` and **no figure keys**. A department of five has them. The
  "protects" case hides the next smallest.
- Goal progress counts a goal by its owner's department, ignores unagreed and company-wide goals.
- Tenant isolation: a second organisation's marks, goals and flags never appear.
- `reviewFlags` stage rules: a period in calibration reports `marksMayMove: true`.
- Retired rule: a department where most people have nothing graded produces **no** headline.

## (l) Pieces, order and effort

Each piece lands alone on staging behind the new route and is gated with `npm run check` (both repos,
the API's with its own database, never the shared one). Nothing is removed until piece 6.

| #   | Piece                                                                                                                              | Repo     | Effort               | Depends on             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------- | ---------------------- |
| 0   | Stop the harm: the task-logging rule removed from the headline, the banner and Explore line draw nothing when there is no headline | both     | **done 23 Oct 2026** | none                   |
| 1   | `buildCompanyReport` core: headline, first step, coverage, findings F1 to F8, strengths, actions, tests                            | API      | 1.5 days             | owner decisions 1 to 4 |
| 2   | Overview tab, route, nav item, redirect from Explore, dashboard banner moved to the lazy headline                                  | web      | 2 days               | 1                      |
| 3   | Departments block: scorecard rows, owner-department goal join, `taskCoverage`, cost, fairness constants, F9                        | API      | 1.5 days             | 1                      |
| 4   | Departments tab: table, Lens, `BubbleChart`, side panel, accessibility                                                             | web      | 2 days               | 3                      |
| 5   | Print layout, audit ping, `EXPORT_DATA` sentence changed in both catalogues                                                        | both     | 1 day                | 2 and 4                |
| 6   | Remove Explore and three.js (list below)                                                                                           | web, API | 0.5 day              | 4                      |
| 7   | Seed variance so the demo shows something                                                                                          | API      | 0.5 day              | none, run any time     |

About nine working days, one engineer. Pieces 1 and 3 touch the same API module, so they go in order.
Piece 7 is independent and should be first if the demo is needed sooner.

**Landing order, as decided on 23 Oct 2026.** Each lands alone on staging, API and web as separate
pushes. The API deploys slowly and a new push cancels the one in flight, so the API goes in **two**
pushes: the endpoint (pieces 1 and 3, with F10 and F11), then the seed (piece 7) together with the
removal of the old routes. The web goes: the Overview (2), the Departments tab (4), print (5), then
the removal of Explore and three.js (6) only after the new screen is live. The seed is applied to the
demo database with a `pg_dump` backup first.

**Piece 6, the removal list.**

- Web: `src/app/(app)/reports/explore/` (8 files, about 1,300 lines), the nav entry in
  `components/portal/nav.tsx`, the `WorkforceHeadline` widget wiring in `dashboard/widgets.tsx` (re-pointed
  by piece 2), `ApiDepartmentTaskIntensity`, `ApiDepartmentPromotionReadiness`, `taskIntensity` and
  `promotionReadiness` in `lib/api/performance.ts`, `three`, `@react-three/fiber`, `@react-three/drei` in
  `package.json` and the lockfile, and the `createElement` workaround in `components/ui/card.tsx` (harmless,
  can go back to JSX). Update `tests/sidebar-model.test.ts` and `tests/sidebar-drilldown.test.tsx`, which
  assert Explore beside Reports. Regenerate `docs/pages` and `docs/components`, do not hand-edit them.
- API: `GET /performance/cycles/:id/task-intensity` and `/promotion-readiness` and their functions in
  `performance/service.ts`, `tests/task-intensity.test.ts`, `tests/promotion-readiness.test.ts`,
  `GET /insights/workforce-headline` and its test, and the `EDIT_RECORDS` baseline in
  `scripts/verify-legacy-permissions.ts`. Keep the `goals` Report Builder dataset: it is generic and
  covered by `tests/reports.test.ts`.

## Decisions made (23 Oct 2026)

The owner decided all four. The recommendations in the first version of this spec are kept where the
owner agreed, and changed where noted.

1. **Replace Explore with this report.** Decided. Named **Company reports** (plural), under Reports,
   at `/reports/company`. `/reports/explore` redirects to it.
2. **Cost against performance: yes.** Decided, as recommended. On the Departments tab and the bubble
   chart, only for people with `VIEW_SALARIES` (absent, never zeroed). For everybody else the chart's x
   axis is goal progress.
3. **Keep "best performer", "promotion-ready" and the rest, with safeguards.** Decided, **changed from
   the recommendation**, which was to show them only as flags in the panel. They now appear in the
   department panel and as findings F10 and F11 for `EDIT_RECORDS`, each with its basis in one line,
   saying plainly when a mark is in calibration and when managers are not comparable, never as one
   company-wide ranking, and linking to the nine-box and the Fairness check (see "Named lines").
4. **Name.** Decided: "Company reports".

Smaller calls this spec has made, which the owner can overrule:

- No probability or impact scores on findings (we have no basis for one).
- PDF is a print layout in version one, gated on `EXPORT_DATA` and audited.
- No 3D now. A dust-cloud "View as map" later, only to the conditions in (i).
- The default period is the period in play, not the latest due date.

## Appendix A: what was true on 23 Oct 2026, and the call behind it

Company Schulltech on the staging demo. Cycle "H2 2026 appraisal", stage CALIBRATION, due 15 Dec 2026.
All reads signed in as the seeded administrator. These are examples, not fixtures.

| Figure                                                      | Value                                                       | Call                                                                            |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Marks flagged by the Fairness check                         | 6 (3 below the evidence, 3 above)                           | `GET /performance/cycles/:id/review-flags` `counts`                             |
| Flagged marks decided / open / waiting                      | 2 / 4 / 0                                                   | same                                                                            |
| Marks that match the evidence                               | 40 of 52 checked (6 unclear)                                | same                                                                            |
| People in the period / with a mark                          | 61 / 57                                                     | `GET /performance/cycles/:id/scores` `counts`                                   |
| Marks with no agreed objective                              | 12                                                          | same, `withoutAgreedObjectives`                                                 |
| People with no appraiser                                    | 2 of 62 (the administrator and the HR manager)              | `GET /performance/cycles/:id/appraisers?exceptionsOnly=true`                    |
| Manager reviews in / outstanding                            | 9 / 4 (29 people have forms)                                | `GET /performance/cycles/:id/report` `forms`                                    |
| Finalised / acknowledged / disputed                         | 3 / 1 / 1                                                   | same, `marks`                                                                   |
| People compared by the Fairness check                       | 57 of 61                                                    | `GET /performance/cycles/:id/fairness?periods=1`                                |
| Department gap flagged                                      | Finance +16.4 points, likely range 7.1 to 25.6 (12 people)  | same, `dimensions[department].flags`                                            |
| Manager group flagged                                       | one manager, 11 people, +17.3 points                        | same, `managers`                                                                |
| Groups hidden                                               | Contract 5 (protects), NYSC 2 (small), 1 manager's 4 people | same, `hidden`                                                                  |
| Fields not checked                                          | religion, state of origin                                   | same, `notChecked`                                                              |
| Marks moved in calibration                                  | 12 (6 up, 6 down)                                           | same, `calibration`                                                             |
| Nine-box placed / no potential / neither                    | 40 / 17 / 4                                                 | `GET /performance/cycles/:id/nine-box`                                          |
| Staff records missing a bank account, pension PIN or tax ID | 52 of 62                                                    | `GET /employees/summary` `payrollBlocked`                                       |
| Weekly tasks                                                | 1 person of 61 has a graded task                            | `GET /performance/cycles/:id/task-intensity` (to be replaced by `taskCoverage`) |
| Objectives                                                  | 54, all individually owned, none by a department, 53 agreed | `GET /performance/goals`                                                        |
| Departments                                                 | 5, flat, no head set on any                                 | `GET /departments`                                                              |
| Cost by department (period 2026-10, in review)              | present                                                     | `GET /insights/reports` `payrollByDepartment`                                   |

## What this spec does not cover

- The visual design of each block. It specifies content, order and rules. A mock is a separate piece
  of work, and the existing screens (`/performance/fairness`, the period screen) are the reference for
  tone.
- A "Hiring" or "Recruitment" tab. OWI has one. Ours has none until recruitment has marks and findings
  of its own to put in it.
- Anything about mobile layout beyond the house rule (no horizontal scroll, 16 px gutter). The table
  scrolls inside its own container, as `TableWrap` does elsewhere.
- Not checked: how long `buildCompanyReport` takes on 1,000 and 5,000 people. That is piece 1's gate.
