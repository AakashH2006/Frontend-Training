# Day 31 - State structure and reducers

## Topics Covered

- Normalising state: `byId` plus `ids`
- What normalising costs, and what it buys
- `useReducer`, and when it beats several `useState` calls
- Actions as a discriminated union
- Why a reducer must be pure, and where the impure part goes
- Exhaustiveness in a reducer
- Bailing out by returning the same state object
- Selectors as plain functions of state
- `dispatch` being stable, and what that saves

## Practical Work

Day 30's app, rewritten with normalised state and a reducer. Nothing about the
UI changed.

```text
src/state/reducer.ts            the shape, ten actions, the reducer, selectors
src/App.tsx                     one useReducer, no handlers
src/components/StateInspector.tsx  the state on the page
src/components/*                unchanged from Day 30
```

The numbers:

```text
Day 30    5 useState calls, 6 handlers, 4 of which set two things at once
Day 31    1 useReducer, 0 handlers, 10 named actions
```

## Why I Moved To A Reducer

Not because Day 30 was broken. Two specific things pushed it.

**Handlers that had to update two things together.** `removeBook` updated the
list *and* cleared `editingId` if the removed book was the one being edited.
`clearAll` set four pieces of state. By the end of Day 30 there were four such
handlers, and each one was a chance to forget the second half.

```tsx
// Day 30
function removeBook(id: string): void {
    setSaved((previous) => previous.filter((book) => book.id !== id));
    if (id === editingId) setEditingId(null);   // easy to omit
}
```

```ts
// Day 31 - one transition, written once
case "book/removed":
    return {
        ...state,
        list: { byId, ids: state.list.ids.filter((id) => id !== action.id) },
        editingId: state.editingId === action.id ? null : state.editingId
    };
```

**I could not say what the app does without reading the handlers.** There was
no list. Now there is, and it is the `Action` type:

```ts
export type Action =
    | { type: "book/added"; draft: BookDraft; id: string; addedAt: string }
    | { type: "book/edited"; id: string; draft: BookDraft }
    | { type: "book/removed"; id: string }
    | { type: "book/statusChanged"; id: string; status: Status }
    | { type: "list/cleared" }
    | { type: "query/changed"; query: string }
    | { type: "filter/changed"; filter: Filter }
    | { type: "sort/changed"; sort: Sort }
    | { type: "editing/started"; id: string }
    | { type: "editing/stopped" };
```

Ten lines that are the specification. And because it is a discriminated union,
each action carries exactly the data it needs and nothing else —
`editing/stopped` has no payload at all, and `book/added` cannot be dispatched
without a draft.

## Normalising

```ts
interface ListState {
    readonly byId: Readonly<Record<string, Book>>;
    readonly ids: readonly string[];
}
```

Day 30 stored `readonly Book[]`, and every update was a `.map` or `.filter` —
a scan of the whole list to change one book.

The reason to normalise is **not** speed. Twenty books do not care. It is this:

> `statusChanged` with an id that is not in the list is a silent no-op in an
> array, because `.map` simply matches nothing. With `byId` it is visible —
> `byId[id]` is `undefined`, and the reducer can decide what to do about it.

Every case that touches a book now starts the same way:

```ts
const existing = state.list.byId[action.id];
if (existing === undefined) return state;
```

### What it costs

One invariant: `ids` and `byId` have to agree. A case that updates one and not
the other is a bug that would be hard to see — so it is on the page:

```tsx
const consistent =
    idsInById.length === state.list.ids.length &&
    state.list.ids.every((id) => state.list.byId[id] !== undefined);
```

```text
ids and byId agree (2 entries)
```

That is the honest trade. An array has no invariant to break; normalised state
has one, kept in one file, and checked visibly instead of trusted.

It also shows up in the selector:

```ts
return state.list.ids
    .map((id) => state.list.byId[id])
    .filter((book): book is Book => book !== undefined);
```

TypeScript cannot know an id in `ids` is a key of `byId`, so the lookup is
`Book | undefined` and the type predicate is needed to get back to `Book[]`.
That is `noUncheckedIndexedAccess` being *right* rather than annoying — the two
really can disagree, and this is exactly where it would surface.

### Removing a key without mutating

```ts
const { [action.id]: _removed, ...byId } = state.list.byId;
```

Destructuring the key out gives a new object. `delete state.list.byId[id]`
would mutate the object React is holding and leave the reference identical —
Day 28's bug, in a new place.

## A Reducer Must Be Pure

The thing that took me longest to accept:

```ts
export function bookAdded(draft: BookDraft): Action {
    return {
        type: "book/added",
        draft,
        id: crypto.randomUUID(),
        addedAt: new Date().toISOString()
    };
}
```

`id` and `addedAt` are on the **action**, not generated in the reducer. My
first version called `crypto.randomUUID()` inside the `book/added` case, which
is wrong for three reasons:

1. A reducer is supposed to be a pure function — same state and action in, same
   state out. `randomUUID()` and `new Date()` are neither.
