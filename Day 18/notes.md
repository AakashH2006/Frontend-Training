# Day 18 - Promises, async/await and Fetch

## Topics Covered

- What a promise is and its three states
- `then` / `catch` / `finally`
- `async` and `await`
- The microtask queue and ordering
- Sequential against parallel work
- `Promise.all`, `allSettled`, `race`
- `fetch` and the `Response` object
- Why `fetch` does not reject on a 404
- Typed errors for HTTP, network, timeout and parse failures
- `AbortController`, `AbortSignal.timeout` and `AbortSignal.any`
- Loading, success, empty and error states
- `unhandledrejection`

## Practical Work

A small directory app over `jsonplaceholder.typicode.com` — a public JSON API
with no key and CORS enabled. The data is fake, which does not matter, because
the work today is not the data. It is the four states every request has.

The page has three buttons that force failures on purpose: a 404, a network
error and an empty result. A path that is never exercised is a path that does
not work, and the happy path is the only one that gets tested by accident.

There is also a console section on promise mechanics, because most of what went
wrong later came from not understanding the ordering.

## What a Promise Is

An object representing a value that is not there yet. It is **pending**, then
either **fulfilled** with a value or **rejected** with a reason, and once it has
settled it never changes again.

`async`/`await` is not an alternative to promises — it is the same machinery
with different syntax. An `async` function always returns a promise, and `await`
unwraps one.

```js
mightFail(false)
    .then((result) => ...)
    .catch((error) => ...)
    .finally(() => ...);
```

`.catch()` handles a rejection anywhere earlier in the chain, which is why one
`try`/`catch` around several `await`s covers all of them.

## Ordering

```js
console.log("1 - synchronous");
setTimeout(() => console.log("4 - setTimeout 0"), 0);
Promise.resolve().then(() => console.log("3 - promise callback"));
console.log("2 - synchronous");
```

Prints 1, 2, 3, 4.

All synchronous code runs to completion first. Then the **microtask** queue —
promise callbacks — is drained. Only then does the event loop take the next
**macrotask**, which is where timers live. So a `setTimeout(..., 0)` is always
later than an already-resolved promise, no matter what the delay says.

This explains why `await` does not block the page: the function pauses, control
goes back to the browser, and the rest of the function is queued as a microtask
for when the promise settles.

## Sequential Against Parallel

```js
await wait(120);
await wait(120);              // ~240ms - the second waits for the first
await Promise.all([wait(120), wait(120)]);   // ~120ms - both at once
```

Two `await`s in a row are sequential, which is correct when the second request
needs the first one's result and wasteful when it does not.

`Promise.all` takes an array of already-started promises and resolves with an
array of results in the original order. It **rejects as soon as any one
rejects**, so it is all-or-nothing.

`Promise.allSettled` never rejects. Every entry comes back as
`{ status: "fulfilled", value }` or `{ status: "rejected", reason }`.

I used `allSettled` for the detail panel, because if the posts load and the
to-dos fail, half a panel is more useful than an error box. `Promise.all` would
have thrown the good half away.

`Promise.race` settles with whichever finishes first, win or lose. It is the
hand-rolled timeout pattern from before `AbortSignal.timeout` existed.

## fetch

The single most important thing I learned today:

**`fetch` only rejects on a network-level failure. A 404 or a 500 is a
successful round trip.**

```js
const response = await fetch(url);
if (!response.ok) throw new HttpError(response.status, response.statusText, url);
return response.json();
```

Without the `response.ok` check, the error page gets passed to `.json()` and
either parses into something meaningless or throws a confusing `SyntaxError`
about unexpected characters. That is why a fetch bug so often shows up as a
parse error rather than as the HTTP error it actually is.

`.json()` is itself async, because the body may still be arriving over the wire.

### Every way it can fail

| `error.name` | Cause |
|--------------|-------|
| `TypeError` | Network failure, DNS, CORS — the request never completed |
| `HttpError` (mine) | The server answered with 4xx or 5xx |
| `SyntaxError` | The body was not valid JSON |
| `AbortError` | Cancelled with an `AbortController` |
| `TimeoutError` | Cancelled by `AbortSignal.timeout` |

The error UI shows a different message for each one, because "Something went
wrong" does not tell the user whether to retry, check their connection or give
up.

## Cancelling

```js
controller?.abort();
controller = new AbortController();
const response = await fetch(url, { signal: controller.signal });
```

Aborting the previous request before starting a new one fixes the race where a
slow first response arrives *after* a fast second one and overwrites the newer
results. The user sees stale data with no error anywhere.

`AbortSignal.timeout(8000)` cancels on its own after eight seconds, so a request
that never answers does not leave the page loading for ever.
`AbortSignal.any([...])` combines the two — either the user's cancel or the
timeout aborts it — and I guarded it with a `typeof` check because it is recent.

An `AbortError` is deliberately **not** shown as an error, because the newer
request is already on screen.

## Retrying

```js
const worthRetrying = error.name === "TypeError";   // network-level only
```

Retrying a 404 just fails again in the same way. Retrying a dropped connection
often works. So the retry helper only retries network errors, gives up after two
attempts and backs off between them.

## The Four States

Every request has four possible outcomes and the UI needs all of them:

1. **Loading** — skeleton cards in the shape of the real ones, so the layout
   does not jump when the content arrives. They are `aria-hidden`, because a
   screen reader should hear the status message and not a list of empty boxes.
2. **Success** — the cards.
3. **Empty** — a successful response with nothing in it. This is not an error,
   and treating it as one is a common bug. The API returned exactly what was
   asked for; there just is not any.
4. **Error** — the specific message plus a Try again button.

The status line is `role="status"`, which is an `aria-live` region, so the state
is announced without moving focus.

Skeleton animation is inside `@media (prefers-reduced-motion: reduce)` so it
stops for anyone who has asked their system for less motion.

## Searching Locally

The filter box does not call the API. The whole list is already in memory, so
filtering it locally is instant and does not burn requests on every keystroke.
The debounce from Day 17 is still there for the render.

The rule I took from this: only go to the network for data I do not already
have.

## unhandledrejection

```js
window.addEventListener("unhandledrejection", (event) => { ... });
```

A rejected promise with no `catch` is the async version of an uncaught error,
except nothing stops and nothing is obviously broken. Logging it turns a
forgotten `catch` into something visible.

## What I Learned

`await` does not block the page. The function pauses and the rest of it is
queued as a microtask.

Microtasks all run before the next timer, so `setTimeout(fn, 0)` is later than
an already-resolved promise.

Two `await`s in a row are sequential. Independent requests should be started
first and awaited together.

`Promise.all` is all-or-nothing; `allSettled` is what to use when a partial
result is still worth showing.

`fetch` does not reject on 404 or 500. `response.ok` has to be checked by hand,
and skipping it is why fetch bugs so often surface as parse errors.

Every failure has a different `name`, and telling them apart is what makes an
error message useful.

Cancelling the previous request prevents a stale response overwriting a newer
one — a bug with no error message attached to it.

An empty successful result is a state of its own, not an error.

## Day 18 Outcome

The API browser loads a directory over `fetch` with `async`/`await`, checks
`response.ok` and throws a typed `HttpError`, retries network failures once with
a backoff, times out after eight seconds and cancels a superseded request with
`AbortController`. It renders all four request states, tells six failure types
apart with a specific message and a retry, loads the detail panel with two
parallel requests through `allSettled` so a partial failure still shows
something, and filters locally instead of re-querying. Three buttons force the
404, network and empty paths so none of them are untested.

Day 19 is ES modules, `localStorage` and Git; Day 20 finishes the Week 4 app and
takes it through a pull request.
