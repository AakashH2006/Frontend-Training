# Day 58 - Performance and Deferred Loading

## Topics Covered

- `rxResource`: a request as a signal, with loading, error and reload built in
- Why `rxResource` and not `httpResource`, which Day 56 had promised
- `linkedSignal`, for derived state that has to remember the previous value
- Sharing one HTTP response between two consumers, and the three things a
  cache has to forget
- `@defer` with `on interaction`, `when`, `prefetch on idle`, `@placeholder`
  and `@loading (after … minimum …)`
- Bundle budgets in `angular.json`, including what they measure and what they
  do to a build that breaks one
- An injection token for a poll interval, and why it is the same decision as
  the cache window
- Measuring instead of assuming: the day's headline number is that `@defer`
  made the initial bundle 10 kB **bigger**

## Practical Work

`Day 58/Performance and Deferred Loading/` is Day 57's contacts app with the
data layer and the loading strategy reworked. Four things changed and each one
is measured below:

```
src/app/fake-api.ts                 writes persist - they never had
src/app/fake-api.spec.ts       NEW  8 tests, the first ones to use the server
src/app/pages/contact-detail-page.ts   rxResource + linkedSignal, no scan
src/app/contacts.api.ts             one record, shared for one second
src/app/contacts.api.spec.ts        +10 tests for the cache
src/app/tokens.ts                   DETAIL_POLL_MS, RECORD_CACHE_MS
src/app/pages/contacts-page.html    @defer (on interaction) the directory
src/app/app.html                    @defer (when …) the confirm dialog
src/app/routes.spec.ts              the duplicate-request test, inverted
angular.json                        budgets tightened to fit this app
src/app/pages/contact-detail-page.html   the last two dead live regions
```

## First, the lead from Day 57: a server that answered 200 and kept nothing

Day 57 ended with an unexplained measurement written down rather than fixed:
clicking Favourite on the detail page changed nothing, with no error.

The request log said why in six lines:

```
GET   /api/contacts/c4   200   123ms
GET   /api/contacts/c4   200   131ms
PATCH /api/contacts/c4   200   133ms
GET   /api/contacts/c4   200   123ms     <- favourite: true, again
GET   /api/contacts/c4   200   123ms
GET   /api/contacts/c4   200   125ms
```

The PATCH succeeded and the next read returned the old value. In `fake-api.ts`:

```ts
const existing = store.find(id);
// ...
store.write((store.rows() ?? []).map((row) => (row === existing ? updated : row)));
```

`rows()` reads a JSON string out of `localStorage` and parses it, so **every
call hands back a new array of new objects**. `existing` came from one parse,
`row` comes from the next, and two objects with identical contents are never
`===`. Nothing matched, the map returned the list unchanged, and `write` saved
it faithfully.

`PUT`, `PATCH` and `DELETE` all had this shape, so none of them had persisted
anything since the day the store moved into `localStorage`. The DELETE case is
the one that should have been obvious:

```
rows before remove    : 2
notice after remove   : Removed Jean Bartik. Dismiss
rows after remove     : 2
names after remove    : Jean Bartik, Katherine Johnson
```

A notice saying the record was removed, and the record still in the list. I had
read that screen dozens of times over seven days.

The fix is three words - compare by id:

```ts
store.write((store.rows() ?? []).map((row) => (read(row, 'id') === id ? updated : row)));
store.write((store.rows() ?? []).filter((row) => read(row, 'id') !== id));
```

**Identity comparison across a serialisation boundary** is the mistake, and the
boundary is what made it invisible: the same code against the in-memory
fallback array would have worked, because there the objects really are the same
ones. Storage that round-trips through JSON silently breaks every `===`,
`indexOf`, `Set` and `Map` keyed on the object.

What let it live for a week is the more useful lesson. `fake-api.ts` is 700
lines of the thing the whole app runs against and it had **no tests at all**.
Every HTTP spec in the project uses `HttpTestingController`, where the test
answers the request - so there is no server, no store, and nothing that
persists. `fake-api.spec.ts` is the first spec to wire the interceptor to a
real `HttpClient` with no testing backend and ask the only question that
matters about a server: after a write, what does a read say? Eight tests, four
of which fail against the old code. I checked that by putting it back.

