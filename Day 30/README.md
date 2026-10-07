# Week 6 — React Fundamentals

The reading list as a React component tree. Typed props, lists with stable
keys, controlled inputs, and state ownership that can be explained rather than
guessed at.

## What this is

Five days building up React with TypeScript: one static page broken into
components, then props and composition, then state, then forms, then the whole
thing as one app.

The finished app for the week is:

`Day 30/Reading List React/`

No fetching and no `useEffect` anywhere this week — both are Week 7. The data
lives in state and is gone on reload, which is a deliberate limitation and the
first thing Week 7 fixes.

## How to run it

```bash
cd "Day 30/Reading List React"
npm install
npm run dev
```

Then open the address Vite prints. Every day this week is its own project with
the same four scripts:

```bash
npm run dev         # dev server, with Fast Refresh
npm run build       # tsc && vite build
npm run preview     # serve the production build
npm run typecheck   # tsc --noEmit
```

Same compiler options as Week 5 — `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters` and
`verbatimModuleSyntax` — with two additions React needs:

```json
"jsx": "react-jsx"
```

That is the modern transform, which is why **no file this week imports React**
even though every file uses JSX. The compiler adds the `react/jsx-runtime`
import itself.

## Folder layout

```text
Day 26/React Setup, JSX and Components/   one page, six pure components
Day 27/Props, Composition and Lists/      typed props, slots, union props
Day 28/Events and State/                  useState, events, functional updates
Day 29/Forms and Lifting State/           controlled inputs, validation, lifting
Day 30/Reading List React/                the week's build
```

Each day carries the previous day's components forward, so the diff between two
folders is the day's actual work.

## The final component tree

```text
App  (saved, query, filter, sort, editingId)
├── Panel "Add a book" | "Editing …"
│   └── BookForm            owns its draft and its errors
├── Panel "Your list"
│   ├── Stat × 4            derived counts
│   ├── FilterBar           owns nothing
│   └── BookRow × n         owns nothing
│       ├── Badge
│       └── Button × 2
└── (Panel, Button, EmptyState shared throughout)
```

## State ownership

The rule, and it is the thing the week was really about:

> State goes in the closest common parent of everything that **reads** it.

**In `App`**, because more than one component reads each one:

| State | Read by |
|-------|---------|
| `saved` | the form's duplicate check, the list, the summary tiles |
| `query`, `filter`, `sort` | `FilterBar` (to show them), `App` (to apply them) |
| `editingId` | `App` (which panel to show), and nothing else |

**Not in `App`**, deliberately:

| Not lifted | Why |
|------------|-----|
| the form's draft | only the form cares what is half-typed |
| the form's errors | same |
| `editing` | derived: `saved.find(b => b.id === editingId)` |
| `visible` | derived: filter + search + sort |
| the counts | derived |
| `isDuplicate` | derived |

"Lift state up" is advice about *sharing*, not a general instruction to move
state upwards. Lifting the form's draft would re-render the whole list on every
keystroke in a field the list has no interest in — which is the thing I would
have got wrong at the start of the week.

And `editingId` is a **string, not a `Book`**. Keeping the object would be a
second copy that goes stale the moment that book is edited.

## What I learned this week

- A component is a better template than a `<template>` element: the slots are
  typed parameters rather than elements to find and write into. Week 4's
  `index.html` was 188 lines with four templates; Week 6's is one `<div>`.
- JSX compiles to function calls, and every rule that looks arbitrary —
  `className`, one root node, capitalisation mattering — follows from that.
- `{expression}` escapes its result, which *removes* the `textContent` against
  `innerHTML` decision rather than making it easier to get right.
- JSX collapses whitespace containing a newline, so `{" "}` is sometimes real
  content.
- `ReactNode` is the type for children, because it includes `false` — which is
  what `{cond && <X/>}` produces.
- An element is just a value, so a prop can hold one. That is all a named slot
  is, and it replaces a growing pile of configuration props.
- `ComponentProps<"button">` inherits every native prop, and `Omit` is how to
  take a decision away from the caller when the component owns it.
- `type = "button"` as a default removes a bug Week 4 was preventing by hand in
  eleven places.
- Optional handler props allow combinations that are nonsense. A discriminated
  union on the props makes them not compile.
- Narrowing works on the props object, so the discriminant must not be
  destructured out of it.
- `{0 && <X/>}` renders a literal `0`. Conditions in JSX should be explicit
  comparisons.
- `key` is how React identifies an element across renders — it is not passed to
  the component. An index breaks reordering, and is correct only for a list
  that never reorders.
