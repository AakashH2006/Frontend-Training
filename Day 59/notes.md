# Day 59 - Production Build and Deployment

## Topics Covered

- `ng build --base-href`, and what it writes into the output's `index.html`
- Root-absolute (`/api`) versus relative versus base-relative, and why the
  difference is invisible until the app is not at the root of a domain
- `PlatformLocation.getBaseHrefFromDOM()`, and deriving configuration from the
  page instead of hard-coding it per environment
- Testing an injection token's factory, and `MOCK_PLATFORM_LOCATION_CONFIG`
- The SPA fallback: why a refreshed deep link 404s on a static host, and the
  five different ways hosts let you fix it
- `.nojekyll`, `404.html`, and two files `ng build` does not write
- Content-hashed filenames: what actually stays cached when one file changes
- `npm ci` and a lockfile, generated with `--package-lock-only`
- GitHub Actions: a workflow that runs the same commands I have been running
  by hand for fifty-nine days
- Checking a check: the first version of today's CI assertion passed on a
  comment

## Practical Work

`Day 59/Production Build and Deployment/` is Day 58's contacts app, built for
somewhere other than `localhost:4200`. Nothing about the UI changed. What
changed is everything that only matters once the output leaves this machine:

```
src/app/tokens.ts               API_BASE derived from <base href>
src/app/tokens.spec.ts     NEW  9 tests - the first for a token's factory
src/index.html                  the comment, and a stale meta description
tools/spa-fallback.mjs     NEW  404.html, .nojekyll, and a base-href check
package.json                    build:pages, build:local
package-lock.json          NEW  202 kB, so CI can npm ci
DEPLOYING.md               NEW  the host-by-host part, measured where possible
.github/workflows/ci.yml   NEW  at the REPO root - four commands and a deploy
```

319 tests in 19 files, up from 310 in 18.

## The bug that was there for seven days

`API_BASE` has been the string `/api` since Day 52. Every spec, every probe and
every `ng serve` ran the app at the root of its origin, so for seven days
`/api` was indistinguishable from a correct answer.

It is not relative. It is **root-absolute**, which is a different thing:

```
served at /                       asset at /api/contacts.json       OK
served at /Frontend-Training/     asset at /api/contacts.json       404
```

GitHub Pages serves a project site from `/<repo>/`. The reason this is not
obvious is that most of the app's requests never reach the network at all - the
fake backend is an interceptor that matches on the path and answers from
`localStorage`. Exactly two requests fall through to a **static file**: the
contacts seed (`public/api/contacts.json`) and the directory
(`public/api/directory.json`). Those two go to the host.

I wrote a prediction into `tokens.ts` before measuring: the list would come up
empty with no error, because an empty seed is a valid seed. The probe, serving
yesterday's bundle under `/Frontend-Training/`:

```
D58 rows on the list      : 0
D58 error shown           : The contacts could not be loaded
D58 seed asked for        : GET /api/contacts.json -> 404 (outside /Frontend-Training/)
D58 log says              : GET /api/contacts?sort=added&page=1  404  7ms
```

Wrong, and wrong in the lucky direction. Day 58's `withRows` seeds with
`switchMap`, not `tap`, so the seed request's 404 is an error *in the pipeline
of the request that triggered it* - and the list renders its failure state. A
visible error beats a page that looks empty.

The log line is the interesting part. It says
`GET /api/contacts?sort=added&page=1` returned 404, and that URL is one the
app's own fake server implements and would have answered. Day 56's log
interceptor records the URL as requested, before `withRows` clones it to the
static path - so the symptom in production is a 404 from an endpoint that
cannot 404. I would have spent a long time looking at the wrong interceptor.

### The fix is a value the page already knows

```ts
export const API_BASE = new InjectionToken<string>('api base path', {
    providedIn: 'root',
    factory: () => apiBase(inject(PlatformLocation).getBaseHrefFromDOM())
});
```

The `<base href>` is the one thing on the page that already knows where the app
is deployed, and it is the same value the router resolves every route against.
Deriving the API path from it means the two **cannot disagree**, which matters
more than it sounds: the failure mode of them disagreeing is a deep link that
routes correctly while fetching from a directory that does not exist.

Three alternatives, and why not:

- **An environment file.** The Angular way for years, and still common:
  `environment.prod.ts` with an `apiBase` constant, swapped by a build
  configuration. It works, and it puts the deployment path inside the bundle -
  so the same artifact cannot be served from two places, and a wrong value is a
  rebuild rather than a flag. `--base-href` is already the flag.
