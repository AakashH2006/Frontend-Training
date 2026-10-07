# Day 45 - Inputs, outputs and mini-build

## Topics Covered

- `input()`, `input.required()`, and inputs with a default
- Input transforms
- `output()`, and what it replaced
- `$event` on an output against `$event` on a DOM event
- `model()`, and what two-way binding on a component actually is
- When to use `model()` and when to write the two bindings out
- Where a guard belongs, so an output's type is honest
- Moving controls into the component they control

## Practical Work

The Week 9 build. The parent owns the state; every child is a function of its
inputs and reports what happened through outputs.

```text
src/app/book-card.ts + .html   3 inputs (one transformed), 3 outputs
src/app/filter-bar.ts + .html   a model(), 4 inputs, 2 outputs
src/app/app.ts + .html          the parent, and the only state
```

Day 44 had the status select, the Remove button and all three filter controls
inline in `app.html` — about 60 lines of template that belonged to the
components they were controlling. The parent's template is now:

```html
<app-filter-bar [(query)]="query" [filter]="filter()" (filterChange)="..." ... />
<app-book-card [book]="book" [position]="i + 1" (statusChange)="..." (remove)="..." />
```

## Inputs

```ts
readonly book = input.required<Book>();
readonly showControls = input<boolean>(true);
readonly position = input<number, string | number>(0, {
    transform: (value) => (typeof value === 'number' ? value : Number(value))
});
```

**`input.required<Book>()`** has no default, and the component will not compile
into a template that omits it. The decorator form, `@Input() book!: Book`,
needed the `!` to promise TypeScript a value Angular would set later — and that
promise was unverifiable. This has no such hole.

**A default beats a required input** where there is a sensible fallback.
`showControls` defaulting to `true` means one component serves both the
interactive card and Day 44's display-only one:

```text
readonly cards : 2
  has controls : no
```

**The transform** is the feature I did not know existed, and it solves a real
annoyance. A static attribute in a template is always a string:

```html
<app-book-card position="7" />
```

Without a transform, `position()` is `"7"` and `position() > 0` compares a
string. With one, the conversion happens **once, at the boundary**:

```text
position shown  : #7 Things Fall Apart
transform works : yes - static "7" became a number
```

The two type parameters are `input<TransformedType, AcceptedType>`, which reads
backwards until you see that the first one is what the class gets.

## Outputs

```ts
readonly statusChange = output<Status>();
readonly remove = output<string>();
readonly edit = output<Book>();
```

`output<T>()` returns an `OutputEmitterRef` with **one method**, `emit`.

The old form was `@Output() statusChange = new EventEmitter<Status>()`, which
exposed the whole `EventEmitter` — including `subscribe`, which invited a
parent to wire itself up imperatively instead of binding in the template. The
new one has no `subscribe` at all: a smaller API doing the same job.

### $event on an output is the payload

```html
(statusChange)="onStatusChange(book.id, $event)"
(remove)="onRemove($event)"
(edit)="onEdit($event)"
```

`$event` here is the **emitted value**, not a DOM event — so it is a `Status`,
a `string` and a `Book` respectively, and `strictTemplates` checks each against
the handler's signature. That is one symbol meaning two different things
depending on what it is bound to, which took a moment.

```text
after statusChange : statusChange from OL2W: finished
after edit         : edit from OL2W: "Beloved"
remove             : remove from OL7W | cards: 6
```

### The guard belongs in the child

```ts
protected onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value ?? '';
    if (isStatus(value)) this.statusChange.emit(value);
}
```

`isStatus` is in the **card**, not the parent, so the output's type is honest:
it emits a `Status`, never a string that might not be one.

A component that emits `string` and expects the parent to validate has moved
the problem rather than solved it — and with three parents it would have to be
solved three times. Same reasoning as Week 5's "validate at the boundary".

### Naming

An output pairing with an input called `x` should be `xChange`, because then
`[(x)]` works.

`remove` and `edit` are deliberately **not** named that way. They are events,
not value changes, and calling them `removeChange` would suggest two-way
binding makes sense for them.

## model()

The thing that made two-way binding stop looking like magic.

