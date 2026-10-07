# Day 22 - Functions and narrowing

## Topics Covered

- Typing parameters and return types, and the bug an inferred return allows
- Optional parameters against defaults
- Rest parameters, and why a spread needs a tuple
- Function type expressions and contextual typing
- Parameter count compatibility, and the `map(parseInt)` trap
- `void`, and why it is not `undefined`
- `typeof` narrowing, and `typeof null === "object"`
- Truthiness narrowing, and where `0` and `""` break it
- Equality narrowing, and the one good use of `!= null`
- `in` and `instanceof`
- Why `catch` gives `unknown`
- Discriminated unions, and exhaustiveness with `never`
- Type predicates and assertion functions

## Practical Work

Twelve sections in `src/narrowing.ts`, same runner shape as Day 21. Eight
deliberate errors pinned with `@ts-expect-error`.

The day splits cleanly in half. Sections 1-5 are typing the things functions are
made of. Sections 6-12 are narrowing, which is the part I actually came for:
Day 21 established that a union only lets you touch what every member has in
common, which is safe and useless. Narrowing is how you get the rest.

## Declare the Return Type

The first thing that changed how I write.

```ts
function looseAverage(values: number[]) {
    if (values.length === 0) return "no data";
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}
//  ^? (values: number[]) => string | number
```

No error anywhere. Inference does exactly what it is told — two return
statements, two types, so the return type is the union of them. The intent was
a number, and the `"no data"` string is the mistake, and nothing points at it.

Every caller now has to narrow a union that should not exist. Written with the
return type declared:

```ts
function strictAverage(values: number[]): number | null {
    if (values.length === 0) return null;
    ...
}
```

The compiler points at the `return` line that disagrees with the contract,
which is the line that is actually wrong.

So: **declare the return type on anything exported.** Inference is right for
locals, where the body is three lines away. On a function boundary it turns a
mistake in the body into a mistake at every call site.

## Optional is not the same as accepting undefined

```ts
function a(label?: string) {}              // may be omitted
function b(label: string | undefined) {}   // must be passed

a();            // fine
b();            // error: expected 1 argument, got 0
b(undefined);   // fine
```

Both have `string | undefined` *inside* the function. The difference is at the
call site, and it is the difference between an options bag whose fields can be
left out and one where every field has to be mentioned.

A default is better than an optional where there is a sensible fallback,
because the type inside the function is then `string` rather than
`string | undefined`, and there is no `??` on the first line:

```ts
function describe(count: number, noun = "item"): string { ... }
```

## Spreads need a tuple

```ts
const authors = ["Achebe", "Morrison"];

function exactlyTwo(a: string, b: string): string { ... }

exactlyTwo(...authors);   // error
```

`string[]` has no length in its type — it might be empty, it might have nine
entries — so TypeScript cannot know the call supplies both parameters. A tuple
does have a length:

```ts
const pair: [string, string] = ["Achebe", "Morrison"];
exactlyTwo(...pair);      // fine
```

This is the first time the array/tuple distinction from Day 21 did real work
rather than being a curiosity.

## Parameter counts, and map(parseInt)

A callback with **fewer** parameters is assignable to a type that declares more.
That is deliberate, and it is why `books.map((b) => b.title)` works when `map`
actually passes three arguments.

It is also why the oldest trap in JavaScript type-checks:

```ts
["1958", "1987", "2012"].map(parseInt)
```

Ran it:

```text
parseInt direct: [ 1958, NaN, NaN ]
wrapped:         [ 1958, 1987, 2012 ]
```

`map` passes `(value, index, array)`. `parseInt` takes `(string, radix)`. So the
index becomes the radix: radix 0 means "guess", radix 1 does not exist, and
radix 2 reads `"2012"` as binary, where `2` is not a digit. Two `NaN`s.

TypeScript permits it because the shapes are compatible — `parseInt`'s second
parameter is optional, so a two-parameter function is a valid one-or-more
parameter callback. A type system that models JavaScript faithfully has to
allow this, which is a useful reminder that "it compiles" is not "it is right".