- **`document.baseURI`.** Shorter, and wrong twice. It is absolute, so every
  request in a test becomes a cross-origin-looking URL; and when there is no
  `<base>` element it falls back to the document's own URL - so on
  `/contacts/c1` it would build `/contacts/c1/api`.
- **Reading `<base>` by hand.** `document.querySelector('base')?.href` is the
  same absolute-URL problem plus a DOM dependency in a root service.

`getBaseHrefFromDOM()` is what `PathLocationStrategy` itself calls. Using the
same source as the router is the entire argument.

### `apiBase`, and the cases I did not want to re-derive

The string handling came out as a pure exported function with a table test,
because the edge cases are the kind that are easier to assert than to reason
about:

| base href | API base | why it comes up |
| --- | --- | --- |
| `''` | `/api` | what `getBaseHrefFromDOM()` returns with no `<base>` - every TestBed in this project |
| `/` | `/api` | served from the root |
| `/Frontend-Training/` | `/Frontend-Training/api` | the reason the function exists |
| `/app` | `/app/api` | `ng build --base-href /app` is accepted and writes exactly that |
| `/app//` | `/app/api` | because the trailing-slash strip is one character away from not doing this |
| `https://example.com/app/` | `/app/api` | legal HTML; keeping the origin would make every request cross-origin, back to the page's own server, and CORS would stop it |

## Testing a factory, and a test environment that lied

Nine tests, and the first attempt at the last three failed in a way worth
keeping:

```
AssertionError: expected '/api' to be '/Frontend-Training/api'
```

I had appended a real `<base href="/Frontend-Training/">` element to the test
document. The factory was correct. `TestBed` does not use the browser's
`PlatformLocation` - it provides `MockPlatformLocation`, whose
`getBaseHrefFromDOM()` returns whatever `MOCK_PLATFORM_LOCATION_CONFIG` says
and never looks at the document at all.

```ts
TestBed.configureTestingModule({
    providers: [{ provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { appBaseHref } }]
});
```

Half an hour on a correct factory, and the lesson is a good one: a test
environment that replaces the thing you are testing against will not tell you
so. It also means the token's test can only assert that the factory *asks*
`PlatformLocation` and passes the answer through `apiBase` - whether Angular's
real implementation reads `<base>` correctly is Angular's test. The end-to-end
claim comes from the probe, against a built bundle:

```
base href in the page     : /Frontend-Training/
rows on the list          : 2
seed asked for            : GET /Frontend-Training/api/contacts.json -> 200
a nav href                : /Frontend-Training/about
url after nav             : /Frontend-Training/about
```

That fourth line is the router's half of the same value: `routerLink="/about"`
rendered as `/Frontend-Training/about`, and following it did not stack a second
prefix.

## The probe had been lying to me for eight days

Not about the app - about the host. Every probe since Day 52 served the build
from the root of a server that answers any path with the file at that path, and
both halves of that are things no static host does. So `probe-59.mjs` serves
the dist **under a prefix**, and with a 404 for anything that is not a file,
with the SPA fallback as a flag so the same bundle can be measured with and
without it.

Asking that host the questions a browser asks:

```
GET the app root          : 200 text/html
GET a real file           : 200 text/html
GET a route               : 404 application/json
GET 404.html              : 200 text/html
GET outside the prefix    : 404 text/plain
GET the seed asset        : 200 application/json
```

Line three is the whole problem. `/Frontend-Training/contacts/c4` is a route,
and a route is not a file. The host has no idea the app owns its URLs, so a
refresh - or a shared link, or the back button after a full reload - gets the
host's own 404 page and the app never loads. Its router never gets the chance
to recognise the URL. "It works until you refresh" is the most common way a
correct SPA looks broken in production.

```
reload, no fallback       : 404, not the app (58 bytes)
reload, with fallback     : 200, the app (3245 bytes)
```

GitHub Pages serves `404.html` for anything it cannot find, so a **copy of
index.html under that name** is the entire fix. `tools/spa-fallback.mjs` does
it, plus `.nojekyll`, after every build.

### What the probe cannot show, said out loud

```
fallback used by jsdom    : never (no HTML request)
router given a deep URL   : the record
```

The harness builds its document from `index.html` on disk, so loading the app
makes no HTML request and the fallback cannot be exercised through it. The two
lines are honest about which half each one measures: the second is the router
reading a prefixed path correctly, which was never in doubt; the fallback claim
comes from the plain `fetch` above, which is exactly what a browser does on
reload and nothing more.

This is the third time this project's measurement harness has not been able to
show something I wanted (Day 58: a lazy chunk being fetched; Day 58: the
spinner that `load()` waits past). Writing down which claim rests on which
measurement is cheap. Letting a label imply the stronger one is how a probe
becomes decoration.

