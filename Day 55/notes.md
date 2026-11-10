# Day 55 - Week 11 build: the URL is the query

## Topics Covered

- `HttpParams`, and what it does and does not encode
- A server-side query: search, filter, sort and paging behind one endpoint
- An envelope that carries facts about rows the client has never seen
- `toObservable` → `distinctUntilChanged` → `filter` → `switchMap` → `toSignal`
  as an application's main data path
- `scan` in a pipeline, to keep the previous page on screen
- `startWith` inside a `switchMap`, for a loading state without a side effect
- Pagination as links: `queryParamsHandling: 'merge'` and `aria-current="page"`
- Fetching one record by its route parameter instead of searching a loaded list
- Debouncing a navigation rather than a request
- Correcting the URL from the server's answer, without a loop

## Practical Work

`Day 55/Contacts Router and API Build/` — Week 11's four days as one app.

The week added the router (Day 51), `HttpClient` (Day 52), RxJS (Day 53) and
tests (Day 54), and left the app in a state where all four were true and the
main screen did not use them together. The list downloaded every contact once
and then filtered, searched, sorted and counted it on the client. Five contacts
make that work. It is also a lie about how an API is used, and the lie was
load-bearing: the detail page found its record with `byId`, so a bookmarked
link worked only because the whole collection happened to be in memory.

So Day 55's build moves the query to the server and makes the URL the thing
that asks it.

| | Day 54 | Day 55 |
| --- | --- | --- |
| list request | `GET /api/contacts` | `GET /api/contacts?q=&filter=&sort=&page=` |
| who filters | a computed | the server |
| who sorts | a computed | the server |
| paging | none | `PAGE_SIZE` on the server, `pages` in the envelope |
| `counts`, `favourites` | computed from the list | sent in the envelope |
| one contact | `contacts.byId(id)` | `GET /api/contacts/:id` |
| "no such contact" | absent from a loaded list | a 404 |
| page numbers | — | `<a>` with merged query params |
| tests | 134 | 168 |

## The Thing That Broke When The Server Started Paging

Day 50's note about derived state says:

> derived state cannot go stale, because there is nothing to keep in sync

That is still true and it stopped being useful, which took me a while to accept.
`counts`, `favourites` and `allTags` were computeds over the full list. The
technique did not fail; its **premise** did. A computed can only derive what the
client has, and the client now has three rows out of five.

So `counts` and `favourites` are in the envelope, sent by the server, about rows
the client has never seen. The rule that replaces Day 50's:

> Derived state is only derivable while you hold all the data. The moment a
> server pages, every aggregate is a fact about rows you do not have, and it has
> to be transmitted rather than computed.

`allTags` did not survive at all. It fed the form's tag datalist, and the honest
replacement is `visibleTags` — the tags on the rows currently loaded. That is a
worse suggestion list. A good one needs `GET /api/tags`, which is a real API's
job and not this exercise's, and pretending three rows can produce it would be
the kind of quiet wrongness this whole week has been about.

The same demotion happened to the uniqueness validator, in two steps. Day 52
made the fake server enforce uniqueness over rows the client cannot parse, which
turned `uniqueEmail` from a rule into a convenience. Paging finishes the job: it
can now only object to an address that is on the page in front of you. The 409
is the authority and the form renders it.

## The Envelope, And The Field I Nearly Left Out

```ts
interface ContactPage {
    contacts: readonly Contact[];   // this page's rows, parsed
    skipped: number;                // rows on this page the client could not read
    matched: number;                // rows matching the query, across all pages
    total: number;                  // rows the server holds, ignoring the query
    page: number;                   // the page the server SERVED
    pages: number;                  // how many pages the query has
    counts: Record<Group, number>;
    favourites: number;
}
```

Day 52 chose an envelope over a bare array and the comment said why: "an
envelope leaves room to add a total or a cursor without changing the shape; a
bare array does not". Five fields later that has held, and this is the first
time a design decision from an earlier day has paid off without my having to
adjust it.

`page` is the interesting one, and I nearly made it `requestedPage`. It is the
page the server **served**, not the one the client asked for. `?page=99` of a
two-page result has to do something, and the three options are:

