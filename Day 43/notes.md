# Day 43 - Template binding and events

## Topics Covered

- Interpolation, and why it takes an expression and not a statement
- Property binding, and the `disabled="false"` trap
- Attribute binding, and when there is no property to set
- `[class.x]` against `[class]`
- Style binding with a unit
- Event binding and `$event`
- `.update()` on a signal, and why not `.set(current + 1)`
- Two-way binding, what it desugars to, and why I did not use it
- `$any()`, the one escape hatch in the template language

## Practical Work

A page exercising each binding with something observable, plus the first
interactive list of the Angular week.

```text
src/app/bindings.ts + .html + .css   the five bindings
src/app/app.ts + .html               a status select and a remove per row
```

## Interpolation

```html
<p>The title is {{ title() }}, {{ title().length }} characters.</p>
```

Evaluated against the class, escaped on the way out. It takes an **expression**
— no assignment, no `;`, no function declaration.

That restriction is the template language's whole design, and I came round to
it. A template that cannot hold a statement cannot grow logic, so the logic has
to live on the class where it is type-checked and testable. JSX lets me put
anything in braces, which is more powerful and the reason React components
drift towards doing too much inline.

One quirk: there is no escape character. Printing literal double braces means
making the expression a string — `{{ '{{ expression }}' }}`.

## Property Binding, And The Trap

```html
<button [disabled]="disabled()">I am {{ disabled() ? 'disabled' : 'enabled' }}</button>
```

`[disabled]` sets the DOM **property**.

The trap, and it is the single most common binding mistake:

```html
<button disabled="false">   <!-- permanently disabled -->
```

That sets the **attribute** to the string `"false"`, and a present `disabled`
attribute disables the button whatever its value. So the plain version fails in
the direction that looks deliberate — the button is disabled and the code says
`false`.

Verified both states:

```text
2 property      : I am enabled  | disabled: false
  after toggle  : I am disabled | disabled: true
```

## Attribute Binding

```html
<input [value]="title()" [attr.aria-describedby]="describedBy()" />
```

For attributes with **no matching DOM property**: every `aria-*`, `colspan`,
`role`. There is nothing for `[aria-describedby]` to set, so `attr.` is
required.

And binding `null` removes the attribute entirely, which is how an optional
`aria-describedby` is expressed — the same pattern Day 42 used on the panel's
`aria-labelledby`.

This property/attribute distinction does not exist in JSX, where React maps the
names for me. Having to know which is which is a real cost of Angular's
templates, and the payoff is that `[attr.x]` works for *any* attribute,
including ones React has no mapping for.

## Class And Style

```html
<p class="book-card__note" [class.is-highlighted]="highlighted()" [class]="'status-' + status()">
```

Three class sources on one element, and they coexist:

```text
4 class target  : book-card__note status-reading
  after both    : book-card__note status-finished is-highlighted
```

`[class.x]` toggles **one** class and leaves the rest alone. `[class]` with a
string replaces the *bound* set — it does not touch the static `class`
attribute, which is why `book-card__note` survives both.

That is more forgiving than I expected. In React I build one `className` string
and any mistake drops a class silently; here the three mechanisms are
independent.

### The unit suffix

```html
<div class="meter__fill" [style.width.%]="progress()"></div>
```

`[style.width.%]` is Angular appending the unit. The alternative is string
concatenation in a template, which is exactly the kind of thing templates are
bad at. This is the one piece of sugar in the binding syntax I actively like.

```text
style width   : 40% | 40% read
after range   : 75% | 75% read
```

## Events

```html
<button (click)="handleClick()">Clicked {{ clicks() }} times</button>
<input (input)="handleInput($event)" (keydown)="handleKey($event)" />
```

Any DOM event name in parentheses. `$event` is the real event, **typed** — so a
handler declaring `KeyboardEvent` is checked against the event the template
actually binds:

```ts
protected handleKey(event: KeyboardEvent): void {
    this.lastKey.set(event.key);
    if (event.key === 'Escape') this.typed.set('');
}
```

```text
typed         : value: "hello" · last key: (none)
after Escape  : value: "" · last key: Escape
```

### .update(), not .set(current + 1)

```ts
this.clicks.update((n) => n + 1);          // yes
this.clicks.set(this.clicks() + 1);        // works, and is the Day 28 shape
```

The signal equivalent of Day 28's functional update, for the same reason: the
second form reads the current value and computes from it, which is the thing
that goes wrong when updates are batched or when the read is stale.

Signals do not have React's closure problem — `this.clicks()` always reads the
current value rather than a captured snapshot — so the second form is not
*broken* here. `.update()` is still the one to write, because it says "derived
from the previous value" and does not depend on when it runs.

### target is still EventTarget | null

```ts
protected handleInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.typed.set(input?.value ?? '');
}
```

