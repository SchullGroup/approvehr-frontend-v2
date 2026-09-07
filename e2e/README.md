# End-to-end tests

```bash
npm run e2e            # both projects, headless
npm run e2e:ui         # the Playwright inspector, for writing one
npx playwright test --project=mobile   # just the phone-width run
```

First run on a new machine needs the browser once:

```bash
npx playwright install chromium
```

## What these cover, and what they deliberately do not

They open the app the way a person does and assert the things that **only exist
between layers**. `tests/*.test.tsx` mount a component; these open a route.

Every defect this repo's `HANDOVER.md` records as "found in the browser, not by
`tsc`" is that shape — a live "Try again" beside a 409, a checkbox that ticked
and left its button grey, `₦0.00` where a figure does not belong, a count true
of the wrong noun. None of those is visible to a type or to a mounted component
with a stubbed store.

Writing them found one immediately: `/people/one-on-ones` offered **Start one**
with no API, where the button's only possible outcome was the offline refusal.
That is the exact class, and it survived a green `npm run check` because a
developer always has the API running.

They run in **demo mode with no API** — `NEXT_PUBLIC_API_URL` is pinned at a
dead port so the suite cannot accidentally exercise a different product
depending on whether somebody has the backend up. That is a real limit on what
they can assert, and it is the right trade for a suite that runs anywhere:
anything needing a database is a backend test, of which there are 2,834.

## Not in `npm run check`

`check` is what CI enforces and it finishes in under a minute; this starts a dev
server and drives Chromium for about two. Wire it into the same job when
somebody decides the wall-clock is worth it.

## Three things that cost time to find

- **`localhost`, never `127.0.0.1`.** Next 16 blocks cross-origin requests for
  dev resources and treats the two as different origins. From `127.0.0.1` every
  chunk 403s, the page never hydrates, and it sits on the session spinner — with
  the only clue in the dev server's own output.
- **Its own `NEXT_DIST_DIR`.** `next dev` refuses to start a second server out
  of one directory, and three sessions share this checkout.
- **A fresh demo browser sees the setup wizard**, deliberately — so every route
  redirects there. `sign-in.ts` seeds the company as set up, by the store's own
  shape and version, so a change to that shape makes the wizard come back
  loudly rather than silently skipping it.
