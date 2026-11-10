# Day 53 - RxJS and async patterns

## Topics Covered

- The feature that makes the operators necessary rather than decorative
- `debounceTime`, `distinctUntilChanged`, and why that order
- `switchMap` against `mergeMap`, `concatMap` and `exhaustMap` - measured
- Where `catchError` goes, and what it kills if it goes outside
- `toSignal` and `toObservable`: the two crossings, and which is async
- `initialValue` against `requireSync`
- `shareReplay`, and the only way to observe it
- `takeUntilDestroyed` - and the write it must not be applied to

## Practical Work

Every list in this project so far has been small enough to hold in memory,
which is why none of the operators I was meant to be learning had anything to
do: Day 52's search filtered an array. So the day's work was a feature that
cannot be built that way.

```text
public/api/directory.json      24 people the client never downloads
src/app/directory.api.ts       GET /api/directory?q= and /directory/size
src/app/directory.service.ts   the pipeline - signal in, signal out
src/app/directory-search.ts    the typeahead, and one deliberate non-use
src/app/fake-api.ts            + the directory endpoints, slower for broad queries
```

A staff directory, searched by asking the server, with an "Add to contacts"
button that turns a result into a POST. That is the whole feature, and it needs
most of RxJS at once.

## The Pipeline

```ts
toObservable(this.querySignal).pipe(
    map((query) => query.trim()),
    debounceTime(250),
    distinctUntilChanged(),
    tap(/* searching = true */),
    switchMap((query) => query.length < 2 ? of([]) : this.api.search(query).pipe(catchError(...))),
    tap(/* searching = false */)
)
```

Nine lines, each load bearing, and both ends are a signal.

```text
typed 8 keys   : 0 directory requests so far
after settling : 1 request(s): GET /api/directory?q=jennifer 200 109ms
  results      : Jennifer Doudna
retyped same   : 1 request(s) total - unchanged means no new one
one letter     : Keep typing… | 1 requests
no matches     : 0 matches for "zzz". | 0 rows
```

Eight keystrokes, one request. That is `debounceTime` and it is the obvious
half.

### debounce before distinct, not after

The order is not interchangeable and I had it the other way first.

`distinctUntilChanged` before `debounceTime` compares every keystroke and then
waits, so typing "ada" and deleting back to "ad" emits "ad" — a request the
debounce would have swallowed, because "ad" was distinct from "ada" at the
moment it was compared. Debouncing first means **only what the user settled on
is ever compared**.

`distinctUntilChanged` is also the one that saves the most requests in real
use, for a reason that is nothing to do with typing: selecting all and retyping
the same word, or pressing a modifier, changes the signal without changing the
string.

### Below two characters, nothing is asked

One letter matches most of a directory and costs the server the most to answer.
So the client declines, and says so differently from "searching":

```text
one letter : Keep typing…
```

Four states in that panel — too short, searching, failed, and a count of
matches — and the branch order is the design. "Too short" has to come first,
because a one-letter query is not a request in progress; it is a request this
app refused to make, and "Searching…" would be a lie.

## switchMap, Measured

This is the day's real lesson and it took a deliberately unfair server to show
it.

The fake directory is **slower for broader queries**, which is realistic (more
rows to scan) and makes the response order go wrong on purpose:

```text
2 letters -> 800ms
3 letters -> 500ms
4 letters -> 200ms
5+        -> 100ms
```

The spread is wider than the 250ms debounce, which is the condition for a
stale answer to be able to overtake a fresh one. **Most typeaheads pass a demo
because that condition does not hold on a fast local server.**

Type `do`, wait 300ms, type `doudna`. The second request is issued later and
answers first. With `mergeMap`, sampled every 120ms:

```text
  658 ms: (none)
  783 ms: (none)
  909 ms: Jennifer Doudna                                      <- correct
 1158 ms: Dorothy Hodgkin, Dorothy Vaughan, Jennifer Doudna    <- stale, and permanent
 2034 ms: Dorothy Hodgkin, Dorothy Vaughan, Jennifer Doudna
```

The search box says "doudna" and the list shows three people who do not match
it, for the rest of the session. No error, no flicker, nothing to notice unless
you read the results.

With `switchMap`, same timing:

```text
  924 ms: Jennifer Doudna
 1556 ms: Jennifer Doudna
log: GET /api/directory?q=do  in flight | GET /api/directory?q=doudna 200 109ms
```

The abandoned request **never reports a status**, which is the clearest evidence
I have seen of what `switchMap` actually does: it unsubscribes, so nothing is
listening when the answer comes, and the log entry the interceptor opened is
never closed. (Whether the socket itself was aborted is not something this
probe can see — it drops the `AbortSignal` on the way into Node's fetch. In a
browser, unsubscribing an HttpClient request aborts it.)

### The four of them, and when each is right

```text
mergeMap    runs everything, keeps every answer      - wrong for a search
concatMap   runs in order, waits for each            - correct and slow
exhaustMap  ignores new input while one is running   - worse: ignores the user
switchMap   unsubscribes the previous, keeps the last - right
```