- `key` also means "this is a different thing", which is how to reset a
  component's state without an effect.
- The setter schedules a render; it does not assign. `setCount(count + 1)`
  three times adds one, because all three read the same captured snapshot.
- `useState([])` infers `never[]`, so an empty initial array needs an explicit
  type parameter.
- Mutating state leaves the reference identical, so React does not re-render —
  and returning the same reference on purpose is how to *skip* one.
- React batches every setter in a handler into one render.
- A controlled input needs both `value` and `onChange`; with only `value` it
  looks frozen.
- An input always gives a string, `type="number"` included — that attribute is
  a keyboard hint, not a validator.
- `useId` exists because a hard-coded id breaks on the second instance of a
  component.
- `useState`'s initialiser runs once, so state does not follow a changing prop.
- A uniqueness check has to exclude the thing being checked, or editing
  anything else about a record fails.
- Spread order decides which side wins, and the right order differs per case:
  defaults first when merging untrusted input, the patch last when applying an
  edit.

## What carried over from Week 5

The types did more work than I expected, and mostly in places that are not
about React at all:

- `readonly` state makes `.sort()` a compile error, which removes the mutation
  bug rather than requiring me to remember `toSorted`.
- A closed `Record<Sort, …>` of comparators means adding a sort option is a
  compile error until it has one. Week 4's `?? comparators.added` made a
  missing comparator a silent default instead.
- `exactOptionalPropertyTypes` is why `actions={cond ? <x/> : undefined}` and
  not `: null` — an absent optional prop and a `null` one are different.
- The `isStatus` / `isSort` / `isFilter` guards are what close the gap between
  the `string` a `<select>` returns and the literal union the action takes.
  Week 4's `"readng"` typo cannot get in.
- `K extends keyof Fields` on the form's single updater rejects a wrong value
  for a key, and replaced five near-identical handlers.

## Checks I ran

Every day type-checks and builds clean. Beyond that, each day's built bundle was
loaded into jsdom and driven through its actual event handlers, because
compiling is not working:

- **Day 26** — the tree renders; the deliberately sparse record (no author, no
  year) falls back to "Author unknown" and "Publication year unknown"
- **Day 27** — both card variants render from the union props, the `actions`
  slot renders, the empty state renders, every button has `type="button"`, and
  the literal-`0` trap is visible on the page as `[0]` beside `[]`
- **Day 28** — "+3 the wrong way" gives 1 and "+3 the right way" gives 4, and
  a handler that sets state then logs it prints the old value while the screen
  shows the new one
- **Day 29** — empty submit reports the required field, `aria-describedby`
  matches the error element's id, a bad year is rejected and the message clears
  on edit, a duplicate `"  dune  "` is caught against a saved `"Dune"`, and the
  lifted query and filter both narrow the list
- **Day 30** — three books added through the real form, sorted four ways,
  filtered, searched by author, edited twice (second edit starts fresh, which is
  the `key` working), renamed into a duplicate and rejected, re-statused,
  removed mid-edit, and cleared. No console errors at any point.

One thing the harness taught me that matters for Week 8: setting
`input.value = "x"` directly does **not** trigger a React change. React tracks
the value through a property descriptor on the prototype, so the test has to
call that setter and then dispatch the event — which is exactly what Testing
Library's `fireEvent.change` does, and Day 37 is where that stops being my
problem.

## Week 6 completion checkpoint

- [x] Typed props throughout, including a discriminated union where two
      variants exist
- [x] Lists rendered with stable keys from ids
- [x] Controlled inputs with validation and accessible error reporting
- [x] State ownership that is easy to explain, and written down above
- [x] No `any`, no `@ts-ignore`, no `useEffect`
- [x] Five daily commits

## Known limitations

Deliberate, and each one is somebody's job later:

- **Nothing persists.** Reload and the list is gone. Week 7, with a custom hook
  over `localStorage`.
- **No API.** The catalogue on Day 28 is a constant. Week 7.
- **All state is in `App`.** That is correct at this size and will not be at the
  next one — Week 7 moves it into a reducer and a context.
- **The author sort orders by forename**, because it sorts on the first
  author's full name. A surname sort needs a surname field; splitting on the
  last space breaks "Ursula K. Le Guin".
- **No tests.** Week 8.

## Next week

Week 7 is React state and data: normalising state so contradictions are not
representable, `useReducer` for multi-action logic, context for app-level
state, effects used only for genuine external synchronisation — and the
`useLocalStorage` hook that makes the list survive a reload.
