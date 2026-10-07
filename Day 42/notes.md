# Day 42 - Standalone components and composition

## Topics Covered

- Selectors, and why they are prefixed
- `imports` as the dependency declaration
- `<ng-content>`, and how it differs from React's `children`
- Named slots with `select`
- Which context projected content is compiled in
- `:host`, and the inline-wrapper problem
- `host: { class: ... }`, and when the component *is* the element
- An inline `template` against a `templateUrl`
- `computed()` in place of a getter
- `[attr.x]` against `[x]`

## Practical Work

Six components, composed. No state beyond two constants.

```text
src/app/panel.ts + .html + .css   ng-content, a named slot, :host
src/app/badge.ts                  inline template, computed class
src/app/stat.ts                   inline template, host class
src/app/empty-state.ts            projects a hint
src/app/book-card.ts + .html      composes Badge
src/app/book-list.ts + .html      the list, and the empty case
src/app/app.ts + .html            composes all of it
```

```text
App
├── Panel "Summary"      projects Stat × 4
├── Panel "Your list"    projects a button into panel-actions, plus BookList
│   └── BookList → BookCard → Badge, or EmptyState
└── Panel "The empty case"
```

## imports Is The Dependency Declaration

```ts
@Component({
    selector: 'app-root',
    imports: [Panel, Stat, BookList],
    templateUrl: './app.html'
})
```

This is the part of standalone components I like most. A component's
dependencies are written **on the component**, so deleting it cannot leave a
dangling registration somewhere else. With an NgModule, `declarations` and
`imports` lived in a file that knew about everything, and removing a component
meant remembering to edit it.

And forgetting an import is a compile error naming the unknown element — better
than React's equivalent failure, which is a lowercase tag rendering silently
as an unknown element (Day 26).

### Selectors are global

```ts
selector: 'app-badge'
```

`app-` is the prefix from `angular.json`, and prefixing is not cosmetic: a
selector is global, so an unprefixed `<badge>` would collide with any library
that had the same idea. React components are imported bindings, so two
`Badge`s in two files never collide. Angular's are matched by tag name, so they
can.

## ng-content Is Not children

React passes children as a prop, because an element is a value. Angular cannot
do that — a template is compiled, not a value — so `<ng-content>` is a
*placeholder* saying where to project the caller's markup.

```html
<!-- panel.html -->
<div class="panel__head">
    <h2>{{ heading() }}</h2>
    <div class="panel__actions">
        <ng-content select="[panel-actions]" />
    </div>
</div>
<ng-content />
```

```html
<!-- app.html -->
<app-panel heading="Your list" headingId="saved">
    <button panel-actions type="button" class="button button--quiet button--small">Clear</button>
    <app-book-list [books]="books()" />
</app-panel>
```

### The named slot needs no prop

Day 27 gave the React `Panel` an `actions` prop holding an element. Here
`select="[panel-actions]"` claims anything the caller marks with that
attribute, and `Panel` needs **no prop for it at all**.

```text
named slot : (empty) | Clear | (empty)
```

Tidier than the prop, and harder to discover from the outside — you have to
read `panel.html` to know the slot exists, whereas a prop is in the type.

**Order matters**, and it is not obvious: a selected `<ng-content>` has to come
before the catch-all, or the catch-all swallows everything first.

### Projected content is compiled in the caller's context

The thing that genuinely differs, and it took a moment to accept.

```html
<app-panel heading="Summary">
    <app-stat label="On the list" [value]="total()" />
</app-panel>
```

That `total()` is a field on **App**, not on Panel. Projected markup is
compiled where it was written, so it can read the caller's fields and cannot
read the component it is projected into.

Which is the opposite of how a template normally works — a component's own
template sees only its own class — and it is the right behaviour, because the
caller wrote that markup.

### :empty instead of a prop

```css
.panel__actions:empty { display: none; }
```

The wrapper collapses when nothing was projected. The alternative is an `@if`
around it, which needs Panel to know whether the caller passed anything — and
that is awkward to ask (`ContentChild`, or a signal query). CSS answers it
without the component having to.

```text
actions collapsed? : 0,1,0   <- children: none, one, none
```

## :host, and the Inline Wrapper

The first layout oddity I hit:

```css
:host { display: block; }
```

`<app-panel>` is a real element in the DOM, and by default it is
`display: inline` wrapping a block `<section>`. `:host` is the only selector
that reaches a component's own element — it is otherwise unstyleable from
inside its own stylesheet.

React has nothing equivalent because a React component renders *no* wrapper
element of its own.

### When the component is the element

`Stat` renders two spans and needs to *be* an `<li>`:

