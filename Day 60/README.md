# Week 12 — Guards, Accessibility, Performance, Deployment and the Capstone

Days 56–60. The last week, and the one with no new framework in it: five days
of taking a working routed application and making it a shippable one.

## What this is

`Day 60/Final Capstone/` is the finished build: a contact manager where the
**URL is the query**, the server answers it, and the client is honest about
what it does not hold. It is the same app Week 11 built, with the week's five
days of work on top.

The same app at four earlier stages is in `Day 56/`–`Day 59/`. Each folder is a
complete, runnable copy, so the diffs between them are the week's actual
history.

| day | folder | what it added |
| --- | --- | --- |
| 56 | `Guards Resolvers and Interceptors` | four guards, two resolvers, a four-interceptor chain, a fake sign-in |
| 57 | `Accessibility and Quality Pass` | one live region, focus on navigation, a dialog that traps focus |
| 58 | `Performance and Deferred Loading` | `rxResource`, a record cache, `@defer`, bundle budgets |
| 59 | `Production Build and Deployment` | a base href the API path derives from, an SPA fallback, CI |
| 60 | `Final Capstone` | `GET /api/tags`, and the first spec that renders the shell |

## How to run it

```bash
cd "Day 60/Final Capstone"
npm install
npm start             # http://localhost:4200
npm test              # 355 tests, ~7s, no browser
npm run typecheck     # tsc -b --force over app and specs
npm run build:local   # for serving from the root of something
npm run build:pages   # for https://<user>.github.io/Frontend-Training/
```

There is no backend to start. `src/app/fake-api.ts` is an HTTP interceptor that
answers `/api/*` itself, seeds from `public/api/*.json` on first use and keeps
its rows in `localStorage`. Clearing site data resets it.

Nothing leaves the machine. The fixture addresses are invented `example.com`
and `example.org` ones attached to the names of historical scientists. The
sign-in on Day 56 is a name in `localStorage` with no password and no server;
its own comments say so, and it protects a page rather than any data.

Deployment, including the three ways a correct build fails on a static host, is
in `Day 60/Final Capstone/DEPLOYING.md`.

## The week's five ideas

### 1. A guard is a question asked before a component exists

Day 56's phase order, which took writing a test helper to understand:

```
canMatch -> canActivate -> resolve -> component created -> canDeactivate
```

A resolver's request is in flight while there is nothing on screen. That is
what makes `RouterTestingHarness` hang if you await the navigation before
answering it — nine five-second timeouts in one run, and the reason
`navigateResolving` exists in `routes.spec.ts`.

The guard that earns its place is `unsavedChangesGuard`, because it holds a
navigation open on an `Observable<boolean>` that a **person** has to resolve.
Nothing else in the framework pauses on a human.

### 2. A live region has to exist before it has anything to say

Day 57. A region added to the DOM at the same moment as its first message is
announced by nothing: there is no change for a screen reader to notice. So
`<app-announcer />` is in the shell, rendered once, empty most of the time.

Two bugs came out of that, and both are the same bug in different clothes:

- padding a repeated message with a nonce made every announcement unique and
  made an effect that called `announce` loop for ever
- the search announced its result count during the debounce window, so it said
  "1 match" about the query before the one you typed

The fix for the second is `Answer { query, entries }` — if the count and the
query travel together, a stale count cannot be announced against a fresh
query. State that must agree belongs in one value.

### 3. Measure before and after, and publish the number that disappoints you

Day 58's headline: `@defer` made the initial bundle **10 kB bigger**. The
deferred components are 1.2 kB of transfer each; the loader machinery costs
more than they save. What it did buy is real and is not measured in kilobytes —
the search panel's constructor no longer runs on every view of the list, so a
request for the directory's size stopped happening.

The two cheap wins that day were not the fashionable one: a shared,
one-second record cache (two screens, one request) and `rxResource`, which
deleted a state machine I had hand-rolled three times.

### 4. Root-absolute is not relative

Day 59, and the bug that had been in the code for seven days. `API_BASE` was
the string `/api`, which looks relative and means "from the root of the
origin". Every spec, probe and `ng serve` ran at the root, so it was
indistinguishable from a correct answer until the app was served from
`/Frontend-Training/`:

