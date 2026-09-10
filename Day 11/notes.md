# Day 11 - Variables, Values and Operators

## Topics Covered

- `const` and `let`, and why `var` is not used
- Block scope and the temporal dead zone
- The seven primitive types
- `typeof`
- Floating point numbers and `NaN`
- Strings and template literals
- Explicit conversion and implicit coercion
- Truthy and falsy values
- `==` against `===`
- Logical operators and short circuiting
- `??` and `?.`

## Practical Work

First day of Week 3, so the page work pauses and the language starts.

The exercises are in `variables.js`. Everything goes to the console and nothing
touches the page, because the DOM is Week 4 and I did not want to learn two
things at once. The same file runs in the browser and under `node variables.js`,
which was a useful thing to find out on its own — this week's code does not need
a browser at all.

There is a small `index.html` so I can load the file in the browser and read the
output in DevTools, and it lists what the file covers.

## Declarations

`const` unless the value is reassigned, `let` when it is, `var` never.

The part I had wrong: **`const` prevents reassignment, not mutation.**

```js
const progress = { html: "done" };
progress.javascript = "in progress";   // fine
progress = {};                         // TypeError
```

The binding is fixed. The object it points at is not. So `const` on an object is
a promise about the variable, not about the contents.

`let` and `const` are block scoped, `var` is function scoped. That single
difference is the reason to drop `var`:

```js
{
    let insideBlock = "gone outside these braces";
}
```

A `var` there would leak out of the block and be visible to the whole function.

### The temporal dead zone

A `let` or `const` binding exists from the top of its block but cannot be read
until the line that declares it. Touching it before that is a `ReferenceError`,
not `undefined`.

`var` gives `undefined` instead, which is worse, because the mistake keeps
running and fails somewhere further down where the cause is not visible.

## Primitives

Seven of them: `string`, `number`, `boolean`, `undefined`, `null`, `symbol`,
`bigint`. Everything else is an object.

`typeof null` returns `"object"`. That is a bug from the first version of the
language that could not be fixed without breaking existing sites, so it stayed.

The `undefined` and `null` distinction I now use:

- `undefined` — nothing has been put here yet, usually the language's doing
- `null` — something was put here deliberately, and it is nothing

## Numbers Are Floats

```js
0.1 + 0.2 === 0.3   // false
0.1 + 0.2           // 0.30000000000000004
```

There is only one number type and it is a 64-bit float, so a value like 0.1 has
no exact binary representation and the error shows up after arithmetic.

Two things I took from this:

1. Compare within a tolerance (`Math.abs(a - b) < Number.EPSILON`) rather than
   with `===`, when floats have been through arithmetic.
2. For money, work in the smallest unit — store paise as an integer and divide
   only when displaying. I will need this in the expense analyzer on Day 15.

`NaN` is the other oddity. It is the only value in the language that is not
equal to itself, so `NaN === NaN` is `false` and the check has to be
`Number.isNaN(value)`.

## Template Literals

Backticks, `${}` for an expression, and real line breaks inside the string.

```js
`${firstName} is on day ${day}, week ${Math.ceil(day / 5)}.`
```

What goes inside `${}` is an expression and not just a variable name, so a
calculation or a method call can go straight in.

Strings are immutable. `toUpperCase()` does not change the string, it returns a
new one, which is why nothing that looks like a "string method that edits" ever
edits.

## Conversion and Coercion

Explicit conversion is a function call I wrote on purpose:

| Input | `Number()` | Note |
|-------|-----------|------|
| `"42"` | `42` | |
| `""` | `0` | an empty string is zero, which catches people out |
| `"12abc"` | `NaN` | `parseInt("12abc", 10)` gives `12` instead |

Implicit coercion is the operator deciding for me, and `+` is the problem
because it means two things:

```js
"5" + 1   // "51"  - + prefers strings, so it concatenates
"5" - 1   // 4     - every other maths operator converts to number
```

This is a real bug and not a trivia question. Every value that comes out of a
form input is a string, including `type="number"`, so:

```js
ageFromForm + 1     // "211"
Number(ageFromForm) + 1   // 22
```

## Truthy and Falsy

There are exactly eight falsy values: `false`, `0`, `-0`, `0n`, `""`, `null`,
`undefined`, `NaN`. Everything else is truthy.

Everything else includes `"0"`, `"false"`, `[]`, `{}` and `" "`, all of which
look empty or negative and are all truthy.

## == against ===

`===` compares type and value. `==` converts first, using a table of rules I do
not want to memorise.

```js
0 == ""      // true
0 == "0"     // true
"" == "0"    // false
```

`==` is not even transitive, which was the point at which I stopped trying to
learn its rules and just decided to use `===` everywhere.

The one case people defend is `value == null`, which is true for both `null` and
`undefined`. Writing it out as `value === null || value === undefined` says the
same thing without needing the reader to know the exception.

## Short Circuiting

`&&` and `||` do not return booleans. They return one of their operands and stop
evaluating as soon as the answer is decided:

```js
"" || "fallback"       // "fallback"
"Aakash" && "reached"  // "reached"
```

That makes `||` a common default-value idiom, and it has a bug in it:

```js
const count = 0;
count || "no data"   // "no data"  - wrong, 0 is a real answer
count ?? "no data"   // 0          - right
```

`??` only falls back on `null` and `undefined`, not on every falsy value. So
`||` is for "empty or missing" and `??` is for "missing" specifically. Anywhere
`0` or `""` are legitimate values, `??` is the correct one.

`?.` does the same kind of job for property access — it stops the lookup and
gives `undefined` instead of throwing a `TypeError` on a missing branch.

## What I Learned

`const` is about the binding, not the value, so a `const` object is still fully
mutable.

`var` is not just old style, it is a different scope, and function scope is the
reason bugs leak out of blocks.

There is one number type, it is a float, and money should be stored as integers
in the smallest unit.

`NaN !== NaN`, so `Number.isNaN()` is the only way to test for it.

The `+` operator is the only maths operator that prefers strings, which is
exactly why form input bugs cluster around it.

Falsy is a list of eight values and nothing else, and `"0"` is not on it.

`||` falls back on any falsy value and `??` only on `null` and `undefined` —
picking the wrong one is a silent bug when the real value is `0`.

## Day 11 Outcome

`variables.js` runs clean in both the browser console and Node, and covers
declarations and scope, all seven primitives, float precision, template
literals, explicit against implicit conversion, the falsy list, strict against
loose equality, and short-circuiting operators, ending with an exercise that
turns raw string form values into a formatted summary with a total.