## The detail page as a resource

Day 55 built the detail page's request by hand, and the shape is worth keeping
in view because it is exactly what `rxResource` replaces:

```ts
request = computed(() => ({ id: this.id(), tick: this.ticks() }));

outcome = toSignal(toObservable(request).pipe(
    switchMap(({ id }) => this.contacts.one(id).pipe(
        map(ready), catchError(failed), startWith(loading))),
    scan((previous, next) => ({ ...next, contact: next.contact ?? previous.contact }))
), { initialValue: INITIAL });
```

Four operators, an `Outcome` interface, an `INITIAL` constant, and a `scan`
whose only job was to stop the poll replacing the page with a spinner every
1500ms. All of it is the resource API's subject matter:

```ts
private readonly record = rxResource<Contact | null, string>({
    params: () => this.id(),
    stream: ({ params }) => this.contacts.one(params),
    defaultValue: null
});
```

### Why `rxResource` and not `httpResource`

Day 56's notes promised `httpResource` here. That was the wrong promise and it
is worth saying why rather than quietly using the other one.

`httpResource` takes a URL. The page would then build
`/api/contacts/${id}` itself and lose everything `ContactsApi.get` does on the
way past: the runtime parse that turns `unknown` into a `Contact`, the
`ApiError` mapping every error state in the app is written against, and the
single place that knows the base path. `rxResource` takes an Observable, so the
API layer keeps all of that and the component gets the state machine. **The URL
belongs to the API layer; the loading state belongs to the page.**

The second half of that promise was wrong too. Day 56 expected `httpResource`
to remove the duplicated request for a record - and no resource API can,
because the duplicate comes from a different file. The resolver asks, the
component asks, and they are two consumers of one fact. That needed a cache,
which is the next section.

### `reload()` is why the `scan` is gone

The poll used to bump a tick that the request depended on. A tick in the params
means *a different question*, so the resource throws away what it has and
starts again from nothing - which is the flicker Day 53 had and the `scan`
papered over.

```ts
interval(this.pollMs).pipe(takeUntilDestroyed()).subscribe(() => {
    this.ticks.update((n) => n + 1);
    this.record.reload();
});
```

`reload()` means *the same question, asked again*: the status goes to
`'reloading'` and `value()` keeps the record it already has until the new one
arrives. The behaviour I wrote four lines of rxjs for is the default. The
status vocabulary is the thing to remember here - `'loading'` is the first
request for a question and `'reloading'` is a repeat - because it is exactly
the distinction the template needs:

```ts
loading = computed(() => this.record.status() === 'loading' && this.contact() === null);
```

### `value()` throws, and `linkedSignal` remembers

Two things about `Resource` that the type signature does not shout about.

**`value()` throws in the error state** unless a `defaultValue` is given, and
`hasValue()` is the guard that says whether there is anything to read. The
obvious `value() ?? null` is a crash waiting for a 503.

**An error state has no value**, so Day 53's "showing the last known details"
behaviour is not free. A failed poll would blank a record that is on screen.
`linkedSignal` is the API for derived state that remembers:

```ts
protected readonly contact = linkedSignal<{ id: string; loaded: Contact | null }, Contact | null>({
    source: () => ({
        id: this.id(),
        loaded: this.record.hasValue() ? this.record.value() : null
    }),
    computation: (source, previous) => {
        if (source.loaded !== null) return source.loaded;
        if (previous !== undefined && previous.source.id === source.id) return previous.value;
        return null;
    }
});
```

The `previous.source.id === source.id` check is the part that matters: without
it, navigating to a contact whose first request fails would show the record
from the page before it - a worse bug than the one this is fixing. And
`linkedSignal` rather than an effect writing to a signal, because Day 57 is a
fresh and expensive reminder of what that costs.

## Two consumers, one request

