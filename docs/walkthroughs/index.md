# Walkthroughs

Documents for people who have to **use** ApproveHR rather than change it — a PM, a new joiner,
somebody running a demo. No code, no database, no jargon left unexplained.

| Walkthrough | Covers |
|---|---|
| [`performance.md`](performance.md) | **Running an appraisal, screen by screen.** Thirty numbered steps from setting the scoring up to publishing the marks, a relay diagram of who hands what to whom, a card per role, eight deliberate surprises, and a twenty-minute demo script. |
| [`running-an-appraisal.pdf`](running-an-appraisal.pdf) | **The same walkthrough, with a photograph of every screen.** 63 pages of A4, built from the live product as three different people — an administrator, a line manager, and an employee reading their own final rating. Every screenshot is captioned with the address it was taken from. Hand this to somebody who will not open a repository. |

## The PDF is a build output, and nothing here rebuilds it

`running-an-appraisal.pdf` was rendered from `performance.md` by a Playwright script that signs in,
walks the product and photographs each screen. **That script is not committed** — it lives in the
gitignored `.e2e-run/` scratch directory and needs a running API, a seeded company and three sets of
credentials, none of which belong in this repository.

So the PDF is a **snapshot, not a derived artefact**: editing `performance.md` does not change it,
and the two can drift. The markdown is the source of truth; if they disagree, the PDF is what is
stale. Two things are stated on its own last page rather than left to be discovered — the
calibration steps and one KPI control are not photographed, because reaching either would have meant
pushing real records through a one-way door.

## The rule these follow

**Every on-screen label is quoted, never paraphrased.** Where the product says something in its own
words — a button, a field, a refusal — the walkthrough reproduces it exactly, so the two cannot
drift apart. If a label in one of these stops matching the product, the document is what is wrong:
fix the document, do not reword the product to match it.

The same rule the codebase applies to itself. `HANDOVER.md` records what happens when a second copy
of a sentence exists: three sets of rating labels, zero importers between them, and the one that
actually rendered was the wrong one.

## Adding one

One file per module, named after the module. Keep the shape: a glossary first, then the map of
doors, then the flow, then numbered steps on a fixed **Where / Who / Click / You'll see** grammar.
The grammar is what makes a walkthrough followable by somebody who has never opened the product —
they learn the shape once and then only read the contents.
