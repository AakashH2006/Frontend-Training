# Deploying this app

Written on Day 59, after the probe showed me three different ways a correct
build fails on a real host, and re-measured on Day 60 for the build that is
actually being deployed. Everything below with a number next to it was
measured; everything that has not been is marked as such.

## The short version

```bash
npm ci                 # exactly the lockfile
npm run typecheck
npm test
npm run build:pages    # ng build --base-href /Frontend-Training/ + the fallback
# upload dist/contacts/browser
```

`npm run build:local` is the same thing with no base href, for serving the
output from the root of something.

## What the build actually produces

Measured on 2026-11-10, Angular 22.2, `npm run build:pages`:

```
Initial chunk files | Names            |  Raw size | Estimated transfer size
main-M365DBAM.js    | main             | 206.04 kB |                49.60 kB
chunk-B8I-MnXf.js   | -                | 173.59 kB |                50.99 kB
chunk-CBr9yjmi.js   | -                |  27.54 kB |                 8.00 kB
styles-2ZWCTULA.css | styles           |  10.16 kB |                 2.10 kB
                    | Initial total    | 417.33 kB |               110.68 kB

Lazy chunk files    | Names            |  Raw size | Estimated transfer size
chunk-CoGb20dI.js   | directory-search |   4.08 kB |                 1.61 kB
chunk-K9HgCnLh.js   | confirm-dialog   |   3.32 kB |                 1.31 kB
chunk-WlPWl_rV.js   | settings-page    |   2.96 kB |                 1.17 kB
chunk-Ks3l31Vg.js   | about-page       |   2.70 kB |                 1.23 kB
chunk-Bf3H7i03.js   | -                |   1.27 kB |               563 bytes
```

Plus three files that are not in that table and matter as much:

- `index.html`, 3,203 bytes, with `<base href="/Frontend-Training/">` written
  into it by `--base-href`.
- `404.html`, a byte-for-byte copy of `index.html`, written by
  `tools/spa-fallback.mjs`.
- `.nojekyll`, empty, same script.

That script also reads the base href back out of the built `index.html` and
exits non-zero if it is not the one the build was told to use, so a build whose
`--base-href` went missing fails at the point it is made rather than on the
host. It strips HTML comments before looking, which is not fussiness: this
project's `src/index.html` has a comment *about* the base href containing the
string `<base href="/">`, and the first version of this check - a `grep` in the
CI workflow - matched that comment and would have passed a bundle with no base
element at all.

`ng build` **empties the output directory**, so those last two are gone after
every build. That is why they are part of the npm script and not something I
run once: the measured difference between the two listings was exactly one
file, `404.html`, missing after a plain `ng build`.

## The three failures the probe found

### 1. The API path was root-absolute

`API_BASE` was the string `/api` for seven days. Served under a prefix:

```
D58 rows on the list      : 0
D58 error shown           : The contacts could not be loaded
D58 seed asked for        : GET /api/contacts.json -> 404 (outside /Frontend-Training/)
```

The fake backend answers most requests itself, so the app looks fine until a
request falls through to a **static file** - the contacts seed and the
directory. Those asked the host for `/api/contacts.json` while the app lived at
`/Frontend-Training/`. The fix is in `src/app/tokens.ts`: the base is derived
from the document's `<base href>` through `PlatformLocation`, so the router's
idea of where the app is and the API's idea cannot drift apart. Same probe,
same host, the current build:

```
rows on the list          : 2
seed asked for            : GET /Frontend-Training/api/contacts.json -> 200
a nav href                : /Frontend-Training/about
```

Nothing has to be rebuilt per environment. `--base-href` is the only knob.

### 2. A refreshed deep link is a request for a file that does not exist

```
GET a route               : 404 application/json
reload, no fallback       : 404, not the app (58 bytes)
reload, with fallback     : 200, the app (3245 bytes)
```