- a 404, which is defensible and unhelpful
- an empty list, which is a screen that looks broken
- the last page, plus a statement of which page that was

The third is the only one where the client can then correct its own URL — which
it does, and which turned out to be the hardest ten lines of the day.

`total` counts the row this client cannot read, so the list says "Showing 2 of 5
matched, 5 in total" with a note that one row on this page was skipped. Three
numbers because they are three different facts, and two of them are things only
the server knows.

## The Pipeline

```ts
toObservable(this.request).pipe(
    distinctUntilChanged((a, b) => keyOf(a) === keyOf(b)),
    filter((request): request is … => request.query !== null),
    switchMap(({ query }) =>
        this.api.list(query).pipe(
            map((page) => ({ status: 'ready', page, error: null, query })),
            catchError((error) => of({ status: 'failed', page: null, error: …, query })),
            startWith({ status: 'loading', page: null, error: null, query })
        )
    ),
    scan((previous, next) => ({ ...next, page: next.page ?? previous.page }), INITIAL)
)
```

Day 53's directory pipeline, applied to the app's main screen. Four of the five
operators are there for a reason I can now state in one line each.

**`distinctUntilChanged`** stops the same question being asked twice. The query
is an object, so the comparison is on a key built from its four fields.

**And it broke `refresh()`**, which is the part I did not see coming. A
deliberate reload *is* the same question, so the operator suppressed it and the
"Try again" button did nothing — a bug that looks exactly like a slow server.
The fix is a nonce in the key:

```ts
interface Request { query: ContactQuery | null; nonce: number; }
```

`refresh()` bumps the nonce, the key changes, the request happens. Day 53 met
the harmless half of this (retyping a word the directory had already answered)
and *wanted* the suppression. Two days later the same operator was the problem.

**`filter`** is why nothing is requested until a page asks. That was not the
original design and the router spec is what changed it — see below.

**`switchMap`** abandons the answer to a question the user has moved on from.
Four days after Day 53 proved it with a stopwatch, two lines of a spec assert it:
`broad.cancelled === true`, `precise.cancelled === false`.

**`startWith` inside the `switchMap`** gives a synchronous loading emission per
request. The obvious alternative is `tap(() => this.statusSignal.set('loading'))`,
which puts a write to a signal inside a stream — the thing I have been avoiding
since Day 53. `startWith` is the same effect as a value, and because `switchMap`
cancels the inner observable, the loading emission belongs to the newest query
and nothing else.

**`scan`** carries the last good page forward:

```ts
scan((previous, next) => ({ ...next, page: next.page ?? previous.page }), INITIAL)
```

So moving to page 2 keeps page 1 on screen until page 2 arrives, instead of
blanking the list for 120 ms, and a failed reload keeps showing the last good
page rather than throwing it away. A stream that has to remember one thing needs
an accumulator; a signal updated from a `tap` would be the same thing with the
state somewhere else.

### What this cost: no constructor, and a request that moved

Day 52's service called `this.refresh()` in its constructor and subscribed by
hand. This one has no constructor at all — `toSignal` subscribes when the field
is initialised. But what it subscribes to is `toObservable`, which watches its
signal with an **effect**, and an effect does not run until change detection
does.

So the first request happens on the first change detection, not on injection.
In the app that is invisible: change detection follows bootstrap immediately. In
a test it is 24 failures with the same message, and the fix is one
`TestBed.tick()`. It would also be very visible to anything that injects the
service outside a component — a resolver, which is Day 56.

## Pagination Is Made Of Links

That is the whole design of `pagination.ts` and it is the week's argument in one
component. Day 36 said state that identifies what is on screen belongs in the
URL. The URL is reached with an `<a href>`. So:

```html
<a [routerLink]="[]" [queryParams]="{ page: 2 }" queryParamsHandling="merge">2</a>
```

which can be middle-clicked into a new tab, copied, bookmarked and announced as
a link. `<button (click)="goTo(2)">` can do none of those and is the version I
would have written in Week 8.

Three decisions in there are invisible on screen and break something if wrong.

