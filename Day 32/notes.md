# Day 32 - Context and reducer

## Topics Covered

- `createContext`, `useContext`, and a provider
- Splitting state and dispatch into two contexts, and why
- `null` as the default, and hooks that throw outside their provider
- Keeping the provider API small — exporting hooks, not contexts
- Where `useMemo` is real and where it is cargo cult
- A component cannot read a context it provides itself
- Context is scoped to its provider, not global
- What context is *not*

## Practical Work

Day 31's reducer, unchanged, moved behind a context.

```text
src/state/reducer.ts        unchanged from Day 31
src/state/ListContext.tsx   two contexts, a provider, four hooks
src/state/ThemeContext.tsx  a second, much smaller context
src/App.tsx                 providers + layout, split into four small components
```

The reducer not needing to change is the result worth noting. A reducer knows
nothing about how it is reached, so this was a change to the plumbing and not to
the logic — which is the argument for having separated them yesterday.

The prop counts:

```text
Day 31   App dispatches 10 ways, passes 4 props to BookRow, 8 to FilterBar
Day 32   App dispatches  2 ways, passes 1 prop to BookRow,  0 to FilterBar
```

`FilterBar` previously took three values, three setters and two numbers — eight
props, all of which came from `App` and were used only there. That is the
definition of plumbing.

## Two Contexts, Not One

The decision the day turns on.

The obvious version is one context holding `{ state, dispatch }`. It works. It
also means **every consumer re-renders whenever either changes** — so a Remove
button, which only dispatches, re-renders on every keystroke in the filter box,
because the state object is new.

```tsx
const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);
```

Splitting them fixes it for free, because `dispatch` is referentially stable for
the lifetime of the provider. A dispatch-only consumer subscribes to a value
that never changes, so it never re-renders from the context at all.

`BookRow` is exactly that consumer:

```tsx
export function BookRow({ book }: BookRowProps) {
    const dispatch = useListDispatch();
```

One prop, and the three handler props are gone.

## null as the default

```tsx
createContext<AppState | null>(null)
```

Not a fake empty state. A missing provider is a programming error, and the
hooks turn it into a loud one:

```tsx
export function useListState(): AppState {
    const state = useContext(StateContext);
    if (state === null) throw new Error("useListState must be used inside a <ListProvider>.");
    return state;
}
```

Without the throw, `useContext` returns `null` outside a provider and the error
arrives later as "cannot read properties of null" inside a component that is
not the problem. This is Day 25's `mustFind` reasoning applied to context: fail
where the mistake is, with a message that names it.

A plausible-looking default is worse than `null`, because then a component
outside the provider silently renders an empty list and looks like it works.

## The Public API Is Four Hooks

Neither context object is exported, and nothing outside this module calls
`useContext`. The module exports:

```text
ListProvider        the provider
useListState        the whole state (used only by the inspector)
useListDispatch     dispatch only
useVisibleBooks     the filtered, sorted list
useListView         editing, counts, total, query, filter, sort, isDuplicate
```

That is the "keep the provider API small" part of the day. The shape of the
state behind those hooks is nobody else's business — and because consumers go
through hooks, normalising the list on Day 31 would not have reached them even
if it had happened today.

## useMemo: where it is real

I had to think about this three times, and the answers were different each time.

**On the provider's values: no.**

```tsx
<DispatchContext.Provider value={dispatch}>
    <StateContext.Provider value={state}>
```

`dispatch` is already stable — wrapping it does nothing. `state` is a new object
exactly when the state has changed, which is exactly when consumers should
re-render; memoising it would be memoising it on itself.

`useMemo` is needed when the value is an **object literal built in the render**
— `value={{ state, dispatch }}` is a new object every time even when nothing
changed. That is the case every context tutorial is about, and splitting the
contexts removes the need rather than working around it.

**In `useVisibleBooks`: yes.**

```tsx
return useMemo(() => selectVisible(state), [state.list, state.query, state.filter, state.sort]);
```

`selectVisible` filters twice and sorts. Without the memo that happens on every
render of every consumer rather than when its inputs change.

The dependency array is the four fields the selector actually reads — **not
`[state]`**, which would invalidate on any change at all and make the memo
pointless.

**In `useListView`: no.**

It returns a fresh object every render and nothing depends on its identity — it
is destructured immediately at every call site. Memoising it would cost a
comparison and save nothing.

The distinction I kept getting wrong: **memoise expensive work, not cheap object
creation.**

