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

- **As drawn in the light theme.** White fill, black line, straight on the page.
- **In the dark theme's indigo in the dark theme.** See "Dark theme" below. Never any other colour.
- **Whole.** No fade, blur, mask or gradient over a figure.
- **Bare.** No tile behind a figure in either theme. (The dark theme used to put it on a light lavender tile, which
  was a white box on a dark page; the owner asked on 24 Nov 2026 for every illustration to fit dark mode.)
- **Decorative.** Empty `alt`, `aria-hidden` on the wrapper: the title and description say everything.
- **Still.** No motion, so nothing for reduced motion to switch off.
- **Few.** One figure per screen at most, large and quiet, belonging to what the screen is for. Kene's earlier
  reaction to figures on small cards and grid cards was to have them taken off; do not put one back.

Shown on `/design-system`.

## Dark theme

Every piece of art follows the theme. Nothing draws a light box, a white card or a daylight-bright gradient on a dark
page.

| Art                                  | Light theme                                    | Dark theme                                                                          |
| ------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Open Peeps figures (`Illustration`)  | white fill, black line                         | fill `accent-soft`, line `accent-text`, from `peeps/dark/`                          |
| Wellness scenes (`SceneImage`)       | black line and pink on the `well-sticker` tile | line `accent-text`, pink `well-pink-text`, on `well-peri-soft`, from `scenes/dark/` |
| Wellness mascots (`WellnessArt`)     | bright `well-*` fills, fixed `well-ink` faces  | the same: built to read on both grounds                                             |
| Blue hero gradient (`HeroBackdrop`)  | `hero-from` #1c2872 to `hero-to` #4059d3       | a step deeper: #131b4f to #2c3d98                                                   |
| Sign-in panel mockups (`AuthVisual`) | white cards, slate ink                         | `surface` cards, `ink` text, `warning-soft` pill (`.ahr-mockups-follow-theme`)      |
| Offline page (`/offline`)            | its own light colours                          | its own dark colours, now that it runs the theme script itself                      |

The dark copies of the line art are files, not filters: `scripts/dark-art.ts` (`npm run art:dark`) writes
`public/illustrations/peeps/dark/` and `public/wellness/scenes/dark/` from the light files, reading the colours out of the
dark block of `globals.css`. Each light file may use only the colours that script knows (white and black for a figure,
black and the pink for a scene); a new colour stops it instead of reaching a dark page unchanged. `npm run check` runs
`verify-dark-art`, which fails when a dark copy is missing or no longer matches its light file and the tokens, and
`verify-contrast` checks the dark line against every ground it is drawn on (3:1, a graphical object) and white text on
both ends of the hero gradient in both themes. `Illustration` and `SceneImage` draw both files and show one: the hidden
one has no box, so a lazy image never fetches it.

User content is not art and is drawn as uploaded: a company logo, a photo, a notice's picture.