## void is a compile-time fiction

I expected `void` to mean "returns undefined". It does not. It means "ignore
whatever this returns".

```ts
type Logger = (message: string) => void;

const returnsSomething = (message: string): number => message.length;
const logger: Logger = returnsSomething;   // allowed
```

That assignment is deliberate: it is what makes `arr.forEach(x => other.push(x))`
legal, since `push` returns a number nobody looks at.

What I did not expect is how thin the fiction is. The result is typed `void` and
unusable:

```ts
const ignored = logger("hello");
ignored + 1;   // error: a void result cannot be used
```

...but I forced that line through with `@ts-expect-error` and ran it:

```text
typeof the void result: number
6
```

The value was there the whole time. `"hello".length` is 5, and 5 + 1 is 6.
`void` does not erase a return value — it only stops me from reading it. Same
lesson as Day 21's forced `push` through a `readonly`: the type system
constrains the code I write, not the code that runs.

A declared `: undefined` return is the stricter thing, and it requires an actual
`return undefined`.

## typeof null

```ts
function brokenLength(value: string[] | null): number {
    if (typeof value === "object") {
        return value.length;   // error: value is possibly null
    }
    return 0;
}
```

`typeof null` is `"object"`, so that check narrows to `string[] | null` and
excludes nothing useful. It is a 1995 bug in JavaScript that cannot be fixed
without breaking the web, and TypeScript models it faithfully rather than
pretending.

The check for "is this an object" is a check against `null`:

```ts
return value === null ? 0 : value.length;
```

## Truthiness, and the falsy trap again

This is the Week 3 `||` lesson coming back with a type system attached — and the
type system does not catch it.

```ts
function brokenPage(page: number | undefined): number {
    if (!page) return 1;      // 0 is falsy
    return page;
}
```

```text
page 0 becomes: 1 <- wrong
page 0 stays:   0
```

`!page` is true for `undefined` **and** for `0`. The question being asked is
"was it supplied", so the test is `page === undefined`. Same story for `""`:

```text
empty note, ||: "(no note)"
empty note, ??: ""
```

Truthiness is the right narrowing when every falsy value genuinely means absent,
and wrong the moment `0` or `""` is a real value. **TypeScript cannot tell those
two situations apart**, because both are `number | undefined`. This is a design
question the types do not answer, which is worth knowing: a type system narrows
what I ask it to narrow, and asking the wrong question still compiles.

## != null

The one place loose equality is clearer than strict:

```ts
if (value != null) return value.trim();
```

`null == undefined` is true, so `!= null` excludes both in one check, and
TypeScript understands it and narrows accordingly. Everywhere else I still use
`===`.

## catch gives unknown

```ts
try { ... } catch (error) {
    error.message   // error: error is of type unknown
}
```

Correct and stricter than Week 4. `throw "a string"` is legal JavaScript, so a
caught value genuinely could be anything — and in section 10 I threw a string
on purpose to prove it. The unguarded `error.message` printed `undefined` rather
than throwing, which is exactly the quiet failure the type was warning about.

```ts
if (error instanceof HttpError) return `HTTP ${error.status}`;
if (error instanceof Error)     return `${error.name}: ${error.message}`;
return `thrown non-error: ${String(error)}`;
```

Order matters. `HttpError extends Error`, so the `Error` branch would catch both
and the status would be lost. Most specific first — the same rule as a CSS
cascade, for the same reason.

## Discriminated Unions

The section that justifies the day.

```ts
type RequestState =
    | { state: "loading" }
    | { state: "loaded"; books: Book[] }
    | { state: "empty" }
    | { state: "failed"; message: string };
```

Every member carries a literal-typed `state`. That shared single-valued property
is the discriminant, and it is what lets a `switch` narrow each branch to one
member — so `result.books` exists in the `loaded` branch and nowhere else.

Two things this fixes, both of them real bugs from Week 4.

