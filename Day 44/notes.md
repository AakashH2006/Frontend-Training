# Day 44 - Control flow and lists

## Topics Covered

- `@if` / `@else if` / `@else`
- `@for`, `track`, and what goes wrong without the right one
- `@empty`, and why it belongs to the loop
- Contextual variables: `$index`, `$first`, `$count`, and shadowing
- `@switch`, and how it is weaker than a `never` check
- `@let`
- A filterable, sortable list with `computed()`
- Automatic dependency tracking against a hand-written dependency array
- `lib` against `target`, again

## Practical Work

Seven books, a text filter, status filters, a sort — and a panel demonstrating
each control-flow block.

```text
src/app/app.ts + .html             the filterable list
src/app/control-flow.ts + .html    @switch, nested @for, and the track demo
```

## Computed, With No Dependency Array

```ts
protected readonly visible = computed<readonly Book[]>(() => {
    const needle = this.query().trim().toLowerCase();
    const filter = this.filter();

    return this.books()
        .filter((book) => filter === 'all' || book.status === filter)
        .filter((book) => needle.length === 0 || matches(book, needle))
        .toSorted(COMPARATORS[this.sort()]);
});
```

Four signals read, **no dependency list anywhere**. Angular records which
signals were read while the computation ran, so the dependencies are whatever
it actually used.

This is the first thing Angular does that is plainly better than its React
equivalent. `useMemo` needs the array written by hand, a wrong array is a stale
value with no error, and I got one wrong on Day 32 — `[state]` instead of the
four fields, which made the memo pointless. That mistake is not expressible
here.

The trade is that the dependencies are invisible: reading this code, I cannot
see what it depends on without following every call. Day 46 is where that gets
tested properly.

### lib again

```text
TS2550: Property 'toSorted' does not exist on type 'Book[]'.
Try changing the 'lib' compiler option to 'es2023' or later.
```

Word for word the Day 24 error. The CLI sets `target: ES2022` and no `lib`, so
`lib` defaults from the target.

`target` controls the syntax emitted; `lib` controls what the compiler believes
exists. Setting them separately is the point — ES2022 output with ES2023
built-ins declared is exactly right. Written out in all ten Angular tsconfigs
now, and I re-ran Days 41–43 after changing it rather than assuming a
widening was safe.

## @for and track

`track` is **mandatory**, and today is where I found out what it actually does
by getting it wrong on purpose.

Two lists, the same data, a text input in each row that Angular never writes
to — so the typed text lives only in the DOM node's identity:

```html
@for (book of rows(); track book.id)   <!-- left -->
@for (book of rows(); track $index)    <!-- right -->
```

Typed `MARK` into the first row of each, then reversed the list:

```text
track id    : An Undated Anthology=-    | Beloved=- | Things Fall Apart=MARK
track index : An Undated Anthology=MARK | Beloved=- | Things Fall Apart=-
```

**The left one moved the node.** `Things Fall Apart` went from position 1 to
position 3 and its text came with it, because the node is identified by
`book.id` and Angular relocated it.

**The right one kept the nodes and swapped the text.** `MARK` is still in
position 1, now attached to a different book.

That is Week 6's `key` lesson with evidence attached, and the evidence is
better than the explanation was. Three weeks of writing "an index breaks
reordering" and this is the first time I have watched it happen.

Angular making it a **compile error** to omit `track` is the right call. React
warns in the console, which is a warning I had learned to scroll past.

`track $index` is correct only for a list that never reorders and never loses
an item from the middle — an append-only log, which is exactly the case Day 28
used it for.

### @empty belongs to the loop

```html
<ul class="book-grid">
    @for (book of visible(); track book.id) { ... }
    @empty {
        <li class="empty-state">...</li>
    }
</ul>
```

The thing I did not expect and immediately liked. In React the equivalent is:

```tsx
{list.length === 0 ? <Empty/> : list.map(...)}
```

...which states the condition and then the loop states it again by producing
nothing. Two places that have to agree. Here there is one construct and no
condition to keep in step.

And two empty states inside it, told apart by a `@let`:

```text
no match    : No book matches that filter. Clear the filters
after clear : Showing 7 of 7.
```

"Nothing saved" and "nothing matches" are different problems with different
actions — Day 29's lesson, and Week 4 showed one message for both.

### Contextual variables, and shadowing

```html
@for (book of visible(); track book.id; let i = $index, isFirst = $first) {
```

`$index`, `$first`, `$last`, `$even`, `$odd` and `$count` are always in scope.
Aliasing with `let` is only necessary when a nested loop would **shadow** them
— which the grouped list does:

```html
@for (group of grouped(); track group.status) {
    @for (book of group.books; track book.id; let inner = $index) {
```

Without the alias, the outer `$index` is unreachable from the inner loop.

Used `$first` for something real rather than for striping: the first result is
announced as such, which a screen reader user gets from nothing else on the
page.

```text
first aria : Kindred (first result)
```

## @switch Is Weaker Than never

