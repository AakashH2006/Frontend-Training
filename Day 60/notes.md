# Day 60 - Final Capstone

## Topics Covered

- A server-side aggregate: `GET /api/tags`, and closing the last limitation in
  the Week 11 README
- A cache with a long window, and why its window is 300 times the record
  cache's
- `rxResource` in the component that reads the answer, so that the page which
  does not need the data does not fetch it
- Rendering the application shell in a spec: `TestBed.createComponent(App)`,
  `provideLocationMocks()`, and the chrome that only the probe had ever tested
- `DeferBlockBehavior.Playthrough`, for the one assertion that needs a defer
  block to actually resolve
- Inverting two tests that asserted a limitation, and renaming a third
- What an untested file looks like after three days: two visible defects, both
  cosmetic, both found within a minute of rendering it
- Writing the Week 12 README and the repository's first README

## Practical Work

`Day 60/Final Capstone/` is Day 59's app with its last two open limitations
closed. Both were written down in the Week 11 README on Day 55 and had been
carried forward in every list since:

```
- Tag suggestions only cover the loaded page. Needs GET /api/tags.
- The shell is untested. No spec renders app.html; only the probe does.
```

```
src/app/fake-api.ts             GET /api/tags, counted over every row
src/app/fake-api.spec.ts        +5 tests, over the server's own counting
src/app/domain.ts               TagCount
src/app/contacts.api.ts         tags(), parseTags, a cache, invalidation
src/app/contacts.api.spec.ts    +13 tests, the parse and the four writes
src/app/contacts.service.ts     tags(), and visibleTags demoted to its real job
src/app/contacts.service.spec.ts  one test renamed, one added
src/app/tokens.ts               TAGS_CACHE_MS
src/app/pages/contact-form-page.ts   an rxResource for the datalist
src/app/routes.spec.ts          two assertions inverted, a helper, +2 tests
src/app/app.spec.ts        NEW  15 tests - the first spec to render the shell
src/app/app.html                two defects the new spec found
.github/workflows/ci.yml        APP_DIR -> Day 60
Day 60/README.md           NEW  Week 12
README.md                  NEW  the repository, all sixty days
```

355 tests in 20 files, up from 319 in 19.

## The tag list: an aggregate the client could not compute

Day 55 is where this went wrong, and the note it left is almost right:

> `counts` and `favourites` come from the server in the envelope; `allTags` was
> only ever feeding the form's datalist and now comes from the rows on screen,
> which makes it a worse suggestion list and an honest one.

"A worse suggestion list and an honest one" is a fair description of a
limitation and a bad excuse for leaving it in place, because the part it does
not say is that it gets worse as the collection grows. With five contacts the
datalist is nearly right. With five hundred it suggests the tags of whichever
three rows you happened to be looking at before you pressed Add.

The rule Day 55 wrote is the one that says what to do about it: *derived state
is only derivable while you hold all the data; the moment a server pages, every
aggregate is a fact about rows you have not seen, and it has to be transmitted
rather than computed.* `counts` and `favourites` were transmitted that day.
This one was not, and the reason was that a datalist felt too small to deserve
an endpoint.

### The server

Five lines in the interceptor, and one function:

```ts
if (req.method === 'GET' && path === '/tags') {
    return withRows(req, next, base, store, (rows) => ok(200, countTags(rows), latency));
}
```

Three decisions in `countTags`, each with a test:

- **An envelope**, `{ tags: [{ name, count }] }`, for the reason Day 52 gave
  for the list's: room for a total or a cursor later without changing a shape
  anybody parses.
- **Sorted by use, ties alphabetical.** The order is part of the answer - "most
  used first" is a fact about the whole collection - and the tie-break is what
  makes the response deterministic enough for a spec to assert the whole array
  rather than its length. Without it the order falls out of `Map` insertion,
  which is stable until somebody reorders a fixture.
- **Rows it cannot read are skipped, not fatal.** The store holds whatever an
  older version of this app wrote, and `public/api/contacts.json` deliberately
  contains a row this client rejects. A server that threw on one bad row would
  take the datalist down for every page.

