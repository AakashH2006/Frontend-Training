/* Day 13 - Functions and scope
   Console exercises. Open index.html and look in the DevTools console,
   or run `node functions.js` from this folder. */

console.log("=== Day 13 - Functions and scope ===");


/* ---------------------------------------------------------------
   1. Three ways to write a function
   --------------------------------------------------------------- */

console.log("\n--- 1. Declarations, expressions and arrows ---");

// Declaration. Hoisted, so it can be called before this line.
function toHours(minutes) {
    return minutes / 60;
}

// Expression. The const is hoisted but not initialised, so calling it earlier
// is a ReferenceError rather than "not a function".
const toMinutes = function (hours) {
    return hours * 60;
};

// Arrow. Shortest form for a single expression - the return is implicit.
const toDays = (hours) => hours / 24;

// An arrow returning an object literal needs the braces wrapped in parentheses,
// otherwise the braces are read as a function body.
const asEntry = (topic, hours) => ({ topic, hours });

console.log("90 minutes is", toHours(90), "hours");
console.log("1.5 hours is", toMinutes(1.5), "minutes");
console.log("36 hours is", toDays(36), "days");
console.log("Object from an arrow:", asEntry("CSS", 18));

// Hoisting, demonstrated.
console.log("Declaration called before its line:", callableEarly());
function callableEarly() {
    return "works";
}

try {
    notCallableEarly();
} catch (error) {
    console.log("Expression called before its line:", error.name);
}
const notCallableEarly = () => "never reached";


/* ---------------------------------------------------------------
   2. Parameters
   --------------------------------------------------------------- */

console.log("\n--- 2. Parameters ---");

// A default is used when the argument is undefined - and only then.
function logEntry(topic, hours = 1, note = "no note") {
    return `${topic}: ${hours}h (${note})`;
}

console.log(logEntry("HTML", 3, "semantic structure"));
console.log(logEntry("CSS"));
console.log(logEntry("JS", undefined, "defaults fill in for undefined"));
console.log(logEntry("JS", null, "but NOT for null"));

// Rest gathers everything left over into a real array.
function totalHours(label, ...entries) {
    return `${label}: ${entries.reduce((sum, n) => sum + n, 0)}h across ${entries.length} days`;
}
console.log(totalHours("Week 3", 2, 3, 2.5, 4, 3));

// Spread does the opposite - it unpacks an array into separate arguments.
const week2 = [3, 2, 4, 3, 5];
console.log(totalHours("Week 2", ...week2));

// JavaScript never checks the number of arguments. Missing ones are undefined
// and extra ones are ignored.
console.log("Too few args:", logEntry());
console.log("Too many args:", logEntry("HTML", 2, "fine", "ignored"));

// Parameters are passed by value. For an object, the value IS the reference,
// so the caller sees property changes but not a reassignment.
function tryToChange(entry) {
    entry.hours = 99;      // visible outside
    entry = { hours: 0 };  // rebinds the local name only
    return entry;
}
const original = { topic: "CSS", hours: 18 };
const returned = tryToChange(original);
console.log("Caller sees the mutation:", original, "| local rebind:", returned);


/* ---------------------------------------------------------------
   3. Return values
   --------------------------------------------------------------- */

console.log("\n--- 3. Return values ---");

// A function with no return gives undefined.
function noReturn() {}
console.log("No return statement ->", noReturn());

// Automatic semicolon insertion. The return ends on its own line, so this
// returns undefined and the object is never reached.
function brokenReturn() {
    return
    { ok: true };
}
console.log("return on its own line ->", brokenReturn(), "- the object is unreachable");

function fixedReturn() {
    return {
        ok: true
    };
}
console.log("brace on the same line ->", fixedReturn());


/* ---------------------------------------------------------------
   4. Scope and the scope chain
   --------------------------------------------------------------- */

console.log("\n--- 4. Scope ---");

const courseName = "Front-End";   // module / global scope

function outerScope() {
    const week = 3;               // function scope

    if (week === 3) {
        const day = 13;           // block scope
        // Lookup goes inwards to outwards: block, then function, then global.
        console.log(`Scope chain: ${courseName}, week ${week}, day ${day}`);
    }

    console.log("typeof day inside the function but outside the block:", typeof day);
}
outerScope();

// Shadowing: an inner name hides an outer one of the same name rather than
// overwriting it.
const status = "outer";
function shadow() {
    const status = "inner";
    return status;
}
console.log("Inner:", shadow(), "| outer is untouched:", status);


/* ---------------------------------------------------------------
   5. Closures
   --------------------------------------------------------------- */

console.log("\n--- 5. Closures ---");

// A function keeps access to the scope it was CREATED in, not the scope it is
// called from. That is a closure, and it outlives the call that made it.
function makeCounter(startAt = 0) {
    let count = startAt;   // private - nothing outside can reach it

    return {
        increment: () => ++count,
        value: () => count
    };
}

const dayCounter = makeCounter(11);
dayCounter.increment();
dayCounter.increment();
console.log("Counter value:", dayCounter.value());

// Each call to makeCounter creates a fresh, independent scope.
const other = makeCounter();
console.log("A second counter is independent:", other.value());
console.log("count is not reachable from outside:", typeof count);