```
D58 rows on the list      : 0
D58 error shown           : The contacts could not be loaded
D58 seed asked for        : GET /api/contacts.json -> 404 (outside /Frontend-Training/)
```

It is now derived from the document's `<base href>` through `PlatformLocation`
— the same source `PathLocationStrategy` uses, so the router's idea of where
the app lives and the data layer's cannot drift apart.

And a refreshed deep link is a request for a file that does not exist, which
is what `404.html` is for:

```
reload, no fallback       : 404, not the app (58 bytes)
reload, with fallback     : 200, the app (3245 bytes)
```

### 5. The last file to get a test is the one with the stale text

Day 60. Every piece of this app had a spec — service, API client, guards,
validators, router, interceptors, form, card — and the file that assembles them
into a page did not, because `RouterTestingHarness` renders a bare
`<router-outlet>` and cannot see the chrome. One spec file, fifteen tests, and
within a minute:

- the header paragraph still said **"Day 57 — the accessibility pass"**, three
  days and two commits later
- the request log read **`Requests (1 , 1 in flight )`**, because an `@if`
  block's leading and trailing whitespace is rendered

Both cosmetic. Both exactly what an untested template accumulates. The title
suffix, which `routes.spec.ts` asserts on four routes, was right every day.

## The capstone's last limitation

Day 55's README listed seven known limitations. Five are now closed - the
guards and resolvers on Day 56, the accessibility audit on Day 57, the third
request per favourite on Day 58, and two on Day 60. Two are not, and both are
in the list at the end of this file. The one that needed a decision rather than
a technique was this:

> **Tag suggestions only cover the loaded page.** Needs `GET /api/tags`.

Day 55 had written that off as honest — "a worse suggestion list and an honest
one". It is a fair description of a limitation and a bad excuse for leaving it,
because it gets worse as the collection grows: with five contacts the datalist
is nearly right, with five hundred it offers the tags of whichever three rows
you last looked at.

The endpoint is five lines. What it demonstrates is the rule Day 55 wrote and
then half-applied:

**Derived state is only derivable while you hold all the data.** The moment a
server pages, every aggregate — the group counts, the favourites count, the tag
list — is a fact about rows the client has never seen. It has to be
transmitted, not computed. Two of the three were transmitted on Day 55; the
third took until Day 60 because a datalist felt too small to deserve a URL.

The probe's proof, against the production bundle:

```
tags on those rows          : eniac
suggested tags              : analytical engine, apollo, compilers, eniac, maths
suggested but never seen    : analytical engine, apollo, compilers, maths
suggests the new tag        : yes
```

`apollo` belongs to a contact whose `group` this client rejects — so the app
suggests a tag from a row it refuses to display. That is correct, and it is the
flip side of transmitting aggregates: the count is over the server's rows, and
the parser is the client's business.

## Architecture

```
src/app/
  routes.ts            the route table, as data: guards, resolvers, lazy loads
  guards.ts            canActivate, canDeactivate, canMatch
  resolvers.ts         the detail and edit titles, from one request
  interceptors.ts      request id, retry
  http-log.service.ts  the log interceptor and the service it writes to
  fake-api.ts          the stand-in server: queries, writes, tags, failures
  app.{ts,html}        the shell - skip link, live region, nav, log, outlet

  contacts.api.ts      every URL the app knows; parses responses; two caches
  contacts.service.ts  the query pipeline, the mutations, one request method
  directory.{api,service}.ts   the typeahead the client never downloads
  announcer.service.ts the one live region, with a queue
  route-focus.service.ts  focus into <main> on navigation, not on load
  confirm.service.ts   a question as an Observable<boolean>
  tokens.ts            API_BASE (derived), latency, two cache windows, poll

  pages/               one component per route
  *.spec.ts            20 spec files beside the code they test

tools/spa-fallback.mjs 404.html, .nojekyll, and a base-href check
DEPLOYING.md           what a static host does and what it needs
```

### The data path, end to end

```
URL  ->  route params  ->  ContactQuery  ->  toObservable
     ->  distinctUntilChanged  ->  switchMap  ->  ContactsApi
     ->  HttpClient  ->  requestId -> log -> retry -> fakeApi
     ->  localStorage
     ->  parse at the boundary  ->  toSignal  ->  template
```