It also goes **before** the general `GET` branch, which is the one line that
could have been a long afternoon: that branch treats any GET without an id as a
query for the contact list, so an unhandled `/api/tags` would have been
answered with a page of contacts and the client would have reported a parsing
error about an endpoint that was never consulted.

### The client, and where the request belongs

`ContactsApi.tags()` with a cache, `ContactsService.tags()` delegating to it,
and the actual resource in the page:

```ts
private readonly tags = rxResource({
    stream: () => this.contacts.tags(),
    defaultValue: [] as readonly TagCount[]
});

protected readonly knownTags = computed(() => this.tags.value().map((tag) => tag.name));
```

The resource is in `contact-form-page.ts` rather than in the service, and that
placement is the whole of the design. A resource in `ContactsService` would
fire when the service is constructed, and the service is injected by the list
page - so **every view of the list would have fetched the tag list**, which is
precisely the regression Day 58 spent a day removing from the same screen
(`asks nothing about the directory until the panel is asked for`). Putting the
request in the component that reads the answer means the page which needs it
asks, and the page which does not cannot.

`defaultValue: []` is the other decision worth stating: a 503 on the tag list
gives an empty datalist and a working form. A suggestion that failed to load
is not a reason to interrupt somebody filling in a form, and the request is
still in the HTTP log, so it is not invisible either.

### A cache window of 30 seconds, and why it is not 1

`TAGS_CACHE_MS` is 30,000. `RECORD_CACHE_MS` is 1,000. There is a test
asserting the first is greater than the second, which looks like a test of two
constants and is a test of a reason:

| | record | tag list |
| --- | --- | --- |
| read by | a page that polls it every 1.5 s | a form, once per visit |
| a stale one looks like | a server that never changes anything | one missing suggestion |
| invalidated by | every write | every write |
| other way to go stale | the poll, which is the point | another client writing |

This app has no other client. So the only way to see a stale tag list is for
the window to outlive a write, and a write clears it - which is what makes 30
seconds safe where 1 second was necessary.

The invalidation has a test per write, for the same reason the record cache's
three do: the way this breaks is that somebody adds a fifth write and does not
know the line exists. I checked that those four tests can fail - commenting out
the two `this.tagList = null` lines fails exactly them and nothing else - which
is a habit from Day 54 and the only thing that distinguishes a test from a
comment.

One of the four is deliberately wasteful and says so. Toggling Favourite
provably cannot change a tag count, so forgetting the tag list after a PATCH
costs about 40 bytes for nothing. The alternative is `forget` taking an
argument for which caches to clear and a decision at every call site, to save
one request, with an invisible failure mode when a caller gets it wrong.
Correct and slightly wasteful wins.

### What the probe showed, end to end

The specs assert each link of the chain with a mocked backend. `probe-60.mjs`
runs the chain in a document, against the production bundle, with the real fake
server and real storage:

```
page 1 of the list          : Jean Bartik, Katherine Johnson
tags on those rows          : eniac
suggested tags              : analytical engine, apollo, compilers, eniac, maths
suggested but never seen    : analytical engine, apollo, compilers, maths
tag requests                : 1
tag requests, 2nd visit     : 1
after submit, url           : /Frontend-Training/contacts/srv-84eae266
notice                      : Added Radia Perlman. Dismiss
suggests the new tag        : yes
suggestions after save      : analytical engine, apollo, compilers, eniac, maths, spanning tree
```

Four of the five suggestions are tags this window has never rendered. Two form
visits are one request. And a tag typed into a form, saved, and asked for again
in a **new document** comes back - which crosses the component, the cache, the
interceptor and `localStorage` in one line of output.

`apollo` is the interesting one. It belongs to Margaret Hamilton, whose `group`
is `colleagues`, which this client's `isContact` guard rejects - so the app
suggests a tag from a row it refuses to display. That is the flip side of
transmitting aggregates and it is correct: the server's count is over the
server's rows, and the client's parser is the client's business. It is also the
kind of thing nobody would have predicted and a probe prints for free.