Day 60's own probe re-ran the deployment half against the final build and
agrees: `base href in the build: /Frontend-Training/`, `reload of a deep link:
200, the app`, `404.html written: yes`, `.nojekyll written: yes`.

A static host has no idea that `/contacts/c4` is a route. `tools/spa-fallback.mjs`
copies `index.html` to `404.html`, which GitHub Pages serves for anything it
cannot find; the app boots, the router reads the path, the right page renders.

The response status really is `404`. A human cannot tell and a crawler can, so
if the host offers a proper rewrite, use it instead:

| Host | Instead of 404.html |
| --- | --- |
| nginx | `try_files $uri $uri/ /index.html;` |
| Netlify | `/*  /index.html  200` in `_redirects` |
| Cloudflare Pages | SPA mode, on by default |
| S3 + CloudFront | custom error response: 403/404 → `/index.html`, status 200 |
| Apache | `FallbackResource /index.html` |

All five are from the hosts' own documentation and **none of them has been
tried here**. The 404.html route is the one I measured, and the one that needs
no host configuration at all - which is why it is the one in the build script.

### 3. Jekyll

GitHub Pages runs the upload through Jekyll unless `.nojekyll` is present, and
Jekyll skips paths beginning with an underscore. Angular 22's output uses none
today - I checked the file listing above - so this is insurance, not a fix. It
is also one empty file against a failure that presents as "one chunk 404s in
production and nowhere else".

## Caching

Filenames are content-hashed, and the hashing is deterministic: two builds of
unchanged sources produced byte-identical listings. So the output can be served
with a long `max-age` - except `index.html` and `404.html`, which must not be,
because they are the files that name the hashed ones.

What a one-character change costs is less flattering than I expected. Editing
one `<h2>` in the lazily-loaded About page moved **seven of the nine JS
filenames**, including `main`. Reverting the character restored every original
name, so this is content addressing working correctly, not a flaky build. What
survived was the one worth surviving:

```
chunk-B8I-MnXf.js   | 173.59 kB | 50.99 kB transfer   unchanged
styles-2ZWCTULA.css |  10.16 kB |  2.10 kB transfer   unchanged
```

That chunk is 46% of the initial transfer size, and `cmp` says it is
byte-identical to the same-named chunk in the "before" build I kept for
comparison - a build with a different `tokens.ts` - which is about as good as
evidence gets that it is framework code and nothing of mine. A returning
visitor re-downloads about 57 kB of a 110 kB app after a typo. Splitting my
own code off the framework's is what earns that, and `@defer` is not what did
it: the lazy chunks are 1.2 kB each.

Day 60 adds a third data point without trying. A whole day's work - a new
endpoint, a new client method with a cache, 36 more tests and an edited shell
template - moved `main` and both anonymous initial chunks, and left
`chunk-B8I-MnXf.js` and `styles-2ZWCTULA.css` with the names they have had
since Day 58. The 51 kB that does not change is the 51 kB I did not write.

## GitHub Pages, concretely

`.github/workflows/ci.yml` at the repository root runs `npm ci`, the
typecheck, the 355 tests, `npm run build:pages` and four `test -f` checks on
the output; on `main` a second job deploys. Its `APP_DIR` is
`Day 60/Final Capstone`, the last day's app, which is the one that gets
deployed. **The workflow has never run.** It needs, in the repository settings,
Pages → Build and deployment → Source = **GitHub Actions**; with the default
"Deploy from a branch" the `deploy` job fails. The base href in
`package.json` is `/Frontend-Training/`, which is right for
`https://<user>.github.io/Frontend-Training/` and wrong for a user site or a
custom domain - both of those are served from the root, so they want
`build:local`.

## What this is not

A real deployment story would also need a real backend. This app has none: the
"server" is an HTTP interceptor and two static JSON files, and every write is
lost on reload. `API_BASE` pointing at a path on the same origin is the right
shape for that, and the day it points at a different origin, CORS becomes the
next thing on this page.
