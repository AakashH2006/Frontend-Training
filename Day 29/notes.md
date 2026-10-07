# Day 29 - Forms and lifting state

## Topics Covered

- Controlled inputs: `value` + `onChange`, and what happens with only one
- One state object for a form, rather than one per field
- A single generic updater, with a `keyof` constraint
- `useId`, and why a hard-coded `id` is a bug waiting for a second instance
- Validating on submit, and clearing a field's error as it is edited
- `aria-invalid` and `aria-describedby`
- `noValidate`, and why two validation systems are worse than one
- Lifting state to the closest common parent — and *not* lifting the draft
- Deriving the filtered list, the counts and the submit state
- Controlled against uncontrolled, with a `ref`
- Three empty cases instead of one

## Practical Work

```text
src/App.tsx                       owns saved, query, filter
src/components/AddBookForm.tsx    owns its own draft and errors
src/components/FilterBar.tsx      owns nothing
src/components/ControlledNotes.tsx  the two input styles side by side
```

A real add-a-book form with five fields and four kinds of input, a filter bar
whose state lives in the parent, and a panel comparing a controlled input to an
uncontrolled one.

## What Belongs Where

This is the day's actual subject, and the rule is one line:

> State goes in the closest common parent of everything that **reads** it.

Applied honestly, it cuts both ways.

**In `App`**, because more than one component reads them:

| State | Read by |
|-------|---------|
| `saved` | the form (duplicate check), the list, the summary tiles |
| `query` | `FilterBar` (to show it), `App` (to filter) |
| `filter` | the same two |

**Not in `App`**, deliberately:

| Not lifted | Why |
|------------|-----|
| the form's draft | only the form cares what is half-typed |
| the field errors | same |
| `shown` / `total` | derived from `saved`, `query` and `filter` |
| `savedIds` | derived |

The draft is the interesting one. Lifting it would re-render `App` — and
therefore the whole saved list, the tiles and the filter bar — on **every
keystroke in a field App has no interest in**. "Lift state up" is advice about
sharing, not a general instruction to move state upwards, and the form is the
component where I would have got that wrong a week ago.

### The form reports a finished thing

```tsx
<AddBookForm onAdd={addBook} isDuplicate={isDuplicate} />
```

`App` never sees a half-typed title; the form never sees the saved list. The
duplicate check goes down as a **function**, not as the list, because the form
needs the answer to one question and not the data to work it out. If the list
moves into a reducer or a server tomorrow, the form does not change.

## Controlled Inputs

```tsx
<input value={draft.title} onChange={(event) => update("title", event.target.value)} />
```

Two halves, and both are required. `value` makes the state the source of truth;
`onChange` is how the state finds out about typing.

With `value` and no `onChange` the field looks frozen and React warns — every
keystroke is immediately overwritten by the prop on the next render. That is
not a bug in React; it is the prop doing exactly what it says.

### One object, not five useState calls

```tsx
interface Draft {
    readonly title: string;
    readonly authors: string;
    readonly year: string;
    readonly status: Status;
    readonly note: string;
}
```

They change together, submit together and clear together, so they are one
thing. Five separate pieces of state would mean five setters in `reset` and
five chances to forget one.

**Everything is a string, including the year**, because that is what an input
gives back — `<input type="number">` included. Storing it as a number would
mean converting on every keystroke and deciding what `""` converts to, which is
a decision with no good answer.

### One updater for every field

```tsx
function update<K extends keyof Draft>(name: K, value: Draft[K]): void {
    setDraft((previous) => ({ ...previous, [name]: value }));
    ...
}
```

Day 24's `keyof` constraint, doing real work: the key and the value type are
related, so `update("status", "nonsense")` does not compile. A plain
`(name: string, value: string)` would have allowed it, and five near-identical
handlers would have been the alternative.

## useId

```tsx
const formId = useId();
const fieldId = (name: keyof Draft) => `${formId}-${name}`;
```

A hard-coded `id="title"` works until there are two of these forms on one page
— then there are two elements with the same id and every label points at the
first. `useId` gives a unique value per component instance that is also stable
across renders, which a counter or `Math.random()` would not be.

The rendered id came out as `_r_0_-title`, which is React's own format and not
something to depend on the shape of.

## Validation

Errors appear **after the first submit attempt**, not while someone is still
typing the first character of a required field. Validating from the start means
the form is red before it has been used.

But an error **clears as soon as that field is edited**:

```tsx
setErrors((previous) => {
    if (previous[name] === undefined) return previous;
    const next = { ...previous };
    delete next[name];
    return next;
});
```

Leaving it until the next submit means the message stays on screen while the
person is fixing precisely the thing it complains about. The early
`return previous` is Day 28's bail-out — no new object when there is nothing to
change, so no re-render.

### The optional field

```tsx
if (draft.year.trim().length > 0) {
    const year = Number(draft.year);
    if (!Number.isInteger(year)) ...
}
```

The year is optional, so `""` is valid and only a non-empty value is checked.
Day 22's lesson about asking the right question: the test is "was something
typed", not "is it truthy".

And `type="number"` is a **keyboard hint, not a validator**. It still gives a
string from `event.target.value`, and some browsers accept `"1e5"` and `"--"`.
`validate` is the actual check.

### Accessibility

```tsx
aria-invalid={errors.title !== undefined}
aria-describedby={errors.title === undefined ? undefined : errorId("title")}
```

`aria-invalid` is the state a screen reader hears. `aria-describedby` points at
the message, so it is read **with** the field instead of being orphaned text
somewhere nearby. I checked the wiring holds: the attribute matches the error
paragraph's id.