**Page 1 is `null`, not `1`.** `?page=1` and no parameter render the same list
from two different addresses: two history entries for one screen, and a
`distinctUntilChanged` that sees one query where the browser sees two URLs. Day
51 made the same call for `sort=added`; it matters more here, because paging is
where people use the Back button.

**The current page is not a link to itself** — it is a `<span aria-current="page">`,
the same attribute `routerLinkActive` sets in the shell's nav.

**The dead ends are spans, not disabled links.** An `<a>` without an href is not
focusable and announces as plain text, so a "disabled link" is a thing that does
not exist. Day 38's rule about disabled controls has one defensible case and
this is it: there is nothing to explain about "there is no page 0".

**`queryParamsHandling: 'merge'`** is what makes the component reusable. The
link changes `page` and leaves `q`, `filter` and `sort` alone, so paging through
a filtered search works without the bar knowing filters exist. That is the one
behaviour that cannot be asserted from the component alone — the href has to be
built against a URL that already has parameters — so its test routes a host
component through `RouterTestingHarness`.

## Two Bugs The Router Spec Found

Both were invisible on screen and both were found by `http.verify()` and
`expectOne`. This is the clearest argument for Day 54's tools that I have.

### One: a list nobody was looking at

Navigating straight to `/contacts/c1` made **two** requests: the contact, and
page 1 of a list that is not on screen. The detail page injects
`ContactsService` for its mutations, the service is `providedIn: 'root'`, and
its pipeline requested page 1 the moment it was created.

The fix is that the query starts as `null` and `filter` keeps it out of the
stream until a page sets one. Nothing asks until something asks.

```
it('fetches only the record when a detail URL is opened cold')
```

There is nothing to see on screen. It is one wasted request on every cold load
of a detail or form URL, and the only trace is a line in a log.

### Two: a filter click that undid half of itself

The URL-correction effect took three attempts, and each wrong version was found
by a test rather than by looking.

**Attempt one** compared `pageNumber()` — the newest answer's page, whatever
question it answered — against the URL. Clicking a filter while page 2 was on
screen compared 2 against 1, concluded the server had clamped, and navigated
back to `?page=2`.

```
expected '/contacts?filter=work&page=2' to be '/contacts?filter=work'
```

**Attempt two** made the answer carry its own query and compared `q` and
`filter` to rule that out. It let the same bug through one step later: clicking
Next from page 1 of a search compared the page-1 answer (same search) against
the page-2 URL, called it a clamp, and went back.

```
/api/contacts?sort=added&page=2&q=ada
/api/contacts?sort=added&page=1&q=ada
```

Forward, then straight back, in one click.

**Attempt three** is three lines, because a clamp is a disagreement *within one
answer*:

```ts
readonly clampedPage = computed<number | null>(() => {
    const { status, page, query } = this.outcome();
    if (status !== 'ready' || page === null || query === null) return null;
    return page.page === query.page ? null : page.page;
});
```

This request asked for page 99; this response says page 2. That is the entire
definition, it needs no knowledge of what is current, and it cannot be confused
by anything in flight.

The general lesson, learned twice in one afternoon:

> When a question and its answer have to be compared, carry the question along
> with the answer. Comparing the newest answer against the newest question is
> only correct when nothing is in flight — which is exactly the case this app
> exists to handle.

## The Correction, And Why It Terminates

```ts
effect(() => {
    const served = this.contacts.clampedPage();
    if (served === null) return;

    const asked = queryFromParams({ page: this.page() }).page;
    if (served === asked) return;

    untracked(() => { this.go({ page: served === 1 ? null : String(served) }, { replaceUrl: true }); });
});
```

This is the only place in the app where state flows from the service back to the
URL, and everywhere else is strictly URL → service. The termination argument:

- writing the corrected page changes this component's own input, which re-runs
  the effect
- the second run finds `served === asked` and does nothing
- `replaceUrl: true`, so the correction is not a history entry and Back does not
  bounce between the two

It costs one extra request — page 99, then page 2 — and that only happens for a
page number that does not exist. The alternative is an address bar that lies.
The probe shows exactly those two requests and nothing more.

## Debouncing A Navigation, Not A Request

