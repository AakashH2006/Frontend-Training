# Day 52 - HttpClient and data access

## Topics Covered

- `provideHttpClient`, `withFetch` and what the fetch backend costs
- The observable is **cold**, and the two opposite bugs that follow
- `http.get<T>()` is an assertion, not a check
- Parsing at the HTTP boundary, with the guard Week 5 already wrote
- Five error kinds, chosen by what the user can do about each
- Status 0, which is not an HTTP status
- Loading, failed and ready - on every page, not just the list
- Functional interceptors: one that logs, one that *is* the backend
- PUT versus PATCH, and who owns an id
- The server as the authority, and what that does to a client-side validator

## Practical Work

The same five routes over data that now arrives over HTTP.

```text
src/app/contacts.api.ts        the only file that knows HttpClient exists
src/app/api-error.ts           HttpErrorResponse -> five kinds
src/app/http-log.service.ts    a service, and the logging interceptor
src/app/fake-api.ts            the fake backend, as an interceptor
src/app/contacts.service.ts    state + status, actions that return Observables
public/api/contacts.json       the server's data, including one bad row
```

Two files went away, which is the more interesting half:

```text
src/app/storage.service.ts   deleted - the client does not persist any more
domain.ts: SEED_CONTACTS     deleted - the server has the seed data
```

The storage boundary did not disappear; it **moved**. Its four failure modes
are in `FakeApiStore` now, because durability is a server's job and the fake
server is the thing that has it. The logic is unchanged for the third time,
which is the same evidence Day 50 recorded: it was never framework code.

## The Observable Is Cold

The single most important thing about HttpClient, and it is not the types.

```ts
this.api.list();              // performs no request at all
source$.subscribe();
source$.subscribe();          // two requests
```

`fetch` is the opposite: the request is in flight before anybody awaits the
promise, and awaiting twice gives the same result twice. An HttpClient
observable is a recipe, and subscribing cooks it.

Both directions of that cost me something today.

**Forgetting to subscribe** produces an action that silently does nothing. No
error, no request, no state change — exactly as if the method body were empty.

**Side effects in the pipeline builder** run at the wrong time. The obvious way
to count in-flight writes is this:

```ts
this.inFlightSignal.update((n) => n + 1);
return this.api.create(draft).pipe(finalize(() => /* decrement */));
```

That counts a request that may never be made, and if nothing ever subscribes,
`finalize` never runs and the app is "busy" for the rest of its life. The fix
is `defer`, which moves the side effect to subscription time:

```ts
return defer(() => {
    this.inFlightSignal.update((n) => n + 1);
    return source();
}).pipe(finalize(() => { this.inFlightSignal.update((n) => n - 1); }));
```

Nothing in the app builds a request without sending it today. The three lines
are there because the first caller that does would otherwise leave the spinner
on forever, and that is a bug nobody would look for in a counter.

## The Generic Is An Assertion

```ts
http.get<Contact[]>('/api/contacts')      // "trust me"
```

There is no validation anywhere in that line. The body is parsed as JSON and
handed over as `Contact[]` because I said so. Every consumer then type-checks
perfectly against a claim nothing has checked.

This is the same hole `JSON.parse` has, which Week 5 closed with a guard, and I
was surprised how much easier Angular makes it to skip — the generic *looks*
like a check, and `as Contact[]` does not.

So the API asks for `unknown` and parses:

```ts
this.http.get<unknown>(`${this.base}/contacts`).pipe(map(parseList), catchError(fail));
```

`parseList` keeps what the guard accepts and counts what it does not, which is
Day 47's storage behaviour at a different boundary:

```text
cards   : Jean Bartik, Katherine Johnson, Grace Hopper, Ada Lovelace
skipped : 1 row from the server was in a shape this app does not understand,
          and was skipped.
```

The fifth row in `public/api/contacts.json` has `"group": "colleagues"`, which
`isGroup` rejects. That row is in the fixture deliberately, and it turned into
the best thing I learned today — see below.

An exception instead of a skip would mean one bad row from a server I do not
control takes down a screen that could have shown the other four.

## Five Kinds Of Failure

`HttpErrorResponse` is not a thing a component can render:

```text
Http failure response for /api/contacts: 409 Conflict
```

Week 5's rule was that data gets parsed at the boundary into something the rest
of the app can trust. **A failure is data too**, which I had not thought about
before today. So every request maps into one of five kinds, chosen by what the
user can *do*:

| kind | what it means | what the UI offers |
|------|---------------|--------------------|
| `offline` | no answer at all | try again |
| `notFound` | it is gone | go somewhere else |
| `conflict` | the server disagrees with the input | change what you typed |
| `server` | not your fault | try again later |
| `malformed` | my bug | an honest message |

