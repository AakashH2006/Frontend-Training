# Day 21 - TypeScript setup and everyday types

## Topics Covered

- A Vite + TypeScript project, and why there is a build step now
- `tsc --noEmit` against `vite build`, and which one actually checks types
- `strict`, and the four extra options I turned on beyond it
- Primitives, and what inference gives `const` against `let`
- Arrays, tuples, and `noUncheckedIndexedAccess`
- Object types, optional properties, excess property checks
- Unions, type aliases, literal types
- `any` against `unknown`
- `strictNullChecks` and the DOM
- Assertions, `as unknown as`, and `satisfies`
- `enum` against a union of literals, and `as const`

## Practical Work

First day of Month 2, and the first day in this repo with a build step.

```text
package.json          vite + typescript, and four scripts
tsconfig.json         the compiler options, commented
index.html            the Vite entry point
src/main.ts           the entry module
src/everyday-types.ts the ten sections - the actual work
src/vite-env.d.ts     one line, and it fixes a real error
src/styles.css        the Week 3 runner stylesheet, imported from main.ts
```

Ten sections printing to the console, in the same shape as the Week 3 exercise
files. The difference is that this file is checked before it runs.

```bash
npm install
npm run dev        # the app
npm run typecheck  # tsc --noEmit - the part that matters
```

### Deliberate errors that have to stay errors

The file contains thirteen mistakes on purpose, each one marked:

```ts
// @ts-expect-error - "readng" is not a Status
const typo: Status = "readng";
```

`@ts-expect-error` asserts that the next line **is** an error. If the line ever
stops being wrong, TypeScript reports the *comment* as unused and the check
fails. So `npm run typecheck` passing clean does two things at once: no real
errors, and all thirteen fake ones still broken in the way I expected.

That is the difference from `@ts-ignore`, which silences whatever happens to be
on the line and keeps silencing it after the code changes underneath. I have not
used `@ts-ignore` anywhere.

Three of the deliberate errors also throw at runtime, which I did not think
about until the console stopped halfway through section 4. A type error and a
runtime error are the same mistake caught at two different times, and
`@ts-expect-error` only suppresses the compiler — the line still runs. Those
three are in `try` blocks now, which turned out to be the most useful thing in
the file:

```text
threw, as the compiler said it would: Cannot read properties of undefined (reading 'toUpperCase')
threw: e.toUpperCase is not a function
```

That is Week 4's debugging experience, arriving a step earlier and with the
line number of the cause rather than the line number of the symptom.

## The Build Step

Days 1 to 18 opened in a browser. Day 19 needed a server. Today needs a
compiler, because no browser runs `.ts`.

What surprised me: **Vite does not type-check.** It strips the types out with
esbuild and never looks at them. The dev server will happily serve a file full
of type errors, and the page will work right up until the moment the mistake
matters.

```json
"scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit"
}
```

So `tsc` is in the build script ahead of `vite build`, and `&&` is doing real
work there — a type error fails the build instead of shipping. And `typecheck`
exists on its own because that is the command I actually want while writing.

This split confused me for a while: the editor shows red squiggles, the dev
server shows a working page, and both are correct. The editor is running the
language service; Vite is not running anything.

### The extension rule reverses

Day 19's hard-won lesson was that the `.js` extension is **required**, because
an import specifier is a URL and nothing resolves it:

```js
import * as store from "./js/state.js";   // Day 19 - required
```

Today the opposite:

```ts
import { run } from "./everyday-types";   // Day 21 - Vite resolves it
```

Both are right, and the reason is who does the resolving. In a plain browser
module, nobody does. With a bundler, the bundler does — and
`"moduleResolution": "bundler"` in tsconfig.json is me telling the compiler to
assume exactly that, so it stops asking for an extension.

### One line that fixed a real error

```ts
/// <reference types="vite/client" />
```

`import "./styles.css"` in `main.ts` gave me:

```text
Cannot find module './styles.css' or its corresponding type declarations.
```