Day 25's problem, unchanged by the framework. `event.target` is
`EventTarget | null` and an `EventTarget` has no `value`.

`instanceof HTMLInputElement` would be better than the cast, and it needs the
DOM constructors in scope — which `tsconfig.app.json` excludes via
`types: []`. So the cast stays, with the reason written next to it rather than
pretended away.

## Two-Way Binding, And Why I Did Not Use It

```html
[(ngModel)]="note"
```

I did not use it, and the reason is worth more than the feature.

**What it desugars to:**

```text
[(thing)]  ==  [thing]  +  (thingChange)
```

That is all. The "banana in a box" is a naming convention — any input named
`x` with a matching output `xChange` can be written `[(x)]`. Knowing that made
it stop looking like magic.

**Why not here:** `ngModel` needs `FormsModule` imported, and it couples the
field to a forms API this component has no other use for. Day 49 is reactive
forms, which is the right tool for a real form. For one field, `[value]` plus
`(input)` *is* the same two bindings written out.

### The one $any() in the project

```html
(input)="note.set($any($event.target).value)"
```

`$any()` is the template's escape hatch, and it exists because
`$event.target` is `EventTarget | null` and **a template cannot narrow a
type** — there is no `instanceof` in an expression language.

So the honest fix is a method on the class, which is what `handleInput` does.
That one is the version to copy; this one is here to show what the escape hatch
costs and that it should appear once, with an explanation, or not at all.

## The Interactive List

The first real interactivity this week: a status select and a Remove per row.

```ts
protected changeStatus(id: string, event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value ?? '';
    if (!isStatus(value)) return;      // the guard, again
    this.setStatus(id, value);
}

protected setStatus(id: string, status: Status): void {
    this.books.update((books) =>
        books.map((book) => (book.id === id ? { ...book, status } : book))
    );
}
```

Two things carried straight over from the React weeks:

**The guard.** A `<select>` gives a `string`; the action takes a `Status`.
`isStatus` is the only way in, so Week 4's `"readng"` typo still cannot reach
the state.

**A new array, not a mutation.** A signal holding a mutated array is Day 28's
bug in Angular clothing: the reference is unchanged, so nothing that depends on
it recomputes. `readonly Book[]` makes `.sort()` and `.push()` compile errors,
which is Week 5 still doing the work.

```text
count         : 3 books on the list.
Beloved badge : Reading
after status  : Finished | class: book-card book-card--finished
after remove  : 2 books on the list. | Things Fall Apart, An Undated Anthology
all removed   : 0 books on the list. | Everything removed. Press Reset to put them back.
after reset   : 3 books on the list.
```

## What I Learned

Interpolation takes an expression, not a statement. The restriction pushes
logic onto the class, which is where it is type-checked.

`[disabled]="false"` disables nothing; `disabled="false"` disables permanently.
Property and attribute are different targets and the attribute version fails in
the direction that looks correct.

`[attr.x]` is for attributes with no DOM property, and binding `null` removes
them.

`[class.x]`, `[class]` and a static `class` are three independent sources that
coexist. `[class]` replaces only what it set.

`[style.width.%]` appends the unit, which keeps string concatenation out of the
template.

`$event` is the real typed event, and `event.target` is still
`EventTarget | null` — the framework does not fix that.

`.update()` on a signal says "derived from the previous value" and does not
depend on when it runs.

`[(x)]` is `[x]` plus `(xChange)` and nothing else.

`$any()` exists because a template cannot narrow a type. The fix is a method on
the class.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  132.84 kB raw, 40.15 kB transfer
```

Every binding driven through jsdom:

```text
1 interpolation : The title is Beloved, 7 characters.
2 property      : enabled -> disabled, DOM property follows
3 attribute     : aria-describedby="title-help"
4 class         : book-card__note status-reading -> ... status-finished is-highlighted
  style         : width 40% -> 75%, label follows
5 events        : 0 -> 2 clicks, log appended; typed "hello"; Escape cleared it
6 two-way       : 4 characters
list            : status change, remove, empty state, reset - all correct
problems        : none
```

The class line is the one worth looking at twice: the static class, the toggled
class and the bound class are all present together, which is the behaviour I
was least sure of before testing it.

## Day 43 Outcome

Every Angular binding exercised with something observable on the page:
interpolation, property binding with the `disabled` trap demonstrated both
ways, attribute binding with `null` removal, three coexisting class sources, a
style binding with a unit suffix, and typed event handlers including a
`KeyboardEvent`. Two-way binding explained by what it desugars to rather than
used, and the single `$any()` in the project sitting next to the class method
that makes it unnecessary.

The reading list is interactive — status and remove per row, through signal
`.update()` with new arrays and the `isStatus` guard at the boundary.

Day 44 is control flow properly: `@if`, `@for` with its `track` and contextual
variables, `@switch`, `@empty`, and the deferred blocks.