A cold detail URL made two requests for the same record, always has, and Day 56
wrote a test called "fetches the record twice for a cold detail URL, and that
is the resolver" to record it. The fix is in the API layer and the value cached
is the **observable**, not the record:

```ts
private readonly records = new Map<string, { at: number; request: Observable<Contact> }>();

get(id: string): Observable<Contact> {
    if (this.cacheMs <= 0) return this.fetch(id);

    const hit = this.records.get(id);
    if (hit !== undefined && Date.now() - hit.at < this.cacheMs) return hit.request;

    const request = this.fetch(id).pipe(
        catchError((error: unknown) => {
            this.records.delete(id);
            return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
    );

    this.records.set(id, { at: Date.now(), request });
    this.sweep();

    return request;
}
```

Caching the observable is the whole trick, and it is the same one
`DirectoryCache` used on Day 56 for the directory size. A `shareReplay`-ed
observable is simultaneously "the request in flight" and "the answer,
remembered": a second caller during the request waits for it, and a second
caller after it gets the value with no round trip. Caching parsed records
instead would need a separate in-flight map and a flag to tell those two cases
apart.

Neither consumer changed. The resolver still asks for the record it takes a
name from, the page still asks for the record it shows, both still own their
own error states - and the measured result is one request:

```
requests for the record   : 1
  request 1               : GET /api/contacts/c4   200   126ms
D57 requests for record   : 2
```

The side effect I did not plan: `shareReplay` replays its buffer
**synchronously** on subscribe, so the component's first render already has its
record. There is no loading state on a cold detail URL any more. The spinner
that used to flash there is gone, and that is asserted in `routes.spec.ts`
rather than in the probe, because `RouterTestingHarness` can look between the
resolver and the first render and the probe cannot - `load()` waits for the
app's first stable state before handing the window over, which is why both
bundles report "not seen" for that line and the line says so.

### The cache window and the poll interval

Both are tokens, in the same file, because they are one decision:

```ts
export const DETAIL_POLL_MS   = new InjectionToken(…, { factory: () => 1500 });
export const RECORD_CACHE_MS  = new InjectionToken(…, { factory: () => 1000 });
```

A window at or above the poll interval would answer every poll out of the cache
and the page would re-render the same record for ever while looking like a
server that never changes anything. There is a test whose only assertion is
`expect(RECORD_CACHE_MS).toBeLessThan(DETAIL_POLL_MS)`, which is an unusual
thing to test and earns its place: the coupling is invisible and a reader
changing one number has no reason to look at the other. The probe confirms the
behaviour end to end:

```
poll counter              : 4 times
reads from polling        : 3
```

### What a cache must forget

Three things, and each one is a spec:

**Writes.** `update`, `setFavourite` and `remove` all `tap(() => this.forget(id))`.
Without it, the detail page's re-read after a PATCH is answered from the cache
with the record from *before* the write, and the Favourite button looks broken
in exactly the way Day 57 found on the server side. I removed the `tap` from
`setFavourite` to check that the spec fails, and it does.

**Failures.** The `catchError` that deletes the entry is not tidiness. A cached
503 means the retry button cannot work - it would be answered instantly with
the same failure for as long as the window lasts - and a cached 404 means
creating a contact and following a link to it can report that it does not
exist.

**Age.** `sweep()` drops expired entries on insert. A thousand contacts browsed
in one session is a thousand entries, and a cache with a one-second window has
no business remembering anything older than that.

## `@defer`, and what it actually cost

Two blocks, chosen for two different reasons, with two different triggers.

### Choosing a trigger