TypeScript is right. A CSS file is not JavaScript and has no exports — the
import only means anything because Vite rewrites it. That reference pulls in
Vite's ambient declarations, which declare `*.css`, `*.svg` and the rest as
modules. A `.d.ts` file is types only: it declares what exists without defining
it, and emits nothing.

## tsconfig

`strict: true` from the first day, on purpose. Turning it on later means fixing
every file at once.

The two parts of `strict` that change daily work:

- **`noImplicitAny`** — a parameter with no annotation and nothing to infer
  from is an error, not a silent `any`.
- **`strictNullChecks`** — `null` and `undefined` stop being members of every
  type, so anything that might be missing has to be handled.

Four more that are not in `strict` and all caught something:

| Option | What it catches |
|--------|-----------------|
| `noUnusedLocals` | The variable I left behind after a refactor |
| `noUncheckedIndexedAccess` | `array[0]` is `T \| undefined`, not `T` |
| `exactOptionalPropertyTypes` | Assigning `undefined` to an optional property |
| `noFallthroughCasesInSwitch` | A missing `break` |

`noUncheckedIndexedAccess` is the one worth talking about.

```ts
const years: number[] = [1979, 1999, 2013];
const first = years[0];
//    ^? number | undefined
```

TypeScript cannot know an index is in range, so indexing gives back a maybe.
This is noisy — it needs a guard, a `??` or a length check at every array
access — and it is still worth having on, because **every** "cannot read
properties of undefined" I hit in Week 4 was this exact mistake.

## Inference

The thing I would have got wrong if I had guessed:

```ts
const title = "Reading List";   // type: "Reading List"  (the literal)
let   label = "unread";         // type: string          (widened)
```

A `const` can never be reassigned, so its type can be the exact value. A `let`
can, so the type has to cover everything it might hold. This is not a detail —
it is why `as const` works at the bottom of section 10, and it is why passing a
`let` string where a literal union is expected fails while passing a `const`
succeeds.

The rule I settled on for annotations: **annotate the boundaries, infer the
inside.** Parameters, return types and anything arriving from outside the
program get written down. A local with an initialiser does not, because then the
same fact is written twice and the two copies can disagree later.

## any against unknown

```ts
const loose: any = "not a number";
loose.toFixed(2);   // compiles. throws.
loose();            // compiles. throws.
new loose();        // compiles. throws.
```

`any` is not a type. It is switching the checker off for that value, and every
line above is accepted.

`unknown` is the honest version — a value whose type is not known *yet*:

```ts
const safe: unknown = JSON.parse('{"title":"Beloved"}');

safe.title;   // error: cannot read a property of unknown

if (typeof safe === "object" && safe !== null && "title" in safe
    && typeof safe.title === "string") {
    console.log(safe.title);   // fine
}
```

Four checks to read one property, and all four are checks `JSON.parse` genuinely
deserves, because its return type is honestly unknown — the string came from
somewhere else.

So: `unknown` at every boundary — `JSON.parse`, a fetch body, `localStorage`, a
file the user chose — and `any` only with a comment explaining why. The course
rule is no unexplained `any`, and this is the reason behind it. `any` does not
describe a value; it describes giving up on one.

## Literal Unions

This is the feature that justifies the whole week for me.

```ts
type Status = "unread" | "reading" | "finished";

const typo: Status = "readng";   // error
```

In Week 4, `setStatus(id, "readng")` was a typo that produced a card with no
badge, no error in the console, and nothing to search for. The `STATUSES`
array and an `includes` check were my defence, and they worked at runtime,
after the fact. Now it does not compile.

### satisfies

The operator I did not expect to like.

```ts
const palette = {
    unread: "#5a646e",
    reading: "#17457f",
    finished: "#1d6b3f"
} satisfies Record<Status, string>;
```

It checks the value against the type **without widening it to that type**. A
missing status or a non-string is an error, and `palette.reading` keeps its
literal type `"#17457f"`.