Day 53 debounced inside the directory's pipeline, because keystrokes went
straight to the stream. Here they go to the URL first, and a history entry per
keystroke is its own bug — so the debounce belongs on the navigation:

```ts
this.typingTimer = setTimeout(() => {
    this.go({ q: value || null, page: null }, { replaceUrl: true });
}, 250);
```

`replaceUrl` on top of the debounce, so typing "doudna" and pressing Back
returns to the list rather than to "doudn".

Two details that are easy to miss:

**`page: null` on every filter change.** The page the user was on means nothing
under a different search, and "no results" on page 3 of a one-page result is the
single most common pagination bug I have seen in other people's apps.

**The search box is not bound to the service.** It was on Day 51, which was fine
when the signal updated synchronously. With 250 ms in between, binding `[value]`
to `contacts.query().q` would put a stale value back into the field the user is
typing in and move the cursor. The box owns its text; the URL is written from
it. Day 34's uncontrolled-input-with-a-debounce, in Angular.

And the timer needs cleaning up. A pending `setTimeout` outlives the component,
so navigating away mid-word would navigate *back* to the list 250 ms later:

```ts
inject(DestroyRef).onDestroy(() => { if (this.typingTimer !== null) clearTimeout(this.typingTimer); });
```

Day 53's rule was "`takeUntilDestroyed` for a read, never for a write". This is
the same rule for a timer, and `DestroyRef.onDestroy` is what that operator uses
underneath.

## A Record Fetched By Its Own Id

```ts
one(id: string): Observable<Contact> { return this.api.get(id); }
```

`byId` is gone. It searched the loaded list, which was correct when the list was
everything and wrong the moment the list became one page: a link to a contact on
page 3, or one the current filter excludes, would have rendered "No such
contact" about a record the server holds perfectly well. A bookmarked URL that
works only if you happen to have the right page loaded is not a working URL.

Two consequences I like more than the change itself.

**"Not found" is now the server's word.** Day 51 inferred it from an absence in
a loaded list. Day 52 had to add a `status() === 'ready'` guard, because that
inference was true for the whole of the first request and the page said "no such
contact" before showing the contact. There is no guard now: a 404 is an answer
and an unanswered request is `loading`. The bug is structurally unreachable
rather than guarded against.

**The branch order in the template does the rest.** Ordered by how definite the
answer is:

```
missing (404) → the record → failed → loading
```

Which gives something Day 52 did not have: a record on screen plus a failed
re-check shows the record with a line saying it may be out of date, instead of
replacing something true with an error.

**The poll got smaller too.** It used to call `contacts.refresh()`, re-fetching
the whole list to see whether one record had changed. It now re-fetches the one
record, through the same pipeline as the navigation — the id and the tick
together, so a poll and a navigation take the same path.

And one component ended up illustrating the whole cleanup question:

- the poll is a hand-written `subscribe` on an `interval`, so it needs
  `takeUntilDestroyed()`
- the record pipeline is a `toSignal`, which unsubscribes with its injector

Two subscriptions, two answers to "who cleans this up", in one file.

## A Write Reloads Rather Than Guesses

Day 52 patched the local array: `contactsSignal.update(cs => [created, ...cs])`.
That was right when the array was the whole truth. Every mutation now ends in
`refresh()`, because the client cannot know what adding a contact does to a
server-side page — the new row may sort onto page 1, push a row onto page 2,
change `matched`, change `pages`, and change a group count.

The cost is a second request per write and it is real; a production API would
return the fresh page with the mutation's response, or `rxResource` would tie
the two together, which is Day 58. What I am not willing to do is guess, because
a guessed page that disagrees with the server is what makes a list flicker
between two states.

The `tap` is on the success path only, so a 409 costs one request rather than
two — which is a test, because it is otherwise invisible.

## Small Things

**`HttpParams` is immutable.** `set` returns a new instance:

```ts
let params = new HttpParams().set('sort', query.sort);
if (query.q.length > 0) params = params.set('q', query.q);
```

Writing `params.set(...)` as a statement and expecting it to stick is a mistake
the type system cannot catch, because the return value is simply discarded. Same
design as `HttpRequest.clone()`, which the fake API has been using since Day 52.