```ts
host: { class: 'summary__tile' }
```

Wrapping the spans in an `<li>` inside the template would put
`<li>` inside `<app-stat>` inside `<ul>`, which is invalid HTML. So the host
element gets the class instead:

```text
stat host class : summary__tile
```

This is the first time "a component is an element" has cost me something that
React's model did not have. React would render the `<li>` and no wrapper.

## [attr.x] against [x]

```html
<section [attr.aria-labelledby]="headingId() ? headingId() + '-heading' : null">
```

`aria-labelledby` is an **attribute** with no matching DOM property, so plain
property binding has nothing to set. `attr.` tells Angular to set the attribute
— and binding `null` removes it entirely, which is why the ternary gives `null`
rather than `""`.

This property/attribute distinction does not exist in JSX, where React maps the
names. Day 43 covers it properly; it turned up here because a region needs its
accessible name.

```text
aria-labelledby : summary-heading, saved-heading, empty-heading
```

## Inline template, or a file

The CLI always generates a separate file. The rule I settled on: **inline when
it fits on one line and nothing in it needs formatting.**

```ts
template: `<span [class]="className()">{{ label() }}</span>`
```

`Badge` and `Stat` are inline; `Panel`, `BookCard`, `BookList` and `App` are
files. The threshold is readability rather than a line count — the moment a
template has nesting, it wants its own file and an editor that knows it is
HTML.

## computed() instead of a getter

Day 41 used a getter:

```ts
protected get total(): number { return this.books().length; }
```

Day 42 uses a computed:

```ts
protected readonly total = computed(() => this.books().length);
```

The getter runs on **every change-detection pass**; the computed recalculates
only when `books` changes. At three books the difference is nothing — it is
here because a computed *reads as a value* while a getter reads as a call that
might do anything, and Day 46 is about this properly.

The same reasoning moved `authorLine` out of `BookCard`'s template:

> Anything with more than a ternary belongs on the class. A template that needs
> explaining is a template doing the class's job.

Which is the same instinct as Day 20 pulling `format.js` out of `render.js`.

## What I Learned

A component's `imports` list is its dependency declaration, which is better
than a central module and catches a missing component at compile time.

Selectors are global and matched by tag name, so the prefix is a real namespace
rather than a convention.

`<ng-content>` is a placeholder, not a value. It cannot be stored in a prop,
and a named slot replaces a prop entirely.

Projected content is compiled in the caller's context — it reads the caller's
fields, not the host component's.

`:host` is the only way to style a component's own element, and without
`display: block` it is an inline wrapper around block content.

`host: { class: ... }` is the answer when the component has to *be* a specific
element, which is a problem React does not have.

`[attr.x]` is for attributes with no DOM property, and binding `null` removes
them.

A computed is a value; a getter is a call that runs on every change-detection
pass.

## Verification

```text
npm run typecheck   ->  tsc -b --force, 0 errors
npm run build       ->  122.26 kB raw, 36.89 kB transfer
```

Rendered in jsdom:

```text
panels            : Summary | Your list | The empty case
aria-labelledby   : summary-heading, saved-heading, empty-heading
stats (projected) : On the list=3, Unread=1, Reading=1, Finished=1
stat host class   : summary__tile
named slot        : (empty) | Clear | (empty)
actions collapsed?: 0,1,0
cards             : 3
   - Things Fall Apart   | Chinua Achebe  | First published 1958     | note: yes | Finished
   - Beloved             | Toni Morrison  | First published 1987     | note: no  | Reading
   - An Undated Anthology| Author unknown | Publication year unknown | note: no  | Unread
empty states      : 1  "This list is deliberately empty. Nothing to show here yet."
host scope attr   : _nghost-ng-c2303051261
problems          : none
```

Four things that are specifically today's work and are visible there: the stats
were projected through `Panel` and still read `App`'s `total()`; the `Clear`
button landed in the named slot and the other two panels' action wrappers are
empty and collapsed; `Stat`'s class is on its host element; and
`_nghost-ng-c2303051261` is the attribute that makes `:host` work.

The build grew by 5 kB over Day 41 for five more components, which is the
compiler including only what the templates reference.

## Day 42 Outcome

Six focused standalone components: a panel with a default and a named content
slot, two with inline templates, one that styles its own host element because
it has to be an `<li>`, and a list that owns its empty case. Projection
verified as compiling in the caller's context, `:host` and `:empty` doing jobs
that would otherwise need props, and every derived string moved out of the
templates onto the classes as a `computed`.

Day 43 is binding properly: interpolation, property, attribute and class
binding, event listeners, and two-way binding where it is actually warranted.