With `: Record<Status, string>` instead, the annotation wins and
`palette.reading` becomes plain `string`. Same check, less information kept.

### enum against as const

A string `enum` is one of the few TypeScript features that **emits JavaScript**.
Everything else today is erased; the enum object is real code in the bundle.

It is also nominal, which is the part that makes it awkward at a boundary:

```ts
const fromApi = "reading";
const asUnion: Status = fromApi;        // fine
const asEnum: LegacyStatus = fromApi;   // error
```

The API sends a string. The union accepts it; the enum does not. So: union of
literals by default. When the iterable runtime list is genuinely wanted,
`as const` gives it without the nominal typing:

```ts
const STATUSES = ["unread", "reading", "finished"] as const;
type Status = (typeof STATUSES)[number];
//   ^? "unread" | "reading" | "finished"
```

One array, and the type is derived from it. The list and the type cannot
disagree, because there is only one of them.

## Assertions

```ts
const input = document.getElementById("query") as HTMLInputElement | null;
```

Reasonable. `getElementById` cannot know the element is an input, and the
`| null` keeps the part it *can* know.

```ts
const lie = "1987" as unknown as number;
typeof lie;   // "string"
```

Not reasonable. `as unknown as` is the tell: a single `as` between unrelated
types is itself an error, and routing through `unknown` only defeats that check.
Writing it means deliberately stepping around the one thing stopping the
mistake.

The non-null assertion is the same kind of claim:

```ts
const el = document.getElementById("output")!;
```

It compiles to nothing. It is not a check — it is me promising, and the runtime
error comes back unchanged if the promise is wrong.

## What I Learned

Vite does not type-check. It strips types with esbuild and never reads them, so
the dev server serves broken types happily and `tsc --noEmit` is the only thing
that actually checks.

`@ts-expect-error` is an assertion that the next line is wrong, so it fails when
the code gets fixed. `@ts-ignore` just silences, and keeps silencing.

Suppressing a type error does not suppress the runtime error underneath it. They
are the same mistake caught at two different times.

Import extensions are required in the browser and optional with a bundler,
because the question is only ever who resolves the specifier.

`const` infers a literal type and `let` infers the widened one, which is the
mechanism behind `as const`.

`noUncheckedIndexedAccess` turns `array[0]` into a maybe. It is noisy and it is
the exact class of bug I spent Week 4 chasing.

`readonly` is erased. A forced `push` through `@ts-expect-error` really does add
to the array — I printed the length afterwards to be sure. Compile-time claims
protect the code I write, not the code that runs.

`any` is the absence of a type; `unknown` is a type that has to be narrowed.
Boundaries should produce `unknown`.

Excess property checks only apply to fresh object literals. Assign through a
variable and the extra properties are fine, because that is ordinary structural
compatibility.

`satisfies` checks without widening, which keeps literal types that an
annotation would throw away.

A string enum emits a runtime object and is nominal, so it rejects the plain
string an API actually sends. A union of literals plus `as const` gives the
same safety, an iterable list, and no emitted code.

## Verification

```text
npm run typecheck   ->  0 errors
npm run build       ->  tsc clean, 5 modules transformed, built in 128ms
```

I also ran the built bundle under Node with a small `document` stub, to prove
the three `try` blocks catch what they claim and nothing else throws. All ten
sections print and the run reaches the end.

## Day 21 Outcome

A Vite + TypeScript project that type-checks clean under `strict` plus four
extra options, with ten worked sections on the everyday types. Thirteen deliberate
errors are pinned with `@ts-expect-error`, so the clean type-check proves both
that the real code is correct and that every example is still wrong. No `any`
anywhere except one section demonstrating why not to use it, and no
`@ts-ignore` at all.

Day 22 is functions and narrowing: typing parameters, returns and callbacks,
then `typeof`, truthiness, equality, `in` and discriminated unions — the part
that makes a union usable rather than just safe.
