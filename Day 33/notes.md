# Day 33 - Effects and data fetching

## Topics Covered

- What an effect is actually for
- The dependency array, and the three cases
- Cleanup, and why StrictMode remounts
- Fetching in an effect: `AbortController` plus an `ignore` flag
- Why both are needed
- Telling "cancelled" from "failed"
- The four request states as a union
- An effect that should not be an effect
- The infinite loop, and the shape of it

## Practical Work

The catalogue constant is gone. The search panel talks to Open Library.

```text
src/lib/api.ts                  fetch, typed failures, the unknown boundary
src/components/SearchPanel.tsx  the effect, written out rather than extracted
src/components/EffectDemos.tsx  four effects, one of which should not be one
src/App.tsx                     plain useState for the saved list
```

`api.ts` has no React in it at all, which is the point: fetching is not a React
problem. It is Week 5's `api.ts` with the Result swapped for a throw, because
the caller is an async function inside an effect that already needs a
`try`/`catch` for the abort case.

The reducer and the context from Days 31–32 are deliberately *not* here. Today
is about effects, and carrying three changes at once would have made the diff
unreadable. Day 35 puts them back together.

## The Signal Comes From The Caller

```ts
export async function searchBooks(query: string, signal: AbortSignal): Promise<SearchResult>
```

Taking a signal rather than making one. The **caller** knows when the request
stops being wanted, and in React the caller is an effect whose cleanup is
exactly that moment. Designing it the other way round — the function owning its
own controller — is what makes fetch code impossible to cancel from outside.

## The Fetching Effect

```tsx
useEffect(() => {
    if (query.length === 0) {
        setState({ phase: "idle" });
        return;
    }

    const controller = new AbortController();
    let ignore = false;

    setState({ phase: "loading", query });

    void (async () => {
        try {
            const result = await searchBooks(query, controller.signal);
            if (ignore) return;
            setState(...);
        } catch (error) {
            if (ignore) return;
            if (error instanceof DOMException && error.name === "AbortError") return;
            setState({ phase: "failed", ... });
        }
    })();

    return () => {
        ignore = true;
        controller.abort();
    };
}, [query, attempt]);
```

### Both the abort and the flag

This is the part I would have got half right.

- **`abort()`** stops the request and makes `fetch` reject with an
  `AbortError`. That handles the network.
- **`ignore`** stops a `setState` from a run that has already been cleaned up.
  An abort is not instantaneous, and a response that arrives in the same tick
  as the cleanup would otherwise still call `setState`.

Without `ignore` this is the stale-response race from Day 18: a slow first
search landing after a fast second one and overwriting it, with no error
anywhere and the user looking at results for a query they have already
replaced.

I tested that directly — a 400ms request for `"slowquery"`, then a 10ms one for
`"fastquery"` while the first was still in flight:

```text
mid-flight     : Searching for "slowquery"…
after the race : Showing 1 of 1 results.
results        : FAST second result    <- not SLOW
first aborted  : true
```

The first request really was aborted, and the slow response never reached the
UI.

### An abort is not a failure

```tsx
if (error instanceof DOMException && error.name === "AbortError") return;
```

Return, do not report. A newer run is already in flight, or the component has
gone. Showing an error here is the commonest bug in hand-written fetch effects
— an error flashes up every time the user types a new search.

`api.ts` rethrows the `AbortError` untouched for exactly this reason: the
caller has to be able to tell "cancelled" from "failed", and wrapping it in a
`SearchError` would have thrown that information away.

### Text and query are separate state

```tsx
const [text, setText] = useState("");    // what is in the box
const [query, setQuery] = useState("");  // what has been asked for
```

The effect depends on `query`, not `text`. If it depended on `text` it would
fire a request per character, and the fix for *that* would be a debounce inside
the effect — which is a timer that then also needs cleaning up.

Submitting is simpler, and it is what the API's rate limit wants anyway.

### The retry counter

```tsx
const [attempt, setAttempt] = useState(0);
// ...
}, [query, attempt]);
```

Retry cannot work by calling `setQuery(query)` — setting state to the same
value is a no-op, so nothing re-runs. A counter in the dependency array is the
way to say "run again with the same inputs".

```text
http 503       : Open Library is having trouble. Try again shortly.
after retry    : Showing 1 of 1 results. | refetched: 1
```

## The Dependency Array

Three cases, and I got one of them wrong on screen before fixing it.

| Array | When it runs |
|-------|--------------|
| none | after **every** render |
| `[a]` | on mount, and when `a` changes |
| `[]` | on mount only |

```text
dep counts      : [a] effect ran: 1 · [] effect ran: 1
after 'Change b': [a] effect ran: 1 · [] effect ran: 1   <- unmoved
after 'Change a': [a] effect ran: 2 · [] effect ran: 1
```

### The bug in my own demo

My first version counted the runs in a **ref**, because writing to a ref does
not cause a render and that felt like the careful choice.

The numbers never moved. The probe caught it:

```text
after 'Change a': no array: 3 · [a]: 1    <- [a] should have been 2
```

A ref write does not re-render, so the displayed value was always the count as
of the *previous* render. The effect had run and the ref had been incremented;
nothing had asked React to show it. **The demo looked broken while the effects
were working perfectly** — which is a good illustration of what a ref is, just
not the one I was trying to give.

State is correct for these two, and it is safe because neither effect's
dependencies include the state it sets: the `[a]` effect re-runs only when `a`
changes, and the `[]` effect never re-runs.

### The one that cannot be counted

An effect with no dependency array runs after every render, so counting it in
state is an infinite loop:

```tsx
useEffect(() => { setCount(count + 1); });   // renders for ever
```

Set state → render → effect runs → set state. This is the commonest way to
write an infinite loop in React, and the honest thing was to say so rather than
quietly leave the case out. It logs to the console instead, where the repeated
line is the evidence:

```text
[no dependency array] ran after a render
[no dependency array] ran after a render
```

## Cleanup and StrictMode

React runs the cleanup before the next effect run and on unmount. In
development it also mounts, unmounts and remounts every component once — so
every effect runs, cleans up, and runs again immediately.

That is not a bug to work around. It is a test: an effect with a missing or
wrong cleanup behaves visibly differently the second time. A listener gets added
twice. A request fires twice. A subscription leaks.

Worth being precise about what I measured, though: the probe runs a **production
build**, where StrictMode's double-invocation is disabled. So the `[]` count
reads 1 there and 2 under `npm run dev`, and the fetch count was 1 rather than
2. The double-run is a development check, not something a built app does.

## What An Effect Is For

The sentence is "an effect synchronises React with something outside React",
and I could repeat it without being able to apply it. So: four examples, each
with a different outside thing.

**The window's size** — not React state, and nothing in React knows when it
changes. Subscribe in the effect, unsubscribe in the cleanup, `[]` because the
subscription depends on nothing.

```text
window width   : window.innerWidth is 1024px
```

**The document title** — lives outside the tree, so keeping it in step with
state is synchronisation. The cleanup restores the previous title, which matters
the moment this is one route among several.

```text
document.title : (1) Day 33 | Effects
```

**A network request** — the search panel.

**And one that is not an effect at all:**

```tsx
// what I would have written a week ago
const [full, setFull] = useState("");
useEffect(() => { setFull(`${first} ${last}`); }, [first, last]);

// what it should be
const full = `${first} ${last}`.trim();
```

The effect version works and is wrong three ways: it renders twice per
keystroke, `full` is one render out of date in between, and it is a second copy
of a fact already known.

```text
derived name   : Derived in the render: Octavia Butler
```

No effect and no state. Day 20's rule — if it can be calculated, it is not
state — and tomorrow's entire subject.

## The Four States, Again

```ts
type SearchState =
    | { phase: "idle" }
    | { phase: "loading"; query: string }
    | { phase: "success"; query: string; hits: readonly SearchHit[]; total: number }
    | { phase: "empty"; query: string }
    | { phase: "failed"; query: string; message: string };
```

A union, not three booleans. `loading && error` and `success` with no `hits`
are not states this can be in — Week 5's lesson, and it is the third time it
has paid off.

Each phase renders something different, and the `default:` is a `never` check
rather than a guess:

```text
initial        : Search for a title, an author or a subject.
loading        : Searching for "slowquery"…       + aria-hidden skeletons
success        : Showing 2 of 2 results.
empty          : Nothing matched "nothingmatches."
failed (503)   : Open Library is having trouble. Try again shortly.
failed (network): Could not reach Open Library. Check your connection.
```

The skeletons are `aria-hidden`, because the status line already says what is
happening and a list of empty boxes is noise — and their animation is inside
`@media (prefers-reduced-motion: reduce)`.

## What I Learned

An effect is for synchronising with something outside React. The test that
works: name the outside thing. If there isn't one, it is not an effect.

A fetching effect needs both an abort and an `ignore` flag. The abort stops the
request; the flag stops a `setState` from a cleaned-up run, because an abort is
not instantaneous.

An `AbortError` must not be reported as a failure, and the network layer has to
rethrow it unwrapped so the caller can tell the difference.

Depending on the input box's text means a request per keystroke. Depending on a
submitted query does not.

Retrying needs a counter in the dependency array, because setting state to the
same value is a no-op.

A ref write does not re-render, so a value only written in an effect and read
in JSX is always one render stale. I shipped that bug into my own demo and the
probe caught it.

An effect with no dependency array that sets state is an infinite loop.

StrictMode remounts every component in development to test the cleanup. A
production build does not, so request counts differ between the two.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  clean
```

Driven through jsdom with a controllable `fetch` stub — settable delay, and a
plan for success, empty, HTTP 503 or network failure:

```text
AbortSignal.any / .timeout in jsdom : function / function

after search   : Showing 2 of 2 results.
results        : Result for dune | Untitled
fetch calls    : 1 dune

saved          : Result for dune
save btn now   : On your list | disabled: true

mid-flight     : Searching for "slowquery"…
after the race : FAST second result   | first aborted: true

empty          : Nothing matched "nothingmatches."
http 503       : Open Library is having trouble. Try again shortly.
after retry    : Showing 1 of 1 results. | refetched: 1
network fail   : Could not reach Open Library. Check your connection.

problems       : none
```

The second result in the success case is `Untitled` — a doc with a blank title
and no author, included in the stub on purpose, mapped by the same `?? []` and
`|| "Untitled"` decisions from Week 5.

## Day 33 Outcome

A real search against Open Library, in one effect with a correct cleanup: an
`AbortController` plus an `ignore` flag, an `AbortError` that is returned from
rather than reported, a retry counter in the dependency array, an eight-second
timeout combined with the caller's signal, and five typed failure kinds each
with its own message. The four request states are a discriminated union with an
exhaustive render.

Plus three effects that show what an effect is for — a subscription, a write to
the document, a request — and one that demonstrates when not to use one at all.

Day 34 is the other half of that: removing the effects that should not be
effects, and extracting the ones that should into reusable hooks.
