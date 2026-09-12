# Every page, on every platform

One file per platform, listing every route it serves. Generated from each repo's own routing
source, so a row here exists because the code puts it there — not because somebody remembered
to write it down.

| Platform | File | Routes | What it is |
|---|---|---:|---|
| **Frontend v2** | [`frontend-v2.md`](frontend-v2.md) | 113 | `approvehr-frontend-v2` — the current product. Next.js 16 App Router; the signed-in app and the public marketing site in one application. |
| **Platform frontend** | [`platform-frontend.md`](platform-frontend.md) | 152 | `approvehr-platform-frontend` — the React Router build of the product. |
| **Landing site** | [`landing-frontend.md`](landing-frontend.md) | 14 | `aprrovehr-frontend` — the standalone marketing and careers site. |

`approvehr-backend` has no pages. Its HTTP surface — 644 endpoints — is in
[`../components/backend-api.md`](../components/backend-api.md).

## How to read a row

- **Route** is the URL a browser sees. `:id` and `[id]` are parameters; `*` is the catch-all.
  Segments in round brackets — `(app)`, `(marketing)` — are Next.js route *groups*: folders that
  organise the code and never appear in the URL.
- **Screen** is the component that renders the page, with layout and guard wrappers stripped.
- **File** is where to open it.

## Regenerating

These are generated rather than hand-kept, from `src/app/**/page.tsx` for the Next app and from
`src/App.tsx` for the two React Router apps. If a route was added and this file was not, the file
is what is wrong. Re-derive rather than patch — a page list that is edited by hand goes stale in a
way nobody notices, which is exactly the failure these files exist to prevent.
