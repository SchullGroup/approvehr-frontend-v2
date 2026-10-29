# Every page, on every platform

One file per platform, listing every route it serves. Read from each repo's own routing source,
so a row here exists because the code puts it there — not because somebody remembered to write
it down.

| Platform              | File                                           | Routes | What it is                                                                                                                                |
| --------------------- | ---------------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend v2**       | [`frontend-v2.md`](frontend-v2.md)             |    157 | `approvehr-frontend-v2` — the current product. Next.js 16 App Router; the signed-in app and the public marketing site in one application. |
| **Platform frontend** | [`platform-frontend.md`](platform-frontend.md) |    152 | `approvehr-platform-frontend` — the React Router build of the product.                                                                    |
| **Landing site**      | [`landing-frontend.md`](landing-frontend.md)   |     15 | `aprrovehr-frontend` — the standalone marketing and careers site.                                                                         |

`approvehr-backend` has no pages. Its HTTP surface — 971 endpoints — is in
[`../components/backend-api.md`](../components/backend-api.md).

## How to read a row

- **Route** is the URL a browser sees. `:id` and `[id]` are parameters; `*` is the catch-all.
  Segments in round brackets — `(app)`, `(marketing)` — are Next.js route _groups_: folders that
  organise the code and never appear in the URL.
- **Title** (in `frontend-v2.md`) is the page's own `<title>`, and its **What it is** is the page's
  own description; an em dash means the page computes it. A route marked as retired is one that
  `src/proxy.ts` sends to the landing site, so this application does not serve it.
- **Screen** (in the two React Router files) is the component that renders the page, with layout
  and guard wrappers stripped.
- **File** is where to open it.

## Regenerating

`frontend-v2.md` is generated. `npm run docs` reads every `src/app/**/page.tsx` and takes each
page's title and description from its own `metadata`; `npm run docs -- --check` says whether the
committed file still matches the code. If a route was added and this file was not, the file is what
is wrong. Re-derive rather than patch — a page list that is edited by hand goes stale in a way
nobody notices, which is exactly the failure these files exist to prevent.

`landing-frontend.md` and `platform-frontend.md` are read from each repo's `src/App.tsx` by hand,
and each says at the top which commit it describes. They are only as current as that note: check
the router before trusting a row.
