# Week 5 — TypeScript for Front-End Development

The Week 4 Reading List, migrated to TypeScript. First week in this repo with a
build step, and no framework yet.

## What this is

Four exercise days building up the language, then the Week 4 app rewritten with
every boundary typed and validated.

The finished project for the week is:

`Day 25/Reading List TypeScript/`

## How to run it

Every day this week is a Vite project with its own `package.json`. There is no
double-clicking `index.html` any more — the browser cannot run `.ts`, so the
file has to be compiled on the way through.

```bash
cd "Day 25/Reading List TypeScript"
npm install
npm run dev
```

Then open the address Vite prints. For Days 21–24 the work is in the console
(`F12`); Day 25 is the app.

Four scripts in every project:

```bash
npm run dev         # the dev server
npm run build       # tsc && vite build
npm run preview     # serve the production build
npm run typecheck   # tsc --noEmit  <- the one that matters
```

`typecheck` is separate on purpose. **Vite does not type-check** — it strips
types with esbuild and never reads them, so the dev server will happily serve a
file full of errors. `tsc --noEmit` is the only thing that actually checks, and
it is first in the `build` script so a type error fails the build.

## Folder layout

```text
Day 21/TypeScript Setup and Everyday Types/   primitives, unions, any vs unknown
Day 22/Functions and Narrowing/               functions, and the six ways to narrow
Day 23/Object Types, Aliases and Interfaces/  the model: API shape vs domain shape
Day 24/Generics, Classes and Modules/         Result<T,E>, Repository<T>
Day 25/Reading List TypeScript/               the migration
```

Days 23 and 24 are not only exercises. `model.ts`, `result.ts` and
`repository.ts` were written there and dropped into Day 25 **without an edit**,
which is why they were written there.

## The compiler options

`strict: true` from Day 21, plus five more that are not part of it:

| Option | What it caught |
|--------|----------------|
| `noUncheckedIndexedAccess` | `array[0]` is `T \| undefined` — the whole Week 4 crash class |
| `exactOptionalPropertyTypes` | "absent" and "present and undefined" are different states |
| `noUnusedLocals` | Variables left behind after a refactor |
| `noUnusedParameters` | The same, in callbacks |
| `verbatimModuleSyntax` | Type-only imports have to say `type` |

`noUncheckedIndexedAccess` is noisy and worth it. Every "cannot read properties
of undefined" I hit in Week 4 was that exact mistake.

## Exercise count

Days 21–24 carry 42 worked sections between them — 10 on everyday types, 12 on
functions and narrowing, 10 on object types, 10 on generics and classes — plus
the migration.

### Deliberate errors, pinned

Days 21–24 contain **41 intentional mistakes**, each marked:

```ts
// @ts-expect-error - "readng" is not a Status
const typo: Status = "readng";
```

`@ts-expect-error` asserts that the next line *is* an error, so if the line ever
stops being wrong the comment itself is reported as unused. A clean
`npm run typecheck` therefore proves two things at once: the real code is
correct, and every example is still broken in the way it is supposed to be.

`@ts-ignore` appears nowhere. It silences whatever happens to be on the line and
keeps silencing it after the code changes underneath.

**Day 25 has none.** It is the app, and it compiles clean.

## The model

The idea the week turns on, and it is Day 23's:

```text
OpenLibraryDoc   what the API sends - snake_case, nearly
                 everything optional, fields the app never draws

Book             what the app works with - camelCase, nothing
                 optional unless the UI renders the missing case

toBook()         the only crossing point
```

Every `??` in `toBook` is a decision about a missing field. Writing the two
types out separately is what forced each one to be made deliberately instead of
discovered later as a blank space on a card.

The rule: **a field is optional in my own types only when the app has something
real to display for the missing case.** So `authors` is `readonly string[]` and
never missing, which removes an `undefined` check from three other files;
`year` stays optional, because "unknown year" is genuinely different from any
number I could invent.

## What the migration actually changed

Not annotations. Two structural things.

**The state union.** Week 4's store was nine flat fields, and three
combinations were constructible and wrong — `phase: "error"` with a full
results array, `phase: "success"` with an error still set, `phase: "loading"`
with the previous query. As a five-member discriminated union they stop
existing, and `render`'s `default:` branch became an exhaustiveness check
instead of a guess that silently drew the success view.