**The directory search panel: `on interaction; prefetch on idle`.** This is the
heaviest thing on the contacts page that most visits never touch, and it asks
the server for the directory's size from its constructor - so an eager render
cost a chunk of JavaScript *and* a request on every single view of the list.
`on interaction` makes the `@placeholder`'s button the trigger; `prefetch on
idle` fetches the chunk in the first quiet moment, so pressing the button
usually costs nothing.

What it is **not** is `on viewport`, which is the trigger every `@defer`
example reaches for first. This panel is at the top of the page, so it is in
the viewport immediately and `on viewport` would be an eager render with extra
steps. The trigger has to match *why* the thing is deferred.

**The confirm dialog: `when confirm.question() !== null; prefetch on idle`.**
There is nothing to interact with here - the dialog appears because a guard
asked a question - so `when` takes the same condition the component renders on.
`prefetch on idle` is what makes that acceptable: without it the first "are you
sure" would wait for a network round trip while a guard held a navigation open.

The `@loading` block is where the two timing arguments live:

```html
@loading (after 100ms; minimum 200ms) {
    <p class="status text-sm" id="directory-loading">Loading the directory search…</p>
}
```

`after 100ms` so a chunk that arrives in 20ms never shows it; `minimum 200ms`
so one that arrives at 110ms does not flash it for a frame. Both are the same
point: a loading state that appears and disappears faster than it can be read
is worse than none, because the eye registers the movement and not the words.

### The measurements

Every build below is the same app with one thing added, `ng build` with the
production configuration, raw size and estimated transfer size of the initial
bundle:

| build | initial raw | initial transfer | lazy chunks |
| --- | --- | --- | --- |
| Day 57's app, renamed | 397.92 kB | 105.40 kB | 2 |
| + writes that persist | 397.92 kB | 105.39 kB | 2 |
| + rxResource, linkedSignal, the record cache | 405.65 kB | 107.64 kB | 2 |
| + `@defer` on the dialog only | 415.95 kB | 108.64 kB | 3 |
| + `@defer` on both | 415.71 kB | 110.17 kB | 4 |
| final (About page copy) | 415.92 kB | 110.26 kB | 4 |

Read that third row and then the fourth. **The first `@defer` block cost 10.30
kB of raw initial bundle** - the deferred-block runtime, the triggers, the
scheduling - to move a 3.32 kB component out of it. The second block moved
another 4.08 kB out and the initial total went *down by 0.24 kB*, which means
the per-block overhead very nearly cancels the code it removes at this size.

So on this app, in bytes, `@defer` is a loss. The threshold is visible in those
numbers: a deferred component has to be heavier than about 10 kB before the
first block pays for itself, and heavier than about 4 kB for each one after
that. A chart library or a rich text editor clears that easily. A 3 kB
confirmation dialog does not.

The second surprise is in the transfer column: between the last two rows the
raw size went **down** and the estimated transfer size went **up**, from 108.64
kB to 110.17 kB. Three small files compress worse than one big one, because
gzip's window and dictionary are per file. "Smaller" has two meanings and they
disagree.

What `@defer` did buy on this page is not a byte count:

```
placeholder button        : present
search box                : absent (deferred)
panel chunk ran           : no
directory requests        : 0
requests for the list     : 1
--- after clicking the placeholder ---
search box after click    : present
directory requests now    : 1
deferred panel works      : 1 match for “ada”.
D57 directory requests    : 1
D57 search box            : present (eager)
```

Every view of the contacts list used to make a second request for a number
almost nobody reads. Now it makes one request, and the typeahead's service,
pipeline and error states are not constructed until somebody asks for them.
That is the saving, and it is a request and some work on the critical path
rather than kilobytes.

And the dialog's trigger costs nothing measurable:

```
dialog before asking      : absent (deferred)
dialog after asking       : present after 108 ms
D57 dialog after asking   : present after 109 ms
```

**The first version of that measurement said 713 ms**, because the polling loop
called Angular's change detection on every iteration and was measuring itself.
Taking the `settle()` out of the loop dropped it to 108. A measurement that
includes the measurement is the most common way to be confidently wrong about
performance, and I managed it on the first try today.

The honest limit: in the probe, the chunk is not actually fetched. The harness
re-bundles the build output into one script with esbuild because jsdom has no
module loader, so `import()` resolves locally. The evidence that
`directory-search` and `confirm-dialog` are separate files is the build output,
which lists them by name and size; the evidence that the triggers work is the
probe. Neither of them measures a real network fetch of a chunk, and nothing in
these notes claims otherwise.

`@defer` in tests is worth one more line. `TestBed` renders defer blocks in
their **placeholder** state by default rather than fetching anything, which is
why the whole suite passed through this change without noticing a thing. That is the right
default - a route test should not be downloading chunks - and it is a thing to
know before writing an assertion about what is inside a defer block:
`deferBlockBehavior` is the switch, and `fixture.getDeferBlocks()` is how a test
drives one deliberately.

### Budgets

`angular.json` had the CLI's defaults: a 500 kB warning and a 1 MB error on the
initial bundle. This app is at 415.92 kB, so the warning was 84 kB away and
would not have fired for anything I did this week.

Tightened to 400 kB to see what one looks like:

```
▲ [WARNING] bundle initial exceeded maximum budget.
            Budget 400.00 kB was not met by 15.71 kB with a total of 415.71 kB.
