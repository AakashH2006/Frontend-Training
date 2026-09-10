# Day 14 - Arrays and Objects

## Topics Covered

- Mutating against non-mutating array methods
- `map`, `filter`, `find`, `findIndex`, `some`, `every`
- `reduce` for sums, groups and lookup tables
- `sort` and comparators
- `flat`, `flatMap` and `Set`
- Dot against bracket property access
- Computed keys and shorthand properties
- `Object.keys`, `values`, `entries` and `fromEntries`
- Spread merging and shallow copies
- Array, object, nested and parameter destructuring

## Practical Work

`arrays-objects.js`, worked on a seven-item product dataset rather than on
throwaway examples, so the exercises are the sort of thing an app would actually
do — filter, group, total, sort, format.

Prices are stored in paise as integers, following what I found on Day 11 about
floats. Every display value goes through one `rupees()` helper that divides by
100 at the last moment.

## Mutating or Not

The distinction I keep having to check:

**Mutating:** `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`,
`fill`, `copyWithin`

**Non-mutating:** `slice`, `concat`, `map`, `filter`, `reduce`, `flat`,
`flatMap`, `join`, and spread

The confusing part is the return values. `push` returns the new *length*,
`splice` returns the *removed items*, and neither returns the array — so
`const next = list.push(x)` gives a number, which is never what I meant.

Modern non-mutating twins exist for some of them: `toSorted`, `toReversed`,
`toSpliced`, `with`. I used `toSorted` behind a feature check, because it is new
enough that I should not assume it.

## map, filter, find

- `map` — same length out, each item transformed
- `filter` — same items, fewer of them
- `find` — the first match or `undefined`; `findIndex` gives its position or `-1`
- `some` / `every` — a yes/no answer, stopping as soon as it is known

The mistake worth writing down:

```js
products.map((product) => { product.name; });   // [undefined, undefined, ...]
```

An arrow with braces has a block body, so it needs an explicit `return`. Without
one, `map` faithfully collects seven `undefined`s and nothing complains. Either
drop the braces or add the `return`.

Chaining reads in the order the work happens, which is why I prefer it to one
loop with three `if`s inside — but each link is a full pass over the array, so it
is a readability trade rather than a free one.

## reduce

`reduce(callback, initialValue)`. The accumulator can be any shape, and that is
what makes it more than "add up an array".

Three shapes I used:

```js
// a number
products.reduce((total, p) => total + p.price * p.stock, 0)

// an object of groups
products.reduce((groups, p) => {
    groups[p.category] ??= [];
    groups[p.category].push(p.name);
    return groups;
}, {})

// a lookup table by id
products.reduce((lookup, p) => { lookup[p.id] = p; return lookup; }, {})
```

The lookup one is the most useful in practice: turning a list into an object
keyed by id makes later reads instant instead of a `find` every time.

Two things that bit me:

1. **Forgetting to return the accumulator.** The next iteration then gets
   `undefined` and everything collapses. The grouping callback needs the
   explicit `return groups` at the end because it has a block body.
2. **Leaving out the initial value.** `reduce` then uses the first element as
   the accumulator, and on an empty array it throws a `TypeError`. Always pass
   the initial value; it also documents the shape.

`??=` is new to me and reads well here — assign only if the key is `null` or
`undefined`, so an existing group is never wiped.

`Object.groupBy` does the grouping in one call in newer runtimes. I used it
behind a `typeof` check with the `reduce` version as the fallback.

## sort

Two surprises in the same method.

**It sorts as strings by default:**

```js
[10, 9, 100, 1].sort()   // [1, 10, 100, 9]
```

Every element is converted to a string and compared character by character, so
`"10"` comes before `"9"`. Numbers need `(a, b) => a - b`.

**It mutates:**

```js
const sorted = [...original].sort((a, b) => a - b);
```

Copy first. I found this by sorting the product list for a report and then
noticing that a later section saw a different order.

Strings need `localeCompare` rather than subtraction, because `-` on strings is
`NaN`. It also handles case and accents properly rather than by code point.

Multiple keys fall out of `||`, because a comparator returning `0` is falsy:

```js
a.category.localeCompare(b.category) || a.price - b.price
```

Sort by category, and only when that ties, by price.

## Objects

Dot notation for a fixed name, brackets when the key is in a variable or is not
a valid identifier (`settings["items-per-page"]`).

`Object.entries` plus `map` plus `Object.fromEntries` is the object equivalent
of `map` on an array — turn it into pairs, transform the pairs, turn it back.

### Spread is shallow

```js
const shallow = { ...source };
shallow.meta.warrantyYears = 5;
source.meta.warrantyYears;   // 5 - the nested object is shared
```

The top level is copied and everything below it is still the same reference.
`structuredClone(source)` makes a real deep copy, and unlike the
`JSON.parse(JSON.stringify(x))` trick it keeps dates, maps and sets, and does not
silently drop `undefined` values or functions.

Merging with spread means later keys win, which is what makes
`{ ...defaults, ...userPrefs }` read correctly.

## Destructuring

Arrays destructure **by position**, objects **by name**.

```js
const [first, second, ...rest] = products;
const { name, price, discount = 0, category: group } = products[0];
```

- `discount = 0` is a default, used when the property is `undefined`
- `category: group` renames on the way out, which is the syntax I keep reading
  backwards — the new name is on the right

Swapping without a temporary variable:

```js
[a, b] = [b, a];
```

In a parameter list it doubles as documentation of what the function actually
uses:

```js
function describe({ name, stock, tags = [] }) { ... }
```

Destructuring `undefined` throws, so a function that might be called with
nothing needs a default object too: `function f({ name = "unknown" } = {})`.

## The Exercise

`stockReport()` puts the whole day together: filter out the sold-out lines,
`reduce` into per-category totals, `Object.entries` and sort by value, then
format. It destructures in the parameter lists throughout, returns an object
that the caller destructures, and does not mutate the dataset — the last line
checks that the original order is untouched.

## What I Learned

The mutating list is short enough to memorise, and the return values of the
mutating methods are never the array itself.

An arrow with braces needs an explicit `return`, and `map` will happily build an
array of `undefined` if it does not get one.

`reduce`'s accumulator can be an object, which is what makes grouping and
lookup tables a one-liner rather than a loop with a pre-declared variable.

Always pass `reduce` an initial value: it defines the shape and stops the empty
array from throwing.

`sort` compares as strings and mutates. Both of those are surprising and both
have bitten me in one day.

A comparator returning `0` is falsy, which is why `||` chains sort keys.

Spread copies one level deep. `structuredClone` is the deep one.

Destructuring renames with `original: newName`, which is the opposite way round
to how I keep reading it.

## Day 14 Outcome

`arrays-objects.js` runs clean in the browser and Node, covering mutating
against non-mutating methods, the whole `map`/`filter`/`find`/`reduce` set,
comparator sorting including multi-key, `flat`/`flatMap`/`Set`, object access
and merging, shallow against deep copies, and every form of destructuring —
finishing with a grouped, sorted stock report that leaves the dataset untouched.
