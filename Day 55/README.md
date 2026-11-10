# Week 11 — Angular Router, HttpClient, RxJS and Testing

Days 51–55. Five days that turned Week 10's single-screen signals app into a
routed application talking to a server, with a test suite instead of a
screenshot.

## What this is

`Day 55/Contacts Router and API Build/` is the week's build: a contact manager
where the **URL is the query**. Search text, group filter, sort order and page
number live in the address bar, the server answers them, and the client renders
one page of the result.

The same app at four earlier stages is in `Day 51/`–`Day 54/`. Each day's
folder is a complete, runnable copy, so the diffs between them are the week's
actual history rather than a reconstruction.

| day | folder | what it added |
| --- | --- | --- |
| 51 | `Routing and Navigation` | 7 routes, lazy loading, a title strategy, URL as state |
| 52 | `HttpClient and Data Access` | `HttpClient`, interceptors, a fake backend, typed errors |
| 53 | `RxJS and Async Patterns` | a typeahead, `switchMap`, `shareReplay`, `takeUntilDestroyed` |
| 54 | `Angular Testing` | `ng test`, `TestBed`, `HttpTestingController`, `RouterTestingHarness` |
| 55 | `Contacts Router and API Build` | server-side query and paging, fetch-by-id, pagination links |

## How to run it

```bash
cd "Day 55/Contacts Router and API Build"
npm install
npm start           # http://localhost:4200
npm test            # 168 tests, ~4s, no browser
npm run build
npm run typecheck   # tsc -b --force over app and specs
```

There is no backend to start. `src/app/fake-api.ts` is an HTTP interceptor that
answers `/api/*` itself, seeds from `public/api/*.json` on first use and keeps
its rows in `localStorage` under `day55.server`. Clearing site data resets it.

Nothing leaves the machine. The fixture addresses are invented `example.com`
and `example.org` ones attached to the names of historical scientists.

## Folder layout

```
src/app/
  routes.ts              the route table, as data
  title-strategy.ts      TitleStrategy -> "<page> | Day 55 | …"
  app.{ts,html}          the shell: nav + <router-outlet>
  app.config.ts          providers: router, http, interceptors

  domain.ts              Contact, Group, Filter, Sort + type guards
  validators.ts          six form validators + parseTags
  api-error.ts           ApiError, five kinds, one mapper
  tokens.ts              API_BASE, API_LATENCY, SERVER_STORE_KEY

  contacts.api.ts        every URL the app knows; parses responses
  contacts.service.ts    the query pipeline and the mutations
  directory.api.ts       a staff directory the client never downloads
  directory.service.ts   the Day 53 typeahead
  fake-api.ts            the stand-in server (deleted the day a real one exists)
  http-log.service.ts    the on-screen request log

  pages/                 one component per route
  contact-card.ts        presentational; injects nothing
  contact-form.ts        create and edit, reactive forms
  pagination.ts          page numbers, as links
  panel.ts stat.ts empty-state.ts notice-bar.ts

  *.spec.ts              9 spec files beside the code they test
```

## Architecture

Four layers, and the boundaries are the point.

```
component  →  service   →  api         →  HttpClient  →  interceptors
(template)    (signals)    (URLs,         (requests)     (log, fake server)
                           parsing)
```

- **Nothing above `contacts.api.ts` knows a URL**, and nothing above it has seen
  an `HttpErrorResponse`. That is the same boundary Week 5 drew around
  `localStorage`, one layer further out.
- **Nothing below a component knows about the router.** The service is handed a
  `ContactQuery`; it has no idea the query came from an address bar.
- **Every response is parsed, not asserted.** `http.get<unknown>()` plus a type
  guard, because `http.get<Contact[]>()` is a claim with no check behind it.

### The data path

```ts
// contacts.service.ts
toObservable(request)                      // { query, nonce } as a stream
  .pipe(
    distinctUntilChanged(sameKey),         // don't ask twice
    filter(hasQuery),                      // don't ask until asked
    switchMap(({ query }) =>               // abandon the previous answer
      api.list(query).pipe(
        map(ready), catchError(failed), startWith(loading)
      )),
    scan(keepPreviousPage)                 // don't blank the list
  )
→ toSignal()                               // back to signals for templates
```

`toObservable` and `toSignal` are the two crossings, and the rule that emerged
over Days 53 and 55 is: **signals for state, observables for sequencing.** A
query is state. "Cancel the previous request" is sequencing. Neither does the
other's job well, and `@angular/core/rxjs-interop` is only two functions wide
because that is all the seam needs.

## The week's five ideas

### 1. A route is data

`routes.ts` exports an array. The shell's nav is built from it, the About page
lists it, and `routes.spec.ts` asserts things about it with no TestBed at all:

```ts
expect(routes[0]?.pathMatch).toBe('full');
expect(pathOf('contacts/new')).toBeLessThan(pathOf('contacts/:id'));
expect(routes[routes.length - 1]?.path).toBe('**');
```