```

That total is the **raw** size, not the transfer size - which is the one thing
about budgets I would otherwise have got wrong, because 415.71 kB raw is 110.17
kB over the wire and a budget written with the second number in mind would be
four times too tight.

And with `maximumError` at 410 kB:

```
X [ERROR] bundle initial exceeded maximum budget.
          Budget 410.00 kB was not met by 5.71 kB with a total of 415.71 kB.
```

`ng build` exits 1. A budget error fails a build, which is the point: it is the
only mechanism here that notices a dependency quietly adding 200 kB.

I also tried `{ "type": "any", "maximumWarning": "30kB" }`, which flags every
file individually and produced this:

```
▲ [WARNING] main-TKV7P7X6.js exceeded maximum budget.  … total of 208.60 kB.
▲ [WARNING] chunk-B8I-MnXf.js exceeded maximum budget. … total of 173.59 kB.
```

Useless here, and instructive: `any` is per file, and this app's weight is two
big files that are supposed to be big. It came out again. The final budgets are
`initial` at 425 kB warning / 475 kB error - roughly 2% and 14% of headroom
over today's build, so the next unplanned 10 kB is a warning and the next
unplanned 60 kB is a failure - and the CLI's `anyComponentStyle` at 4/8 kB,
left alone.

## The two live regions Day 57 missed

Day 57 removed four dead `role="status"` attributes and its notes say "every
live region in this app failed that". There were six. The detail page's
"showing the last known details" line and its loading paragraph both claimed
`role="status"` from inside an `@if`, and the probe never saw them because it
only ever counted the live regions present on a **resting** page - and both of
those need a failure to exist at all.

The same blind spot that hid the original bug hid the rest of it. Both are
plain text now, and the stale-record message is announced from the component
through the shell's one region, once per distinct message rather than once per
failed poll:

```ts
effect(() => {
    if (!this.stale()) { this.lastAnnounced = null; return; }

    const message = `Showing the last known details. ${this.error()?.message ?? ''}`.trim();
    if (this.lastAnnounced === message) return;
    this.lastAnnounced = message;

    this.announcer.announce(message);
});
```

`lastAnnounced` is a plain field rather than a signal, deliberately: it is read
and written inside this effect, and a signal would make the effect depend on
its own output - which is Day 57's infinite loop, and I am not writing it
twice.

## What I Learned

**Identity comparison does not survive JSON.** `row === existing` worked
against an in-memory array and silently failed against the same data read back
out of `localStorage`, because parsing produces new objects every time. Three
of the fake server's five verbs had never persisted anything, and every screen
said they had.

**The code with no tests is the code with the bug.** `fake-api.ts` is the
largest file in the project and the only one nothing tested, because
`HttpTestingController` replaces exactly the thing it is. A spec that wires the
interceptor to a real `HttpClient` found four failures in eight tests.

**`rxResource` is the state machine I had already written three times.** The
loading flag, the error branch, the carry-the-previous-value-across-a-refresh
`scan` - all of it is `status()`, `error()` and `reload()`. The API's vocabulary
is the useful part: `'loading'` versus `'reloading'` is the distinction a
template needs and the one I kept re-deriving.

**`params` changing is a new question; `reload()` is the same one again.** That
one sentence is the whole difference between a page that flickers on every poll
and one that does not.

**`Resource.value()` throws, and a resource does not remember.** `hasValue()`
is the guard; `linkedSignal` is the way to keep the last good value, and the
"same key" check in its computation is what stops it showing one record's data
under another record's name.

**A cached observable beats a cached value.** `shareReplay` on a stored
`Observable` handles both "the request is in flight" and "the answer is
remembered" with one mechanism - and replays synchronously, which removed a
loading state I had not thought of as removable.

**A cache is three invalidations, not one.** Writes, failures and age. Missing
any of them produces a bug that looks like the server misbehaving, which is the
hardest kind to attribute.

**Two numbers that must stay ordered belong in the same file.** The cache
window has to be shorter than the poll interval, and nothing in either file
would ever have said so. It is a test now.

**`@defer` is not free, and on a small app it is a net loss in bytes.** 10.30 kB
of runtime for the first block. The win on this page was a request that stopped
happening on every list view, not the 7 kB that moved out of the initial
bundle - and I would not have known either way without building it four times.

**Compressed and uncompressed sizes can move in opposite directions.**
Splitting code out made the raw bundle smaller and the estimated transfer bigger.

**Budgets measure raw bytes, and `any` is per file.** Both of those are easy to
assume the other way round, and one build each settles it.

**Do not call change detection inside a loop that is timing change detection.**
713 ms versus 108 ms for the same event, and the difference was entirely my
measurement.

## Verification

Type checking:

```
> npm run typecheck
> tsc -b --force
(no output)
```

The suite - 310 tests in 18 files, up from Day 57's 288 in 17:

```
> npm test

 ✓ src/app/settings.service.spec.ts     (7 tests)    96ms
 ✓ src/app/session.service.spec.ts      (7 tests)    30ms
 ✓ src/app/announcer.spec.ts            (15 tests)  548ms
 ✓ src/app/directory.service.spec.ts    (15 tests)  249ms
 ✓ src/app/guards.spec.ts               (13 tests)  150ms
 ✓ src/app/contacts.service.spec.ts     (24 tests)  278ms
 ✓ src/app/fake-api.spec.ts             (8 tests)   298ms
 ✓ src/app/domain.spec.ts               (15 tests)    6ms
 ✓ src/app/validators.spec.ts           (34 tests)   25ms
 ✓ src/app/contacts.api.spec.ts         (34 tests)  337ms
 ✓ src/app/contact-card.spec.ts         (8 tests)   384ms
 ✓ src/app/route-focus.spec.ts          (16 tests)  562ms
 ✓ src/app/pages/sign-in-page.spec.ts   (15 tests)  407ms
 ✓ src/app/confirm-dialog.spec.ts       (9 tests)   670ms
 ✓ src/app/pagination.spec.ts           (10 tests)  499ms
 ✓ src/app/contact-form.spec.ts         (20 tests) 1079ms
 ✓ src/app/routes.spec.ts               (41 tests)  804ms
 ✓ src/app/interceptors.spec.ts         (19 tests) 2546ms

 Test Files  18 passed (18)
      Tests  310 passed (310)
   Duration  6.77s