### Why `404.html` and not a rewrite

Five hosts, from their own documentation, none of them tried here:

| Host | The proper fix |
| --- | --- |
| nginx | `try_files $uri $uri/ /index.html;` |
| Netlify | `/*  /index.html  200` in `_redirects` |
| Cloudflare Pages | SPA mode, on by default |
| S3 + CloudFront | custom error response 404 -> `/index.html`, status 200 |
| Apache | `FallbackResource /index.html` |

All of them answer **200**, which `404.html` does not. A human cannot tell the
difference; a crawler can, and is right to dislike it. The 404.html route is
the one that needs no host configuration at all, which is why it is the one in
the build script and the rest are in `DEPLOYING.md`.

### `ng build` empties the output directory

Measured, by diffing two file listings: after a plain `ng build` the only
difference was `404.html`, gone. That is why the fallback is part of the npm
script and not something I ran once:

```json
"build:pages": "ng build --base-href /Frontend-Training/ && node tools/spa-fallback.mjs dist/contacts/browser /Frontend-Training/",
"build:local": "ng build && node tools/spa-fallback.mjs dist/contacts/browser /"
```

## The check that passed on a comment

The CI workflow's output step started as:

```yaml
grep -q '<base href="/Frontend-Training/">' dist/contacts/browser/index.html
```

It passed. It also would have passed on a bundle with no `<base>` element at
all, because `src/index.html` carries a comment *about* the base href - and
when I wrote today's explanation into that comment, it came to contain the
string `<base href="/Frontend-Training/">` as well. The grep was matching text
no browser will ever act on.

So the check moved into `tools/spa-fallback.mjs`, which strips HTML comments
before looking and exits non-zero if the base href is not the one the build was
told to produce. Three failure paths, all exercised:

```
$ node tools/spa-fallback.mjs dist/contacts/browser /wrong/
spa-fallback: base href is "/Frontend-Training/", expected "/wrong/"
  The --base-href flag did not reach the build, or the two disagree.
exit 1

$ node tools/spa-fallback.mjs <a dir whose index.html has the base href only in a comment>
spa-fallback: no <base href> in the built index.html
  Without one the router and API_BASE have nothing to resolve against.
exit 1

$ node tools/spa-fallback.mjs <an empty dir>
spa-fallback: no index.html in ... - did the build run?
exit 1
```

The expected value is passed in rather than inferred, so the base href appears
twice in `package.json`. That is deliberate: the failure being caught is the
flag not arriving, and a check derived from the flag cannot catch it. Two
copies that have to agree is a cheap price.

It is still a regex over HTML, which is usually a mistake. What makes it
acceptable is the input: one file, generated by a tool, whose `<base>` element
this script only ever has to *find*.

## Hashed filenames, and what actually stays cached

Angular writes content-addressed names - `main-ILQ6J2DL.js` - so the output can
be served with a long `max-age`. Everything except `index.html` and `404.html`,
which must not be, because they are the files that name the hashed ones.

Two builds of unchanged sources produced byte-identical listings, so the
hashing is deterministic. Then I changed one character in one `<h2>` in the
lazily-loaded About page, and expected one filename to move:

```
7 of the 9 JS filenames changed, including main
chunk-B8I-MnXf.js   | 173.59 kB | 50.99 kB transfer   unchanged
styles-2ZWCTULA.css |  10.16 kB |  2.10 kB transfer   unchanged
```

Reverting the character restored every original name, so this is content
addressing working correctly rather than a flaky build. I do not fully
understand the spread - `main` has to change, because it names the chunk that
changed, but why `confirm-dialog` and `settings-page` moved is a question I can
only guess at (a shared chunk whose contents shifted, and every importer's
bytes with it) and am writing down as a guess.

What survived is the part worth surviving. That 173.59 kB chunk is **46% of the
initial transfer size**, and `cmp` says it is byte-identical to the same-named
chunk in the "before" bundle I kept for comparison - a build with a different
`tokens.ts`. Two source trees, one byte-identical chunk: it is framework code
and nothing of mine. A returning visitor re-downloads about 57 kB of a 110 kB
app after a typo in an `<h2>`.

Which is a real benefit, and it is **not** what `@defer` bought. Yesterday's
lazy chunks are 1.2 kB of transfer each. Splitting my code off the framework's
is what earns the cache hit, and that happens by default.

## CI, and the thing I cannot verify

`.github/workflows/ci.yml` lives at the **repository root**, not in the day's
folder - GitHub only reads workflows from there. One `env: APP_DIR` at the top
is the only line Day 60 has to change.