Five of those stages were added in Week 11 and four in Week 12, and the one
that matters most is the last-but-one: nothing from the network reaches a
template without being parsed. Week 5's boundary rule, which is why
`public/api/contacts.json` still contains a row this client rejects.

## Checks I ran

| check | result |
| --- | --- |
| `npm test` | 355 passed, 20 files, 6.69 s |
| `npm run typecheck` | clean (`tsc -b --force`, app + specs) |
| `npm run build:pages` | 417.33 kB raw / 110.68 kB transfer, five lazy chunks |
| `probe-60.mjs` against `dist/` | exit 0, no console errors, 8.6 s |

Measured across the week, for the same app:

| day | initial raw | transfer | tests |
| --- | --- | --- | --- |
| 55 (Week 11) | 383.04 kB | 99.62 kB | 168 |
| 56 | 393.04 kB | 104.08 kB | 245 |
| 57 | 397.92 kB | 105.38 kB | 288 |
| 58 | 415.92 kB | 110.26 kB | 310 |
| 59 | 415.87 kB | 110.38 kB | 319 |
| 60 | 417.33 kB | 110.68 kB | 355 |

The week cost ≈34 kB raw / ≈11 kB transfer and added 187 tests. The 18 kB jump
on Day 58 is the one worth remembering: 10 kB of it is `@defer`'s loader
machinery, bought deliberately for savings that are not measured in bytes.

## Week 12 completion checkpoint

- [x] Guards: `canActivate`, `canDeactivate`, `canMatch`, and a guard that
      waits for a person
- [x] Resolvers, including the resolved title Day 55's spec was waiting for
- [x] An interceptor chain whose order is load-bearing, with a spec for the
      order
- [x] One live region, created before it has anything to say, with a queue
- [x] Focus moved on navigation and trapped in a modal; a skip link that is
      genuinely first
- [x] `rxResource` and `linkedSignal` instead of a hand-rolled state machine
- [x] One HTTP response shared between two consumers, with invalidation on
      every write
- [x] `@defer` with `on interaction`, `when` and `prefetch on idle`, measured
      honestly
- [x] Bundle budgets that fail a build
- [x] A production build with a base href the API path is derived from
- [x] An SPA fallback, `.nojekyll`, and a build script that verifies its own
      output
- [x] A lockfile and a CI workflow (written, never run — see below)
- [x] A server-side aggregate for the tag suggestions
- [x] A spec that renders the application shell

## Known limitations

- **The backend is still an interceptor.** Real latency, real status codes,
  real parsing, real pagination — and no network, no auth, no concurrency. It
  would be deleted the day a real API appeared, and `contacts.api.ts` would not
  change.
- **The sign-in is not security.** A name in `localStorage`, no password, no
  server. It gates a page, not data, and `session.service.ts` says so in its
  own comments.
- **A write still costs two requests** — the mutation, then a fresh page,
  because the client cannot know what a write does to a server-side query. A
  real API would return the mutation and the new page together.
- **The CI workflow has never run.** It needs a push to GitHub and the
  repository's Pages source set to "GitHub Actions". `npm ci` has not been run
  here either, because `node_modules` is a junction to one shared install.
  Both are stated as unverified in `Day 60/notes.md` and in the workflow's own
  header.
- **The five host rewrite rules in `DEPLOYING.md` are from documentation**, not
  from use. The `404.html` route is the one that was measured.
- **No end-to-end browser test.** The probes drive the built bundle in jsdom,
  which is not a browser: no layout, no paint, no real focus ring. Playwright
  would be the next thing.
- **Nothing is deployed.** The build is deployable and has been served under a
  prefix by a host that behaves like GitHub Pages. It has not been served by
  GitHub Pages.

## Next

There is no Day 61. The twelve weeks are done, and what they produced is in
`README.md` at the root of the repository — sixty folders, twelve week notes
and one app that is honest about which of its claims were measured.

If this continued, the three things at the top of the list would be: a real
backend, so the fake one can be deleted and nothing above it changes; a
Playwright suite, because jsdom cannot see a focus ring; and the actual
deployment, because "deployable" and "deployed" are different words and only
one of them has been demonstrated.