**What it encodes, measured.** I expected `q=a%20%26%20b%3Dc` and got:

```
/api/contacts?sort=added&page=1&q=a%20%26%20b=c
```

The space and the ampersand are encoded; the **equals sign is not**. Angular's
default `HttpUrlEncodingCodec` deliberately leaves a handful of characters
alone because they are legal inside a parameter value and encoding them only
makes URLs harder to read. `&` is encoded because leaving it would change where
the parameter ends — the only one that actually matters.

**The page size is the server's and the client is never told it.** The envelope
carries `pages`, so the bar renders without knowing how many rows a page holds.
The obvious design puts `PAGE_SIZE` in a shared constants file and has the
client compute `Math.ceil(matched / PAGE_SIZE)`, which makes a server-side
change a client bug.

**The first response used to have a different shape from every other.** Day 52's
list handler served the static seed file's body straight back and wrote it to
the store as a side effect, which worked only because the file's shape and the
response shape happened to match. They do not any more. `withRows` seeds with
`switchMap` and then answers the question that was actually asked — so the first
request of a session goes through the same code as every other.

**Backticks in an inline template, again.** The pagination component's template
is a JS template literal, and `` `aria-current="page"` `` inside an HTML comment
in it produced six TS1005s and a `Cannot find name 'current'`. Day 53 hit this
in the About page and wrote it down there; writing it down did not stop me
doing it again. The rule is simple and I will keep it where the next violation
will be: **no backticks inside an inline template or `styles` string.**

**Controls moved outside the status branches.** Day 52 rendered the summary, the
search box and the filter chips inside the `ready` branch, which was right when
a load happened once. Every keystroke is now a load, and a search box that
disappears while its own request is in flight is unusable. So the controls are
always rendered and the *list* has the three states — the same reasoning as the
detail page's branch order.

## What I Learned

**The URL being the query is what makes the rest fall into place.** Day 51's
"state that identifies what is on screen belongs in the URL" was an
accessibility and shareability argument. With a server-side query it becomes a
*structural* one: the address is the request, so a bookmark, a back button, a
tag link and a page number are all the same mechanism, and none of them needs
code of its own. The tag links on the detail page became stronger without being
touched — they now find contacts that were never on the page the user came from.

**The file that changed least was the one I expected to rewrite.**
`contacts-page.ts` kept its structure: inputs from the route, one effect copying
them into the service, handlers that navigate. The data source underneath it
changed completely. That is the second time this has happened — Day 52 said the
same thing about Day 51's work — and it is the clearest evidence I have that
the URL-as-state boundary is in the right place.

**Three pipelines with the same little `Outcome` interface, and I left them
alone.** Extracting a generic `Outcome<T>` plus a builder would mean
parameterising the differences: one carries a previous page, one a previous
record, one has a branch for "no id at all". An abstraction over three things
that are nearly the same is how you get one thing that fits none of them. Day
44's note about premature components, applying to streams.

**A clamp is a property of an answer, not a comparison across time.** The
general version — carry the question with the answer — is the single most useful
thing I learned today, and I learned it by writing the wrong thing twice and
being told both times.

**`verify()` pays for itself on a day like this.** Two of the three real bugs
were invisible on screen: a wasted request, and a navigation that was
immediately undone by another one. Neither would have appeared in a probe, and
neither would have appeared in a screenshot.

## Verification

`npm test` — 9 files, no browser:

```
✓  src/app/domain.spec.ts (15 tests) 13ms
✓  src/app/validators.spec.ts (34 tests) 27ms
✓  src/app/directory.service.spec.ts (12 tests) 130ms
✓  src/app/contacts.api.spec.ts (24 tests) 145ms
✓  src/app/contacts.service.spec.ts (24 tests) 195ms
✓  src/app/contact-card.spec.ts (8 tests) 289ms
✓  src/app/pagination.spec.ts (10 tests) 327ms
✓  src/app/routes.spec.ts (21 tests) 458ms
✓  src/app/contact-form.spec.ts (20 tests) 1042ms

Test Files  9 passed (9)
     Tests  168 passed (168)
  Duration  3.82s
```

