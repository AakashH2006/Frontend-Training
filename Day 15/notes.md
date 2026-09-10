# Day 15 - Objects and Error Handling Mini-Project

## Topics Covered

- `throw` and the `Error` object
- `try` / `catch` / `finally`
- Custom error classes
- `instanceof` for narrowing a catch
- Rethrowing what I cannot handle
- `error.cause`
- `Object.freeze`
- `Object.hasOwn` against `in`
- Input validation as a separate layer
- Collecting failures instead of stopping at the first

## Practical Work

Last day of Week 3, so this is the mini-project: `expense-analyzer.js`.

It takes raw expense rows in the shape a form or a CSV would produce — every
field a string, some of them wrong — validates each one, reports on what it
accepted and explains what it rejected and why.

It runs four times over different data so every path is exercised: the full
mixed dataset, a dataset where every row is invalid, an empty input, and a
deliberate non-validation error to prove it is not swallowed.

Everything from this week is in it: template literals and conversion from Day
11, guard clauses and loops from Day 12, small pure functions and closures from
Day 13, and `reduce`, destructuring and sorting from Day 14.

## Structure

Four layers, each of which only does one job:

```text
parse*        one field in, clean value out, or throw
parseExpense  one row in, clean object out, or throw
loadExpenses  many rows in, { accepted, rejected } out - catches here
analyse       clean rows in, summary object out - assumes valid data
printReport   summary in, console output out
```

The rule that made this work: **the analysis functions do not validate.** By the
time data reaches `analyse()` it is guaranteed clean, so there is not a single
`if (typeof x === "string")` in the reporting code. All the defensive work
happens once, at the edge.

That is a version of the pure-function idea from Day 13 — keep the side effects
and the messy input handling at the edges, and let the middle be simple.

## Throwing

An error is thrown with a value, and that value should be an `Error`:

```js
throw new ValidationError("Amount is not a number", { field: "amount", value: raw });
```

`throw "some string"` is legal and it is a bad idea, because a string has no
`name`, no `message` and no stack trace, so the catch block cannot tell what it
is or where it came from.

### Custom error classes

```js
class ValidationError extends Error {
    constructor(message, { field, value } = {}) {
        super(message);
        this.name = "ValidationError";
        this.field = field;
        this.value = value;
    }
}
```

Two reasons this is better than a plain `Error`:

1. `instanceof ValidationError` lets a catch block ask what kind of failure this
   is, instead of matching on message text, which breaks the moment I reword a
   message.
2. It carries extra fields. The rejection report prints the line number, the
   field name and the offending value, and all of that comes off the error
   object rather than being reconstructed by the caller.

Setting `this.name` explicitly matters — without it the name stays `"Error"` and
the console prints the wrong label.

## Catching Narrowly

The part I would have got wrong a week ago:

```js
try {
    accepted.push(parseExpense(row, index));
} catch (error) {
    if (error instanceof ValidationError) {
        rejected.push({ ... });
    } else {
        throw error;
    }
}
```

A bare `catch` that handles everything hides my own bugs. If `parseExpense` has
a typo and throws a `TypeError`, a catch-all would file it as "bad user input"
and the run would look successful with a mysteriously short report.

So: handle what I recognise, rethrow the rest. I tested this by calling
`loadExpenses({ length: 1 })`, which is not an array — the `TypeError` from
`rows.forEach` came straight back out instead of being logged as a bad row.

## Collecting Failures

The first version stopped at the first bad row, which is a poor experience — the
user fixes one line, runs it again, and finds the next one.

`loadExpenses` returns both lists instead:

```js
return { accepted, rejected };
```

Now one run reports all eight problems at once, each with its line number, and
still produces a full report from the eight rows that were fine. Partial success
is a better default than all-or-nothing for anything importing user data.

## finally

```js
} finally {
    console.log(`[finished in ${Date.now() - startedAt}ms]`);
}
```

`finally` runs whether the `try` succeeded, threw, or returned — including when
`return true` is inside the `try`, which surprised me. The return value is
computed, then `finally` runs, then the function actually returns.

That makes it the place for anything that must happen either way: closing a
file, stopping a spinner, or a timing line like this one.

## error.cause

When one error wraps another, the original is easy to lose:

```js
throw new Error("Could not import row 4", { cause: error });
```

`cause` keeps the low-level error attached, so the report can say both "could
not import row 4" and "because the amount was not a number". Without it I would
have to flatten the original into a string and lose its type and stack.

## The Date Bug

The one real bug I found today, and it is the sort I would not have gone looking
for.

My date check was a regex for `YYYY-MM-DD` followed by `new Date()` and a
`Number.isNaN(date.getTime())` test, which I believed was thorough.

`"2026-02-30"` passed both. February has 28 days in 2026, so that date does not
exist — but `Date` does not reject it. It **rolls the extra days over** into
March and hands back a perfectly valid date object. The row was accepted and
turned up in the report under a `2026-02` month heading.

The fix is a round trip: build the date, then check it still says what I typed.

```js
const [year, month, day] = text.split("-").map(Number);
const date = new Date(Date.UTC(year, month - 1, day));

if (date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day) {
    throw new ValidationError("Date does not exist in that month", { ... });
}
```

If the day rolled over, the rebuilt date disagrees with the input and the row is
rejected. The rejection count went from 7 to 8 once this was in.

Two smaller date notes:

- `getUTCMonth()` is zero-based, so February is `1`. `getUTCDate()` is not.
- I used `Date.UTC` rather than the local-time constructor so that the check
  cannot be thrown off by a timezone shifting the date by a day.

## Validation Details

Ordering matters, in the same way branch order did on Day 12:

```js
if (text === "") throw ...            // must come first
const rupees = Number(text);
if (Number.isNaN(rupees)) throw ...   // then this
```

`Number("")` is `0`, not `NaN`, so an empty amount would sail through the `NaN`
check and be recorded as a zero-rupee expense. The empty test has to come first.

`Object.hasOwn(CATEGORIES, key)` rather than `key in CATEGORIES`, because `in`
also finds inherited properties — `"toString" in CATEGORIES` is `true`, so a
row with the category `"constructor"` would have been accepted.

Money is parsed straight to integer paise with `Math.round(rupees * 100)`, and
the only division is in the `rupees()` display helper. That follows from the
float problem on Day 11 and means no total can drift.

`Object.freeze` on the category and budget objects stops an accidental write
turning configuration into data. It is shallow, so a nested object would need
freezing too — everything here is one level deep.

## What I Learned

Validation belongs at the edge, in one layer, so nothing downstream has to be
defensive.

An error should be an `Error`, and a custom subclass turns "something went
wrong" into "this specific thing went wrong with this field and this value".

`instanceof` in the catch, and rethrow anything unrecognised. A catch-all is how
a bug becomes invisible.

Collecting failures beats stopping at the first one, because a user fixing an
import wants the whole list.

`finally` runs even when the `try` block returns.

`new Date()` does not validate. It rolls impossible dates over silently, and the
only reliable check is to build it and compare it back to the input.

Check for an empty string before checking for `NaN`, because `Number("")` is `0`.

`Object.hasOwn` rather than `in`, or inherited properties become valid input.

## Day 15 Outcome

The Week 3 mini-project runs clean in the browser and Node. It validates four
fields with typed errors that carry the field and value, collects every
rejection with its line number instead of stopping at the first, reports totals
by category and by month with a budget comparison, and handles the empty
dataset, the all-invalid dataset and unexpected errors along separate paths.

Week 3 README is written. Week 4 is the DOM, events and the Fetch API.