All four *work*, in the sense that results appear. Only one of them is correct
for "I changed my mind about what I wanted", which is what every keystroke in a
search box means.

`exhaustMap` is not useless — it is the right answer for a submit button, where
the first request should win and the rest are double-clicks. Which tells me the
operator is chosen by what a second input *means*, not by what it does to the
stream.

## Where catchError Goes

```ts
switchMap((query) =>
    this.api.search(query).pipe(
        catchError((error) => { this.errorSignal.set(...); return of([]); })
    )
)
```

Inside the `switchMap`, not after it. A `catchError` on the outer pipeline ends
**the whole stream** on the first failure — the search box would stop working
for the rest of the session, silently, because an observable that has errored
is finished. Inside, it ends only that one request, and the next keystroke
tries again.

That asymmetry is the most useful thing I now know about errors in a pipeline,
and it is invisible in the code: both versions compile, both look like error
handling, and one of them is a time bomb.

## The Two Crossings

```text
signal --toObservable--> stream --toSignal--> signal
```

The state is a signal because everything in this app is. The middle is a stream
because **time** is the thing being manipulated, and signals have nothing to say
about time. Day 46 said a signal is a value that notifies; the missing word was
*now*. There is no signal equivalent of "the value 250ms after the last
change".

Two things about the crossings that are not obvious:

**`toObservable` is not a cheap cast.** It watches the signal with an effect, so
it emits *asynchronously* and it needs an injection context. In a field
initialiser of a root service, both hold.

**`toSignal` needs a starting value**, because a signal always has one. The
alternative is `{ requireSync: true }`, which throws unless the source emits
synchronously on subscribe — and `toObservable` never does. So `requireSync`
here would be a crash at startup rather than a type error, which makes it worth
knowing that one of those two options is a promise about timing.

`toSignal` also unsubscribes when its injection context is destroyed, which is
why the typeahead needs no cleanup code anywhere: the pipeline lives in a
root-scoped service, so there is exactly one subscription for the life of the
app, however many times the component is created.

## shareReplay, And How To See It

`DirectoryApi.size()` is cold, so every subscriber gets its own request. Two
unrelated components want that number: the search panel and the About page.

```ts
readonly size$ = this.api.size().pipe(shareReplay({ bufferSize: 1, refCount: false }));
```

```text
about page : The staff directory has 24 people in it.
  size calls : 1
```

One request between the two of them. Without it there would be two, and
**nothing else would differ** — both components render the same number either
way, which is why the request log earns its place on screen for a second day
running.

Two details that look like style and are not:

- `refCount: false` keeps the cached answer after the last subscriber leaves,
  which is right for something that does not change. `refCount: true` would
  re-request on the next navigation back.
- It is a **field**, so the sharing is per instance of the service — and the
  service is `providedIn: 'root'`, so there is one. Writing the same
  `shareReplay` inside the method, returning a fresh pipeline per call, shares
  nothing at all and reads identically.

## takeUntilDestroyed, And The Trap

The detail page polls the server every 1.5s, because a contact can change in
another tab. `interval` never completes, so this is the first subscription in
the project that genuinely outlives what created it:

```ts
interval(POLL_MS).pipe(takeUntilDestroyed()).subscribe(() => { ... });
```

```text
detail page   : Ada Lovelace
  polled      : 0 times
  after 3.4s  : 2 times
navigated to  : /contacts
poll stopped? : yes - the log is unchanged after 3.4s
```

Removing it, same probe:

```text
navigated to : /contacts
poll stopped : NO - still requesting after leaving the page
  log tail   : GET /api/contacts 200 124ms | GET /api/contacts 200 125ms
```

It replaces the `private destroy$ = new Subject()` plus `ngOnDestroy` plus
`takeUntil(this.destroy$)` that every older Angular codebase has in every
component. With no argument it must be called in an injection context; elsewhere
it takes a `DestroyRef`.

### And then I put it on a write

The obvious next step is to add it to every `subscribe` in a component, and the
"Add to contacts" button is a component subscribing to an HTTP call, so I tried
it. It is a bug, and a quiet one:

```text
row          : Jennifer Doudna · Biochemist · Add to contacts
navigated to : /contacts/new            (clicked Add, then left immediately)
notice       : (none)
post logged  : POST /api/contacts  in flight
after reload : Jean Bartik, Katherine Johnson, Grace Hopper, Ada Lovelace
doudna there : NO - the write was cancelled
```

`takeUntilDestroyed` unsubscribes on destroy, and unsubscribing an HttpClient
request **cancels** it. So adding somebody and immediately navigating away
abandoned the POST: no contact, no error, no message, and the only trace is a
log entry that never got a status.

The rule I came out with:

> **`takeUntilDestroyed` for a read, never for a write.**

