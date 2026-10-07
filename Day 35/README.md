# Week 7 — React State, Effects and Reusable Logic

A searchable, API-backed reading list with a normalised reducer, context, custom
hooks and explicit request states. The list survives a reload.

## What this is

Five days on handling medium-size state and external data without turning
components into a tangle of effects.

The finished app for the week is:

`Day 35/Reading List Data/`

## How to run it

```bash
cd "Day 35/Reading List Data"
npm install
npm run dev
```

Then open the address Vite prints. Searching hits
[Open Library](https://openlibrary.org/developers/api) — real data, no key,
CORS enabled — so the dev server needs a connection. The saved list does not.

Same four scripts and the same strict compiler options as Weeks 5 and 6.

## Folder layout

```text
Day 31/State Structure and Reducers/   normalised state, useReducer, selectors
Day 32/Context and Reducer/            two contexts, hooks as the only API
Day 33/Effects and Data Fetching/      a real API, cleanup, abort, four states
Day 34/Custom Hooks/                   four hooks, and the effects I removed
Day 35/Reading List Data/              the week's build
```

Each day is a working app. Day 33 deliberately drops back to plain `useState`
for the saved list, because carrying the reducer and the context along would
have made that day's diff about three things at once. Day 35 puts them back.

## Architecture

```text
src/state/reducer.ts       the shape, 10 actions, one pure function, 6 selectors
src/state/persistence.ts   read/write, version envelope, 4 failure modes
src/state/ListContext.tsx  3 contexts, 5 hooks, 1 effect
src/hooks/                 useBookSearch, useLocalStorage, useDebouncedValue,
                           useOnlineStatus
src/lib/api.ts             fetch, typed failures, the unknown boundary
src/components/            presentational, plus 2 that read context
src/App.tsx                providers + layout
```

One-way dependencies: `api.ts` and `reducer.ts` import nothing of the app's;
`persistence.ts` imports the reducer's types; the context imports both; the
components import the context's hooks. Nothing points back up.

### State

```ts
interface AppState {
    list: { byId: Record<string, Book>; ids: readonly string[] };
    query: string;
    filter: Filter;
    sort: Sort;
    editingId: string | null;
}
```

Derived by selectors and never stored: the visible list, the book being edited,
the per-status counts, the set of saved ids, and the duplicate check.

Search state is not in here at all. It lives in `useBookSearch`, because
nothing outside the search panel needs it — the same "closest common parent"
rule from Week 6, applied to a hook.

### Why normalised

Not speed; twenty books do not care. Because an update to an id that is not in
the list is a **silent no-op** in an array (`.map` matches nothing) and a
visible one in `byId`.

The cost is one invariant — `ids` and `byId` must agree — which Day 31 renders
on the page and checks live rather than trusting.

### The three contexts

| Context | Changes |
|---------|---------|
| `DispatchContext` | never |
| `StateContext` | when the state changes |
| `NoticeContext` | almost never |

Split by **how often the value changes**, not by what it is about. Bundled into
one `{ state, dispatch, notice }`, a Remove button would re-render on every
keystroke in the filter box, because the state object is new.

Neither context object is exported. The public API is five hooks, all of which
throw outside the provider.

## What I learned this week

- A reducer earns its place when handlers start updating two things together.
  Week 6 had four such handlers and that was the tipping point.
- The action union *is* the specification. Reading what an app can do in ten
  lines is worth more than I expected.
- A reducer must be pure, so ids and timestamps belong on the action.
  StrictMode double-invokes the reducer specifically to catch this — and that
  decision paid off on Day 35, when a second source of books needed only a new
  action *creator*.
- Returning the same state object skips the re-render, so "nothing to do" is
  genuinely free.
- An exhaustive `switch` with a `never` default makes a new action a compile
  error.
- One context holding `{ state, dispatch }` re-renders dispatch-only consumers
  on every state change. Two (or three) contexts fix it for free.
- `null` as a context default plus a throwing hook puts the error where the
  mistake is. A plausible default hides it.
- A component cannot consume a context it provides, and splitting to satisfy
  that produced a better tree.
- Context is scoped to its nearest provider, so two providers are two states.
  It is dependency injection, not a store.
- `useMemo` belongs on expensive work, not on object creation — and its
  dependencies should be the fields actually read, not the whole state.
- An effect synchronises React with something **outside** React. The test that
  works: name the outside thing.
- A fetching effect needs both an abort and an `ignore` flag. The abort stops
  the request; the flag stops a `setState` from a cleaned-up run.
- An `AbortError` must not be shown as a failure, and the network layer has to
  rethrow it unwrapped so the caller can tell cancelled from failed.
- Retrying needs a counter in the dependency array, because setting state to
  the same value is a no-op.
- A ref write does not re-render, so a value only written in an effect and read
  in JSX is always one render stale. I shipped that into a demo and the probe
  caught it.
- An effect with no dependency array that sets state is an infinite loop.
- A custom hook shares **logic**, not state. Each call gets its own state.
- A lazy `useState` initialiser — or `useReducer`'s third argument — is the
  right place to read storage. A loading effect gives a flash of empty.
- In a debounce hook, the cleanup *is* the debounce.
- `useSyncExternalStore` is for a value outside React with a subscribe API; it
  avoids a duplicated copy that can be read stale.
- The four non-effects: derived state, expensive derived state, resetting state
  on a prop change, and reacting to an event.
- Decide what *not* to persist. Session state restored days later is worse than
  no restore.

## Request states

Five, as a discriminated union, so `loading && error` is not representable:

```text
idle     "Search for a title, an author or a subject."
loading  "Searching for "dune"…"  + aria-hidden skeletons
success  "Showing 2 of 2 results."
empty    "Nothing matched "zzz"."
failed   one of five specific messages, with a Try again button
```

Failure kinds: `http` (404 / 429 / 5xx worded separately), `network`,
`timeout`, `parse`, `shape`. Eight seconds is the timeout, combined with the
caller's signal through `AbortSignal.any`.

## Persistence

A `{ version, savedAt, books }` envelope, with four failures each getting their
own message rather than a `console.warn`:

| Situation | What happens |
|-----------|--------------|
| Nothing stored | Empty list, no notice |
| One unreadable row | That row dropped, the rest kept, notice shown |
| Version mismatch | Refused, notice naming both versions |
| Corrupt JSON | Reset, notice shown |
| Over quota on write | Notice shown, app keeps working |
| Storage blocked | In-memory for the session, notice shown |

Only the books are persisted. `query`, `filter`, `sort` and `editingId` reset
on load, deliberately — restoring a three-day-old filter and showing "Showing 0
of 12" is a worse first impression than starting clean.

## Checks I ran

Every day type-checks and builds clean. Each day's built bundle was then driven
through jsdom with its real event handlers:

- **Day 31** — the `ids`/`byId` invariant held through every action; removing
  the book being edited cleared `editingId` in one transition; `list/cleared`
  reset the sort as well
- **Day 32** — `FilterBar` works with zero props and `BookRow` with one; a
  nested second provider held its own 2 books while the outer list stayed at 2
  with no leakage
- **Day 33** — a 400ms request followed by a 10ms one: the slow one was
  aborted and the fast result won, with `first aborted: true`. Empty, HTTP 503,
  network failure and retry all exercised against a stubbed `fetch`
- **Day 34** — five page loads over one shared `localStorage`: persisted,
  restored, rejected corrupt JSON, rejected data of the wrong shape, and
  survived a `localStorage` getter that **throws** (what Safari private mode
  does). The debounce showed "Filtering…" then caught up; `useMemo` did not
  re-run on a forced render; `key` reset a draft with no intermediate wrong
  value
- **Day 35** — search, save both results, re-save guarded, add by hand, change
  status, sort, filter, search by author, reload and restore, then one corrupt
  row (kept 3 of 4), a version mismatch, corrupt JSON, and blocked storage
  while offline. No console errors anywhere.

Three bugs of my own that the probes caught, all fixed: a ref-based counter
that never updated on screen (Day 33), an impure module-level counter read
during render (Day 34), and two pluralisation errors in status messages
(Days 31 and 35).

## Week 7 completion checkpoint

- [x] Explicit loading, error and empty states
- [x] A reducer and context, with state structure that is easy to explain
- [x] More than one custom hook — four, one of them generic
- [x] Effects used only for external synchronisation, each with cleanup
- [x] No `any`, no `@ts-ignore`
- [x] Five daily commits

## Known limitations

- **One screen.** Everything is on one page. Week 8 adds routing.
- **No tests.** The reducer and selectors are pure functions written to be
  testable, and nothing has tested them yet. Week 8, Day 37.
- **No pagination.** The API returns 12 results and there is no next page.
- **Search state is lost on navigation**, because it lives in a hook in one
  component. Routing will make that visible.
- **The author sort orders by forename**, still — it sorts on the first
  author's full name, and a surname sort needs a surname field.

## Next week

Week 8 is routing, testing and a mini-capstone: React Router with nested routes
and route parameters, Vitest and React Testing Library over the reducer and two
or three user-visible behaviours, an accessibility and quality pass, a
production build and a deployment.