React Router's routes are JSX elements, so there is nothing to assert against
and nothing to build a nav from. Three differences cost real time on Day 51:
matching is **first-match-wins** (so order *is* specificity, and
`contacts/new` must precede `contacts/:id`), `pathMatch: 'full'` is mandatory on
a redirect from `''`, and `**` has to be last.

### 2. State that identifies the screen belongs in the URL

By Day 55 that is five things — `/contacts/:id`, and `?q`, `?filter`, `?sort`,
`?page` — and every one of them is reachable as a link:

- a tag on a contact links to `/contacts?q=maths`, which searches the **server**
  and finds contacts that were never on the page you came from
- every page number is an `<a>` with merged query params, so it can be
  middle-clicked, copied and bookmarked
- a filter chip is a navigation, so Back undoes it

What this costs: URL text is untrusted input. `queryFromParams` guards all four
parameters, because `?filter=javascript:alert(1)` and `?page=-3` are both things
you can type.

### 3. The server is the authority

Day 52 moved the data behind HTTP and three things followed immediately.

**State has a status.** `loading | ready | failed`, and every screen renders all
three. Day 18 said empty and broken are different states; async adds "not yet".

**An action returns an observable.** `add()` cannot return the contact it
created, because the id comes from the server. So the caller navigates in
`next`, and a 409 has nothing to navigate to.

**Some rules only the server can enforce.** The fake API rejects a duplicate
email by reading *every* row it holds, including the one this client cannot
parse — so the client's own `uniqueEmail` validator accepts an address the
server refuses. That turned the validator from a rule into a convenience, and
Day 55's paging finished the job: it can now only object to an address on the
page in front of you.

### 4. Cancellation is the point of RxJS

`switchMap` in two places — the directory typeahead and the contacts query —
and the behaviour is the same: the answer to a question the user has moved on
from is **unsubscribed**, not merely ignored. Day 53 proved it with a stopwatch
against a server made deliberately slower for broader queries. Day 54 reduced
the proof to:

```ts
expect(broad.cancelled).toBe(true);
expect(precise.cancelled).toBe(false);
```

The hard-won rules:

- **`catchError` goes INSIDE the `switchMap`.** Outside, the first failure ends
  the stream and the feature is dead for the session — silently, because "the
  pipeline is finished" has no error state.
- **`takeUntilDestroyed` for a read, never for a write.** Day 53 put it on a POST
  and the write was cancelled by navigation: no notice, no contact, and nothing
  on screen to suggest anything had happened.
- **`delay` does not delay an error.** Measured: `throwError().pipe(delay(200))`
  errors at 0 ms. A "slow failure" built that way never renders a loading state.
  The fake server uses `timer().pipe(switchMap(…))`.

### 5. Tests assert what a screenshot cannot

Days 51–53 verified everything with a probe: build the app, serve `dist/`, load
the bundle into jsdom, click, read the DOM. It found three real bugs and it
cannot assert that something did **not** happen.

`HttpTestingController` can, and that is most of what Day 54 was for:

```ts
http.expectNone('/api/contacts');   // nothing was requested
http.verify();                      // nothing is left unanswered
```

`verify()` in an `afterEach` found two bugs on Day 55 that were invisible on
screen: a cold `/contacts/:id` fetching a list nobody was looking at, and a URL
correction that navigated backwards on a click the user had just made.

The honest division, written down on Day 54 and still true:

> Tests for units and their contracts; the probe for the artefact that ships.

Nothing in the 168 tests renders `app.html`, exercises `routerLinkActive`, or
loads the built bundle. `probe-55.mjs` does all three.

## Derived state, and where it stopped working

This is the week's most interesting reversal, and it is a reversal of something
I wrote confidently on Day 50:

> derived state cannot go stale, because there is nothing to keep in sync

Still true. No longer useful. `counts`, `favourites` and `allTags` were
computeds over the full contact list; once the server pages, the client holds
three rows out of five, and a computed can only derive what it has.

So `counts` and `favourites` are now **transmitted** — they arrive in the
response envelope, as facts about rows the client has never seen. `allTags` did
not survive at all: the replacement suggests only tags on the loaded page, which
is worse and honest. A good version needs `GET /api/tags`.

```
Derived state is only derivable while you hold all the data. The moment a
server pages, every aggregate is a fact about rows you do not have, and it has
to be transmitted rather than computed.
```

The envelope that resulted:

```ts
{ contacts, skipped, matched, total, page, pages, counts, favourites }
```

`page` is the page the server **served**, not the one that was asked for — which
is what lets `?page=99` of a two-page result answer with page 2 and say so, and
what lets the client correct its own address bar.

## What I learned this week

**The URL-as-state boundary was in the right place.** Day 52 replaced the data
source and `contacts-page.ts` barely changed. Day 55 replaced client-side
filtering with a server-side query and it barely changed again. Inputs from the
route, one effect copying them into the service, handlers that navigate — that
structure survived two rewrites of everything underneath it.

