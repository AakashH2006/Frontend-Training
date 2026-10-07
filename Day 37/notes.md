# Day 37 - Unit and component testing

## Topics Covered

- Vitest reusing the Vite config, and why that is the reason to use it
- `environment: "jsdom"`, `setupFiles`, and `globals: false`
- `@testing-library/jest-dom/vitest`, and the types half of it
- `cleanup` between tests, and what breaks without it
- Testing a pure reducer: no React, no DOM
- Querying by role and by label, never by class
- `userEvent` against `fireEvent`
- `findBy*` and `waitFor`
- `MemoryRouter` and `initialEntries`
- `within`, and why it beats a test id
- Asserting on identity, to test a bail-out

## Practical Work

The first tests in this repo. **60 tests in three files.**

```text
src/test/setup.ts                   matchers, cleanup, one jsdom gap
vite.config.ts                      the test block
src/state/reducer.test.ts           26 tests - pure functions, no DOM
src/components/BookForm.test.tsx    17 tests - one component
src/routes/routing.test.tsx         17 tests - routes wired together
```

```bash
npm test          # vitest run
npm run test:watch
npm run typecheck # and this still has to pass too - see below
```

## Vitest, and why

It reuses `vite.config.ts`. The plugins, the aliases and the TypeScript
handling are already configured for the app, so **the tests compile exactly the
way the app does**. A separate Jest config would be a second place for those to
drift, plus a transform to keep in step.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        globals: false,
        include: ["src/**/*.test.{ts,tsx}"],
        css: false
    }
});
```

`vitest/config`, not `vite` — it re-exports `defineConfig` with the `test`
property declared. Importing from `"vite"` happened to typecheck while
vitest's types were in scope, which is not the same as being right.

`globals: false` is the default and I kept it. Every test file imports
`describe`, `it` and `expect`. It is more typing, and it means a test file has
no hidden dependencies — which matters because the same files have to typecheck
under the app's tsconfig.

`environment: "jsdom"` is the same jsdom I had been driving by hand all
fortnight. **Testing Library was the part that was missing, not the DOM.**

## Setup

Three things, and the second one is the one I would have forgotten.

```ts
import "@testing-library/jest-dom/vitest";

afterEach(() => { cleanup(); });
```

**The matchers.** `toBeInTheDocument`, `toBeDisabled`, `toHaveValue`,
`toBeInvalid`, `toHaveAccessibleDescription`. They are what make a failure say
"expected the element to be disabled" rather than "expected false to be true".

My first version imported the matchers and called `expect.extend(matchers)` by
hand. That works at runtime and then `tsc` rejects **every** matcher, because
nothing told TypeScript they exist. The `/vitest` entry point does both halves.

**`cleanup`.** Without it, each `render` appends another copy of the component
to the same document, and `getByRole("button", { name: "Save" })` fails with
"found multiple elements" in the *second* test — which looks like a bug in the
second test and was caused by the first.

The same reasoning put `window.localStorage.clear()` in a `beforeEach` in the
routing tests. A book saved in one test was still on the list in the next, and
the failure surfaced in the innocent one.

## The Reducer Tests Were The Easy Ones

That is not an accident. Day 31 moved this logic into a pure function and
pushed `crypto.randomUUID()` and `new Date()` out onto the action **so that
this would be possible**:

```ts
function add(b: Book): Action {
    const { id, addedAt, ...draft } = b;
    return { type: "book/added", id, addedAt, draft };
}

