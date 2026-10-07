# Day 23 - Object types, aliases and interfaces

## Topics Covered

- `type` against `interface`, and when the choice matters
- Declaration merging
- `extends` against an intersection, and the `never` property
- Optional properties under `exactOptionalPropertyTypes`
- `readonly`, and how shallow it is
- Index signatures, `Record`, and closed lookup tables
- Structural typing, and branded types
- Modelling the API's shape separately from the domain's
- `Pick`, `Omit`, `Partial`, `keyof`
- Validating at the two boundaries: the network and storage

## Practical Work

Two files, and the split between them is the day.

```text
src/model.ts         the types, and the one function that crosses between them
src/object-types.ts  ten sections exercising them
```

`model.ts` is the first file this week that is not an exercise. It is the real
model for the Reading List, and Day 25 imports it unchanged.

## The Two Sets of Types

```ts
// What the API sends. I did not design it and cannot change it.
interface OpenLibraryDoc {
    readonly key: string;
    readonly title: string;
    readonly author_name?: readonly string[];
    readonly first_publish_year?: number;
    readonly cover_i?: number;
    readonly edition_count?: number;
}

// What the app works with. I did design this.
interface Book {
    readonly id: string;
    readonly title: string;
    readonly authors: readonly string[];
    readonly year?: number;
    readonly coverId?: number;
    readonly editionCount: number;
}
```

Nearly every field on the doc is optional, and that is not defensiveness — I
checked against real responses. `author_name` is missing on some anthologies,
`first_publish_year` on anything undated, `cover_i` whenever there is no scanned
cover.

On `Book`, almost nothing is optional. The rule I settled on:

> A field is optional in my own types only when the app has something real to
> display for the missing case.

`authors` is `readonly string[]` and never missing, because an empty array is a
real answer that every consumer can `.map` over. `year` stays optional, because
"unknown year" is genuinely different from any number I could invent, and the UI
renders that difference.

### toBook is the only crossing point

```ts
export function toBook(doc: OpenLibraryDoc): Book {
    return {
        id: doc.key.replace("/works/", ""),
        title: doc.title.trim() || "Untitled",
        authors: doc.author_name ?? [],
        ...(doc.first_publish_year === undefined ? {} : { year: doc.first_publish_year }),
        editionCount: doc.edition_count ?? 1
    };
}
```

Every `??` in there is a decision about a missing field. Writing the two types
out separately is what forced each one to be made on purpose, rather than
discovered later as a blank space on a card.

Week 4 had this mapping too, buried in `api.js`. What is new is that both shapes
have names, so the boundary is visible instead of implied — and the three
decisions live in one function instead of being spread between `api.js`
(`?? []`) and `render.js` ("Author unknown").

The cost of skipping it, which I wrote both ways to see:

```ts
function withoutMapping(doc: OpenLibraryDoc): string {
    return (doc.author_name ?? ["Author unknown"]).join(", ");
}
function withMapping(book: Book): string {
    return book.authors.length > 0 ? book.authors.join(", ") : "Author unknown";
}
```

Both print `Author unknown`. The second is the only one that still works when
the API renames the field — and one optional field in the API otherwise becomes
an optional check in every component downstream.

## type against interface

Structurally identical, mutually assignable, and neither is "the object one".
The differences that are actually real:

| | `interface` | `type` |
|---|---|---|
| Can be reopened | Yes (declaration merging) | No |
| Can describe | Object shapes only | Anything — unions, tuples, primitives, functions |
| `extends` | Yes | Via `&` |

So `Status` **has** to be an alias:

```ts
type Status = "unread" | "reading" | "finished";
```

A union of string literals is not an object shape, and an interface cannot
express it.

### Declaration merging decided it for me

```ts
interface Mergeable { title: string; }
interface Mergeable { year: number; }   // not a redeclaration - an addition
```

Both properties are required now, from two blocks that could be in two files.
A duplicate *alias* is an error — "Duplicate identifier" — which is the more
helpful behaviour almost every time.

