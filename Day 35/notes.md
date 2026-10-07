# Day 35 - Data-driven weekly build

## Topics Covered

- Putting the week back together: reducer, context, hooks, API
- `useReducer`'s third argument, and reading storage once
- Persisting a reducer's state without the hook owning it
- Choosing what *not* to persist
- A third context, and why splitting keeps paying
- Skipping the write on hydration
- An action creator that preserves an external id
- A guard the normalised shape needed once a second source of books existed

## Practical Work

Everything from the week in one app.

```text
src/state/reducer.ts       Day 31, plus two additions
src/state/persistence.ts   new - read and write, four failure modes
src/state/ListContext.tsx  Day 32, now three contexts and an effect
src/hooks/useBookSearch.ts Day 34, unchanged
src/hooks/useOnlineStatus.ts, useDebouncedValue.ts
src/lib/api.ts             Day 33, unchanged
src/components/*           Days 26-33
src/App.tsx                providers + layout
```

Days 33 and 34's files came over **unchanged**, and Day 31's reducer needed two
small additions. That is the week's real result: the pieces fit because each one
knows as little as possible about the others.

## The Integration Is One Line

```tsx
<SearchPanel savedIds={savedIds} onSave={(hit) => dispatch(bookSavedFromSearch(hit))} />
```

The search hook knows nothing about the reducer. The reducer knows nothing
about the API. This is the only place they meet, and it is an action creator
call.

### The creator that keeps the API's id

A book saved from a search has to keep Open Library's id, or the search panel
cannot tell which results are already on the list.

```ts
export function bookSavedFromSearch(hit): Action {
    return { type: "book/added", id: hit.id, addedAt: new Date().toISOString(), draft: {...} };
}
```

**No new action type was needed.** `book/added` already carries the id, because
Day 31 moved it out of the reducer to keep the reducer pure. A design that
generated the id *inside* the reducer would have needed a second action here —
which is a small vindication of a decision that felt pedantic at the time.

### A guard the normalised shape needed

Day 31's `book/added` did not check for an existing id, because the only way in
was a form that generated a fresh UUID. With a second source, saving the same
result twice would push a duplicate into `ids` while `byId` kept one entry —
the normalisation invariant breaking.

```ts
if (state.list.byId[action.id] !== undefined) return state;
```

Day 31's `StateInspector` would have caught it. Better to make it impossible,
and the bail-out is free.

```text
re-save guard: button disabled = true | list length still 2
```

## Persisting A Reducer

Day 34's `useLocalStorage` owns state with `useState`. That does not fit a
reducer, which already owns the state. So `persistence.ts` is the same four
failure modes with the state ownership removed — two plain functions, both
testable without React.

### useReducer's third argument

```tsx
const [loaded] = useState(readStoredList);
const [state, dispatch] = useReducer(reducer, undefined, () => loaded.state);
```

`useReducer`'s third argument is an init function, run **once**. The second
argument is ignored when it is present, which is why it is `undefined`.

That is where the stored list is read: once, before the first render. No flash
of an empty list, and no second source of truth. The `useState(readStoredList)`
wrapper is there because the function returns both the state *and* a notice,
and the notice has to survive as state.

### Skipping the first write

```tsx
const hydrated = useRef(false);

useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return; }
    const result = writeStoredList(books);
    if (!result.ok) setNotice(result.notice);
}, [books]);
```

Without the ref, mounting writes the list straight back. Harmless in content —
but a corrupt entry that was just skipped gets overwritten with the cleaned-up
version *before the user has seen the notice about it*.

Being precise: in development StrictMode runs the effect, cleans up and runs it
again on the same instance, so one write still happens on mount there. The ref
removes the write on a plain mount, not every possible one.

## What Not To Persist

Only the books. `query`, `filter`, `sort` and `editingId` are session concerns.

Restoring a filter from three days ago and showing "Showing 0 of 12" is a worse
first impression than starting clean — and restoring `editingId` could open an
editor for a book that has since been deleted.

That is a product decision rather than a technical one, so it is written down in
`persistence.ts`, because the code cannot explain it. Verified:

```text
=== reload ===
restored     : Beloved | Neuromancer | Dune
filters reset: sort = added | query: ""
```

## A Third Context

```tsx
StateContext     changes when the state changes
DispatchContext  never changes
NoticeContext    changes almost never
```

Bundled into one `{ state, dispatch, notice }`, the header's notice line would
re-render on every keystroke in the filter box. Split, it re-renders when the
notice changes.

This is the third time splitting has paid off, and the rule is now clear:
**separate values by how often they change**, not by what they are about.

## The Notices

Four distinct messages, where Week 4 had a `console.warn` for all of them:

```text
=== one row with status 'readng' ===  1 saved entry could not be read and was skipped.
=== version 99 ===                    The saved list is version 99, and this app expects 1.
=== corrupt JSON ===                  The saved list could not be read, so it has been reset.
=== blocked storage ===               This browser is blocking local storage…
```

The first is the one that matters most. A single bad row is dropped and the
other three are kept — `kept: 3 of 4` — rather than the whole list being lost
or the bad row rendering as a card with no badge, which is what Week 4 did.

The probe caught a grammar bug in that message: "1 saved entry … were skipped".
Fixed.

## One Type Change

```ts
// Day 28
export function isStatus(value: string): value is Status
// Day 35
export function isStatus(value: unknown): value is Status
```

Day 28 wrote `string` because the only caller was a `<select>`. Day 35 added a
second caller — the storage boundary, where the value came out of `JSON.parse`
and is genuinely unknown.

Widening costs nothing: a string is assignable to `unknown`, so the select
callers still compile, and the `typeof` guard was already needed because
`includes` wants a string. **A guard that works at every boundary is better
than one that works at one**, and the compiler is what pointed this out.

## What I Learned

Pieces fit together when each knows as little as possible about the others.
Three of this week's five files came into the build unchanged.

`useReducer`'s third argument reads initial state once, before the first
render. A loading effect gives a flash of empty and a second source of truth.

Keeping the id generation on the action rather than in the reducer meant a
second source of books needed an action *creator*, not an action type.

A normalised shape needs a duplicate guard the moment there is more than one
way for an item to arrive.

Decide what not to persist. Session state restored days later is worse than no
restore at all.

Split contexts by how often their values change.

Widening a guard's parameter to `unknown` makes it usable at every boundary and
breaks no existing caller.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  clean
```

Driven through jsdom across six page loads sharing one `localStorage`:

```text
search status: Showing 2 of 2 results.
saved        : Neuromancer | Dune
search btns  : On your list*, On your list*      (* = disabled)
stored ver   : 1 | ids: OLNEURO,OLDUNE           (Open Library ids kept)
re-save guard: disabled = true | list length still 2

after manual : Beloved | Neuromancer | Dune
after status : On the list=3 Unread=2 Reading=0 Finished=1
sort title   : Beloved | Dune | Neuromancer
query gibson : Neuromancer | Showing 1 of 3.
filter done  : Dune

=== reload ===                 restored all three, filters reset
=== row with 'readng' ===      kept 3 of 4, with a notice
=== version 99 ===             refused, with a notice
=== corrupt JSON ===           reset, with a notice
=== blocked + offline ===      both notices shown
problems     : none
```

`query gibson` matching `Neuromancer` is the author search; `filter done`
showing only `Dune` is the status that was changed through a row's select. The
stored ids being `OLNEURO,OLDUNE` rather than UUIDs is `bookSavedFromSearch`
doing its job.

## Day 35 Outcome

The Week 7 build: a live Open Library search with four request states, abort and
retry; a normalised reducer behind three contexts whose only public API is five
hooks; persistence with a version envelope that drops unreadable rows and
reports what it did; and a list that filters, sorts, edits and survives a
reload.

Days 33 and 34's files came in unchanged, and the reducer needed one guard and
one action creator.

That closes Week 7. Week 8 is routing, testing and deployment — and the first
tests in this repo, which the pure reducer and selectors from Day 31 were
written to make possible.
