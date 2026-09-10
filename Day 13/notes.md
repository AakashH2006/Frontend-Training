# Day 13 - Functions and Scope

## Topics Covered

- Function declarations, expressions and arrow functions
- Hoisting and the temporal dead zone
- Default, rest and spread parameters
- Pass by value and object references
- Return values and automatic semicolon insertion
- Global, function and block scope
- The scope chain and shadowing
- Closures
- Callbacks and higher-order functions
- `this` in normal and arrow functions
- Pure functions and side effects
- Recursion

## Practical Work

`functions.js`, ten sections, ending with a small reporting pipeline built out
of the pieces from the rest of the file. Runs in the console and under
`node functions.js`.

## Three Ways to Write One

```js
function toHours(minutes) { return minutes / 60; }   // declaration
const toMinutes = function (hours) { ... };          // expression
const toDays = (hours) => hours / 24;                // arrow
```

They are not interchangeable. The differences that actually matter:

| | Declaration | Expression | Arrow |
|---|---|---|---|
| Hoisted and callable early | yes | no | no |
| Has its own `this` | yes | yes | **no** |
| Implicit return | no | no | yes, for a single expression |

A declaration is fully hoisted, so it can be called above the line that defines
it. A `const` function expression is hoisted as a binding but not initialised,
so calling it early is a `ReferenceError` — which I confirmed rather than
assumed.

One arrow trap I hit straight away:

```js
const asEntry = (topic, hours) => ({ topic, hours });
```

Without the parentheses the braces are read as a function body, not an object
literal, and the function silently returns `undefined`.

## Parameters

### Defaults fire on undefined only

```js
logEntry("JS", undefined, "...")   // hours = 1   (default used)
logEntry("JS", null, "...")        // hours = null (default NOT used)
```

`null` is a value, so it is accepted as one. This is the same distinction as
`??` from Day 11 — "missing" and "empty" are not the same thing.

### Rest and spread

```js
function totalHours(label, ...entries) { ... }   // gathers into an array
totalHours("Week 2", ...week2);                  // unpacks an array
```

Same three dots, opposite directions. Rest is in the parameter list, spread is
at the call site. The rest parameter is a real array, unlike the old `arguments`
object, so `reduce` works on it directly.

### Arity is never checked

JavaScript does not care how many arguments are passed. Missing ones are
`undefined` and extra ones are dropped, with no error either way. Nothing warned
me that `logEntry()` with no arguments produced `"undefined: 1h (no note)"`.

That is one of the things TypeScript fixes in Week 5, which is starting to make
more sense as a reason to use it.

### Pass by value, including objects

```js
function tryToChange(entry) {
    entry.hours = 99;       // caller sees this
    entry = { hours: 0 };   // caller does not see this
}
```

The value that gets copied *is* the reference. So mutating the object through
the parameter changes the caller's object, but reassigning the parameter only
rebinds the local name.

## The Return Trap

```js
function brokenReturn() {
    return
    { ok: true };
}
```

Returns `undefined`. Automatic semicolon insertion ends the statement at the end
of the `return` line, and the object below is unreachable code. Nothing warns.

The rule: the value has to start on the same line as `return`.

## Scope and the Scope Chain

Lookup goes inwards to outwards — block, then function, then module or global —
and stops at the first match. Nothing goes the other way, which is why a `const`
declared in an `if` block is invisible to the function around it.

Shadowing hides an outer name rather than overwriting it, so the outer value is
still intact after the inner function returns.

## Closures

The idea that took the longest and is the most useful:

**A function keeps access to the scope it was created in, not the scope it is
called from, and that scope survives after the outer function has returned.**

```js
function makeCounter(startAt = 0) {
    let count = startAt;
    return {
        increment: () => ++count,
        value: () => count
    };
}
```

`count` is genuinely private. Nothing outside `makeCounter` can read or write it
except through the two functions, and `typeof count` outside is `"undefined"`.

Every call to `makeCounter` makes a new scope, so two counters do not interfere
with each other. That is the same mechanism as `let` per iteration in a `for`
loop from Day 12 — a new binding each time rather than one shared one.

A `once()` wrapper is the same idea used for something practical: `called` and
`result` live in the closure, so the second call returns the stored result
without running the body again.

## Callbacks and Higher-Order Functions

A function is a value, so it can be passed in and returned out.

```js
const multiplyBy = (factor) => (n) => n * factor;
const triple = multiplyBy(3);
```

`multiplyBy` returns a function that has closed over `factor`. This is how
configurable helpers get built, and it is the shape that `map`, `filter` and
`reduce` expect on Day 14.

## this

For a normal function, `this` is decided by **how it is called**, not by where
it was written. The same function body gives a different answer depending on
what it is called on, which is why passing a method around by name loses the
object it came from.

An arrow function has no `this` of its own at all. It uses the `this` of the
scope it was written in, and that cannot be changed by the caller:

```js
run() {
    const inner = () => this.label;   // the run() method's this
    return inner();
}
```

The rule I am taking forward: use an arrow for a callback inside a method, so
`this` stays put. Do not use an arrow for the method itself, or there is no
object `this` to inherit.

## Pure Functions

Pure: the same input always gives the same output, and nothing outside is
touched.

```js
const addHours = (entry, hours) => ({ ...entry, hours: entry.hours + hours });
```

The spread makes a new object rather than editing the one passed in, so the
caller's data is untouched. The impure version changed the caller's object
underneath them, which the output makes obvious — the "original" value had
already moved before the second line printed.

Impure is not banned. Side effects are the point of a program that does
anything. The aim is to keep them out of the small calculation functions and
push them to the edges, which is how the exercise in section 10 is arranged.

## Recursion

Base case first, then the same problem one step smaller:

```js
function countLeaves(node) {
    if (Array.isArray(node)) return node.length;
    let total = 0;
    for (const key in node) total += countLeaves(node[key]);
    return total;
}
```

A loop cannot easily walk a tree of unknown depth without keeping its own stack.
Recursion gets the call stack to do that job. The forgotten base case is an
immediate stack overflow, so I write that line first now.

## The Exercise

Section 10 turns a raw log into a sorted report using four small functions and a
`pipe` helper:

```js
const pipe = (...fns) => (input) => fns.reduce((value, fn) => fn(value), input);
```

Rest parameters gather the functions, a closure keeps them, and `reduce` feeds
each result into the next. Every step is a pure function that could be tested on
its own, and only the final loop prints anything.

## What I Learned

Declarations are hoisted and callable early; function expressions and arrows are
not.

An arrow returning an object literal needs parentheses around the braces.

Defaults apply to `undefined` only, so `null` gets through.

Rest and spread are the same syntax in opposite directions.

JavaScript never checks how many arguments arrive, which is a whole class of
silent bug that types would catch.

An object argument is passed as a copy of the reference, so mutation is visible
to the caller and reassignment is not.

`return` on a line of its own returns `undefined`, because of semicolon
insertion.

A closure is a function plus the scope it was born in, and that is how private
state exists in a language with no private keyword.

`this` in a normal function belongs to the call site; an arrow has none of its
own and uses the surrounding one.

## Day 13 Outcome

`functions.js` runs clean in the browser and Node, covering the three function
forms and hoisting, parameter handling, the return trap, the scope chain,
closures with private state, higher-order functions, `this` binding, purity and
recursion, and ends with a report built by composing small pure functions.