## The shell, rendered at last

`routes.spec.ts` has carried this note since Day 54:

> What the harness does NOT give is the app shell: no nav, no routerLinkActive,
> no layout, because its template is only the outlet. Those still need the
> shell rendered, and the probe is still the only thing that tests the built
> bundle end to end.

`RouterTestingHarness` mounts a component whose template is a bare
`<router-outlet>`. Perfect for "what did this route render", structurally blind
to everything around it. So for six days every claim about the nav, the skip
link, the live region, the request log and the sign-in line was a probe against
a built bundle: thirty seconds, a `dist/` directory, and output I read by eye.

`app.spec.ts` mounts `App`:

```ts
TestBed.configureTestingModule({
    providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideLocationMocks(),
        provideHttpClient(withInterceptors([requestIdInterceptor, logInterceptor])),
        provideHttpClientTesting(),
        { provide: SESSION_STORE_KEY, useValue: 'app.spec.session' }
    ],
    deferBlockBehavior: behavior
});

fixture = TestBed.createComponent(App);
```

Four things in there that I had to find out:

**`provideLocationMocks()`.** Without it the router drives jsdom's real
`location`, so a navigation in one test changes the URL of the document the
whole file shares. The mocks give it a `SpyLocation` - an in-memory URL that is
reset with the TestBed.

**The interceptors.** My first version used a bare `provideHttpClient()`, and
the request-log assertions failed against correct code: the shell *renders* the
log, `logInterceptor` *produces* it, and a test of the shell with no
interceptors is a test of an app that was never assembled. `retryInterceptor`
is deliberately left out - it would re-send a 503 and make the log two rows -
and `fakeApiInterceptor` is left out because `provideHttpClientTesting`
replaces the backend and two servers answering one request is not a test of
either.

**A macrotask.** `await router.navigateByUrl('/contacts')` followed by
`whenStable()` is not enough for the list page's request to exist:
the page sets its query in an effect, and the service reaches `HttpClient`
through `toObservable`. `setTimeout(0)` is the same fix, for the same reason,
that Day 56 needed for resolvers.

**`DeferBlockBehavior.Playthrough`.** The confirm dialog is behind
`@defer (when confirm.question() !== null)`, and `TestBed`'s default renders a
defer block's placeholder for ever. This dialog has no placeholder, so the
assertion "the dialog appears when a question exists" fails against correct
code until the behaviour is switched - which makes it the worst kind of test to
leave in a file, and the reason that one `it` mounts differently from the other
fourteen.

### Two defects, within a minute

The one component in the app with no spec was the one with visible text that
was wrong.

**The header still said "Day 57".** Three days, two commits, a day on
performance and a day on deployment, and the paragraph under the `<h1>` still
read "Day 57 - the accessibility pass. One live region that was there before it
had anything to say…". The footer too. Nothing had ever rendered the file. It
is no coincidence that the title suffix - which `routes.spec.ts` asserts on four
routes - was right every single day.

**The request log said `Requests (1 , 1 in flight )`.** A space before the
comma and another before the bracket, because the `@if` inside the summary was
formatted over three lines and **its body's leading and trailing whitespace is
rendered**. HTML collapses runs of whitespace; it does not remove them. Two
days of this on screen, in the one widget whose whole purpose is to be looked
at.

Both are cosmetic. Both are also exactly what an untested file accumulates, and
the spec now asserts the day string in two places and the exact summary text -
so the next day that forgets gets a failure instead of a stale paragraph.

## Two assertions inverted, one renamed

The house habit, for the third time this week. When a test asserts a
limitation, closing the limitation means the test is *wrong*, and the way to
keep the history is to invert it and leave the old one in the comment.

**`routes.spec.ts`** said of the add form:

```ts
http.expectNone(() => true);
// Nothing is fetched at all: there is no id to fetch and no page has set a
// query. An add form that makes a request before the user has typed anything
// is a thing I have shipped before.
```