```

New since yesterday: 8 in `fake-api.spec.ts`, 10 in `contacts.api.spec.ts` for
the cache, and 4 in `routes.spec.ts` - one of which is Day 56's
duplicate-request test with the number inverted, and two of which are a new
describe that turns the cache off so that Day 52's "do not say it is missing
while it is loading" bug still has somewhere to fail.

The production build, clean against the new budgets:

```
> npx ng build

Initial chunk files | Names            |  Raw size | Estimated transfer size
main-*.js           | main             | 208.60 kB |                50.13 kB
chunk-*.js          | -                | 173.59 kB |                50.99 kB
chunk-*.js          | -                |  23.35 kB |                 6.96 kB
styles-*.css        | styles           |  10.16 kB |                 2.10 kB

                    | Initial total    | 415.92 kB |               110.26 kB

Lazy chunk files    | Names            |  Raw size | Estimated transfer size
chunk-*.js          | directory-search |   4.08 kB |                 1.61 kB
chunk-*.js          | confirm-dialog   |   3.32 kB |                 1.31 kB
chunk-*.js          | settings-page    |   2.96 kB |                 1.17 kB
chunk-*.js          | about-page       |   2.70 kB |                 1.23 kB

Application bundle generation complete. [2.5 seconds]
```

Four lazy chunks now: two routes, which have been lazy since Day 55, and two
`@defer` blocks.

The probe, against today's bundle and - for the two numbers that are a claim
about a change - against Day 57's:

```
> node probe-58.mjs .../Day 58/.../dist/contacts/browser .../Day 57/.../dist/contacts/browser

