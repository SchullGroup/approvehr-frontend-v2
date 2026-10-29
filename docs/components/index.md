# Every component and function, on every platform

One file per platform. Each lists every exported symbol, grouped by what it is for rather than by
where the file happens to sit — so "where do I find the data hooks" and "what is already in the
design system" both have an answer you can scan.

| Platform              | File                                           | Files | Components | Hooks | Functions |
| --------------------- | ---------------------------------------------- | ----: | ---------: | ----: | --------: |
| **Frontend v2**       | [`frontend-v2.md`](frontend-v2.md)             |  1184 |        989 |   416 |      1408 |
| **Platform frontend** | [`platform-frontend.md`](platform-frontend.md) |   800 |        642 |   933 |       208 |
| **Landing site**      | [`landing-frontend.md`](landing-frontend.md)   |    39 |         50 |     — |        17 |
| **API**               | [`backend-api.md`](backend-api.md)             |   479 |          — |     — |      2087 |

The API file also carries all **971 endpoints**, listed per module with their full mounted paths.

## What the columns mean

|               |                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Component** | Renders. PascalCase, in a `.tsx` file.                                                                                                                                                                        |
| **Hook**      | Starts with `use`. Holds state, or fetches.                                                                                                                                                                   |
| **Function**  | A plain callable — a formatter, a guard, a transform.                                                                                                                                                         |
| **Also**      | Constants and types are **counted, not listed**. There are thousands of them across the frontends and a list of them helps nobody; the count tells you the file has them and the file name tells you where. |

## Before you add anything

Check the group it would belong to first. Three of the most expensive bugs in `HANDOVER.md` were a
second copy of something that already existed — a second payroll engine, a second set of rating
labels, a second implementation of a score. The point of a grouped list is that the search is
cheap enough that nobody skips it.

## Regenerating

`frontend-v2.md`, `landing-frontend.md` and `backend-api.md` are generated. `npm run docs` walks
`src/**/*.{ts,tsx}` in this repo, in the landing site (read at `origin/main`) and, for the API,
`src/**/*.ts` (read at `origin/staging`), excluding tests and `.d.ts`; `npm run docs -- --check`
says whether the committed files still match the code. If a symbol is missing, re-derive the
file rather than patching the row.

Classification is by declaration shape and name, so a symbol lands in the wrong column
occasionally — the file path beside it is always right. A `forwardRef` or `memo` component counts
as a component, a barrel (an `index.ts` that only re-exports) is left out, and a symbol exported
through `export { a }` counts where it is declared. The API file also finds every endpoint by
following the mounts from `app.ts`, and stops with a line number rather than guess at a route it
cannot follow.

`platform-frontend.md` is from a one-off pass and says so at the top; that repository has not
changed since 2026-08-21.