True, and the limitation. The form now makes exactly one request, for the tag
list, so the assertion is `expectNone('/api/contacts')` followed by
`expectNone(() => true)` *after* the tags are answered - which keeps the half
of the old claim that was about the bug I had actually shipped.

**`contacts.service.spec.ts`** had `derives the tag suggestions from the rows it
has, and says no more`. The assertion did not change by a character; the name
and the comment did. `visibleTags()` is still correct and is no longer standing
in for something it cannot do - it is "the tags of the page you are looking at",
which is a question worth answering and a different one.

Keeping both computed and endpoint is what made it obvious they were never the
same thing. On Day 59 I would have deleted one to keep the other.

## What I Learned

**A limitation written down three times is a decision, not a note.** "Needs
`GET /api/tags`" appeared in the Week 11 README, in a comment in
`contacts.service.ts` and in a test name. Writing it down honestly made it feel
handled. It took five lines of server and a day that had room for it; what it
cost in the meantime was five days of a suggestion list that got worse the more
contacts existed - and it would have been the whole life of the app if Day 60
had been about something else.

**Where a request lives decides which pages make it.** The same `rxResource`,
moved from the service to the page, is the difference between one screen
fetching tags and every screen fetching tags. Day 58 removed exactly this kind
of request from the list page by deferring a component; today's version is the
same lesson arriving before the mistake instead of after it.

**The untested file is the one with the stale text.** Not the subtle bug, not
the race - the paragraph that says the wrong day and the summary with a space
before the comma. Tests do not only catch logic; they are the only thing that
ever reads your template twice.

**A test that cannot fail is a comment.** The four cache-invalidation tests
passed the first time they ran, which is suspicious rather than reassuring, so
I broke the two lines they cover and watched exactly those four fail. Ten
seconds. It is the only way to tell an assertion from a decoration, and it is
the habit I would keep out of all sixty days.

**Measure the chain, not only the links.** Thirteen specs assert the tag list
with a mocked backend. The probe typed a tag into a form, saved it, opened a
new document and read it back out of the datalist - and it is the only thing
that could have shown me `apollo`, a suggestion harvested from a row the
client refuses to render.

**`TestBed` replaces more than you think.** Day 59 it was `PlatformLocation`.
Today it was the HTTP interceptors and the defer-block behaviour. Three times
in two days, a test environment quietly substituted the thing I was trying to
test, and twice it made a correct implementation look broken. Knowing which
providers a `TestBed` is *not* giving you is most of knowing what your test
means.

## Verification

Type checking:

```
> npm run typecheck
> tsc -b --force
(no output)
```

The suite - 355 tests in 20 files, up from Day 59's 319 in 19:

```
> npm test

 ✓ src/app/directory.service.spec.ts    (15 tests)  211ms
 ✓ src/app/guards.spec.ts               (13 tests)  145ms
 ✓ src/app/settings.service.spec.ts     (7 tests)    32ms
 ✓ src/app/session.service.spec.ts      (7 tests)    28ms
 ✓ src/app/contacts.service.spec.ts     (25 tests)  331ms
 ✓ src/app/contacts.api.spec.ts         (47 tests)  365ms
 ✓ src/app/announcer.spec.ts            (15 tests)  436ms
 ✓ src/app/tokens.spec.ts               (9 tests)    14ms
 ✓ src/app/fake-api.spec.ts             (13 tests)  369ms
 ✓ src/app/domain.spec.ts               (15 tests)    8ms
 ✓ src/app/confirm-dialog.spec.ts       (9 tests)   599ms
 ✓ src/app/pagination.spec.ts           (10 tests)  510ms
 ✓ src/app/contact-card.spec.ts         (8 tests)   429ms
 ✓ src/app/pages/sign-in-page.spec.ts   (15 tests)  405ms
 ✓ src/app/validators.spec.ts           (34 tests)   20ms
 ✓ src/app/route-focus.spec.ts          (16 tests)  557ms
 ✓ src/app/app.spec.ts                  (15 tests)  873ms
 ✓ src/app/contact-form.spec.ts         (20 tests) 1170ms
 ✓ src/app/routes.spec.ts               (43 tests) 1241ms
 ✓ src/app/interceptors.spec.ts         (19 tests) 2533ms

 Test Files  20 passed (20)
      Tests  355 passed (355)
   Duration  6.69s
```