```text
offline   : The contacts service could not be reached. Check your connection and try again.
bad shape : The contacts service sent a list in the wrong shape.
conflict  : Another contact already uses margaret@example.com.
```

Only the conflict uses the server's own words, because the server is the only
thing that knows which field conflicted. Everything else is phrased here.

### Status 0 is not a status

```text
offline      : failed
request log  : GET /api/contacts   0   10ms
```

Status 0 is what the browser reports when the request never got an answer: no
network, DNS failure, a CORS rejection, or nothing listening. It is the shape
Day 18 met as "a `fetch` that rejects rather than resolving with `ok: false`",
and it is the one case where there is no HTTP exchange to inspect.

### The error channel is untyped

`catchError` hands you `any` and `subscribe({ error })` gets `unknown` at best,
so every handler starts by deciding what it was given. That is why `ApiError`
is a class rather than a union of plain objects: an instance is the only thing
a runtime guard can check.

```ts
function fail(error: unknown): Observable<never> {
    if (error instanceof ApiError) return throwError(() => error);        // already mapped
    if (error instanceof HttpErrorResponse) return throwError(() => toApiError(error));
    return throwError(() => new ApiError('server', '...'));
}
```

The first line matters: without it a malformed body — which the parser throws
as an `ApiError` — would be re-reported as a server error.

## Three States, Everywhere

Day 18 said empty and broken are different states. Async adds *not yet*, and
today was the first time I had to render all three on more than one screen.

The list was the obvious one. The **detail page** was not, and that was a real
bug: Day 51's template is

```html
@if (contact()) { ... } @else { No such contact }
```

which was correct when the list was already in memory. Over HTTP, a cold load
of `/contacts/c1` has an empty list for as long as the request takes, so the
page confidently says the contact does not exist and then shows it:

```text
detail paint : Loading the contact... (no "No such contact")
  settled    : Ada Lovelace
```

The fix is to make "not found" a claim the page is only allowed to make once
the data has arrived:

```ts
protected readonly missing = computed(
    () => this.contacts.status() === 'ready' && this.contact() === undefined
);
```

The edit page needed exactly the same fix, for exactly the same reason. **A
confident wrong answer is worse than a spinner**, and routing plus async data
makes that failure the default rather than something you have to work towards.

### The fake latency is load-bearing

`API_LATENCY` defaults to 120ms because a backend that answers instantly hides
every mistake in a loading state: a spinner that is never seen is a spinner
that was never tested. Both of the bugs above were invisible at 0ms.

## Interceptors

Functional now — `HttpInterceptorFn` is `(req, next) => Observable<HttpEvent>`
and `inject()` works inside it, which replaces a class with an `intercept`
method and a multi-provider.

```ts
withInterceptors([logInterceptor, fakeApiInterceptor])
```

**The array is a pipeline.** A request walks down it and the response walks back
up, so order is behaviour:

- `logInterceptor` first, so it records the URL the app asked for rather than
  the rewritten one, and so it times everything below it — including the fake
  backend's latency
- `fakeApiInterceptor` last, which is where a backend belongs: it either
  answers or calls `next` to reach the real network

Swapping them would log nothing for any request the fake answered, because an
interceptor that returns its own response never passes the request on.

The log is on screen rather than in the console, which is the only reason a
probe can check it:

```text
GET /api/contacts     200  40ms
POST /api/contacts    201  134ms
PATCH /api/contacts/srv-bded7b2a  200  134ms
DELETE /api/contacts/srv-bded7b2a 204  135ms
DELETE /api/contacts/c3           404  123ms
GET /api/contacts     0    10ms
```

Three things in that list are worth noticing: every status is a real one, the
timings include the fake latency, and `logInterceptor` knows nothing about
contacts. That last point is the argument for interceptors existing at all.

### An interceptor that is a server

`fake-api.ts` answers the contacts API itself. It is not the app — it would be
deleted the day a real backend appeared — and writing it this way bought three
things a service full of `of(...)` would not have:

- real HTTP semantics: 201, 204, 404, 409, and a body I have to parse
- real latency, so the loading states exist and get seen
- a rule the client **cannot see**, which turned out to be the day's best lesson

It also taught me something about RxJS I had wrong. `delay` does not delay an
error:

```text
throwError().pipe(delay(200))                   -> error at 0ms
of('ok').pipe(delay(200))                       -> value at 218ms
timer(200).pipe(switchMap(() => throwError()))  -> error at 219ms
```