Merging exists for extending types you do not own: adding a property to
`Window`, declaring a module's missing types. Inside my own code, the inability
to merge is a feature, because the alternative is defining a thing twice and
never finding out.

So: **alias by default, interface when something extends or implements it.**
`Book` and `SavedBook` are interfaces because `SavedBook extends Book`.

## extends against an intersection

Nearly the same thing, until there is a conflict.

```ts
type Conflicting = { count: string } & { count: number };

const impossible: Conflicting = { count: 1 };   // error
```

The intersection does not complain at the declaration. It quietly computes
`string & number`, which is `never`, and the error arrives later wherever
someone tries to build one — and the message is about `never`, not about the
two declarations that disagree.

`extends` with an incompatible property is an error *at the interface*, naming
the property and why. So the failure lands where the mistake is rather than
where it is noticed, which is why `SavedBook extends Book`.

## exactOptionalPropertyTypes

The option that made `toBook` ugly, and I kept it.

```ts
const explicitUndefined: Book = { ...book, year: undefined };
// error: undefined is not assignable to an exact optional property
```

`year?: number` means **absent or a number**. Present-and-undefined is a third
state the type never asked for. The difference is observable:

```text
"year" in absent:  false
"year" in present: true
both read as: undefined undefined
```

Two objects that read identically and answer `in` differently. Without the
option, `"year" in book` could be `true` for a book with no year, and then the
UI is checking two things to answer one question.

The alternatives were to turn the option off or widen to
`year?: number | undefined`. Both put `undefined` back into a field that means
"this book has no known year". The conditional spread is ugly and honest:

```ts
...(doc.first_publish_year === undefined ? {} : { year: doc.first_publish_year })
```

## readonly is shallow

```ts
const book: Book = toBook(sampleDoc);
book.title = "changed";     // error
```

...and then I forced it through and printed it:

```text
title is now: changed
```

Third time this week. `readonly` is erased, like `as const` and like `void`. It
constrains the code I write and not the code that runs.

`Readonly<T>` goes one level only:

```ts
const frozen: Readonly<{ title: string; tags: string[] }> = { title: "NW", tags: ["fiction"] };

frozen.title = "x";          // error
frozen.tags.push("literary"); // fine
```

```text
Readonly<T> is one level deep: [ 'fiction', 'literary' ]
```

The property is protected; the array it points at is not. Same lesson as the
Week 3 note that `const` fixes the binding and not the value. Which is why
`model.ts` writes `readonly string[]` by hand rather than wrapping in
`Readonly<T>`.

## Record, and closed lookup tables

```ts
const countsByStatus: Record<Status, number> = { unread: 4, reading: 1, finished: 7 };
```

A `Record` over a literal union is **closed**: every key must be present, and no
other key is allowed. Both of these fail:

```ts
{ unread: 0, reading: 0, finished: 0, abandoned: 0 }   // "abandoned" is not a Status
{ unread: 0, reading: 0 }                              // finished is missing
```

That is the useful part. Add a fourth status to `STATUSES` and every
`Record<Status, ...>` in the codebase becomes an error until it is filled in —
the same exhaustiveness guarantee as Day 22's `never` default, applied to a
lookup table instead of a switch.

An open index signature has no such guarantee, and
`noUncheckedIndexedAccess` is what keeps it honest:

```ts
const value = countsBySubject["philosophy"];
//    ^? number | undefined
```

```text
a key that is not there: undefined
threw, as the type said: Cannot read properties of undefined (reading 'toFixed')
```

Whereas indexing the closed `Record` needs no guard at all, because the key is
guaranteed to exist. Two things that look like the same operation and are not.

## Structural typing, and where it bites

TypeScript compares shapes, not names, so an object never declared as a `Book`
is a perfectly good one. That is mostly a convenience. Here is where it is not:

```ts
type BookId = string;
type UserId = string;

function fetchBook(id: BookId): string { ... }

fetchBook(userId);   // no error, and it is wrong
```

