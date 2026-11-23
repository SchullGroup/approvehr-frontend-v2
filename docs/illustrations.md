# Illustrations

People drawn in the app come from **Open Peeps** by Pablo Stanley (https://www.openpeeps.com/). It is released under
**CC0**, so no credit is needed anywhere; this page is the only record of where it came from. The mobile app
(`approvehr-mobile`, `src/ui/art`, its own `docs/illustrations.md`) draws the same figures under the same names.

## Where the files come from

The official "Open Peeps Flat Assets" zip, linked from the pack's Gumroad page (a public Dropbox file, about 22 MB):
`https://www.dropbox.com/scl/fi/rh7i18bjbv93yiz13pr6c/Open-Peeps-Flat-Assets.zip?rlkey=w67sm180akja9fy8fgayfuue9&dl=1`

If that link dies, the GitHub mirror `CharlieMcVicker/open-peeps-creator` carries byte-identical template files.

## How a figure gets into the app

```
npx tsx scripts/import-peeps.ts "<path to the unzipped 'Flat Assets' folder>"
```

The script optimises the chosen templates with svgo, crops each file's view box to where the drawing really is
(`INK`), writes `public/illustrations/peeps/<name>.svg` and regenerates `src/lib/peeps.ts`. Nothing there is edited by
hand. To add a figure: add it to `FIGURES`, measure it with `getBBox()` in a browser on the optimised file and add it to
`INK`, run the script, then give it a name that the mobile app can share.

Seven figures exist: `hand-on-hip`, `shrug`, `coffee-break`, `on-phone`, `arms-crossed`, `paper-b`, `welcome`. Ask for
one by name with `<Illustration name="…" />`. Screens never import an SVG.

**They repeat.** Seven figures over some ninety full-size empty states means the same person shows up on many
screens. More figures need the pack (above); a figure is only worth adding if it gets a mood of its own, or a new
pose for an existing mood that can then be chosen per screen.

## Empty states: the figure follows the mood

`EmptyState` (`components/ui/feedback.tsx`) draws a figure on every **full-size** state: a list, a tab or a screen with
nothing in it. It is picked by `mood`, one pose per mood, the same wherever the mood is used:

| mood        | figure         | use it when the words say                                           |
| ----------- | -------------- | ------------------------------------------------------------------- |
| `nothing`   | `shrug`        | nothing here, and nothing to do about it (default without `action`) |
| `start`     | `welcome`      | nothing yet, and here is how to add the first (default with one)    |
| `caught-up` | `coffee-break` | you have dealt with everything that was waiting on you              |
| `all-clear` | `hand-on-hip`  | nothing is wrong, missing, late or flagged                          |
| `waiting`   | `on-phone`     | it will appear once somebody else has done something                |
| `documents` | `paper-b`      | forms, claims, policies and other records                           |
| `search`    | `arms-crossed` | the search or the filters matched nothing                           |

A list that can be empty for two reasons picks per reason:
`mood={narrowed ? "search" : "nothing"}`. Explicit `art` still wins (Wellness's mascots, the Approvals figure).

Drawn at 136px; a compact state that asks for a mood gets 104px.

### Where a figure does not go: use `plain`, or `compact`

`plain` keeps the grey icon circle and draws no person. It is for:

- **a missing permission** ("You cannot see hiring", "… is not part of your access");
- **an error** or something that could not load or does not work ("Could not load offers", "No assistant is connected");
- **a record that is not there** ("That requisition is not here", "No payslip here");
- **a module that is switched off, or needs the API** ("Appraisals are switched off", "The org chart needs the API");
- **an account state** rather than an empty list ("No employee record", "Not linked to a staff record");
- **a state that is one small section of a page** that holds several (the interviews card on a candidate, the history
  card on an employee record, the people list of a department, a drawer).

`compact` is for the small ones that sit in a card, a drawer or a table cell: it keeps its icon with no edit.

Never a figure on a card in a grid, on an error, on a missing permission, on a record that is not there, on a "sent,
now wait" or part-done outcome, or on the Wellness screens, which have their own mascots (`WellnessArt`, `SceneImage`).

`tests/empty-state-call-sites.test.ts` reads every `<EmptyState` and fails when one with a refusal or error icon (lock,
shield, warning triangle, question mark, crossed-out person, broken plug, compass) has neither `plain`, `compact` nor
`art`. `tests/empty-state-figures.test.tsx` covers the mechanism.

## Success moments

`SuccessMoment` takes `art` for the plainly good, complete news: early pay sent, setup finished, password changed,
email confirmed. It ignores `art` when `compact`.

## Rules for the figures

- **Not recoloured.** White fill, black line, as drawn.
- **Whole.** No fade, blur, mask or gradient over a figure.
- **Bare where the surface is light.** In the dark theme, where black line work cannot be read, `Illustration` puts
  the figure on the light `well-sticker` tile the Wellness scenes use.
- **Decorative.** Empty `alt`, `aria-hidden` on the wrapper: the title and description say everything.
- **Still.** No motion, so nothing for reduced motion to switch off.
- **Few.** One figure per screen at most, large and quiet, belonging to what the screen is for. Kene's earlier
  reaction to figures on small cards and grid cards was to have them taken off; do not put one back.

Shown on `/design-system`.
