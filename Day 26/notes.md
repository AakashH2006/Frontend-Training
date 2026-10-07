# Day 26 - React setup, JSX and components

## Topics Covered

- A React + TypeScript project with Vite
- `jsx: "react-jsx"`, and why there is no `import React`
- What JSX compiles to, and the rules that follow from that
- Components as functions of props
- `children` and `ReactNode`
- Fragments
- Lists, `.map`, and `key`
- Conditional rendering: `&&` against a ternary, and the falsy trap
- Purity, and what `<StrictMode>` is for
- `createRoot`

## Practical Work

Week 4's reading list page, as a component tree. Static data, no state, no
fetching — today is only about where the boundaries between components go.

```text
index.html                    one div
src/main.tsx                  createRoot + StrictMode
src/App.tsx                   composes, and nothing else
src/data.ts                   the static books
src/components/Header.tsx     no props
src/components/Panel.tsx      takes children
src/components/SummaryBar.tsx derives counts from books
src/components/BookList.tsx   the list, and the empty case
src/components/BookCard.tsx   one book
src/components/JsxNotes.tsx   the day's notes, on the page
```

```bash
npm install
npm run dev
npm run typecheck
```

The tree, which is the thing I was trying to be able to see:

```text
App
├── Header
├── Panel "Your list"
│   ├── SummaryBar
│   └── BookList
│       └── BookCard  (one per book)
└── Panel "What JSX compiles to"
    └── JsxNotes
```

Week 4's `render.js` had exactly this structure, and it was implicit in the
order the functions happened to call each other. Here it *is* the file.

## index.html got shorter

This was the first surprise. Week 4's `index.html` was 188 lines of markup with
four `<template>` elements. This one is:

```html
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

The templates are gone, and not because React has a different way of doing
templates. **A component is a better template.** A `<template>` is cloned and
then populated by hand — which is what `render.js` did, with
`queryIn(node, '[data-field="author"]')` to find the slot to write into. A
component takes typed arguments and returns a tree. The slots are parameters.

## There Is No import React

```json
"jsx": "react-jsx"
```

Not one file this week imports React, and every file uses JSX. `react-jsx` is
the modern transform: `<div />` compiles to a call to `_jsx` from
`"react/jsx-runtime"`, and the compiler adds that import itself.

The old value, `"react"`, compiled to `React.createElement`, which is why the
import used to be mandatory — the compiled output referenced a variable that had
to be in scope. Knowing which transform is configured is the difference between
that import being required and being dead code.

## JSX Is Function Calls

Everything odd about JSX follows from one fact: it compiles to function calls,
so what looks like an attribute is really an argument.

**`className`, not `class`.** The props map to DOM properties, and `class` is a
reserved word in JavaScript. Same reason a label takes `htmlFor`.

**Braces are TypeScript.** `{book.title}` is evaluated at render time and the
result is escaped before it reaches the DOM.

That last part quietly removed a decision I had to get right four times in
Week 4. `render.js` had a comment reminding me to use `textContent` and never
`innerHTML`, because titles come from a public API. In JSX, `{book.title}` is
escaped and there is no second option to pick wrongly. To get the dangerous
behaviour you have to write `dangerouslySetInnerHTML`, which is named that way
on purpose.

**One root node.** A component returns a single node, because the compiled form
is a single call. A fragment — `<>...</>` — groups siblings and renders no
element, which beats a `<div>` that exists only to satisfy the rule and then has
to be styled around.

**Capitalisation decides everything.** `<Panel />` compiles to a reference to
the `Panel` variable; `<panel />` compiles to the string `"panel"` and renders
an unknown element. Lowercase is a DOM tag, uppercase is a component. A typo in
the case is not a syntax error.

**Comments go in braces.** A `//` inside JSX renders as text.

### The first bug of the day

```tsx
Same reason <code>for</code> on a label is{" "}
<code>htmlFor</code>.
```

That `{" "}` is a deliberate space. JSX collapses whitespace that contains a
newline, so breaking a line between an element and the next word deletes the
space between them. The output read `…label ishtmlFor`, and I spent a minute
looking at the stylesheet before working out it was the JSX.

## Props

```tsx
<Panel id="list" title="Your list">
    <SummaryBar books={BOOKS} />
    <BookList books={BOOKS} />
</Panel>
```

`title="Your list"` is a string. `books={BOOKS}` is an expression — braces mean
"this is TypeScript, evaluate it". `books="BOOKS"` would pass the literal
string, and that is a mistake the types catch and plain JSX would not.

Everything between the tags arrives as the `children` prop, so `Panel` renders
two elements without knowing what either one is.

### ReactNode is the right type for children

```tsx
interface PanelProps {
    readonly title: string;
    readonly children: ReactNode;
    readonly id?: string;
}
```

`ReactNode` covers an element, a string, a number, an array of those, `null`,
`undefined` and `false`. That last one matters: `{condition && <Thing />}`
evaluates to `false` when the condition is false, so `false` has to be a legal
child.

`ReactElement` would be wrong. It is a single element, so `<Panel>text</Panel>`
and two children side by side would both fail to typecheck.

### Destructuring in the parameter list

```tsx
export function Panel({ title, children, id }: PanelProps) {
```

A component takes exactly one argument, the props object. Destructuring it in
the signature is the convention and it reads better than `props.title`
everywhere — and the annotation goes on the whole object, not on each name.

## Lists and keys

```tsx
{books.map((book) => (
    <BookCard key={book.id} book={book} />
))}
```

`.map` rather than a loop, because JSX children can be an array and `map`
produces one. Week 4's `DocumentFragment` is gone entirely — React does that
batching.

**`key` is not a prop the component receives.** `BookCard` never sees it. It is
how React matches an element in this render against the same element in the
previous one.

