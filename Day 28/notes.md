# Day 28 - Events and state

## Topics Covered

- `useState`, and why the setter is not an assignment
- Why an empty-array initial value needs an annotation
- Typed events: `ChangeEvent<HTMLSelectElement>`, `MouseEvent`
- Functional updates, and the closure bug they fix
- State as a snapshot per render
- Batching
- Updating arrays and objects without mutating
- Bailing out by returning the same reference
- Where state belongs
- Deriving instead of storing a second copy
- When an array index *is* a valid key

## Practical Work

The buttons from Day 27 do something now. A catalogue standing in for an API, a
saved list that can be added to, removed from and re-statused, and a panel of
four experiments that exist purely to make the wrong version print the wrong
number.

```text
src/App.tsx                        owns the saved list
src/components/Catalogue.tsx       the "results" half - no state of its own
src/components/BookRow.tsx         a saved row, with a select and a remove
src/components/StateExperiments.tsx  four buttons, four lessons
```

## The Setter Is Not An Assignment

```tsx
const [saved, setSaved] = useState<readonly Book[]>([]);
```

`saved` is a `const` within a render. It is never assigned to. `setSaved`
schedules a re-render, and the new value appears as a *different* `saved` in
the next render.

That sentence is in every tutorial and it did not mean anything to me until I
built the fourth experiment and watched it print a stale number.

### The annotation that is actually required

```tsx
useState<readonly Book[]>([])
```

Without it, TypeScript infers `never[]` from the empty array — and `never[]`
accepts nothing, so the first `addBook` does not compile. The error talks about
`Book` not being assignable to `never`, which is confusing exactly once.

This is the one place in React where an annotation is not optional, and it is
because the initial value carries no information.

## The Closure Bug

The experiment I came for. Three increments, written two ways.

```tsx
function tripleWrong(): void {
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
}

function tripleRight(): void {
    setCount((previous) => previous + 1);
    setCount((previous) => previous + 1);
    setCount((previous) => previous + 1);
}
```

Clicked each once, from zero:

```text
+3 wrong way   : count is 1
+3 right way   : count is 4
```

One, not three. All three calls in `tripleWrong` read `count` from the closure
of the render they were created in — a `const` captured when that render ran —
so all three compute `0 + 1` and the last one wins.

**This is not a React quirk.** It is what a closure over a `const` does. React
just makes it matter, because the value the closure captured is a snapshot that
a later update has already replaced.

The updater form receives the value *after* the previous updater, so they
compose. The rule I took: **if the next value depends on the previous one, pass
a function.**

### State is a snapshot

```tsx
function readAfterSetting(): void {
    setCount(count + 100);
    note(`right after setCount, count is still ${count}`);
}
```

```text
+100 and read  : count is 104
log line       : readAfterSetting: right after setCount, count is still 4
```

The count on screen is 104 and the log says 4, and both are correct. Setting
state does not change the variable — nothing in JavaScript could, it is a
`const` — it schedules the next render. Reading state immediately after setting
it always reads the old value.

Which is why the duplicate check in `addBook` goes *inside* the updater:

```tsx
setSaved((previous) =>
    previous.some((entry) => entry.id === book.id) ? previous : [{ ...book, status: "unread" }, ...previous]
);
```

Checking `saved` outside would check the render's snapshot, and two fast clicks
could both pass it.

### Batching

Two pieces of state set in one handler produce **one** re-render, not two.
Since React 18 that holds inside promises and timeouts as well, not just event
handlers. So `setCount` plus `setLog` in the same function is one render, which
is why the wrong-way experiment is one visible update rather than three.

## Immutable Updates

```tsx
setSaved((previous) => previous.map((book) => (book.id === id ? { ...book, status } : book)));
```

Not `saved[i].status = status`. Mutating the array React is holding would change
the data and leave the reference identical — so React compares old and new, sees
the same array, and does not re-render. The state "updated" and nothing
happened.

Every update in `App.tsx` produces a new object and a new array for that
reason, and the `readonly Book[]` type makes the mutating version a compile
error rather than a thing I have to remember.

### Returning the same reference on purpose

```tsx
? previous                                    // nothing to do
: [{ ...book, status: "unread" }, ...previous]
```

Returning `previous` unchanged is not laziness. React bails out of the re-render
when the next state is the same reference, so a duplicate click costs nothing.
`[...previous]` would be a new array every time and would re-render for no
reason — the mirror image of the mutation bug.

## Typed Events

```tsx
function handleStatus(event: ChangeEvent<HTMLSelectElement>): void {
    const value = event.target.value;
    if (isStatus(value)) onStatusChange(book.id, value);
}
```

`ChangeEvent<HTMLSelectElement>` is the type, and the payoff is
`event.target.value` being a `string` instead of needing Week 4's
`select.value` on an element I had asserted into existence.