**The boundaries.** `response.json()` and `JSON.parse` both return `any`.
Received as `unknown` instead, both now have a validation step, and that is the
single most important change in the week — one annotation that stops `any` from
spreading through the entire app.

A side effect worth noting: `getState()` got *faster*. Week 4 deep-copied the
saved list on every call because nothing else stopped a caller mutating it. With
`readonly` throughout, the snapshot can be the object itself.

## What I learned this week

- Vite does not type-check. `tsc --noEmit` is the only thing that does.
- `@ts-expect-error` fails when the code gets fixed; `@ts-ignore` never does.
- Suppressing a type error does not suppress the runtime error underneath it.
- `const` infers a literal type and `let` infers the widened one — the
  mechanism behind `as const`.
- `any` is the absence of a type; `unknown` is a type that must be narrowed.
  Boundaries should produce `unknown`.
- `readonly`, `as const`, `void` and `private` are all erased. I forced each one
  through with `@ts-expect-error` and watched it work at runtime. The type
  system constrains the code I write, not the code that runs.
- Declare return types on exported functions, or a mistake in the body becomes a
  union every caller has to handle.
- Truthiness narrowing is wrong whenever `0` or `""` is a real value — and the
  types cannot tell me that, because asking the wrong question still compiles.
- `typeof null === "object"`, so a `typeof` check never narrows away null.
- `catch` gives `unknown`, because `throw "a string"` is legal.
- A discriminated union makes illegal combinations unconstructible, and a
  `never` default turns a new member into a build error.
- A type predicate carries narrowing across a function call, and is trusted
  rather than verified — the body is all that stands behind it.
- `Record` over a literal union is a closed table, so adding a union member
  breaks every table until it is filled in.
- `lib` controls what the compiler believes exists; `target` controls emitted
  syntax. Neither changes what the browser can do.
- `private` is erased and reachable from JavaScript; `#` is enforced by the
  runtime.
- A constructor default for a dependency is what makes a class testable — it is
  why all five storage failure paths are exercised this week and only one was in
  Week 4.
- The DOM is where `strictNullChecks` costs the most, and one throwing lookup
  helper beats both twenty `!`s and twenty null checks.
- `cloneNode` gives `Node`, `event.target` gives `EventTarget | null`, and
  `dataset` entries give `string | undefined` — all three unchecked in working
  Week 4 code.

## What the types did not catch

Worth writing down, because a migration can oversell itself.

- Falsy-value bugs. `if (!page)` where `0` is valid compiles perfectly.
- Wrong logic. `visibleSaved` could filter the wrong field and compile.
- Data already written to disk by the old version. A guard at that boundary
  helps; no type reaches it.
- Anything about the real contents of `index.html`.
  `mustFind<HTMLInputElement>` is a claim about markup the compiler never sees.

## Checks I ran

- `npm run typecheck` clean on all five projects
- `npm run build` clean on all five
- Days 21–24 built and run under Node with a `document` stub, to confirm every
  section prints and nothing throws uncaught — three deliberate errors also
  throw at runtime and are in `try` blocks that report what they caught
- Day 25: a script cross-referencing all 24 `mustFind` ids and 12 template
  selectors against `index.html`, since a missing id is the one failure the
  helper introduced
- Day 25: the production bundle loaded into jsdom with `fetch` stubbed, driving
  a real search and save through the actual event handlers — results render, a
  deliberately sparse record maps to "Untitled / Author unknown / Publication
  year unknown", the save button disables, and the summary tiles compute
  (`Oldest=1958`, `Commonest decade=1950s`). No console errors.
- All five storage failure paths forced on Day 24 through an injected
  `MemoryStorage`: empty, corrupt JSON, wrong version, one bad row among good
  ones, quota, and storage blocked entirely

## Week 5 completion checkpoint

- [x] TypeScript project compiles cleanly
- [x] Domain and API data are typed, as two separate shapes with one mapping
- [x] No unexplained `any` — the only `any` in the week is one section
      demonstrating why not to use it
- [x] No `@ts-ignore` anywhere
- [x] Code split into modules with one-way dependencies
- [x] Five daily commits

## Next week

Week 6 is React fundamentals: a React + TypeScript project with Vite, the
reading list as a component tree, typed props, lists with stable keys, `useState`
and controlled inputs — and state ownership that can be explained rather than
guessed at.