Both are `string`, so an alias buys documentation and no safety whatsoever. A
brand fixes it:

```ts
type Branded<T, B extends string> = T & { readonly __brand: B };
type SafeBookId = Branded<string, "BookId">;

fetchBookSafely("U-42");                   // error
fetchBookSafely("OL1234W" as SafeBookId);  // fine
```

The brand exists only in the type — there is no `__brand` property at runtime.
Making one requires an assertion, which is the point: it marks the single place
where the claim is made, instead of letting any string in anywhere.

## Utility types

All of these derive from `Book`/`SavedBook` rather than restating them, so a
change to the source type reaches every one.

```ts
type BookCard = Pick<Book, "id" | "title" | "authors">;
type NewBook  = Omit<SavedBook, "addedAt">;
type BookPatch = Partial<Pick<SavedBook, "status" | "note">>;
```

`Partial` is the right type for a patch and the wrong type for storage. A
`Partial<SavedBook>` in the store means every read needs a guard — which is
exactly how one optional field spreads through a codebase.

And narrowing the patch to two fields does real work:

```ts
applyPatch(saved, { status: "finished" });   // fine
applyPatch(saved, { title: "nope" });        // error - title is not patchable
```

## Validating at the storage boundary

The network is one boundary; `localStorage` is the other, and it is the worse
one, because the data on disk was written by an older version of my own code.

```ts
const parsed: unknown = JSON.parse(stored);

if (!Array.isArray(parsed)) return [];
const books: SavedBook[] = parsed.filter(isSavedBook);
```

`JSON.parse` returns `any` in the standard library — the one place this week's
no-`any` rule is not mine to enforce. Annotating the result `unknown` is how to
take it back.

Then the guard from `model.ts` as a filter predicate, which is Day 22's section
12 doing something real:

```text
one entry had status 'readng'; kept 1 of 2
```

Week 4 stored that typo happily and rendered a card with no badge. The types
cannot reach data already written to disk — nothing can — but a guard at the
boundary turns it into one dropped row instead of a silently broken card.

## What I Learned

Model the API's shape and the app's shape as two types with one function between
them. Every missing field then becomes one explicit decision in one place
instead of an optional check in every consumer.

A field should be optional in my own types only when the UI has something real
to show for the missing case. `authors: readonly string[]` with `?? []` removes
a check from everywhere downstream.

`type` and `interface` are interchangeable for object shapes. Only `type` can
express a union, and only `interface` can be reopened — which makes aliases the
safer default in my own code.

`extends` reports a conflict at the declaration; an intersection quietly
produces `never` and reports it at the first attempt to build one.

`exactOptionalPropertyTypes` makes "absent" and "present and undefined"
different states, and `in` can tell them apart even though reading cannot.

`readonly` is erased and `Readonly<T>` is one level deep. Neither protects the
array behind the property.

`Record` over a literal union is a closed table, so adding a union member breaks
every table until it is updated. An open index signature gives
`T | undefined` on every read instead.

A type alias for `string` provides no safety at all, because typing is
structural. A brand is the cheap fix, and it costs nothing at runtime.

`Partial` belongs on a patch, not in a store.

`JSON.parse` returns `any`; annotating the receiving variable as `unknown` is
how to put the check back.

## Verification

```text
npm run typecheck   ->  0 errors (12 deliberate ones pinned)
built, then run under Node with a document stub
all 10 sections print, no uncaught throw
```

## Day 23 Outcome

A real model for the Reading List in `src/model.ts`: the Open Library response
typed as it actually arrives, the domain `Book` and `SavedBook` typed as the app
wants them, one mapping function between the two, and type guards for the
storage boundary. Ten sections exercising object types, with twelve deliberate
errors pinned by `@ts-expect-error`.

Day 24 is generics, classes and modules: one generic helper worth having, a
typed repository class over `localStorage`, and the module boundaries that
Day 25's migration needs.