New: 15 in `app.spec.ts`, 13 in `contacts.api.spec.ts`, 5 in
`fake-api.spec.ts`, 2 in `routes.spec.ts`, 1 in `contacts.service.spec.ts`.

The production build:

```
> npm run build:pages

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

Application bundle generation complete. [2.333 seconds]

spa-fallback: base href "/Frontend-Training/", 404.html written (3203 bytes) and .nojekyll created
```

A whole endpoint, a cache and a resource cost **1.46 kB raw / 0.30 kB
transfer** over Day 59's 415.87 / 110.38. Still inside the 425 kB warning
budget. `chunk-B8I-MnXf.js` is byte-identical to Day 58's, confirmed with
`cmp` - three days of work and the 51 kB of framework has not moved.

The probe (`probe-60.mjs`, exit 0, 8,601 ms, console errors: none):

```
page 1 of the list          : Jean Bartik, Katherine Johnson
tags on those rows          : eniac
requests so far             : 1
on the form                 : yes
suggested tags              : analytical engine, apollo, compilers, eniac, maths
tag requests                : 1
suggested but never seen    : analytical engine, apollo, compilers, maths
tag requests, 2nd visit     : 1
still suggesting            : 5
after submit, url           : /Frontend-Training/contacts/srv-84eae266
notice                      : Added Radia Perlman. Dismiss
form said                   : (nothing)
suggests the new tag        : yes
suggestions after save      : analytical engine, apollo, compilers, eniac, maths, spanning tree
console errors              : none
base href in the build      : /Frontend-Training/
reload of a deep link       : 200, the app
404.html written            : yes
.nojekyll written           : yes
```

Two bugs in the probe itself, both found by printing more than I needed:
clicking `#submit` does nothing in jsdom, which does not implement form
submission, so the first run reported `suggests the new tag: NO` - the fix is
`submitForm`, which dispatches the event the form listens for; and the first
submit that did fire was refused with `There is 1 problem with this form: Give
either an email address or a phone number`, which is Day 50's `emailOrPhone`, a
cross-field validator on the form group, working exactly as written and me
having forgotten it.

`page 1 of the list` shows two rows because the server's page of three includes
Margaret Hamilton, whom this client's guard rejects. That is Day 52's
deliberate bad row doing its job, and it is why `tags on those rows` is just
`eniac`.

Not verified, unchanged from Day 59:

- the GitHub Actions workflow, which has never run anywhere - its `APP_DIR`
  now points at this folder
- `npm ci`, because `node_modules` is a junction to one shared install
- the five host rewrite rules in `DEPLOYING.md`, which are from documentation
- the actual GitHub Pages deployment: nothing has been pushed and the
  repository's Pages source has not been set to "GitHub Actions"

## Day 60 Outcome

The two limitations the Week 11 README listed and Weeks 11 and 12 both carried
forward are closed. One needed five lines of server and a day's worth of
honesty about why "a worse suggestion list and an honest one" was not good
enough. The other needed one spec file, and paid for itself in under a minute
by finding a header that had been naming the wrong day since Day 57.

What I would keep from today, out of sixty days: rendering the thing the user
actually sees, in a test, as early as possible. Every individual piece of this
app had a spec - the service, the API client, the guards, the validators, the
router, the interceptors, the form, the card - and the file that assembles them
into a page did not, so it was the file that went stale. The probe caught the
behavioural problems there because a probe loads the real shell; it could not
catch a paragraph naming the wrong day, because reading output by eye is how
you stop seeing things.

The Week 12 README is in `Day 60/README.md`, and the repository finally has a
`README.md` of its own - sixty days, twelve weeks, and an index, which took
until the last day because I did not need one until somebody else might.
