# Day 30 - React mini-build

## Topics Covered

- One form component for both adding and editing
- `key` as a way to reset a component's state
- Why `useState`'s initialiser does not follow a changing prop
- Storing an id rather than the object it identifies
- A duplicate check that does not match a thing against itself
- Spread order when merging a draft into an existing record
- `toSorted` on readonly state
- Closing state that depends on something that has been deleted
- `crypto.randomUUID`

## Practical Work

The Week 6 build: a reading list with add, edit, delete, filter and sort.

```text
src/App.tsx                     all five pieces of state
src/components/BookForm.tsx     add and edit, one component
src/components/BookRow.tsx      a row: status, edit, remove
src/components/FilterBar.tsx    query, status filters, sort
src/components/{Panel,Button,Badge,Stat,EmptyState}.tsx   from Days 26-27
```

State, and nothing else:

```text
saved      readonly SavedBook[]   the list
query      string                 text filter
filter     Filter                 status filter
sort       Sort                   ordering
editingId  string | null          which row is open for editing
```

Derived in the render, never stored: `editing`, `visible`, the five counts, and
the duplicate check. Five pieces of state for five features, and the test for
each was Day 20's — could this be calculated from something already here?

## One Form, Two Jobs

I started writing `EditBookForm` and stopped a few lines in. It was the same
five fields, the same validation and the same error handling. The differences
between adding and editing came to exactly three things:

| Difference | Prop |
|------------|------|
| what the fields start as | `initial?: Book` |
| what the button says | `submitLabel: string` |
| whether there is a way out | `onCancel?: () => void` |

No `mode` prop. The *presence* of `onCancel` is what makes the Cancel button
appear, which means there is no second thing to keep in step with the first.

```tsx
export type BookDraft = Omit<Book, "id">;
```

The form reports a `BookDraft` — no `id`, because the form does not invent
identity. Adding generates one in `App`; editing keeps the existing one.
Neither is the form's business, and `Omit` says so in the type rather than in a
comment.

The payoff is immediate: a validation fix lands in both cases, and there is one
place where the year rule lives.

## The key Trick

The thing I actually learned today, and I learned it by hitting the bug.

```tsx
const [fields, setFields] = useState<Fields>(() => toFields(initial));
```

`useState`'s initialiser runs on the **first render only**. On every later
render the argument is computed and thrown away. So clicking Edit on one book
and then Edit on another reuses the same component instance — same position in
the tree, so React keeps its state — and the fields still hold the first book.

Three ways out:

1. **An effect that resets state when `initial` changes.** This is the one the
   React docs specifically warn about. It also renders once with the wrong
   values before correcting itself.
2. **Derive the fields from props and keep no state.** Impossible — the fields
   have to hold what is *typed*, which is not in the props.
3. **Give the component a `key`.**

```tsx
<BookForm key={editing.id} initial={editing} ... />
```

A different key means a different component as far as React is concerned, so it
unmounts the old one and mounts a fresh one with fresh state. One attribute, no
effect, and no render with stale values.

So `key` is not only for lists. It is how to tell React *this is a different
thing*. Verified it:

```text
editing Dune    : "Dune"
editing Beloved : "Beloved" <- fresh state, not 'Dune'
```

## Store the id, not the object

```tsx
const [editingId, setEditingId] = useState<string | null>(null);
const editing = saved.find((book) => book.id === editingId);
```

Keeping the whole book in state would be a second copy, and it would go stale
the moment that book is edited — the form would save, the list would update,
and the edit panel's heading would still show the old title.

The id is the minimum that cannot disagree with anything. `editing` is derived.

### And it has to be closed when its subject disappears

```tsx
function removeBook(id: string): void {
    setSaved((previous) => previous.filter((book) => book.id !== id));
    if (id === editingId) setEditingId(null);
}
```

Without that second line, removing the row currently being edited leaves
`editingId` pointing at nothing, so `editing` is `undefined` and the app falls
back to the Add panel — which happens to be the right outcome, by accident, and
only because the render handles `undefined`. Being explicit means the state
cannot hold a reference to something deleted. Checked:

```text
removed while editing -> panel: closed (add panel back)
```

## The duplicate bug

The first real bug of the day. The duplicate check from Day 29:

```tsx
saved.some((book) => book.title.trim().toLowerCase() === normalised)
```

...rejects a book as a duplicate **of itself**. Open an edit, change only the
note, press Save, and it refuses because a book with that title is already on
the list — namely the one being edited.

```tsx
function isDuplicateOf(exceptId: string | null) {
    return (title: string): boolean =>
        saved.some((book) => book.id !== exceptId && book.title.trim().toLowerCase() === normalised);
}
```

A function returning a function, so `App` can bind the exception per use:
`isDuplicateOf(null)` when adding, `isDuplicateOf(editing.id)` when editing.
The form still just receives `(title) => boolean` and knows nothing about it.

Both halves verified:

```text
saved same title: closed | errors: (none)
rename to dup   : That title is already on your list.
```

## Spread Order, Again

```tsx
book.id === editingId ? { ...book, ...draft } : book
```

The draft goes **second**, so its five fields win and `id` and `addedAt`
survive. The other way round, the old values would overwrite the edit and the
save would silently do nothing.

Day 20 had the mirror image of this in the import merge, where the defaults had
to go *first* so a file could not overwrite them with `undefined`. Same
operator, opposite order, and the rule is just: whichever side should win goes
last.

## toSorted on readonly state

```tsx
.toSorted(COMPARATORS[sort])
```

`saved` is `readonly SavedBook[]`, so `.sort()` does not even compile — which
is Week 5 preventing a Week 4 bug rather than me remembering it. Sorting in
place would mutate the array React is holding, leave the reference identical,
and skip the re-render.

The comparators are a closed `Record<Sort, ...>`, so adding a sort option is a
compile error until it has one. No `?? comparators.added` fallback, which in
Day 20 meant a missing comparator was a silent default instead of an error.

Checked each one against data chosen to make a mistake visible:

```text
sort by title  : Beloved, Dune, Neuromancer          (alphabetical)
sort by author : Dune, Beloved, Neuromancer          (Herbert, Morrison, Gibson -> F, T, W)
sort by year   : Beloved, Neuromancer, Dune          (1987, 1984, 1965 - newest first)
sort by added  : Beloved, Neuromancer, Dune          (most recent first)
```

The author sort is the one worth checking, because it sorts on
`authors[0] ?? ""` — the first author's *full* name, so it orders by forename.
That is wrong for a bookshelf and right for what the data actually holds; a
surname sort needs a surname field, and inventing one by splitting on the last
space breaks on "Ursula K. Le Guin". Left as it is, deliberately, and noted
rather than quietly wrong.

## crypto.randomUUID

```tsx
id: crypto.randomUUID()
```

Day 29 used `local-${Date.now()}`, which collides if two books are added in the
same millisecond — and two adds in one millisecond is exactly what a test
harness does. `randomUUID` is in every current browser, and jsdom provides it
too, so the probe ran on real UUIDs rather than a stub.

## Two routes to the same field

The status select stays on each row even though the edit form can also change
the status. Moving a book from unread to reading is the commonest thing anyone
will do here, and making it a three-click edit would be worse.

Two routes to one field is fine when both go through the same action —
`changeStatus` — so there is no second code path that can drift.

## What I Learned

Two components that differ only in their initial values, their button text and
whether they can be cancelled are one component with three props.

`useState`'s initialiser runs once, so state does not follow a changing prop.
`key` is the fix, and it is the right fix because the alternative is an effect
the docs warn about.

`key` means "this is a different thing", not just "this is a list item".

Store the id and derive the object. The id cannot go stale; a copy of the
object can.

State that points at a record has to be cleared when that record is deleted.

A uniqueness check needs to exclude the thing being checked, or editing
anything else about a record fails.

Spread order decides which side wins, and the answer differs per case —
defaults first when merging untrusted input, the patch last when applying an
edit.

`readonly` state makes `.sort()` a compile error, which removes a mutation bug
I would otherwise have to remember.

`Date.now()` is not an id.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  clean
```

The whole app driven through jsdom — three books added through the real form,
then sorted four ways, filtered, searched, edited twice, renamed into a
duplicate, re-statused, removed mid-edit and cleared:

```text
added three     : Beloved, Neuromancer, Dune
stats           : On the list=3 Unread=1 Reading=1 Finished=1

filter Finished : Beloved      | Showing 1 of 3.
query 'gibson'  : Neuromancer  | Showing 1 of 3.

edit panel      : Editing "Dune"
prefilled       : "Dune" "Frank Herbert" "1965" "reading"
buttons         : Save changes, Cancel
saved same title: closed | errors: (none)
note applied    : Reread in October.

editing Dune    : "Dune"
editing Beloved : "Beloved"   <- fresh state
rename to dup   : That title is already on your list.

row status      : Finished
stats           : On the list=3 Unread=0 Reading=1 Finished=2

removed while editing -> panel: closed
after clear     : Nothing saved yet. | Showing 0 of 0.
problems        : none
```

The query filter searches authors as well as titles — `"gibson"` matches
`Neuromancer`, whose title does not contain it.

## Day 30 Outcome

A complete filterable reading list in React and TypeScript: add, edit, delete,
filter by status, search by title or author, and sort four ways. Eight
components, five pieces of state, and everything on screen that can be derived
*is* derived. One form serves both add and edit, reset by `key` rather than an
effect. Type-checks and builds clean under the same strict options as Week 5,
with no `any`, no suppression comments, and no `useEffect` anywhere — which is
Week 7's subject and deliberately absent here.

That closes Week 6. Week 7 is state structure and data: normalising state,
`useReducer`, context, effects for real external synchronisation, and the
custom hook that makes this list survive a reload.