It is still only a `string`, though. The union needs the guard, and `isStatus`
is what closes that gap — the "readng" typo from Week 4 cannot get into state
here, because the only path in goes through a predicate.

### The select's options come from the union

```tsx
{STATUSES.map((status) => (
    <option key={status} value={status}>{STATUS_LABELS[status]}</option>
))}
```

Day 25 needed a function at startup to rewrite a `<template>`'s options so the
markup and the union could not drift. Here it is a `.map`, which is the first
time this week that React has been plainly *less* code rather than differently
shaped code.

### Inline arrows in handlers

```tsx
<Button small variant="danger" onClick={() => onRemove(book.id)}>
```

This allocates a function per render. That is fine — one small object, and the
alternatives (a `useCallback`, or reading the id back off a data attribute) both
cost more than they save at this size. Worth knowing it is a trade and not a
mistake; `useCallback` has a real use and this is not it.

## Where State Belongs

Three components need the saved list: `Catalogue` (to know what is already
saved), the saved list (to render it), and the summary (to count it). Their
closest common parent is `App`, so it lives in `App`.

Pushing it into the saved list would hide it from `Catalogue`; pushing it up has
nowhere to go. This is the easy case with one answer — Day 29 is the case where
there is a choice.

### Deriving, again

```tsx
const savedIds = new Set(saved.map((book) => book.id));
```

Not state. A second piece of state holding the same fact could disagree with the
first, and the stale one would be a wrong badge on a card. One `Set` per render
is cheap, and it cannot be wrong — Day 20's rule, now three weeks old and still
the one I reach for most.

Same for the counts: `saved.filter(...).length` per status, computed in the
render.

## When an index is a valid key

Day 26 and 27 both said an index is the wrong key. Here is the exception:

```tsx
{log.map((line, index) => <li key={index} className="text-sm">{line}</li>)}
```

The log is append-only. Nothing is reordered, nothing is removed from the
middle, and no entry holds state. An index is stable *for this list*, so it is
correct — and the rule is really "the key must be stable for the item", not
"never use the index".

## One strict-option detail

```tsx
actions={saved.length > 0 ? <button .../> : undefined}
```

`: undefined`, not `: null`. `actions?: ReactNode` is an exact optional property
under Week 5's `exactOptionalPropertyTypes`, so `null` — a legal `ReactNode` —
is not a legal value for an *absent* optional prop. A small thing, and that
option is still earning its place three weeks later.

## What I Learned

The setter schedules a render; it does not assign. `count` is a `const` inside
each render and reading it after setting it gives the old value — I printed 104
on screen and 4 in the log from the same handler.

`setCount(count + 1)` three times adds one, because all three read the same
captured snapshot. If the next value depends on the previous one, pass a
function.

`useState([])` infers `never[]`, so an empty initial array needs an explicit
type parameter. It is the one annotation React genuinely requires.

Mutating state leaves the reference identical, so React does not re-render —
and returning the same reference on purpose is how to *skip* a re-render.

React batches all setters in a handler into one render, including inside
promises and timeouts since 18.

`ChangeEvent<HTMLSelectElement>` types `event.target.value` as a string, and a
guard is still needed to get from `string` to a literal union.

State belongs in the closest common parent of everything that reads it.

A derived value is not state, and an index is a fine key for a list that only
ever grows at the end.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  clean
```

Driven through jsdom with real dispatched events:

```text
catalogue cards: 6
saved initially: Nothing saved yet. Add something from the catalogue above.
stats          : On the list=0 Unread=0 Reading=0 Finished=0

after two adds : 2 rows | On the list=2 Unread=2 Reading=0 Finished=0
add btn now    : On your list   disabled: true

after status   : On the list=2 Unread=1 Reading=0 Finished=1
first badge    : Finished
first row class: book-card book-card--finished

after remove   : 1 rows | On the list=1 Unread=1 Reading=0 Finished=0

+3 wrong way   : count is 1
+3 right way   : count is 4
+100 and read  : count is 104
log            : readAfterSetting: right after setCount, count is still 4

after reset    : count is 0 | log lines: 0
problems       : none
```

Every derived number tracks: adding two books moves `On the list` and `Unread`
together, changing one to finished moves it between two tiles without touching
the total, and the Add button disables once the id is in the derived `Set`. The
two increment buttons differ by two, which was the point of writing them.

## Day 28 Outcome

An interactive reading list: add from a catalogue, remove, change status, and
clear — all through `useState`, all with immutable updates, and with every
displayed number derived rather than stored. Typed event handlers with a guard
closing the `string`-to-union gap, select options generated from the union
itself, and a bail-out on duplicate adds that returns the same reference on
purpose.

Plus four experiments that demonstrate the closure bug, snapshot semantics and
batching with numbers on the page rather than claims in a comment.

Day 29 is forms and lifting state: controlled inputs, a real add-a-book form
with validation, and moving state up to the parent two siblings share — the case
where there is actually a choice about where it goes.