`book.id` because it is stable and unique. An index would compile and would be
wrong the moment the list is reordered or an item is removed from the middle:
React would keep the DOM node and swap the data underneath it, so any state
attached to that node — a focused input, a half-typed note — ends up on the
wrong row. There is no state today, which is precisely why it is worth getting
right today rather than debugging it on Day 28.

## Conditional rendering, and the falsy trap

Two forms, and they are not interchangeable.

```tsx
{/* something to show either way -> ternary */}
<p>{book.year === undefined ? "Publication year unknown" : `First published ${book.year}`}</p>

{/* this or nothing -> && */}
{book.note !== undefined && <p className="book-card__note">{book.note}</p>}
```

The trap, which is Day 22's falsy narrowing arriving in a new place:

```tsx
{count && <p>{count} books</p>}
```

When `count` is `0`, `&&` evaluates to `0` — and `0` is a perfectly valid React
child, so it renders a literal **0** on the page. An empty string renders
nothing visible but is the same mistake.

So the test is explicit rather than truthy. `book.note !== undefined`, not
`book.note`.

## Purity, and StrictMode

```tsx
<StrictMode>
    <App />
</StrictMode>
```

`<StrictMode>` deliberately renders every component **twice** in development.
Not a bug, and it does nothing at all in a production build.

It is there to make impure components obvious. A component that accumulates
into a variable outside itself, mutates its props, or pushes to a shared array
produces visibly different output when run twice. Today's components are pure —
same props in, same output, nothing outside touched — so the double render
changes nothing, which is the point of having the check on.

It also changed how I wrote `BookCard`: `authorLine` lives outside the
component, because it needs no props and recreating the function on every render
would be waste. That is the Day 20 `format.js` lesson again — pure functions do
not belong inside the thing that renders.

### Deriving rather than passing

`SummaryBar` takes the books and counts them. It deliberately does **not** take
the counts as props:

```tsx
<SummaryBar books={BOOKS} />
```

Day 20's rule was that a value calculable from state is not state. The same
applies to props. If `App` passed both the books and the counts, the two could
disagree, and the one that went stale would be a wrong number on screen with
nothing in the console.

One more detail there: it maps over `STATUSES` rather than over the counts
object, so the order is fixed and a status with zero books still gets a tile.
Iterating the counts would hide `Finished: 0`, which is information.

## createRoot

```tsx
const container = document.getElementById("root");

if (container === null) {
    throw new Error('Expected an element with id "root" in index.html and found none.');
}

createRoot(container).render(...);
```

`createRoot` is the React 18+ API — a root is created once and `.render` is
called on it. The old `ReactDOM.render` is gone.

And `getElementById` still returns `HTMLElement | null`, so Day 25's `mustFind`
reasoning applies to the one lookup this app has left. Throwing with the id in
the message beats a `!` that fails later inside React.

## What I Learned

A component is a better template than a `<template>`, because the slots are
typed parameters instead of elements to be found and written into.

With `jsx: "react-jsx"` the React import is unnecessary, because the compiler
adds the runtime import itself. The old transform compiled to
`React.createElement`, which is why the import used to be required.

JSX compiles to function calls, and every rule that looks arbitrary —
`className`, one root node, capitalisation mattering — follows from that.

`{expression}` escapes its result, which removes the `textContent` against
`innerHTML` decision rather than making it easier to get right.

JSX collapses whitespace containing a newline, so `{" "}` is sometimes real
content.

`ReactNode` is the type for children because it includes `false`, which is what
`{cond && <X/>}` produces.

`key` is not passed to the component. It is how React identifies an element
across renders, and an index breaks reordering in a way that only shows up once
there is state to lose.

`{count && <p/>}` renders a literal `0` when the count is zero. Conditions in
JSX should be explicit comparisons, not truthiness.

`<StrictMode>` double-renders in development to expose impure components, and
does nothing in production.

A component should derive what it can from the props it has, rather than being
handed a second copy that can go stale.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  tsc clean, vite build clean
```

Then the built bundle loaded into jsdom, to confirm the tree actually renders:

```text
h1              : Reading List
panels          : Your list | What JSX compiles to
aria-labelledby : list-heading, jsx-heading
summary tiles   : On the list=4, Unread=2, Reading=1, Finished=1
cards           : 4
   - Things Fall Apart   | Chinua Achebe  | First published 1958      | note: yes | Finished
   - Beloved             | Toni Morrison  | First published 1987      | note: no  | Reading
   - NW                  | Zadie Smith    | First published 2012      | note: no  | Unread
   - An Undated Anthology| Author unknown | Publication year unknown  | note: no  | Unread
problems        : none
```

The fourth row is the one I put the holes in deliberately: no authors and no
year, rendering as "Author unknown" and "Publication year unknown" rather than
as two blank lines. Week 5's lesson was that the missing cases are the ones
that render badly, so there has been a record with holes in it in the data from
the start.

The harness needed one fix: my first version read the DOM immediately after
evaluating the bundle and found an empty page with no errors. React's render is
scheduled rather than synchronous, so the inspection has to wait a tick. Worth
knowing before Day 37, when the tests arrive and that is the whole problem
`waitFor` exists to solve.

## Day 26 Outcome

A React + TypeScript project on Vite, with Week 4's page as six components:
one taking `children`, one deriving its own counts, one owning the empty case,
and one rendering a single book. All of them pure, under `<StrictMode>`, with
`key` from a stable id and every conditional written as an explicit comparison
rather than a truthiness check. Type-checks and builds clean under the same
strict options as Week 5, and the rendered output is verified against jsdom.

Day 27 is props and composition properly: typed props with defaults, reusable
presentational components, and conditional UI — still with no state, because
state is Day 28.