const state = applyAll([add(book()), { type: "editing/started", id: "b1" }]);
```

A fixed id and a fixed timestamp, because the test is about the reducer and not
about the clock. No mocking, no fake timers, no `vi.spyOn`. That decision felt
pedantic on Day 31 and it is the reason 26 tests are three lines each.

### Asserting on identity

```ts
const after = reducer(before, add(book({ title: "Changed" })));
expect(after).toBe(before);
```

`toBe`, not `toEqual`. The bail-outs from Day 31 return the **same reference**
so React skips the re-render, and identity is the only way to test that. It is
worth testing precisely because it is invisible otherwise — `toEqual` would
pass on a new object that happened to have the same contents, and the
performance behaviour would be silently gone.

### The test that was wrong

The first run had one failure, and it was my test:

```text
expected [ 'Beloved', 'Neuromancer' ] to deeply equal [ 'Beloved', 'Dune', 'Neuromancer' ]
```

Searching for `"o"`, I had expected `Dune` to match. Neither "Dune" nor "Frank
Herbert" contains an `o`. **The code was right and my expectation was wrong** —
which is the most useful kind of failure to get from a first test run, and a
reminder that a test is only evidence if I would have believed it either way.

## Component Tests: Query Like A User

```ts
const titleField = () => screen.getByLabelText("Title");
const submitButton = (name = "Add to list") => screen.getByRole("button", { name });
```

Every query is by role or by label. None is by class name or test id, and that
is not purity for its own sake:

> A test that finds a button by `.button--danger` passes after I rename the
> class and the button has stopped working, and fails after I restyle it and
> nothing has.

Querying by label is also an accessibility assertion. If `getByLabelText`
cannot find the field, a screen reader could not either — so these 17 tests are
quietly checking the Day 29 labelling work as well.

### userEvent, not fireEvent

```ts
const user = userEvent.setup();
await user.type(titleField(), "  Dune  ");
await user.selectOptions(statusField(), "reading");
await user.type(titleField(), "Dune{Enter}");
```

`userEvent` dispatches the full sequence a real interaction produces —
pointerdown, mousedown, focus, keydown, keypress, input, keyup — where
`fireEvent` dispatches one event.

That matters: a bare `change` sets the value **without ever focusing the
field**, so a test could pass while the form was unusable by keyboard. And
`{Enter}` tests that the real `<form>` submit still works, which switching the
button to a plain `onClick` would break silently.

This is also the thing my hand-rolled jsdom probes were approximating all
fortnight. Setting `input.value` directly does not trigger React's change
tracking, so I was reaching through the prototype's property descriptor by
hand. `userEvent` does that correctly, and it is one line.

### Asserting the accessible wiring

```ts
expect(title).toBeInvalid();
expect(title).toHaveAccessibleDescription("A title is required.");
```

`toHaveAccessibleDescription` resolves `aria-describedby`, so this asserts the
error is **associated with** the field rather than merely being a paragraph
somewhere nearby. Day 29 wired that up; nothing had checked it until now.

### Asserting the exact payload

```ts
expect(onSubmit).toHaveBeenCalledWith({ title: "Minimal", authors: [], status: "unread" });
```

The exact object, so an extra `year: undefined` would fail. That is Week 5's
`exactOptionalPropertyTypes` decision tested rather than assumed.

## Route Tests

```tsx
<MemoryRouter initialEntries={["/?q=dune"]}>
```

`MemoryRouter` is a router with no browser — the history is an array. That is
the whole reason a deep link is testable at all:

```ts
it("shows the not-found panel for a book id that is not on the list", () => {
    renderAt("/book/MISSING");
    expect(heading("Book not found")).toBeInTheDocument();
});
```

These are the tests that catch what unit tests miss: a route rendering the
right component with the wrong props, or a `Link` pointing at a path no route
matches. One of them walks the whole chain:

```ts
await user.click(await screen.findByRole("button", { name: "Save" }));
await user.click(screen.getByRole("link", { name: /Your list/ }));
await user.click(screen.getByRole("link", { name: "Result for dune" }));
await user.selectOptions(screen.getByLabelText("Status"), "finished");
await user.click(screen.getByRole("link", { name: "Back to your list" }));
// then assert the Finished count is 1
```

select → dispatch → reducer → selector → render, across three routes.

### findBy, and the thing my probes were working around

```ts
expect(await screen.findByText("Result for dune")).toBeInTheDocument();
```

`findBy*` retries until the element appears or it times out. The fetch resolves
on a microtask and the state updates after it, so a synchronous `getBy*` runs
before the results exist.

All fortnight my jsdom probes solved this with `await wait(200)` — a guess that
is both slower than necessary and flaky if it is ever too short. `findBy*` is
the correct version of that, and `waitFor` is the general form for an assertion
that is not a query.

### within, not a test id

Two of my tests failed on the first run with "found multiple elements":

```text
Found multiple elements with the text of: Search Open Library
Found multiple elements with the text: Finished
```

The first: "Search Open Library" is both the panel's heading — which names the
`<section>` through `aria-labelledby` — and the input's label. Narrowing to
`getByRole("searchbox", { name: ... })` is unambiguous and closer to how a user
finds the field.

The second: "Finished" is a summary tile, a filter button **and** a badge.

```ts
const summary = screen.getByRole("list", { name: "Status summary" });
const finished = within(summary).getByText("Finished").closest("li");
```

`within` is the answer to "found multiple elements" far more often than a test
id is — and it needed an app change, because the summary list had **no
accessible name at all**. A screen reader announced "list, 4 items" with no
idea what the list was. So a test ambiguity turned out to be a real
accessibility gap, which is Day 38's subject arriving a day early.

## Tests passing is not type-checking passing

The most useful thing I learned today.

All 60 tests passed, and `npm run typecheck` then failed:

```text
src/state/reducer.test.ts(307,48): error TS2379: Argument of type
'{ id: string; title: string; year: undefined; }' is not assignable to
'Partial<Book>' with 'exactOptionalPropertyTypes: true'.
```

`book({ year: undefined })` in a test helper. Vitest ran it happily — the types
are erased, which is Day 21's lesson again — and `tsc` was right to refuse it.

So **both** commands belong in the build. A test suite that passes while the
types are broken is a test suite that will not survive the next refactor, and
the whole point of the types is to make the refactor safe.

## What I Learned

Vitest reusing the Vite config means the tests compile the way the app does.
That is the main reason to prefer it here.

`@testing-library/jest-dom/vitest` registers the matchers *and* their types.
Calling `expect.extend` by hand gets only the runtime half.

`cleanup` in an `afterEach` and clearing storage in a `beforeEach` both prevent
one test's state leaking into the next — and the failure always appears in the
innocent test.

A pure reducer with ids and timestamps on the action needs no mocks at all. The
Day 31 decision paid for itself here.

`toBe` rather than `toEqual` is how to test a bail-out that returns the same
reference.

Query by role and by label. A class-based query passes when the thing is broken
and fails when it is merely restyled.

`userEvent` dispatches a real interaction sequence, including focus. `fireEvent`
sets a value without it, which can hide a form that is unusable by keyboard.

`findBy*` and `waitFor` replace the `setTimeout` guesses I had been using all
fortnight.

`MemoryRouter` with `initialEntries` makes a deep link a one-line test.

`within` beats a test id, and a query that is ambiguous for a test is often
ambiguous for a screen reader too.

`npm test` passing and `npm run typecheck` passing are different facts.

## Verification

```text
npm run typecheck   ->  0 errors
npm test            ->  3 files, 60 tests, all passing
npm run build       ->  clean
```

Breakdown:

```text
src/state/reducer.test.ts         26 tests  adding, editing, removing, status,
                                            view state, action creators, 11 selectors
src/components/BookForm.test.tsx  17 tests  validation, submitting, editing
src/routes/routing.test.tsx       17 tests  5 routes, search-to-list end to end,
                                            adding, filtering
```

Four failures across the first two runs, all of them mine rather than the
app's: one wrong expectation about which titles contain an "o", two ambiguous
queries, and one `year: undefined` that only `tsc` objected to. The third of
those produced a real accessibility fix.

## Day 37 Outcome

A test suite of 60 tests across three levels: a pure reducer and its eleven
selectors with no DOM, one component through its labels and roles with
`userEvent`, and the routes wired together in a `MemoryRouter` with a stubbed
`fetch`. No test queries a class name or a test id, every form field is found
by its label, and the inline error's `aria-describedby` wiring is asserted
rather than assumed.

Plus one accessible name added to the app because a test could not tell two
"Finished"s apart — and neither could a screen reader.

Day 38 is the rest of that: a keyboard and screen-reader pass over every route
and form, focus management on navigation, and a cleanup.
