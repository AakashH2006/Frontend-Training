# Day 34 - Avoiding unnecessary effects, and custom hooks

## Topics Covered

- What a custom hook is, and what it is not
- Extracting an effect without redesigning it
- A generic hook, and why the type parameter earns its place
- `useLocalStorage`: lazy initialisation, and all four failure modes
- `useSyncExternalStore`, and why it beats `useState` + an effect
- Stable references in a hook's API
- Four effects that should not be effects
- Where `useMemo` belongs, and where it is noise

## Practical Work

Four hooks, and the saved list finally survives a reload — the first item on
Week 6's list of known limitations.

```text
src/hooks/useBookSearch.ts      the Day 33 effect, extracted
src/hooks/useLocalStorage.ts    persistence, with the four failure modes
src/hooks/useDebouncedValue.ts  generic
src/hooks/useOnlineStatus.ts    useSyncExternalStore
src/components/SearchPanel.tsx  markup and one hook call
src/components/NotEffects.tsx   four effects I removed
```

## What A Custom Hook Is

A function whose name begins with `use` and which calls other hooks. That is
all. There is no registration and nothing special about the function — the
naming convention is what React's rules-of-hooks checking relies on, which is
why it is worth keeping exactly.

**What it is not: shared state.** I had this backwards. Two components calling
`useBookSearch` get two independent state machines, because the `useState`
inside belongs to the *calling* component. A hook shares **logic**; a context
shares **state**. That is the whole difference from Day 32, and it is why both
exist.

## Extracting Without Redesigning

Day 33's `SearchPanel` was 160 lines doing two jobs: the effect with its race
handling, and the markup with its four branches. I could not change the JSX
without reading the abort logic.

```tsx
const { state, retry } = useBookSearch(query);
```

The effect in `useBookSearch.ts` is the Day 33 effect **line for line**. That
was deliberate: a refactor that also changes behaviour is two changes at once,
and then a regression has two possible causes. Nothing was redesigned, so
nothing needed re-testing from scratch.

What stayed in the component is the `text`/`query` split, because that decision
is about *this form* — one request per submit rather than per keystroke — and
not about searching.

The hook's API is two things: `state` and `retry`. No setter is exposed. Day
32's "keep the API small", applied to a hook.

## useLocalStorage

The hook that bundles three things which always travel together: reading the
initial value, writing on change, and the four ways `localStorage` fails.

### Lazy initialisation

```tsx
const [value, setStateValue] = useState<T>(() => {
    if (!available) return initial;
    try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return initial;
        const parsed: unknown = JSON.parse(raw);
        return isValid(parsed) ? parsed : initial;
    } catch {
        return initial;
    }
});
```

Passing a **function** rather than a value. `useState(readStored(key))` would
run the parse on every render and throw the result away; the function form runs
it once. For a `JSON.parse` of the whole list that is the difference between a
cost on mount and a cost per keystroke.

### The effect I did not write

My first version had **two** effects — one to load, one to save. The loader ran
after the first render, so the list flashed empty and then filled in, and it
was a second source of truth that could disagree with the state.

Reading in the initialiser is one read, before the first paint. The only effect
is the write, and writing *is* synchronisation with something outside React —
which is Day 33's definition, and the test that says this one belongs in an
effect while the read does not.

It also means a write happens once per *committed* value rather than once per
`setValue` call, so three calls in one handler are one write.

### The validator

```tsx
isValid: (value: unknown) => value is T
```

Anything already on disk was written by an older version of this code and is
untrusted — Week 5's storage boundary, now a parameter. The hook never learns
what `T` is, which is Day 24's `Repository<T>` reasoning in a different shape.

Tested all four of the paths that matter:

```text
=== reload ===                        restored: Beta for dune | Alpha for dune
=== corrupt stored JSON ===           starts empty
=== stored data of the wrong shape === rejected (validator)
=== storage blocked, offline ===      "This browser is blocking local storage…"
```

The wrong-shape case is the one a plain `JSON.parse` would have let through:
`[{ id: 1, title: "wrong types" }]` is valid JSON and not a `SavedBook[]`.

### The one awkward line

```tsx
typeof next === "function" ? (next as (p: T) => T)(previous) : next
```

`T` could itself be a function type, in which case this check is wrong. React's
own `setState` has exactly the same limitation and the same workaround — wrap
it, `setValue(() => myFunction)`. Written down rather than pretended away.

## useDebouncedValue

```tsx
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}
```

**The cleanup is the debounce.** Every change re-runs the effect, and the
cleanup cancels the previous timer before the new one is set — so only the last
change in a burst survives. Written without the cleanup this is not a slow
debounce, it is *no* debounce: every keystroke schedules its own timer and every
one fires.

The generic earns its place because `T` appears in the parameter and the return
type — Day 24's two-positions test. `useDebouncedValue(text, 300)` gives a
string; the same hook over an object gives the object.

And it is used for the **opposite** reason from Day 33's submit-only search:
filtering an array in memory is cheap, but re-rendering a long list on every
keystroke is not, while a network request per keystroke is unacceptable at any
length. Same hook, different problem.

The lag is visible rather than hidden:

```tsx
{filterText !== debouncedFilter && " Filtering…"}
```

A derived value that exists only because the two are separate, and it tells the
user the list is one keystroke behind. No extra state for it.

```text
immediately  : Showing 2 of 2. Filtering…
after 400ms  : Showing 1 of 2.
```

## useSyncExternalStore

The hook I did not know existed, and it is the right tool for online status.

The obvious version is `useState(navigator.onLine)` plus an effect with two
listeners. It works. This is better for three reasons:

- **No duplicated state.** The effect version keeps a *copy* of
  `navigator.onLine`, which can be one render out of date. This reads the real
  value when React asks.
- **It is correct under concurrent rendering.** An effect-maintained copy can be
  read mid-render in a stale state — a tearing bug.
- **The server snapshot is a separate argument**, so there is one obvious place
  for "what is true before hydration".

```tsx
function subscribe(onChange: () => void): () => void { ... }
function getSnapshot(): boolean { return navigator.onLine; }
function getServerSnapshot(): boolean { return true; }

export function useOnlineStatus(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

All three are defined **outside** the hook so they are stable references. If
`subscribe` were recreated each render, `useSyncExternalStore` would unsubscribe
and resubscribe every time — the same identity trap as a dependency array.

The shape to look for: a value outside React, that changes without React's
involvement, with a subscribe/unsubscribe API. Online status, media queries,
window size, a store from another library.

## Four Effects I Removed

The day's reading is "You Might Not Need an Effect", and these are the four
patterns from it that I had actually written at some point this fortnight.

**1. Derived state.**

```tsx
// wrong
const [filtered, setFiltered] = useState(items);
useEffect(() => { setFiltered(items.filter(...)); }, [items, query]);

// right
const filtered = items.filter(...);
```

Renders twice per keystroke, is one render stale in between, and is a second
copy of a known fact.

**2. Expensive derivation → `useMemo`, still not an effect.** An effect would
*still* render twice and still hold a second copy. `useMemo` keeps one source of
truth and skips the work:

```text
memo runs before/after forced re-render: 5 / 5 (did not re-run)
```

Honest caveat, which is in the file: that derivation is not actually expensive,
and wrapping a cheap filter in `useMemo` costs a dependency comparison to save
nothing.

**3. Resetting state when a prop changes → `key`.** Day 30's trick again. The
effect version renders once with the previous person's draft still in the box
and *then* clears it:

```text
draft        : draft: some note
after switch : draft: (empty)   <- reset by key, never briefly wrong
```

**4. An event is not an effect.**

```tsx
// wrong
useEffect(() => { if (count > 0) setLog(l => [...l, `count became ${count}`]); }, [count]);

// right
function handleClick() { setCount(next); setLog(previous => [...previous, ...]); }
```

The log entry belongs to the *click*, not to the count having changed. The
difference shows the moment something else changes the count — or the component
remounts with a non-zero count and logs an event nobody caused. StrictMode makes
that second case visible immediately.

### A bug I wrote and removed

My first version of the `useMemo` demo kept a module-level counter,
incremented it inside the memo factory, and rendered it. That is a mutable read
during render — impure, and exactly what every other file this fortnight
avoids. Counting it in state is worse: setting state from inside a memo factory
is not allowed.

A `console.log` in the factory is the honest way to make "this did not re-run"
observable without pretending the render is pure when it is not.

## What I Learned

A custom hook shares logic, not state. Each call gets its own state, which is
the opposite of what I assumed and the reason both hooks and context exist.

Extract an effect without changing it. A refactor that also changes behaviour
gives a regression two possible causes.

A lazy `useState` initialiser is the right place to read storage. Two effects —
one to load, one to save — produce a flash of empty and a second source of
truth.

Writing to storage belongs in an effect because it is external
synchronisation; reading it does not, because it is just the initial value.

In a debounce hook, the cleanup *is* the debounce. Without it there is no
debouncing at all.

`useSyncExternalStore` is for a value that lives outside React with a
subscribe API. It avoids a duplicated copy that can be read stale.

Functions passed to `useSyncExternalStore` must be defined outside the hook, or
it resubscribes on every render.

The four non-effects: derived state, expensive derived state, resetting state on
a prop change, and reacting to an event. Only the third needs a React feature
(`key`), and none needs an effect.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  clean
```

Driven through jsdom across five separate page loads, sharing one `localStorage`
so persistence is actually tested:

```text
storage note : Saved in this browser. The list will still be here after a reload.
offline note : absent (online)

search status: Showing 2 of 2 results.
saved list   : Beta for dune | Alpha for dune
persisted key: day34.readingList | entries: 2

immediately  : Showing 2 of 2. Filtering…
after 400ms  : Showing 1 of 2.   | visible: Alpha for dune

memo runs before/after forced re-render: 5 / 5 (did not re-run)
draft        : draft: some note  ->  after switch: (empty)
event log    : 1 logged: clicked, count is now 1
problems     : none

=== reload ===                         restored: Beta for dune | Alpha for dune
=== corrupt stored JSON ===            starts empty
=== stored data of the wrong shape === rejected
=== storage blocked, offline ===       both notices shown
```

The blocked-storage load is the one worth having: `localStorage` is defined as a
getter that **throws**, which is what Safari private mode actually does — and
the app starts, says it will not remember anything, and works for the session.

## Day 34 Outcome

Four custom hooks. `useBookSearch` holds Day 33's effect unchanged, leaving the
panel as markup and one call. `useLocalStorage` reads in a lazy initialiser,
writes in an effect, validates untrusted stored data through a type predicate,
and reports quota, corruption, wrong shape and blocked access.
`useDebouncedValue` is generic with the cleanup doing the work.
`useOnlineStatus` uses `useSyncExternalStore` with stable module-level
functions and a server snapshot.

Plus four demonstrations of effects removed rather than written — including one
impure counter I wrote, noticed, and replaced.

The list survives a reload, which closes the first of Week 6's known
limitations.

Day 35 is the Week 7 build: the reducer and context from Days 31–32 back
together with the hooks from today, as one searchable API-backed app — plus the
Week 7 README.