## A component cannot read a context it provides

The first mistake I made. My first `App` was:

```tsx
export function App() {
    return (
        <ListProvider>
            {/* ...and then useListView() here */}
        </ListProvider>
    );
}
```

`useListView()` inside `App` reads the nearest provider **above** `App`, which
is nothing — so it threw the "must be used inside a ListProvider" error from my
own hook. Which is the error working, and it told me exactly what was wrong.

The fix is to split: `App` is the providers, and a child consumes.

```tsx
export function App() {
    return (
        <ThemeProvider>
            <ListProvider>
                <ReadingList />
            </ListProvider>
        </ThemeProvider>
    );
}
```

That also pushed `App` into four small components — `FormPanel`, `ListPanel`,
`StatePanel`, `ScopeDemo` — each asking for what it needs. Which is better than
what I had, so the constraint improved the design rather than just satisfying
React.

## Context Is Not A Global

The thing I wanted to prove to myself, so it is a panel on the page: a second
`<ListProvider>` nested inside the first, with its own `useReducer`.

```text
inner before  : Inner provider holds 0 books.
inner after   : Inner provider holds 2 books.
outer still   : Beloved, Dune | total: 2
inner titles leaked into outer: false
```

A context is read from the **nearest provider above the consumer**. Two
providers are two independent states, which is how the same component can appear
twice on a page with different data — and why context is not a store.

The distinction I settled on:

> Context is dependency injection for the tree. It holds no state and has no
> update logic. `useReducer` holds the state; the context only decides who can
> reach it.

## The Second Context

`ThemeContext` is deliberately much smaller — a value and a toggle, with
`useState` and no reducer. It is here because it is the case context is
genuinely *for*: something the whole tree might want, that no component in the
middle has any reason to forward.

```tsx
const value: ThemeValue = { density, toggleDensity: () => ... };
```

An object literal as the value — the case the `useMemo` advice is about — and
not memoised, with a stated reason: this provider holds nothing but `density`,
so it re-renders only when `density` changes. "A new object every render" and
"a new object when the value changed" are the same thing here. It would matter
if the provider also held unrelated state.

The theme itself is one class on the page, and the cascade does the rest:

```css
.page--compact { --space-3: 10px; --space-4: 14px; }
```

No inline styles and no CSS-in-JS. The context changes a class name; every rule
that responds to it lives in the stylesheet, which is still the right place for
styling.

## What I Learned

Moving a reducer behind a context does not change the reducer. That is the
payoff for having separated the logic from the wiring.

One context holding `{ state, dispatch }` re-renders dispatch-only consumers on
every state change. Two contexts fix it for free, because `dispatch` is stable.

`null` as a context default plus a throwing hook puts the error where the
mistake is. A plausible default hides it.

Export hooks, not contexts. Then the state's shape is private and can change
without touching consumers.

`useMemo` belongs on expensive work, not on object creation — and its
dependencies should be the fields actually read, not the whole state object.

A component cannot consume a context it provides, and splitting it to satisfy
that produced a better tree than I had.

Context is scoped to its nearest provider. Two providers are two states, so
context is dependency injection and not a store.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  clean
```

Driven through jsdom:

```text
page class    : page page--comfortable
after toggle  : page page--compact | Density: compact

outer list    : Beloved, Dune
after status  : On the list=2 Unread=1 Reading=1 Finished=0
edit via row  : Editing "Dune"        <- BookRow dispatched with one prop
cancelled     : back to Add

query herbert : Dune | Showing 1 of 2.   <- FilterBar, zero props
filter Reading: Dune | Showing 1 of 2.

inner before  : Inner provider holds 0 books.
inner after   : Inner provider holds 2 books.
outer still   : Beloved, Dune | total: 2
inner titles leaked into outer: false
problems      : none
```

`query herbert` matching `Dune` is the author search — `FilterBar` dispatches a
`query/changed` with no props at all, and the list it does not own narrows.

## Day 32 Outcome

Day 31's reducer behind two contexts — state and dispatch separately, so
dispatch-only consumers never re-render from a state change — with `null`
defaults and four hooks that throw outside their provider. Neither context
object is exported, so the state's shape stays private. `FilterBar` went from
eight props to none and `BookRow` from four to one. A second, smaller theme
context shows the simpler case, and a nested provider panel demonstrates on the
page that context is scoped rather than global.

Day 33 is effects: what they are actually for, cleanup, abort, and the four
request states — with a real fetch replacing the constant catalogue.
