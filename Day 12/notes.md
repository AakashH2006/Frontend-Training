# Day 12 - Control Flow and Loops

## Topics Covered

- `if`, `else if`, `else`
- The conditional (ternary) operator
- Guard clauses
- `switch`, grouped cases and fall-through
- `for`, `while`, `do...while`
- `for...of` and `for...in`
- `entries()`
- `forEach` and why it cannot be broken out of
- `break`, `continue` and labelled loops

## Practical Work

`control-flow.js` — five sections on the constructs themselves, then ten small
exercises. Runs in the browser console and under `node control-flow.js`.

The exercises are the point of the day. Reading about `for` loops is not the
same as writing ten of them and getting the off-by-one wrong twice.

## Conditionals

The first matching branch wins and the rest are skipped, so the order of the
tests is part of the logic:

```js
if (score >= 90) return "excellent";
if (score >= 75) return "good";
if (score >= 50) return "pass";
return "needs work";
```

Written the other way round, everything above 50 would come out as "pass".
The ordering is doing the work that the `&&` in `score >= 75 && score < 90`
would otherwise have to do.

### Guard clauses

Returning early on the awkward cases keeps the main path at the left margin:

```js
function feeFor(status) {
    if (!status) return "unknown";
    if (status === "staff") return "free";
    return "full price";
}
```

The alternative nests the real answer three levels deep inside `else` blocks.
This reads top to bottom as a list of rules instead.

### Ternary

`condition ? a : b` is an expression, so it produces a value and can go straight
inside a template literal. I used it for one either/or and nothing more. Nested
ternaries were where I stopped — that is what `if` is for.

## switch

`switch` compares with `===`, which caught me out immediately:

```js
topicForDay("12")   // "not part of week 3"
```

The string `"12"` never matches `case 12`. There is no coercion, so anything
coming from a form or a URL has to be converted before it gets here.

### Fall-through

Without a `break` or a `return`, execution carries on into the next case body
whether or not it matches:

```js
switch (value) {
    case "a":
        reached.push("a");
    // no break
    case "b":
        reached.push("b");
        break;
}
```

`brokenSwitch("a")` returns `["a", "b"]`. Nothing warns about it.

The one fall-through I do want is grouping labels with nothing between them:

```js
case 14:
case 15:
    return "arrays, objects and the mini-project";
```

That reads as "either of these", and because there is no code between the two
labels there is nothing to fall through into.

I used `return` rather than `break` inside a function, which sidesteps the whole
issue — there is no way to fall through a `return`.

## The Counting Loops

| Loop | Use it when |
|------|-------------|
| `for` | The index itself is part of the work |
| `while` | The number of iterations is not known in advance |
| `do...while` | The body must run at least once before testing |

`do...while` ran once even though its condition was already false, which is the
whole difference — the test is at the bottom.

### let, not var, in a for loop

```js
for (let i = 1; i <= 3; i++) {
    laterWithLet.push(() => i);
}
// [1, 2, 3]
```

`let` creates a **new binding for each iteration**, so a function created inside
the loop captures that iteration's value. With `var` there is one binding shared
by every iteration, so all three functions would report `4` — the value it
finished on. This is the classic loop-closure bug and `let` simply removes it.

## Iterating

- `for...of` gives the **values**. Default choice for an array.
- `for...in` gives the **keys**, as strings, including inherited ones.
- `entries()` gives both, destructured as `[index, value]`.
- `forEach` reads nicely but cannot be stopped.

`for...in` on an array looks like it works, and that is the trap:

```js
technologies.lastUpdated = "2026-09-10";
// for...in now yields "0", "1", "2", "lastUpdated"
```

The indexes come back as strings, and anything else attached to the array turns
up as well. `for...in` is for plain objects; `for...of` is for arrays.

### forEach cannot break

`break` is a syntax error inside a `forEach` callback, and `return` only ends
that one call, not the loop. So any loop that has to stop early — a search, a
first match, a limit — needs `for...of`, not `forEach`.

## break, continue and Labels

- `continue` skips the rest of this iteration and goes to the next
- `break` leaves the loop entirely

A label lets `break` leave an outer loop from inside an inner one:

```js
outer:
for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= 3; col++) {
        if (row * col > 4) break outer;
    }
}
```

Without the label, `break` only exits the inner loop and the outer one carries
on. This is the only place I have seen a label used for something sensible.

## The Exercises

Ten of them, all in section 6 of the file:

1. FizzBuzz to 20 — building the label with two `if`s instead of four branches
2. Grade from a score — invalid and out-of-range handled first
3. Count vowels — `for...of` over a string, since strings are iterable
4. Reverse a string — a countdown `for` loop
5. Sum even numbers 1 to 100 — `continue` on the odd ones (2550)
6. Times table — one row per line
7. Largest value without `Math.max`
8. Primes to 30 — the divisor loop stops at the square root
9. Countdown with `while`
10. Week planner — a nested loop with a `switch` inside

Two things I got wrong while writing them:

- **Off by one in the reverse loop.** Starting at `text.length` gives
  `undefined` on the first character, because the last index is `length - 1`.
- **`if (n % 3 === 0) return "Fizz"` in FizzBuzz.** Returning early means 15
  never gets to the Buzz test. Building the string up and only then falling back
  to the number is what makes the both-case work.

The prime loop condition is the one I want to remember:

```js
for (let divisor = 2; divisor * divisor <= n; divisor++)
```

Any factor larger than the square root is already paired with one smaller than
it, so there is nothing above the square root left to find. `divisor * divisor`
avoids calling `Math.sqrt` on every iteration.

## What I Learned

Branch order is logic. The first match wins, so the tests have to be arranged
from most specific to least.

Guard clauses keep the interesting path unindented and turn a function into a
readable list of rules.

`switch` uses `===`, so `"12"` and `12` are different cases and a value from
outside the program has to be converted first.

A missing `break` fails silently and runs the next case body as well.

`let` in a `for` loop gives one binding per iteration, which is why the closure
bug that `var` has does not exist any more.

`for...in` is for objects and `for...of` is for arrays, and mixing them up looks
like it works until something extra is attached to the array.

`forEach` cannot be stopped early, so any search loop has to be `for...of`.

## Day 12 Outcome

`control-flow.js` runs clean in both the browser and Node, and covers
conditionals, guard clauses, `switch` including fall-through, all three counting
loops, the three ways of iterating a collection, and `break`/`continue`/labels,
followed by ten worked exercises.