```yaml
- name: Install     run: npm ci
- name: Typecheck   run: npm run typecheck
- name: Test        run: npm test
- name: Build       run: npm run build:pages
```

The same four commands, run by something that is not me on a clean checkout.
That is the entire value: a check that runs only when I remember it passes on
the day I look and says nothing about the other fifty-eight. The budgets Day 58
set are the first thing in this project that can fail a build, which makes them
the first thing worth wiring into one.

`npm ci` rather than `npm install` - it installs exactly the lockfile, fails if
`package.json` and the lockfile disagree, and deletes `node_modules` first. All
three are what a build server should do and none of them are what I want
locally; the third would be actively destructive here, because `node_modules`
in every day's folder is a junction to one shared Angular install. So the
lockfile was generated with `npm install --package-lock-only`, and `npm ci`
itself is **not among the commands I have run**.

**This workflow has never run.** Verified locally: the YAML parses, the paths
in it exist, and the typecheck, the tests, `build:pages` and the four `test -f`
checks all pass here in that order. Not verified, and only a runner can say:
whether the lockfile resolves on Linux, whether the headless browser the test
runner wants exists on `ubuntu-latest`, and whether the Pages deploy job works
at all. The deploy also does nothing until the repository's Pages source is set
to "GitHub Actions" in its settings, which is a click I have not made.

The deploy is a second job, `needs: check`,
`if: github.ref == 'refs/heads/main'`, with `permissions: pages: write,
id-token: write` on that job and nowhere else - so the job that runs the tests
cannot publish, and the job that publishes cannot run unless the tests passed.
It rebuilds rather than downloading the first job's artifact: slower by two
seconds, and correct, because an artifact is a file that could have been
replaced between two jobs.

## What I Learned

**Root-absolute is not relative, and nothing told me for seven days.** `/api`
looks relative. The leading slash means "from the root of the origin", and the
only way the difference shows up is to serve the app from somewhere that is not
the root - which no spec, no probe and no `ng serve` had ever done. The class of
bug is "a value that is correct in every environment I have ever run in", and
the defence is not care, it is running in a different environment once.

**My prediction about the failure was wrong in writing, which is the useful
place to be wrong.** I committed "the list comes up empty, with no error" to a
comment and the probe said "The contacts could not be loaded". Having written
it down made the difference checkable; the correction is now in the same
comment, with the `switchMap` reason it happened.

**Deriving configuration beats configuring it.** The deployment path exists in
exactly one place - the `<base href>` the build flag writes - and both the
router and the API read it from there. An environment file would have put the
same value in two places, inside the bundle, where a mistake is a rebuild.

**A check can pass on a comment.** The grep that verified today's most
important build output matched a sentence I had written *about* the thing it was
checking. I only noticed because I added a line to that comment and watched the
match count go from two to three. Every assertion over text has this failure
mode; the fix was to parse a little - strip comments - and to put the check
somewhere a human would read it.

**The measurement harness has limits, and naming them is part of the
measurement.** `fallback used by jsdom: never (no HTML request)` is a more
useful line than a passing assertion would have been, because it says which
claim the probe is not making.

**What stays cached is the framework, not my cleverness.** A one-character
change moved 7 of 9 filenames. The 51 kB that survived is Angular, byte for
byte, in two builds of two different source trees. Yesterday's `@defer` work
moved 1.2 kB chunks; the default code-splitting between framework and app moves
46% of the payload off every repeat visit.

## Verification

Type checking:

```
> npm run typecheck
> tsc -b --force
(no output)
```

The suite - 319 tests in 19 files, up from Day 58's 310 in 18:

```
> npm test

 ✓ src/app/tokens.spec.ts               (9 tests)    50ms
 ✓ src/app/session.service.spec.ts      (7 tests)    31ms
 ✓ src/app/settings.service.spec.ts     (7 tests)    31ms
 ✓ src/app/directory.service.spec.ts    (15 tests)  207ms
 ✓ src/app/announcer.spec.ts            (15 tests)  433ms
 ✓ src/app/fake-api.spec.ts             (8 tests)   273ms
 ✓ src/app/domain.spec.ts               (15 tests)    6ms
 ✓ src/app/guards.spec.ts               (13 tests)  153ms
 ✓ src/app/contacts.service.spec.ts     (24 tests)  323ms
 ✓ src/app/contacts.api.spec.ts         (34 tests)  337ms
 ✓ src/app/validators.spec.ts           (34 tests)   35ms
 ✓ src/app/contact-card.spec.ts         (8 tests)   442ms
 ✓ src/app/pagination.spec.ts           (10 tests)  537ms
 ✓ src/app/pages/sign-in-page.spec.ts   (15 tests)  374ms
 ✓ src/app/route-focus.spec.ts          (16 tests)  537ms
 ✓ src/app/confirm-dialog.spec.ts       (9 tests)   648ms
 ✓ src/app/routes.spec.ts               (41 tests)  801ms
 ✓ src/app/contact-form.spec.ts         (20 tests) 1222ms
 ✓ src/app/interceptors.spec.ts         (19 tests) 2520ms

 Test Files  19 passed (19)
      Tests  319 passed (319)
   Duration  6.56s
```