`noValidate` on the form turns off the browser's own bubbles, because this form
reports inline and next to the field. Two validation systems that can disagree
is worse than either one alone — which is a change of mind from Week 1, where
the whole point was native validation. Native is right when there is no custom
messaging; it is wrong alongside it.

## Deriving, not storing

```tsx
const visible = saved
    .filter((book) => filter === "all" || book.status === filter)
    .filter((book) => needle.length === 0 || matches(book, needle));
```

Three inputs, one output, recomputed each render. Same as Day 20, and the
reason there is no `visible` state and no `canSubmit` state:

```tsx
const hasErrors = Object.keys(errors).length > 0;
```

A `canSubmit` piece of state would need updating from every field's handler,
and the first one that forgot would leave the button wrong.

The live character count is the clearest case for a controlled input — the
state is already here, so `{draft.note.length} / 300` is a render-time read and
not a second listener.

## Three empty cases

```tsx
{saved.length === 0 ? (
    <EmptyState message="Nothing saved yet." ... />
) : visible.length === 0 ? (
    <EmptyState message="No saved book matches that filter." ... />
) : (
    <ul>...</ul>
)}
```

"Nothing saved" and "nothing matches" are different problems with different
actions. Week 4 showed one message for both, which left a filtered-to-zero list
looking identical to an empty one.

Related: clearing the list also clears the filters. Leaving `query` set would
show "Showing 0 of 0" with text in the filter box and no way to tell whether
the list is empty or just filtered.

## Controlled against uncontrolled

```tsx
const uncontrolledRef = useRef<HTMLInputElement | null>(null);
<input ref={uncontrolledRef} defaultValue="" />
```

`defaultValue`, not `value` — passing `value` without `onChange` is the frozen
field. The DOM holds the value and React does not know it until something asks.

```text
controlled 'ab'   : "AB" | Three characters or more.
controlled 'abcd' : "ABCD" | error: (none)
uncontrolled read : Read on demand: "typed directly"
```

Three things are only possible because the controlled value is in state: a live
count, a live transform (typing lowercase produces uppercase), and a derived
validation message. All three are render-time reads of something already there.

The uncontrolled field can do none of them, because nothing re-renders when it
changes — and it does not re-render on every keystroke either. That is the
trade, and it is a real one; it is just the wrong side of it for a form that
validates.

`useRef<HTMLInputElement | null>(null)` is `| null` because the ref is empty
until the element mounts, which is why the read is `uncontrolledRef.current?.value`.

## What I Learned

"Lift state up" is about sharing, not about moving state upwards generally.
Lifting a form's draft re-renders everything around it on every keystroke.

A form should own what is half-finished and report what is finished. Passing a
`isDuplicate` function down instead of the list keeps the form unaware of how
the data is stored.

A controlled input needs both `value` and `onChange`; with only `value` it
looks frozen, because the prop overwrites every keystroke.

Fields that change, submit and clear together are one piece of state.

An input always gives a string, `type="number"` included. It is a keyboard hint
rather than a validator.

A generic updater with `K extends keyof Draft` replaces one handler per field
and still rejects a wrong value for a key.

`useId` exists because a hard-coded id breaks on the second instance of a
component, and a random one is not stable across renders.

Show errors after the first submit, clear them on edit, and return the previous
state object when there is nothing to change.

`aria-invalid` plus `aria-describedby` is what makes an inline error reach a
screen reader. `noValidate` is what stops the browser disagreeing with it.

"Empty" and "filtered to nothing" are two states, and showing one message for
both hides which one it is.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  clean
```

Driven through jsdom, setting input values through the prototype's `value`
setter so React's own change tracking sees them:

```text
ids unique (useId): _r_0_-title

empty submit      : A title is required.
status            : 1 field(s) need attention.
title aria-invalid: true
describedby wired : true

bad year          : Use a year between 1450 and 2026.
after fixing year : (none)
char count        : 22 / 300

after valid submit: 1 row(s)   form cleared: ""
stats             : On the list=1 Unread=1 Reading=0 Finished=0

duplicate         : That title is already on your list.

two books         : Showing 2 of 2.
query 'dune'      : Showing 1 of 2. | rows: 1
query 'zzz'       : Showing 0 of 2. | No saved book matches that filter.
filter Finished   : Showing 0 of 2. | pressed: true
filter All        : Showing 2 of 2. | pressed: true

controlled 'ab'   : "AB" | Three characters or more.
controlled 'abcd' : "ABCD" | error: (none)
uncontrolled read : Read on demand: "typed directly"
problems          : none
```

The duplicate check was fed `"  dune  "` against a saved `"Dune"` and caught
it, which is the trim-and-lowercase comparison working rather than a strict
equality that would have let it through. The year error quotes 2026 because it
is built from `new Date().getFullYear()` rather than hard-coded.

One thing the harness taught me: setting `input.value = "x"` directly does
**not** trigger a React change. React tracks the value through a property
descriptor on the prototype, so a test has to call that setter and then dispatch
the event. Worth knowing now, because it is exactly what Testing Library's
`fireEvent.change` does for me on Day 37.

## Day 29 Outcome

A controlled five-field form with per-field validation, inline errors wired to
`aria-invalid` and `aria-describedby`, `useId` for collision-free ids, a single
generic updater constrained by `keyof`, and a duplicate check passed down as a
function. The query and status filter lifted to `App` because two components
share them; the draft deliberately left where it is because one component does
not. Everything displayed — the filtered list, the counts, the submit state,
the character count — derived in the render rather than stored.

Day 30 is the Week 6 build: the whole thing as one filterable reading list with
add, edit, delete and filter, plus the Week 6 README.
