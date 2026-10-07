# Day 24 - Generics, classes and modules

## Topics Covered

- What a generic is for, against `any` and `unknown`
- Type parameter inference, and when to be explicit
- Constraints with `extends`
- `keyof` as a constraint — `pluck` and `groupBy`
- Generic classes
- Parameter properties, `private` against `#`, `protected`, `implements`
- Returning `this`
- `Result<T, E>` as a generic discriminated union
- A typed `Repository<T>` over `localStorage`
- Generic defaults, and when a type parameter is only ceremony
- Module boundaries, `import type`, and a circular import I backed out of

## Practical Work

Four files, and two of them are not exercises.

```text
src/model.ts       carried forward from Day 23, unchanged
src/result.ts      Result<T, E> and its helpers
src/repository.ts  Repository<T> over localStorage
src/generics.ts    the ten sections
```

`result.ts` and `repository.ts` are the real thing — Day 25's migration imports
both. `repository.ts` is Week 4's `storage.js` with the item type lifted out.

## What a Generic Is For

Three ways to write "give me the first item":

```ts
function firstAny(items: readonly any[]): any { return items[0]; }
function firstUnknown(items: readonly unknown[]): unknown { return items[0]; }
function first<T>(items: readonly T[]): T | undefined { return items[0]; }
```

`any` compiles and loses the caller's type — `a.nonsense` would also compile.
`unknown` is honest and useless: the caller has to narrow a type they already
knew before calling. The generic writes down the *relationship* between the
argument and the return value.

`T` is not a type. It is a placeholder filled in per call site, and it is erased
like everything else this week.

Note the return type is `T | undefined`, not `T`. That is
`noUncheckedIndexedAccess` doing its job, and it is correct — an empty array has
no first item, and saying so in the type is the difference between this helper
and a crash.

### The test for whether a generic earns its place

I nearly wrote this:

```ts
function pointless<T>(value: T): string { return String(value); }
```

`T` appears in exactly one position and nothing depends on it. That is `unknown`
with ceremony.

> A type parameter earns its place when it appears in at least two positions, so
> it describes a relationship.

`first<T>` relates the array to the return value. `pluck<T, K>` relates the
object, the key and the result. `pointless<T>` relates nothing.

Same story for overloads. Three signatures for one behaviour:

```ts
function format(value: string): string;
function format(value: number): string;
function format(value: string | number): string { ... }
```

A union says it in one line. Overloads earn their place when the return type
*depends on* the argument type, which a union cannot express.

## Constraints

Unconstrained `T` can be anything, so the body can do nothing with it:

```ts
function brokenLongest<T>(items: readonly T[]): T | undefined {
    return items.toSorted((a, b) => b.length - a.length)[0];
    //                                 ^ property length does not exist on type T
}
```

The constraint is the fix, and it says exactly how much the body needs to know:

```ts
function longest<T extends { length: number }>(items: readonly T[]): T | undefined
```

Strings and arrays both qualify; `longest([1, 2, 3])` is an error.

### A lib version I had to change

`toSorted` did not exist. The error was:

```text
Property 'toSorted' does not exist on type 'readonly T[]'
```

...and the cause was `"lib": ["ES2022", ...]` in my tsconfig. `toSorted` is
ES2023. The method exists in the browser I am using either way — `lib` does not
change what runs, it changes **what the compiler believes exists**.

That is a sharper version of a thing I thought I already understood. `target`
controls what syntax is emitted; `lib` controls which built-ins are declared.
Setting `lib` too high means code that compiles and throws in an older runtime;
too low means a method I can use being reported as missing. Week 5's tsconfigs
are all `ES2023` now.

## keyof Constraints

The signature that convinced me generics were worth the syntax:

```ts
function pluck<T, K extends keyof T>(items: readonly T[], key: K): readonly T[K][] {
    return items.map((item) => item[key]);
}
```

Two parameters with a relationship between them. `K` must be a key of `T`, and
the return type is the type *of that key*:

```ts
pluck(books, "title");      // readonly string[]
pluck(books, "year");       // readonly (number | undefined)[]
pluck(books, "publisher");  // error - not a key of Book
```

And because the return type tracks the key, this is a compile error rather than
a runtime surprise:

```ts
const wrong: readonly number[] = pluck(books, "title");   // error
```

`groupBy` is the other one, and it has the single assertion in the file:

```ts
const groups = {} as Record<K, T[]>;
```

It is a lie for exactly as long as the loop takes. The honest alternative,
`Partial<Record<K, T[]>>`, pushes an `undefined` check onto every caller for a
value that is always there by the time they see it. Written down here because
that is the rule this week: no unexplained assertion.

## Classes

The class exists in `repository.ts` for one reason: **there is state to hold.**
The key, the version and the validator are fixed at construction and used by
every method afterwards. Functions would mean passing all three to each call, or
closing over them in a factory — which is a class with extra steps.

### Parameter properties

```ts
constructor(
    private readonly key: string,
    private readonly version: number,
    private readonly isValid: Validator<T>,
    private readonly storage: Storage = localStorage
) {}
```

A modifier in the parameter list declares the field, assigns it and marks it
readonly. Four lines instead of twelve.

The `storage` default is the thing I would not have thought of a week ago. It
makes the class testable: section 8 passes a `MemoryStorage` and forces all
five failure paths. Week 4's `storage.js` reached for `localStorage` directly,
so the quota path was untestable and I only ever saw it by filling the quota by
hand.

### private against #

```ts
console.log(entry.status);                                    // error: private
console.log((entry as unknown as Record<string, unknown>)["status"]);  // "reading"
```

```text
private is compile-time only: reading
```

`private` is erased. It stops me writing the access and does nothing at runtime.
`#progress` is different — it is a language-level private field, enforced by the
runtime, and `entry.#progress` from outside the class is a *syntax* error rather
than a type error.

So `#` for anything that genuinely must not be reachable, which is why the
repository's `#available` uses it. `private` elsewhere, as documentation with
compiler support.

### Returning this

```ts
advance(to: Status, progress: number): this { ...; return this; }
```

`this` as a return type rather than `ReadingEntry` is what keeps a chained call
on a subclass typed as the subclass:

```ts
const chained: AnnotatedEntry = annotated.advance("reading", 10);   // fine
```

With `: ReadingEntry` that assignment would need a cast.

## Result<T, E>

```ts
type Result<T, E = Error> =
    | { readonly ok: true;  readonly value: T }
    | { readonly ok: false; readonly error: E };
```

Day 22's discriminated union with the payload types left as parameters, so one
declaration covers every operation that can fail.

Why it exists: Week 4's `storage.js` returned `{ ok: false, reason: "quota" }`
and `{ ok: true }` from the same function as a plain untyped object. Nothing
stopped a caller reading `.value` on a failure, and nothing reminded them to
check `.ok` at all. Now:

```ts
console.log(bad.value);   // error: value does not exist on the failure member
```

### The never trick in the constructors

```ts
function ok<T>(value: T): Result<T, never> { return { ok: true, value }; }
function err<E>(error: E): Result<never, E> { return { ok: false, error }; }
```

`never` has no values, so the failure member of `Result<T, never>` is
uninhabitable and collapses away. The effect is that `ok(1)` is assignable to
`Result<number, string>`, `Result<number, Error>` and anything else — the error
type stays free until the context pins it down.

```text
ok() fits any error type: true true
```

### map returns the failure unchanged

```ts
function map<T, U, E>(result: Result<T, E>, f: (value: T) => U): Result<U, E> {
    return result.ok ? ok(f(result.value)) : result;
}
```

`return result`, not `err(result.error)`. Narrowing has already proved it is the
failure member, and that member does not mention the success type at all — so
the same object is a valid `Result<U, E>`. Rebuilding it would allocate for
nothing.

## The Repository

```ts
const repo = new Repository<SavedBook>("reading-list", 1, isSavedBook, storage);
```

One class, one type parameter, and Day 23's type guard passed in as a validator.
**The repository never learns what a `SavedBook` is** — which is why it could
store something else tomorrow without being edited.

`load()` returns `Result<readonly T[], StorageFailure>`, and `StorageFailure` is
a four-member union. All five paths, forced in section 8:

```text
first load: 0 items
save: ok
loaded: [ 'Things Fall Apart (finished)', 'Beloved (reading)' ]
corrupt -> The saved list could not be read (...), so it has been reset.
version -> The saved list is version 99, and this app expects 1.
one row had a bad status; kept 1 of 2
quota -> The list is too large to save in this browser.
available: false
unavailable -> This browser is not allowing local storage...
```

The difference from Week 4 is in the type, not the logic. Week 4's `load()`
returned a bare array and logged problems to the console, so the UI could not
tell **empty** from **broken** — and Day 18's whole lesson was that those are
different states. Here they cannot be confused, because one is `ok([])` and the
other is `err({ kind: "corrupt" })`.

`describeFailure` is a free function with an exhaustive switch and a `never`
default, so adding a fifth failure kind breaks the build until it has wording.

## Module Boundaries

```ts
import { type Book, type SavedBook, isSavedBook, toBook } from "./model";
```

`type` on each type-only name. With `verbatimModuleSyntax` on, TypeScript emits
imports exactly as written — so a type imported *without* the keyword becomes a
real runtime import. Marking them means the emitted import pulls in only the two
functions.

The dependency direction, which is Day 19's rule with types added:

```text
model.ts       <- nothing
result.ts      <- nothing
repository.ts  <- result.ts
generics.ts    <- all three
main.ts        <- generics.ts
```

### The cycle I backed out of

I started putting `describeFailure` on the `Repository` class. That meant
`repository.ts` owned the wording, which I did not want — so I moved the wording
to its own module, which then needed `StorageFailure` *from* `repository.ts`.
Two modules importing each other.

It would have run. ES modules hoist function declarations, so a cycle resolves
for functions. But a `const` read during the evaluation of a cycle is
`undefined` — a failure with no error message attached, which is the worst kind.

The real problem is that a cycle means the boundary is in the wrong place.
`describeFailure` is a free function in `repository.ts` now, next to the type it
describes, and nothing imports backwards.

## What I Learned

A type parameter is worth having when it appears in two or more positions,
because then it describes a relationship. Used once, it is `unknown` with extra
syntax.

A constraint says how much the body needs to know about `T`, and without one the
body can do nothing at all.

`keyof` as a constraint lets the return type track the argument, which turns a
whole class of property-name mistake into a compile error.

`lib` controls what the compiler believes exists; `target` controls what syntax
is emitted. `toSorted` needs `ES2023`, and neither setting changes what the
browser can actually do.

`private` is erased and reachable from JavaScript; `#` is enforced by the
runtime. Only one of them is actually private.

A constructor default for a dependency — `storage: Storage = localStorage` — is
what makes a class testable without a mocking library. It is the reason all five
storage failures are exercised today and only one of them was in Week 4.

Returning `this` keeps chained calls typed as the subclass.

`Result<T, never>` collapses its failure member because `never` is
uninhabitable, which is what lets `ok()` fit any error type.

A narrowed failure can be returned unchanged as a `Result` with a different
success type, because the failure member never mentions it.

`import type` matters under `verbatimModuleSyntax`: an unmarked type import
becomes a runtime import of a module that may have nothing in it at runtime.

A circular import between functions resolves and a circular import of a `const`
gives `undefined` silently. Either way the cycle is a sign the boundary is
wrong.

## Verification

```text
npm run typecheck   ->  0 errors (9 deliberate ones pinned)
built, then run under Node with a document stub
all 10 sections print, all 5 repository failure paths fire, no uncaught throw
```

The first run failed to type-check with five real errors — two `any[]`/
`unknown[]` parameters rejecting a `readonly` array, and `toSorted` missing from
the ES2022 lib. Both were my mistakes rather than the examples', and the lib one
is the more interesting of the two.

## Day 24 Outcome

A generic `Result<T, E>` with constructors, `map` and `unwrapOr`; a
`Repository<T>` that handles all four `localStorage` failure modes behind a
typed result and takes its storage as a constructor parameter so every path is
testable; generic helpers with `keyof` constraints; and a one-way module graph
with no cycles. Nine deliberate errors pinned, and no unexplained `any` or
assertion — the one assertion in the file has a paragraph next to it.

Day 25 is the migration: Week 4's Reading List Dashboard, in TypeScript, using
`model.ts`, `result.ts` and `repository.ts` as they stand. Plus the Week 5
README.