New: 9 in `tokens.spec.ts` - six for `apiBase` as a pure function, three for
the token through `MOCK_PLATFORM_LOCATION_CONFIG`.

The production build:

```
> npm run build:pages

Initial chunk files | Names            |  Raw size | Estimated transfer size
main-ILQ6J2DL.js    | main             | 204.66 kB |                49.32 kB
chunk-B8I-MnXf.js   | -                | 173.59 kB |                50.99 kB
chunk-Ccdpis1f.js   | -                |  27.46 kB |                 7.98 kB
styles-2ZWCTULA.css | styles           |  10.16 kB |                 2.10 kB

                    | Initial total    | 415.87 kB |               110.38 kB

Lazy chunk files    | Names            |  Raw size | Estimated transfer size
chunk-Pkr5Zb64.js   | directory-search |   4.08 kB |                 1.61 kB
chunk--nx62vTc.js   | confirm-dialog   |   3.32 kB |                 1.31 kB
chunk-B2LVfv0a.js   | settings-page    |   2.96 kB |                 1.17 kB
chunk-D6httKxM.js   | about-page       |   2.70 kB |                 1.23 kB
chunk-Ch5tO7WT.js   | -                |   1.27 kB |               561 bytes

Application bundle generation complete. [2.362 seconds]

spa-fallback: base href "/Frontend-Training/", 404.html written (3245 bytes) and .nojekyll created
```

Day 58's verification section recorded 415.92 kB / 110.26 kB, so today put
nothing new in the bundle - 50 bytes less of it, in fact. What it changed is a
string inside the bundle and a comment inside `index.html`. Still inside the
425 kB warning budget.

The probe - a static host, under a prefix, with and without a fallback
(`probe-59.mjs`, exit 0, 6,376 ms):

```
GET the app root          : 200 text/html
GET a real file           : 200 text/html
GET a route               : 404 application/json
GET 404.html              : 200 text/html
GET outside the prefix    : 404 text/plain
GET the seed asset        : 200 application/json
base href in the page     : /Frontend-Training/
rows on the list          : 2
names                     : Jean Bartik, Katherine Johnson
seed asked for            : GET /Frontend-Training/api/contacts.json -> 200
a nav href                : /Frontend-Training/about
url after nav             : /Frontend-Training/about
page after nav            : About this build
router given a deep URL   : the record
deep link url             : /Frontend-Training/contacts/c4
fallback used by jsdom    : never (no HTML request)
reload, no fallback       : 404, not the app (58 bytes)
reload, with fallback     : 200, the app (3245 bytes)
D58 rows on the list      : 0
D58 empty-state says      : (none)
D58 error shown           : The contacts could not be loaded
D58 seed asked for        : GET /api/contacts.json -> 404 (outside /Frontend-Training/)
D58 log says              : GET /api/contacts?sort=added&page=1  404  7ms
console errors            : none
```

Two rows rather than three because the list is paginated at two per page, as it
has been since Day 54. `D58 empty-state says: (none)` is correct and not a gap:
the list renders its *error* state, so the empty state is not on the page.

Not verified, and listed as such:

- the GitHub Actions workflow, which has never run anywhere
- `npm ci`, for the reason in the CI section above
- the five host rewrite rules in `DEPLOYING.md`, which are from documentation
- the actual GitHub Pages deployment: the repository's Pages source has not
  been set to "GitHub Actions" and nothing has been pushed

## Day 59 Outcome

The app would have deployed broken. Not visibly broken in a way I would have
caught in review - broken by a leading slash in a string that had been correct
in every environment this project has ever run in, and broken again by a
refresh on a URL the app itself generates. Both are now measured failures with
measured fixes, and the measurement I am most glad about is the one that showed
my written prediction was wrong.

The day's smallest piece of work is the one I will remember: a `grep` that
verified the single most important line of the build output, passing on a
comment about that line. Checks are code. They are code that nobody reads until
it is wrong, and it is wrong silently, in the direction of green.

Day 60 is the last day - the Week 12 README and the capstone, which after today
means the deployable build and the honest list of what about it has and has not
been run.