placeholder button        : present
search box                : absent (deferred)
panel chunk ran           : no
directory requests        : 0
requests for the list     : 1
search box after click    : present
directory requests now    : 1
deferred panel works      : 1 match for “ada”.
and announced             : 1 match for ada.
first contact             : Jean Bartik (c4)
spinner once watched      : not seen (see note)
record on screen          : fields rendered
requests for the record   : 1
  request 1               : r1-wz35c GET /api/contacts/c4 200 126ms
favourite pressed         : true
pressed after click       : false
label after click         : Favourite
writes in the log         : 1
reads after the write     : 2
poll counter              : 4 times
reads from polling        : 3
url after remove          : /contacts
notice                    : Removed Jean Bartik. Dismiss
names after remove        : Katherine Johnson, Grace Hopper
dialog before asking      : absent (deferred)
dialog after asking       : present after 108 ms
focus in the dialog       : dialog-cancel
after Keep editing        : /contacts/new
D57 directory requests    : 1
D57 search box            : present (eager)
D57 spinner once watched  : not seen (same note)
D57 requests for record   : 2
D57 dialog after asking   : present after 109 ms
console errors            : none
probe wall time           : 21338 ms (excluding the builds)
```

Four lines of that are the day: `directory requests: 0` against
`D57 directory requests: 1`, and `requests for the record: 1` against
`D57 requests for record: 2`. Two more are Day 57's unexplained lead, closed:
`pressed after click: false` and `names after remove: Katherine Johnson, Grace
Hopper`.

| measurement | Day 57 | Day 58 |
| --- | --- | --- |
| requests for a cold detail URL | 2 | 1 |
| requests on a contacts list view | 2 | 1 |
| loading state on a cold detail URL | yes | none (asserted in routes.spec) |
| PATCH then re-read | old value | new value |
| DELETE then list | record still there | record gone |
| initial bundle, raw | 397.92 kB | 415.92 kB |
| initial bundle, transfer | 105.40 kB | 110.26 kB |
| lazy chunks | 2 | 4 |
| dialog, click to on screen | 109 ms | 108 ms |

## Day 58 Outcome

The app makes half as many requests for the two screens anybody actually looks
at, its writes persist for the first time, and its detail page has stopped
hand-rolling what `rxResource` does - an `Outcome` interface, an `INITIAL`
constant, four operators and a `scan`, all deleted. The file is *longer* than
yesterday's all the same (205 lines to 299), because of the comments and
because the stale-record announcement moved into it; the thing that shrank is
the amount of state machine I am responsible for, which is not the same number
and is the one I care about. It also ships 18 kB more JavaScript than it did
yesterday, 10 kB of which is the price of saying `@defer` at all.

I would keep all of today's changes and I would not have guessed which ones
were worth it. The cache was the cheap win - a dozen lines, one request saved
per page, and a loading state that stopped existing. `@defer` was the expensive
lesson: the right triggers, a real saving in requests and work, and a bundle
that got bigger. The resource API was neither a win nor a cost in bytes; it
removed a state machine I had written three times and would have written again.

Day 59 is the production build and deployment: `base href`, the SPA fallback,
hashed filenames, and whatever CI can be made to run against a repository of
sixty daily folders. The budgets set today are the first thing in this project
that can fail a build, which makes them the first thing worth wiring into one.