```html
@switch (phase()) {
    @case ('idle')    { ... }
    @case ('loading') { ... }
    @case ('success') { Showing {{ books().length }} results. }
    @case ('empty')   { ... }
    @case ('failed')  { ... }
    @default          { Unknown phase: {{ phase() }} }
}
```

Two things differ from a JavaScript `switch`: there is no fall-through, so no
`break`; and **`@default` is optional**.

That second one is a real downside against the `never` exhaustiveness check
this repo has used since Day 22. Adding a sixth phase renders **silence**
rather than failing to compile, and `strictTemplates` does not help — every
case is still a valid comparison.

So the exhaustiveness has to live on the class. `phases` is an `as const`
tuple and `nextPhase` indexes it, so a new phase has to be added there first.
It is a weaker guarantee than `const unreachable: never = phase` and worth
knowing is weaker, rather than assuming the framework has it covered.

```text
phase: Search for a title, an author or a subject.
phase: Searching…
phase: Showing 7 results.
phase: Nothing matched.
phase: That search did not work.
```

## @let

```html
@let shown = visible().length;
@let filtering = query().trim().length > 0 || filter() !== 'all';
```

New in Angular 18. What it replaces is reading `visible().length` in three
places — each read is cheap because it is a computed, but `shown` is clearer
than the same expression three lines apart.

It is a **declaration, not an assignment**: there is no way to reassign it,
which keeps the template an expression language. And it is scoped to the rest
of the template, so it cannot be used above the line declaring it.

`filtering` is the better use: a condition with a name, used by the `@empty`
block to choose between two messages. Putting that expression inline would
mean reading it to work out what it means.

## One Sort Worth Looking At

```text
sort author : An Undated Anthology, Things Fall Apart, Kindred
```

`An Undated Anthology` sorts **first** by author, because it has no authors and
the comparator is `(a.authors[0] ?? '')` — an empty string sorts before
everything.

That is the `?? ''` working as written, and it is arguably wrong: unknown
authors probably belong at the end, the way unknown years do. The year
comparator uses `?? -Infinity` for exactly that reason.

Noted rather than changed, because it is the same inconsistency the React app
has had since Day 30 and fixing it in one of four places would be worse. It
goes in Week 9's README.

## What I Learned

`computed()` tracks its dependencies automatically, which removes a whole
category of mistake that `useMemo`'s dependency array invites — at the cost of
the dependencies not being visible in the code.

`track` is mandatory in Angular and a console warning in React. Having
reversed a list with a text input in each row, the mandatory version is
obviously right.

`track $index` keeps the DOM nodes and swaps the data, so anything held in a
node — typed text, focus, scroll — ends up on the wrong item.

`@empty` makes the empty case part of the loop, so there is no condition stated
twice.

Contextual variables need aliasing only when a nested loop shadows them.

`@switch` has no fall-through and an optional `@default`, so it gives no
exhaustiveness guarantee. That has to be arranged on the class.

`@let` is a declaration scoped to the rest of the template — a name for a
condition, not a variable.

`lib` defaults from `target`, and the CLI sets only `target`.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  133.79 kB raw, 40.36 kB transfer
Days 41-43 re-verified after the lib change: typecheck and build clean
```

Driven through jsdom:

```text
stats         : On the list=7, Unread=3, Reading=2, Finished=2
order (added) : Kindred, Song of Solomon, The Left Hand of Darkness, ...
row numbering : #1 of 7 | #2 of 7 | #3 of 7
first aria    : Kindred (first result)

sort title    : An Undated Anthology, Beloved, Kindred, Neuromancer, ...
sort year     : Beloved, Neuromancer, Kindred, ... , An Undated Anthology   (undated last)
filter Reading: Kindred, Beloved | Showing 2 of 7. | pressed: true
query morrison: Song of Solomon, Beloved | Showing 2 of 7.
no match      : No book matches that filter. Clear the filters

groups        : unread (3) | reading (2) | finished (2)
first group   : 1. An Undated Anthology, 2. Neuromancer, 3. Song of Solomon

track id      : ... | Things Fall Apart=MARK      (text followed the book)
track index   : An Undated Anthology=MARK | ...   (text stayed on the row)
problems      : none
```

The author query matching two books is the author search working — neither
title contains "morrison". And `sort year` putting `An Undated Anthology` last
is the `?? -Infinity` doing its job, which is the comparator the author sort
should probably copy.

## Day 44 Outcome

A list that filters by status, searches titles and authors, and sorts four
ways — all through one `computed()` with no dependency array. The built-in
control flow throughout: `@if`/`@else`, `@for` with `track` and contextual
variables, `@empty` carrying two different empty states, a nested `@for` that
demonstrates shadowing, `@switch` over five request phases, and `@let` naming
a condition.

Plus a side-by-side demonstration of `track book.id` against `track $index`
with typed text in each row, which is three weeks of writing about keys finally
shown rather than asserted.

Day 45 closes Week 9: typed `input()` and `output()`, a parent-child reading
list, and the Week 9 README.