So a "slow failure" built with `delay` arrives instantly, the loading state
never renders, and the failure path gets tested under conditions that cannot
happen in production.

## The Server Is The Authority

The fifth row of the fixture is unparsable by this client, and the fake server
does not care — it stores what it was given and enforces uniqueness over
**every** row, including that one.

So:

```text
client says : uniqueEmail error: none
server says : Another contact already uses margaret@example.com.
  url       : /contacts/new
```

The client's `uniqueEmail` validator passed, because it can only see the four
rows it managed to read. The server refused, because it can see five.

That is not a contrived case. It is what happens whenever a client's copy of
the data is partial, which it always is — pagination, filtering, a stale cache,
or a row another user added a second ago. Day 50 called `uniqueEmail` a
validator; after today it is a **convenience**, and the 409 is the rule.

Same thing on a PUT:

```text
editing     : Editing Grace Hopper
  conflict  : Another contact already uses margaret@example.com.
```

### Who owns an id

```ts
id: `srv-${crypto.randomUUID().slice(0, 8)}`     // in the fake server
```

Day 50's service generated ids and timestamps itself, and I wrote then that
identity belongs to whatever owns the collection. The collection is on the
server now, so both moved — and `add()` cannot know what it created until the
answer arrives:

```text
after submit : /contacts/new | still on form: YES
  landed on  : /contacts/srv-bded7b2a | Alan Turing
```

Navigating on the click rather than on the response would have gone to
`/contacts/undefined`.

### PUT versus PATCH

Favouriting is one boolean. PUT would mean sending the whole contact back to
change it, which is wasteful and a way to overwrite a field somebody else
edited. `PATCH { favourite: true }` is the first time I have had a concrete
reason to care about the difference rather than a definition of it.

## The Form Bug, Three Days Running

The probe caught the best bug of the day, and it is one line that has now been
wrong in two different ways.

```ts
this.clear();     // at the end of onSubmit
```

- **Day 50** added it, to fix a form that stayed in edit mode after a save.
- **Day 51** made it unnecessary: the page navigates on save, so the component
  is destroyed anyway.
- **Day 52** makes it harmful. A save can fail now, and the form had already
  thrown away everything the user typed by the time the message arrived:

```text
server says : Another contact already uses margaret@example.com.
fields kept : (empty) | (empty)
```

An empty form under the words "Another contact already uses
margaret@example.com". After the fix:

```text
fields kept : Margaret Hamilton | margaret@example.com
```

The rule: **a form must not discard its contents until something has confirmed
they are safe to discard**, and the form itself cannot know that. So `onSubmit`
only emits, and the page decides — navigate away on success, keep the fields
and show the message on failure.

What makes it worth writing down is the shape: a line that was *correct* when
it was written, made redundant by one change and wrong by the next, in a file
nobody had a reason to reopen.

## A 404 Is Not Always An Error

The other decision that came out of the probe. Removing a contact the server
has already lost:

```text
request log : DELETE /api/contacts/c3  404  123ms
notice      : Removed Katherine Johnson.
still shown : no
```

Before: an error message, and the row left on screen. The server said "no such
contact" — which is the outcome the button was for. The user asked for it to be
gone; it is gone.

```ts
catchError((error: unknown) =>
    isApiError(error) && error.kind === 'notFound' ? of(undefined) : throwError(() => error)
)
```

This is the first decision I have made that depends on *which* failure it was
rather than on there being one, and it is what `api-error.ts` was for. The
other four kinds still fail.

## withFetch, And What It Cost The Probe

```ts
provideHttpClient(withFetch())
```

XHR is still Angular's default, for backwards compatibility and because it can
report upload progress, which `fetch` cannot. Nothing here uploads anything,
so `fetch` wins on being the platform API with a future.

It is not free: jsdom implements XHR and has **no `fetch` at all**, so the
probe had to grow a real static server on a loopback port and give the jsdom
window a `fetch` backed by Node's, pointed at it. The requests in the probe are
therefore real HTTP over a real socket, which is better than what came before —
but the signal is dropped on the way through, because jsdom's `AbortSignal` is
not an instance Node's fetch accepts. **Request cancellation is not covered by
any of this**, and that is worth knowing before Day 53 starts using
`switchMap`.

A framework option that forces a change in the test harness is worth recording.

## What I Learned

An HttpClient observable is cold: no subscribe, no request; two subscribes, two
requests. Side effects belong inside `defer`, not beside the pipeline.

`http.get<T>()` is an assertion. The boundary needs the same guard the storage
layer has had since Week 5.

