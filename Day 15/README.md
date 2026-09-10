# Week 3 — JavaScript Fundamentals

Five days of the language itself, with no DOM and no framework. Everything is
console output, so the same files run in the browser and under Node.

## What this is

Four days of exercises building up the language, then a mini-project that uses
all of it: a console expense analyzer with real input validation and error
handling.

The finished project for the week is:

`Day 15/Objects and Error Handling/expense-analyzer.js`

## How to run it

No build step and no dependencies.

**In the browser** — open any day's `index.html` and then the DevTools console
(`F12`, then the Console tab). The page itself only explains what the file does;
all of the output is in the console.

**Without a browser** — from inside a day's folder:

```bash
node variables.js
node control-flow.js
node functions.js
node arrays-objects.js
node expense-analyzer.js
```

Both run exactly the same file. Nothing this week touches the DOM, which is why
it does not need a browser at all — that starts in Week 4.

## Folder layout

```text
Day 11/Variables, Values and Operators/   variables.js
Day 12/Control Flow and Loops/            control-flow.js
Day 13/Functions and Scope/               functions.js
Day 14/Arrays and Objects/                arrays-objects.js
Day 15/Objects and Error Handling/        expense-analyzer.js
```

Each folder also has an `index.html` runner page and a copy of the small
`styles.css`, so any day can be opened on its own.

## The mini-project

`expense-analyzer.js` takes raw expense rows in the shape a form or a CSV would
produce — every field a string, several of them wrong — and:

- validates date, description, category and amount, each in its own function
- rejects a bad row with its line number, the field and the reason, and carries
  on rather than stopping at the first failure
- stores money as integer paise and divides only when printing
- groups totals by category and by month, finds the largest and the average, and
  compares each category against a budget
- runs three more times to exercise the failure paths: all rows invalid, empty
  input, and an unexpected error that is rethrown rather than swallowed

It is arranged in four layers — parse, load, analyse, report — and the analysis
layer does no validation at all, because by then the data is guaranteed clean.

## Exercise count

Over the four exercise days: 9 sections on values and operators, 10 worked
exercises on control flow plus 5 sections on the constructs, 10 sections on
functions and scope, and 8 on arrays and objects — comfortably past the 15 the
week asks for, plus the mini-project.

## What I learned this week

- `const` fixes the binding, not the value, so a `const` object is still fully
  mutable.
- There is one number type and it is a float, so money is stored in the smallest
  unit as an integer and only divided for display.
- `||` falls back on any falsy value and `??` only on `null` and `undefined`.
  Picking the wrong one is a silent bug the moment a real value is `0`.
- `let` in a `for` loop creates a binding per iteration, which is why the old
  closure-in-a-loop bug does not happen any more.
- `for...of` is for arrays and `for...in` is for objects, and swapping them looks
  like it works until something extra is attached to the array.
- A closure is a function plus the scope it was created in, and it is how private
  state exists in a language with no private keyword.
- `this` in a normal function belongs to the call site; an arrow has none of its
  own and uses the surrounding one.
- `sort` compares as strings by default and mutates the array.
- `reduce`'s accumulator can be an object, which turns grouping and lookup tables
  into one call.
- Spread copies one level deep; `structuredClone` is the deep one.
- Validation belongs in one layer at the edge, and a catch block should handle
  only what it recognises and rethrow the rest.
- `new Date()` does not reject impossible dates — it rolls them over — so a date
  has to be built and compared back to the input.

## Checks I ran

- Every file runs to completion under Node with no uncaught errors
- Every file runs in the browser console with the same output
- The analyzer exercised on four datasets: mixed, all-invalid, empty, and a
  deliberate unexpected error
- Confirmed the analyzer does not mutate its input dataset
- Confirmed a non-`ValidationError` is rethrown out of the loader rather than
  reported as bad input

## Week 3 completion checkpoint

- [x] More than 15 small exercises across the week
- [x] One mini-project using functions, arrays and objects
- [x] Input validation and `try`/`catch` where failure is possible
- [x] Nothing copy-pasted; every exercise written and run
- [x] Five daily commits

## Next week

Week 4 is browser JavaScript: DOM selection and updates, events and forms, then
Promises, `async`/`await` and the Fetch API, followed by modules, `localStorage`
and the Git and GitHub workflow.