**Carry the question with the answer.** Day 55's URL correction took three
attempts, and the first two compared the newest answer against the newest
question. That is only correct when nothing is in flight, which is exactly the
case the app exists to handle. The working version compares an answer with
itself: *this request asked for page 99, this response says page 2.*

**A side effect in a stream usually has an operator instead.** `startWith` for a
loading state rather than a `tap` writing to a signal; `scan` for "remember the
last page" rather than a second signal. Both versions work; one keeps the state
in the stream that owns it.

**`distinctUntilChanged` and "try again" are in direct conflict.** A deliberate
reload is the same question, so the operator suppresses it and the button does
nothing. A nonce in the comparison key is the fix, and the bug looks exactly
like a slow server.

**Angular's testing story is better than its reputation and the defaults are
wrong.** `ng test` needed a hand-written builder target; `tsconfig.spec.json`
carried a `types: ["node"]` entry for thirteen days that was an error the first
time anything ran; the generated `include` pattern does not survive `tsc` being
pointed at it. All three were fixed in Day 54's commit, and none of them is the
framework's fault so much as the cost of `--skip-tests` in Week 9.

**Four days of probes were not wasted.** They found the self-clearing form, the
premature "no such contact", and the cancelled write — three bugs in three days,
all of them things a user would see. What they could not find is the two Day 55
bugs, which a user would not see and which were in the parts that matter most.

## Checks I ran

| check | result |
| --- | --- |
| `npm test` | 168 passed, 9 files, 3.82 s |
| `npm run typecheck` | clean (`tsc -b --force`, app + specs) |
| `ng build` | 383.04 kB raw / 99.62 kB transfer, `about-page` lazy at 1.92 kB |
| `probe-55.mjs` against `dist/` | 8 scenarios, no console errors |

Measured across the week, for the same app:

| day | initial raw | transfer | tests |
| --- | --- | --- | --- |
| 50 (Week 10) | 222.57 kB | 60.43 kB | — |
| 51 | 334.49 kB | 87.29 kB | — |
| 52 | 365.65 kB | 95.31 kB | — |
| 53 | 376.10 kB | 97.87 kB | — |
| 54 | 376.11 kB | 97.88 kB | 134 |
| 55 | 383.04 kB | 99.62 kB | 168 |

The router is the expensive import of the week: ≈103 kB raw / ≈27 kB transfer
over Day 50. `HttpClient` with `withFetch()` was ≈31 kB / ≈8 kB. The 168 tests
add nothing at all — specs are not imported by anything the app ships, and
`tsconfig.app.json` excludes them.

## Week 11 completion checkpoint

- [x] Routing: 7 routes, redirect, wildcard, lazy `loadComponent`, title strategy
- [x] Route parameters as component inputs (`withComponentInputBinding`)
- [x] Query parameters as state, guarded on the way in
- [x] `HttpClient` with `withFetch()`, four verbs, parsed responses
- [x] Interceptors: a request log, and a whole fake backend
- [x] Typed errors: five kinds, one mapper, user-facing wording
- [x] RxJS: debounce, distinct, `switchMap`, `shareReplay`, `scan`, `startWith`
- [x] `toSignal` / `toObservable`, and a rule for which to use
- [x] `takeUntilDestroyed`, and where not to use it
- [x] `ng test` with Vitest: 168 tests over guards, validators, API, services,
      components, forms and routes
- [x] Server-side search, filter, sort and paging driven entirely by the URL
- [x] Pagination as links, with `aria-current` and merged query params

## Known limitations

- **The backend is an interceptor.** Real latency, real status codes, real
  parsing — and no network, no auth, no concurrency. It would be deleted the day
  a real API appeared, and `contacts.api.ts` would not change.
- **No guards or resolvers yet.** Every route is reachable by anyone and the
  detail route's title is the static word "Contact" rather than the record's
  name. `routes.spec.ts` has a passing test asserting that, which will fail on
  Day 56 — deliberately.
- **A write costs two requests**: the mutation, then a reload, because the client
  cannot know what a write does to a server-side page. `rxResource` is Day 58.
- **Favouriting from the detail page costs three** — PATCH, the list reload, and
  this page's own record. Two screens reading one row through two endpoints.
- **Tag suggestions only cover the loaded page.** Needs `GET /api/tags`.
- **The shell is untested.** No spec renders `app.html`; only the probe does.
- **No accessibility audit yet.** Route changes are not announced and focus is
  not moved on navigation, which is Day 57.

## Next week

Week 12 is the last. Day 56 is guards, resolvers and interceptors — including
the resolved title the detail route is waiting for. Day 57 is an accessibility
and quality pass, Day 58 performance and deferred loading, Day 59 a production
build and deployment, and Day 60 the final capstone.