**Illegal states stop being constructible.** Week 4's store had `phase`,
`results`, `error` and `saved` as four independent fields, so
`phase: "error"` alongside a full `results` array was a state the code could
produce — and did, before I added the `results: []` to `searchFailed`. Here:

```ts
const impossible: RequestState = { state: "failed", message: "x", books: [] };
// error: books does not exist on the failed member
```

**Adding a state breaks the build instead of a branch.**

```ts
default:
    return assertNever(result);   // result is `never` here

function assertNever(value: never): never {
    throw new Error(`Unhandled state: ${JSON.stringify(value)}`);
}
```

In the `default`, every case has been handled, so the remaining type is `never`
— and `never` is the only type assignable to `never`. Add a fifth member to
`RequestState` without a `case` for it, and `result` is that member rather than
`never`, and this line stops compiling.

Week 4 had four render branches I had to remember to keep in step with the
`phase` field by hand. This is the compiler doing that job.

## Type Predicates

```ts
function isBook(value: unknown): value is Book {
    return typeof value === "object" && value !== null
        && "title" in value && typeof value.title === "string"
        && "year"  in value && typeof value.year  === "number";
}
```

`value is Book` is the return type, and it means a `true` result narrows the
argument at the call site. Narrowing survives the function call, which an
ordinary `boolean` return would not.

The payoff is in a filter:

```ts
const books = mixed.filter(isBook);
//    ^? Book[]        - without the predicate: unknown[]
```

```text
filtered: [ 'NW', 'Beloved' ]
```

An assertion function is the throwing version:

```ts
function assertIsBook(value: unknown): asserts value is Book {
    if (!isBook(value)) throw new TypeError("not a book");
}
```

After it returns at all, the narrowing holds for the rest of the scope. The
explicit annotation is required — inference cannot produce an `asserts` type.

**The honest warning**: a predicate is only as good as its body. TypeScript
takes `value is Book` entirely on trust and checks nothing inside. `return true`
would compile and would be a lie. So these are the same category of claim as an
`as` cast — the difference is that a predicate gives the check somewhere to
live, and the check is the point.

## What I Learned

Declare return types on exported functions. An inferred return turns a mistake
in the body into a union every caller has to handle.

`label?: string` and `label: string | undefined` differ at the call site, not
inside the function. A default is better than either when there is a fallback.

A spread argument needs a tuple, because an array's length is not in its type.

A callback may take fewer parameters than its type declares. That is what makes
`map(cb)` ergonomic and what makes `map(parseInt)` return `NaN`s while
type-checking cleanly.

`void` means "ignore the result", not "returns undefined" — and the result is
really still there. I printed it.

`typeof null === "object"`, so a `typeof` check never narrows away null.

Truthiness narrowing is wrong whenever `0` or `""` is a real value, and the
types cannot tell me that, because asking the wrong question still compiles.

`!= null` excludes null and undefined together, and is understood by the
narrowing.

`catch` gives `unknown` because anything can be thrown. `instanceof` chains go
most specific first, since a subclass matches its parent's branch too.

A discriminated union makes illegal combinations unconstructible, and a `never`
default makes a new member a build error instead of a missing branch.

A type predicate carries narrowing across a function call, and it is trusted
rather than verified — so the body is the only thing standing behind it.

## Verification

```text
npm run typecheck   ->  0 errors (7 deliberate ones still pinned)
built, then run under Node with a document stub
all 12 sections print, no uncaught throw
```

## Day 22 Outcome

Twelve sections covering function types and the six ways to narrow a union,
type-checking clean under `strict` with seven deliberate errors pinned. The
discriminated-union section rebuilds Week 4's request `phase` as a shape where
`phase: "error"` with a full results array cannot be constructed, and where
adding a state is a compile error rather than a forgotten branch.

Day 23 is object types, aliases and interfaces: modelling the Open Library
response and the domain it maps to, with optional and `readonly` used
deliberately rather than by habit.