```ts
readonly query = model<string>('');
```

```html
<app-filter-bar [(query)]="query" ... />
```

`model()` is an input **and** an output in one. Inside `FilterBar` it is a
writable signal — `this.query.set(...)` updates the parent's signal, because
`model()` emits `queryChange` behind the scenes.

Which is exactly the `[(x)] == [x] + (xChange)` identity from Day 43, with
Angular generating the output instead of me writing it.

The proof is that the parent has **no `queryChange` handler anywhere**, and
the parent's `lastEvent` does not move when the query changes:

```text
model() query : Showing 2 of 7. | titles: Song of Solomon, Beloved
  last event  : edit from OL2W: "Beloved"   <- unchanged
```

### And where I did not use it

`filter` and `sort` are a plain `input` plus a named `output`, written out:

```ts
readonly filter = input.required<Filter>();
readonly filterChange = output<Filter>();
```

Because the parent does **more than store them**. `clearFilters` resets the
query and the filter together; `reset` resets all four pieces of state. The
parent needs to be the one deciding that.

A `model()` would let the child write the parent's state directly, which reads
as convenient and makes the parent's state harder to reason about. That is Day
29's "who owns what" lesson in Angular's shape:

> `model()` when the child owns the value and the parent just holds it.
> `input` + `output` when the parent does something with the change.

The difference is visible in the event log: `filterChange` is recorded,
`query` is not.

## Moving The Controls

The boundary change that made the parent shorter. Day 44's card was
display-only and the parent put a `<select>` and two buttons beside it. That
was the wrong split: **a card that shows a book should own the controls for
that book.**

The parent went from wiring widgets to handling events, which is the difference
between knowing *how* a card is operated and knowing *what happened*.

## What I Learned

`input.required<T>()` removes the `!` that the decorator form needed, and with
it an unverifiable promise.

An input with a default serves two use cases from one component, which is
better than a second component or a required flag.

An input transform converts at the boundary, which is the only place a static
attribute's string-ness can be dealt with once.

`output<T>()` exposes only `emit`. The old `EventEmitter` exposed `subscribe`
and invited the wrong pattern.

`$event` is the emitted payload on an output and the DOM event on a DOM event.
Same symbol, two meanings.

A guard belongs in the component that emits, so the output's type is true.

`model()` is an input plus a generated `xChange` output, and `[(x)]` is sugar
for those two.

Use `model()` when the child owns the value; use `input` + `output` when the
parent does something with the change.

Controls belong in the component they control.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  133.44 kB raw, 40.03 kB transfer
```

Driven through jsdom:

```text
cards             : 7
positions         : #1 Kindred | #2 Song of Solomon | #3 The Left Hand of Darkness
after statusChange: statusChange from OL2W: finished | badge: Finished
  stats           : On the list=7, Unread=3, Reading=1, Finished=3
after edit        : edit from OL2W: "Beloved"
model() query     : Showing 2 of 7. | last event unchanged
filterChange      : filterChange: reading | Showing 1 of 7.
empty             : No book matches that filter. Clear the filters
after clear       : filters cleared by the parent | Showing 7 of 7.
remove            : remove from OL7W | cards: 6
readonly cards    : 2 | has controls: no | position: #7
transform         : static "7" became a number
after reset       : reset | cards: 7
problems          : none
```

Two of those lines are the day's actual claims: the event log *not* moving when
the query changed, which proves `model()` needs no handler; and `#7` rendering
from a static `position="7"`, which proves the transform ran — without it,
`position() > 0` would have compared a string and the `@if` would still have
passed, so the number is the only evidence.

## Day 45 Outcome

The Week 9 build: a parent owning four pieces of state, a card with three typed
inputs (one required, one defaulted, one transformed) and three typed outputs,
and a filter bar using `model()` for the value it owns and `input` + `output`
for the two the parent acts on. The status guard lives in the card so its
output emits a `Status` rather than a string.

Day 44's sixty lines of inline controls are gone from the parent's template.

Week 9 is written up in `Day 45/README.md`. Week 10 is signals properly,
dependency injection and services, and typed reactive forms.