Day 54 had 134. The 34 new ones are the query parameters, the envelope's
numbers, the pipeline's sequencing, the pagination bar and paging through the
router.

`npm run typecheck` (`tsc -b --force`) passes over both projects.

`ng build`:

```
Initial total | 383.04 kB |  99.62 kB
about-page    |   1.92 kB | 893 bytes
```

Day 54 was 376.11 kB / 97.88 kB, so paging, a server-side query, a pagination
component and three extra pipelines cost **6.93 kB raw / 1.74 kB transfer**. The
`scan`, `startWith` and `filter` operators are most of it; tree-shaking means
only the operators actually imported are in there.

### The probe: the built bundle against its own fake server

The specs mock the backend, so not one of them has ever run the server-side
query. This drives `dist/`:

```
url                 : /contacts
page 1              : Jean Bartik, Katherine Johnson
shown-count         : Showing 2 of 5 matched, 5 in total.
page-status         : Page 1 of 2 · 5 contacts matched
skipped             : 1 row on this page was in a shape this app does not
                      understand, and was skipped.
requests            : GET /api/contacts?sort=added&page=1 200 148ms

next href           : /contacts?page=2
url after Next      : /contacts?page=2
page 2              : Grace Hopper, Ada Lovelace
page-status         : Page 2 of 2 · 5 contacts matched
skipped             : (none)

asked for           : ?page=99
url after clamp     : /contacts?page=2
clamped to          : Page 2 of 2 · 5 contacts matched
clamp requests      : GET /api/contacts?sort=added&page=99 200 135ms
                    | GET /api/contacts?sort=added&page=2  200 123ms

q=hopper            : Grace Hopper
shown-count         : Showing 1 of 1 matched, 5 in total.
bar present         : no (one page)

typed 4 keys        : 0 new requests
after settling      : 1 request(s): GET /api/contacts?sort=added&page=1&q=jean
url                 : /contacts?q=jean
results             : Jean Bartik

detail heading      : Jean Bartik
detail requests     : GET /api/contacts/c4 200 127ms
no-such-contact     : absent

missing id          : no-such-contact shown
missing requests    : GET /api/contacts/does-not-exist 404 125ms

nav current         : About
about heading       : About this build
console errors      : none
probe wall time     : 11291 ms (excluding the build)
```

Five things in there are worth pointing at.

**Page 1 shows two contacts out of three rows.** `PAGE_SIZE` is 3 and one of the
first three rows is the record with `"group": "colleagues"` that this client
cannot parse — so the skipped message appears on page 1 and not on page 2. The
per-page `skipped` count is honest in a way the whole-list version was not.

**The Next link's href is the URL**, read before anything was clicked. That is
the assertion a click handler could never satisfy.

**The clamp is two requests**, exactly as the spec says: page 99, then page 2,
and the address bar ends up at `?page=2`.

**Four keystrokes are zero requests**, then one after the debounce — and the URL
is `?q=jean`, so the search is shareable.

**A detail URL opened cold is one request.** `GET /api/contacts/c4` and nothing
else: the list that used to come with it is the bug the router spec found.

**The shell is the only thing here the tests do not cover.** `nav current:
About` is `routerLinkActive` setting `aria-current`, in the one component that
`RouterTestingHarness` never renders.

## Day 55 Outcome

Week 11's four days as one screen: the router supplies the query, RxJS sequences
it, `HttpClient` performs it, and 168 tests assert the parts that cannot be
seen. Search, group, sort and page live in the URL; the server answers them; the
page numbers are links; a record is fetched by its own id so a bookmark works
whatever page it is on; and three aggregates that used to be computeds are now
transmitted, because a client holding three rows out of five cannot derive them.

Three bugs found, all by tests and none visible on screen: a list request nobody
wanted, and two versions of a URL correction that navigated backwards on a click
the user had just made. The third version compares an answer with itself, which
is the day's one real idea.

Week 11's README is next to these notes. Week 12 starts with Day 56: guards,
resolvers and interceptors — where the detail route's static "Contact" title
finally becomes the record's name, which has been a passing test since Day 54
waiting to fail.