A read nobody is looking at any more is waste. A write is something the user
asked for, and a component going away does not withdraw the request. Anything
that must outlive the component belongs to a service — which is where both the
request and the notice already live, so the callback firing after destruction
touches nothing that is gone.

That is the same conclusion as Day 48's "if there is no useful common parent it
is a service", arriving from the opposite direction: **lifetime** rather than
position.

## Small Things

**`params` rather than string concatenation.** `{ params: { q: query } }` is
encoded by HttpClient, so a query with a space or an `&` in it stays one
parameter. The same lesson as Day 51's `router.navigate(['/contacts', id])`.

**Disabled while in flight is not disabled because invalid.** Day 49 argued
against `[disabled]="form.invalid"` because a disabled button gives no reason.
Disabling the Add button *while its request is running* is a different thing:
the reason is on the button ("Adding…"), it lasts 120ms, and the alternative is
two POSTs.

**An id, not a boolean, for "which row is busy".** Two adds can overlap, and a
boolean unspins both.

## What I Learned

The operators are necessary only when the data is not already in memory. I
could have written `debounceTime` into Day 52's local filter and learned
nothing from it.

`debounceTime` before `distinctUntilChanged`, so only what the user settled on
is compared.

`switchMap` is the right flattening operator for "I changed my mind", which is
what a keystroke is. `mergeMap` keeps every answer and lets a stale one win
permanently; the failure needs a server that is slower for broader queries to
show up at all.

The operator is chosen by what a second input *means* — a new question
(switchMap), a queue (concatMap), or a double-click (exhaustMap).

`catchError` inside the `switchMap` fails one request; outside it fails the
feature for the rest of the session.

Signals and streams are for different things: a signal is a value now, a stream
is a value over time. Crossing between them is one function call in each
direction, and `toObservable` is asynchronous.

`shareReplay` as a field on a root service shares; the same call inside a
method does not.

`takeUntilDestroyed` is right for reads and is a silent data-loss bug on
writes.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  initial 376.10 kB raw, 97.87 kB transfer
                        lazy    about-page 1.63 kB raw, 809 B transfer
```

```text
Day 52  initial 365.65 kB raw | 95.31 kB transfer
Day 53  initial 376.10 kB raw | 97.87 kB transfer     (+10 kB / +2.5 kB)
```

Two and a half kilobytes for the operators, the interop and a whole feature,
because RxJS was already in the bundle for HttpClient.

Twelve scenarios through jsdom, over a real loopback server with a real fetch:

```text
directory      : Searching 24 people in the staff directory.
requests       : GET /api/contacts 200 44ms | GET /api/directory/size 200 167ms

typed 8 keys   : 0 directory requests so far
after settling : 1 request(s): GET /api/directory?q=jennifer 200 109ms
  results      : Jennifer Doudna
  status       : 1 match for "jennifer".
retyped same   : 1 request(s) total - unchanged means no new one
one letter     : Keep typing… | 1 requests
no matches     : 0 matches for "zzz". | 0 rows

race           : query box: doudna
  results      : Jennifer Doudna
  requests     : ...q=do in flight | ...q=doudna 200 109ms
  status       : 1 match for "doudna".

add button     : Add to contacts
while adding   : Adding…
after adding   : Added Jennifer Doudna from the directory. | contacts: 5
  row now      : Jennifer Doudna ... Already a contact
  request      : POST /api/contacts 201 129ms

about page     : The staff directory has 24 people in it.
  size calls   : 1                      (shareReplay, two consumers)

detail page    : Ada Lovelace
  polled       : 0 times
  after 3.4s   : 2 times
navigated to   : /contacts
poll stopped?  : yes - the log is unchanged after 3.4s

problems       : none
```

Three experiments, each run against its own build and reverted:

1. **`mergeMap` instead of `switchMap`** — the stale answer wins, permanently
   (sampled output above).
2. **The poll without `takeUntilDestroyed`** — still requesting after the page
   is gone.
3. **`takeUntilDestroyed` on the add** — the write is cancelled and nothing says
   so.

The first latency model was also wrong and the probe found it: with a 100-700ms
spread and a 250ms debounce, the stale answer could never arrive last, so the
`mergeMap` version *passed*. A test that cannot fail is worse than no test,
because it is evidence of the wrong thing. Widening the spread to 100-800ms and
basing it on the query length made the race reproducible every run.

## Day 53 Outcome

A typeahead against a directory the client never downloads: eight keystrokes
collapsed into one request, queries under two characters declined rather than
sent, four rendered states, errors handled inside the `switchMap` so one
failure does not end the feature, and a stale response that can no longer
overwrite a fresh one — demonstrated by building the version where it does.

One number fetched once for two components, a poll that stops when its page
does, and a write that deliberately has no cleanup attached to it.

Day 54 is Angular's own testing tools: `TestBed`,
`HttpTestingController`, `RouterTestingHarness`, and `ng test` with Vitest -
which has been configured and unused since Day 41. Everything in these
"Verification" sections has been a probe driving a built bundle; tomorrow it
becomes tests that run in two seconds against the source.