A failure is data, and deserves parsing into kinds that say what the user can
do — rather than a status number spread across every component.

Status 0 means there was no answer, which is a different thing from a bad one.

Every page that reads data needs a loading state, not just the list. A
confident wrong answer is the default failure mode of routing plus async.

A fake backend that answers instantly is a backend that hides your bugs.

`delay` does not delay errors.

An interceptor can answer a request itself, and the app cannot tell. The array
order is the pipeline.

The server is the authority on anything the client has only a partial copy of,
and a client-side uniqueness check is a convenience rather than a rule.

A form must not throw away what the user typed until a save is confirmed.

A 404 from a DELETE is the outcome the user asked for.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  initial 365.65 kB raw, 95.31 kB transfer
                        lazy    about-page 1.23 kB raw, 651 B transfer
```

HttpClient's cost, measured the same way the router's was yesterday:

```text
Day 51  initial 334.49 kB raw | 87.29 kB transfer
Day 52  initial 365.65 kB raw | 95.31 kB transfer     (+31 kB / +8 kB)
```

Eight kilobytes over the wire for HttpClient, the interceptors, the error
mapping and the fake backend together. The fake backend is about a third of
that and would leave with it.

Fourteen scenarios through jsdom, over a real loopback server with a real
`fetch`, across ten page loads sharing one `localStorage`:

```text
cold load       : ready                      (a real GET of a real file)
cards           : Jean Bartik, Katherine Johnson, Grace Hopper, Ada Lovelace
skipped         : 1 row ... was skipped
request log     : GET /api/contacts 200 40ms

first paint     : loading                    (the seeded load, 120ms latency)
  in flight     : GET /api/contacts in flight
settled         : ready | 4 cards

detail paint    : Loading the contact... (no "No such contact")
  settled       : Ada Lovelace

after submit    : /contacts/new | still on form: YES
  landed on     : /contacts/srv-bded7b2a | Alan Turing
  server id     : srv-bded7b2a
  notice        : Added Alan Turing.
  request log   : POST /api/contacts 201 134ms

client says     : uniqueEmail error: none
server says     : Another contact already uses margaret@example.com.
  url           : /contacts/new            (no navigation)
  fields kept   : Margaret Hamilton | margaret@example.com
  request log   : POST /api/contacts 409 123ms

editing         : Editing Grace Hopper
  conflict      : Another contact already uses margaret@example.com.
  fields kept   : Grace Hopper | margaret@example.com

patch sent      : PATCH /api/contacts/srv-bded7b2a in flight
  after patch   : favourites: 3 | PATCH 200 134ms

after delete    : 4 cards | Removed Alan Turing.
  request log   : DELETE /api/contacts/srv-bded7b2a 204 135ms

stale delete    : removing Katherine Johnson, which the server no longer has
  notice        : Removed Katherine Johnson.
  still shown   : no
  request log   : DELETE /api/contacts/c3 404 123ms

offline         : failed
  message       : The contacts service could not be reached...
  retry?        : Try again
  request log   : GET /api/contacts 0 10ms

bad shape       : failed | The contacts service sent a list in the wrong shape.

problems        : none
```

Two experiments run against their own builds and reverted:

**A subscribe with no error handler.** Dropping one callback and driving the
409:

```text
url            : /contacts/new
server-error   : (nothing on screen)
request log    : POST /api/contacts 409 131ms
console output : console.error: ERROR ApiError: Another contact already uses
                 margaret@example.com.
```

The request happened, the server refused it, and the only report was in a
console nobody has open. `provideBrowserGlobalErrorListeners` logging it is
what makes this *look* handled.

**`delay` on an error**, measured above.

And two bugs of mine that the probe caught, neither of which the type system
could have:

1. The form clearing itself before the server answered.
2. "No such contact" rendered for the length of the first request, on two
   different pages.

## Day 52 Outcome

The same five routes over HTTP: one file that knows about `HttpClient`, a
boundary that parses rather than asserts, five error kinds chosen by what can
be done about them, loading and failure states on every page that reads data,
and two interceptors — one that logs every request on screen and one that is
the server.

The client stopped owning identity, timestamps, persistence and the last word
on uniqueness. All four moved to the thing that owns the collection, which is
the real difference between Day 50's app and this one.

Known limitations, both for Day 53: nothing unsubscribes, which is harmless
while every request completes and wrong the moment one does not; and the search
box still filters a list that is entirely in memory, so `switchMap` and
`debounceTime` have not had to appear yet.

Day 53 is RxJS properly: the operators, `toSignal`, `takeUntilDestroyed`, and a
search that asks the server.