2. It makes the reducer untestable: there is no way to assert on the result.
3. **StrictMode calls the reducer twice** in development to check exactly this.
   An impure reducer produces two different ids for one dispatch.

So the impure part happens at the edge, in an action creator. The reducer stays
a function I can call with a state and an action and assert on — which is the
whole reason Day 37's tests will be able to cover the logic without rendering
anything.

## Exhaustiveness

```ts
default: {
    const unreachable: never = action;
    throw new Error(`Unhandled action: ${JSON.stringify(unreachable)}`);
}
```

Every action type is handled above, so `action` is `never` here. Add an
eleventh action without a case and this line stops compiling.

Day 20's render switch had a `default:` that rendered the success view —
so an unrecognised phase silently drew the wrong thing. This cannot.

## Bailing Out

Four cases return `state` unchanged:

```ts
if (existing === undefined) return state;              // no such book
if (existing.status === action.status) return state;   // nothing to change
```

React compares the returned state to the previous one and **skips the
re-render** when they are the same reference. So "no change" is free, and
returning `{ ...state }` out of habit would re-render for nothing.

The second one is worth having: a status select firing `change` with the value
it already had is a real event, and this turns it into no work.

## Selectors

```ts
export function selectVisible(state: AppState): readonly Book[]
export function selectEditing(state: AppState): Book | undefined
export function selectCounts(state: AppState): Record<Status, number>
export function selectIsDuplicate(state: AppState, exceptId: string | null)
```

Plain functions of state, in the same file as the reducer. Nothing derived is
stored — the same rule as Day 20 and Day 30 — but now the derivation has a name
and lives outside the component.

They are pure, so they are the other half of what can be tested without a
browser. That is the same reasoning that pulled `format.js` out of `render.js`
on Day 20, and it keeps producing the same answer.

## dispatch Is Stable

```tsx
const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
```

`dispatch` never changes for the lifetime of the component. `useState`'s setter
is stable too, but the *handlers* built around it are not — Day 30's
`removeBook` was a new function object on every render, so every `BookRow`
received a new prop every time.

It does not matter yet, because nothing is memoised. It is the reason a reducer
scales better into Day 32, where the dispatch goes through a context and a
changing value would re-render every consumer.

## What I Learned

A reducer earns its place when handlers start updating two things together.
Four such handlers was the point at which six closures became harder to trust
than one function.

The action union is the specification. Being able to read what an app can do
in ten lines is worth more than I expected.

Normalising is not about speed. It is about an update to a missing id being
visible instead of silently doing nothing.

Normalising costs one invariant — `ids` and `byId` agreeing — and the honest
thing is to check it rather than trust it.

`noUncheckedIndexedAccess` makes a normalised lookup return `T | undefined`,
and that is correct, because the two halves genuinely can disagree.

Destructuring a key out of an object removes it without mutating; `delete`
mutates and leaves the reference identical.

A reducer has to be pure, so ids and timestamps belong on the action. StrictMode
double-invokes the reducer specifically to catch this.

Returning the same state object skips the re-render, which makes "nothing to do"
genuinely free.

Selectors are pure functions of state and belong next to the reducer, not in the
component.

`dispatch` is stable; handlers built around `useState` are not.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  clean
```

Driven through jsdom, watching the invariant the whole way:

```text
initial invariant: ids and byId agree (0 entries).
initial ids      : []  | byId: {}  | editingId: null

after two adds   : Beloved, Dune
ids              : ["4d10333b-…","b871fad1-…"]
byId keys        : { b871fad1-…, 4d10333b-… }
invariant        : ids and byId agree (2 entries).

status -> finished, stats: On the list=2 Unread=1 Reading=0 Finished=1

editing          : Editing "Dune"  | editingId: b871fad1-28b…
removed while editing -> editingId: null | panel: closed
remaining        : Beloved | invariant: ids and byId agree (1 entry).

sort by title    : Beloved, Neuromancer
query gibson     : Neuromancer | Showing 1 of 2.

after clear      : [] | {} | sort back to: "" / all / added
invariant        : ids and byId agree (0 entries).
problems         : none
```

The `byId` keys come back in a different order from `ids`, which is the point of
separating them — object key order is insertion order and means nothing, while
`ids` is the order the UI uses.

`list/cleared` returning `INITIAL_STATE` resets the sort back to `added` as
well, which Day 30 needed four setters to do.

The probe caught one thing: my inspector said "1 entries". Fixed.

## Day 31 Outcome

The Week 6 app with its state normalised into `byId` plus `ids`, all logic in
one pure reducer behind a ten-member action union, an exhaustive `default` that
makes a new action a compile error, four bail-out cases that skip re-renders,
and five selectors that derive everything on screen. Ids and timestamps are
generated in an action creator so the reducer stays pure and testable. The state
is rendered on the page with its invariant checked live.

Day 32 moves that reducer behind a context, so the components stop being handed
`dispatch` through four levels of props.