// Closures are also what make a "run this only once" wrapper work.
function once(fn) {
    let called = false;
    let result;
    return (...args) => {
        if (called) return result;
        called = true;
        result = fn(...args);
        return result;
    };
}

const setUp = once((name) => {
    console.log("Setting up for", name);
    return `${name} ready`;
});

console.log(setUp("Aakash"));
console.log(setUp("Aakash"), "- second call did not run the body again");


/* ---------------------------------------------------------------
   6. Callbacks and functions as values
   --------------------------------------------------------------- */

console.log("\n--- 6. Callbacks ---");

// A function is a value, so it can be passed to another function.
function applyToAll(numbers, transform) {
    const out = [];
    for (const n of numbers) {
        out.push(transform(n));
    }
    return out;
}

console.log("Doubled:", applyToAll([1, 2, 3], (n) => n * 2));
console.log("Squared:", applyToAll([1, 2, 3], (n) => n * n));

// A function can also return a function, which gives a configurable one.
const multiplyBy = (factor) => (n) => n * factor;
const triple = multiplyBy(3);
console.log("triple(7):", triple(7));

// For a normal function, `this` is decided by the CALL, not by where the
// function was written. The same function body gives a different answer
// depending on what it is called on.
const tracker = {
    label: "Week 3",
    describe() {
        return `${this.label} tracker`;
    }
};
console.log("Called as a method:", tracker.describe());

const detached = tracker.describe;
console.log("Same function, different object:", detached.call({ label: "Week 4" }));


/* ---------------------------------------------------------------
   7. Arrow functions and this
   --------------------------------------------------------------- */

console.log("\n--- 7. this ---");

const timerNormal = {
    label: "normal function",
    run() {
        // An inner normal function gets its own `this`, which is not the object.
        const inner = function () {
            return typeof this === "undefined" ? "undefined (strict)" : "not the object";
        };
        return `${this.label}: inner this is ${inner()}`;
    }
};

const timerArrow = {
    label: "arrow function",
    run() {
        // An arrow has no `this` of its own, so it uses the one from where it
        // was written - the run() method's `this`.
        const inner = () => this.label;
        return `${this.label}: inner this.label is "${inner()}"`;
    }
};

console.log(timerNormal.run());
console.log(timerArrow.run());


/* ---------------------------------------------------------------
   8. Pure functions and side effects
   --------------------------------------------------------------- */

console.log("\n--- 8. Pure and impure ---");

// Pure: same input, same output, nothing outside is touched.
const addHours = (entry, hours) => ({ ...entry, hours: entry.hours + hours });

// Impure: changes its argument, so the caller's data changes underneath them.
function addHoursImpure(entry, hours) {
    entry.hours += hours;
    return entry;
}

const base = { topic: "JS", hours: 6 };
const pureResult = addHours(base, 2);
console.log("After pure call    - original:", base.hours, "result:", pureResult.hours);

addHoursImpure(base, 2);
console.log("After impure call  - original:", base.hours, "- the input changed");


/* ---------------------------------------------------------------
   9. Recursion
   --------------------------------------------------------------- */

console.log("\n--- 9. Recursion ---");

// Base case first, then the smaller version of the same problem.
function factorial(n) {
    if (n < 0) throw new RangeError("factorial needs a non-negative integer");
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}
console.log("factorial(6):", factorial(6));

// Recursion suits nested structures, where a loop would need its own stack.
const syllabus = {
    "Month 1": {
        "Week 1": ["HTML", "Accessibility"],
        "Week 2": ["CSS", "Grid"]
    },
    "Month 2": {
        "Week 5": ["TypeScript"]
    }
};

function countLeaves(node) {
    if (Array.isArray(node)) return node.length;
    let total = 0;
    for (const key in node) {
        total += countLeaves(node[key]);
    }
    return total;
}
console.log("Topics in the syllabus tree:", countLeaves(syllabus));


/* ---------------------------------------------------------------
   10. Exercise: a small reporting pipeline
   --------------------------------------------------------------- */

console.log("\n--- 10. Exercise ---");

const log = [
    { topic: "HTML", minutes: 720 },
    { topic: "CSS", minutes: 1110 },
    { topic: "JavaScript", minutes: 360 },
    { topic: "CSS", minutes: 240 }
];

// Small, single-purpose functions, each of which could be tested on its own.
const minutesToHours = (minutes) => Math.round((minutes / 60) * 10) / 10;

const groupTotals = (entries) =>
    entries.reduce((totals, entry) => {
        totals[entry.topic] = (totals[entry.topic] ?? 0) + entry.minutes;
        return totals;
    }, {});

const formatRow = ([topic, minutes]) =>
    `${topic.padEnd(12)} ${String(minutesToHours(minutes)).padStart(5)}h`;

// A tiny compose helper, built out of closures and rest parameters.
const pipe = (...fns) => (input) => fns.reduce((value, fn) => fn(value), input);

const report = pipe(
    groupTotals,
    Object.entries,
    (rows) => rows.sort((a, b) => b[1] - a[1]),
    (rows) => rows.map(formatRow)
);

for (const row of report(log)) {
    console.log(row);
}

console.log("\n=== End of Day 13 ===");
