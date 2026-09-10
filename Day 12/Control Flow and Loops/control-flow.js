/* Day 12 - Control flow and loops
   Console exercises. Open index.html and look in the DevTools console,
   or run `node control-flow.js` from this folder. */

console.log("=== Day 12 - Control flow and loops ===");


/* ---------------------------------------------------------------
   1. if / else if / else
   --------------------------------------------------------------- */

console.log("\n--- 1. if / else if / else ---");

function describeScore(score) {
    if (score >= 90) {
        return "excellent";
    } else if (score >= 75) {
        return "good";
    } else if (score >= 50) {
        return "pass";
    }
    return "needs work";
}

for (const score of [95, 80, 55, 30]) {
    console.log(score, "->", describeScore(score));
}

// Order matters, because the first match wins and the rest are skipped.
// Written the other way round, everything above 50 would say "pass".

// A ternary is fine for one either/or that produces a value.
const week = 3;
console.log(`Week ${week} is ${week <= 2 ? "markup and styling" : "JavaScript"}.`);

// Guard clauses: return early on the awkward cases so the main path is not
// buried inside three levels of braces.
function feeFor(status) {
    if (!status) return "unknown";
    if (status === "staff") return "free";
    if (status === "student") return "half price";
    return "full price";
}

console.log(["staff", "student", "public", ""].map(feeFor).join(" | "));


/* ---------------------------------------------------------------
   2. switch, and the missing break
   --------------------------------------------------------------- */

console.log("\n--- 2. switch ---");

function topicForDay(dayNumber) {
    switch (dayNumber) {
        case 11:
            return "values and operators";
        case 12:
            return "control flow and loops";
        case 13:
            return "functions and scope";
        // Deliberate fall-through: two labels, one body. Grouping cases like
        // this is the only fall-through I want, and it reads clearly because
        // there is no code between the labels.
        case 14:
        case 15:
            return "arrays, objects and the mini-project";
        default:
            return "not part of week 3";
    }
}

for (const day of [11, 14, 15, 21]) {
    console.log("Day", day, "->", topicForDay(day));
}

// What happens when break is forgotten. Execution carries on into the next
// case body regardless of whether it matches.
function brokenSwitch(value) {
    const reached = [];
    switch (value) {
        case "a":
            reached.push("a");
        // falls through - no break
        case "b":
            reached.push("b");
            break;
        case "c":
            reached.push("c");
            break;
    }
    return reached;
}

console.log("brokenSwitch('a') reached:", brokenSwitch("a"), "- 'b' should not be there");

// switch compares with === , so a string case never matches a number value.
console.log("topicForDay('12') ->", topicForDay("12"));


/* ---------------------------------------------------------------
   3. The counting loops
   --------------------------------------------------------------- */

console.log("\n--- 3. for, while, do...while ---");

// for: initialiser, condition, update. Use it when the index itself matters.
let forOutput = "";
for (let i = 1; i <= 5; i++) {
    forOutput += i + " ";
}
console.log("for       ->", forOutput.trim());

// let, not var. With var the single binding is shared by every iteration, which
// is the classic bug where every deferred callback sees the final value.
const laterWithLet = [];
for (let i = 1; i <= 3; i++) {
    laterWithLet.push(() => i);
}
console.log("let per iteration ->", laterWithLet.map((fn) => fn()));

// while: the count is not known in advance.
let remaining = 5;
let whileOutput = "";
while (remaining > 0) {
    whileOutput += remaining + " ";
    remaining--;
}
console.log("while     ->", whileOutput.trim());

// do...while: body runs once before the condition is ever checked.
let attempts = 0;
do {
    attempts++;
} while (attempts < 1);
console.log("do...while ran", attempts, "time even though the condition was already false");


/* ---------------------------------------------------------------
   4. for...of, for...in and forEach
   --------------------------------------------------------------- */

console.log("\n--- 4. Iterating ---");

const technologies = ["HTML", "CSS", "JavaScript"];

// for...of gives the VALUES. This is the default choice for an array.
for (const tech of technologies) {
    console.log("for...of  ->", tech);
}

// for...in gives the KEYS, as strings, and walks inherited properties too.
// On an array that means "0", "1", "2" - index strings, not values.
for (const key in technologies) {
    console.log("for...in  -> key", key, typeof key, "value", technologies[key]);
}

// Why that is a trap: anything else attached to the array shows up as well.
technologies.lastUpdated = "2026-09-10";
const keysSeen = [];
for (const key in technologies) {
    keysSeen.push(key);
}
console.log("for...in also sees:", keysSeen);
delete technologies.lastUpdated;

// for...in belongs on plain objects.
const hoursByTopic = { HTML: 12, CSS: 18, JavaScript: 6 };
for (const topic in hoursByTopic) {
    console.log("object key ->", topic, "=", hoursByTopic[topic]);
}

// entries() when both index and value are needed.
for (const [index, tech] of technologies.entries()) {
    console.log(`entries() -> ${index}: ${tech}`);
}

// forEach reads well but cannot be stopped early - break and return do not
// exit the loop, they only exit the callback for that one item.
technologies.forEach((tech) => console.log("forEach   ->", tech));


/* ---------------------------------------------------------------
   5. break, continue and labels
   --------------------------------------------------------------- */

console.log("\n--- 5. break and continue ---");

const scores = [70, 45, 88, 0, 91];

for (const score of scores) {
    if (score === 0) continue;       // skip this one, keep looping
    if (score > 90) {
        console.log("Found a score above 90, stopping:", score);
        break;                        // leave the loop entirely
    }
    console.log("Checked", score);
}

// A label lets break leave the OUTER loop from inside the inner one.
outer:
for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= 3; col++) {
        if (row * col > 4) {
            console.log(`Stopped at row ${row}, col ${col}`);
            break outer;
        }
    }
}


/* ---------------------------------------------------------------
   6. Ten small exercises
   --------------------------------------------------------------- */

console.log("\n--- 6. Exercises ---");

// 1. FizzBuzz, 1 to 20.
function fizzBuzz(limit) {
    const out = [];
    for (let n = 1; n <= limit; n++) {
        let label = "";
        if (n % 3 === 0) label += "Fizz";
        if (n % 5 === 0) label += "Buzz";
        out.push(label || n);
    }
    return out;
}
console.log("1. FizzBuzz:", fizzBuzz(20).join(" "));

// 2. Grade from a score, with the invalid range handled first.
function grade(score) {
    if (typeof score !== "number" || Number.isNaN(score)) return "invalid";
    if (score < 0 || score > 100) return "out of range";
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
}
console.log("2. Grades:", [100, 85, 72, 61, 20, 140].map(grade).join(", "));

// 3. Count vowels in a string.
function countVowels(text) {
    let count = 0;
    for (const character of text.toLowerCase()) {
        if ("aeiou".includes(character)) count++;
    }
    return count;
}
console.log("3. Vowels in 'Front-End Development':", countVowels("Front-End Development"));

// 4. Reverse a string with a countdown loop.
function reverse(text) {
    let out = "";
    for (let i = text.length - 1; i >= 0; i--) {
        out += text[i];
    }
    return out;
}
console.log("4. Reversed:", reverse("javascript"));

// 5. Sum the even numbers in a range.
function sumEvens(from, to) {
    let total = 0;
    for (let n = from; n <= to; n++) {
        if (n % 2 !== 0) continue;
        total += n;
    }
    return total;
}
console.log("5. Even numbers 1 to 100 sum to:", sumEvens(1, 100));

// 6. Multiplication table as one line per row.
function timesTable(of, upTo) {
    const rows = [];
    for (let n = 1; n <= upTo; n++) {
        rows.push(`${of} x ${n} = ${of * n}`);
    }
    return rows;
}
console.log("6. Seven times table:", timesTable(7, 5).join(" | "));

// 7. Largest value without Math.max.
function largest(numbers) {
    if (numbers.length === 0) return undefined;
    let biggest = numbers[0];
    for (const n of numbers) {
        if (n > biggest) biggest = n;
    }
    return biggest;
}
console.log("7. Largest of [12, 45, 3, 91, 7]:", largest([12, 45, 3, 91, 7]));

// 8. Prime check. The loop stops at the square root, because a factor above it
// would already have been found paired with one below it.
function isPrime(n) {
    if (!Number.isInteger(n) || n < 2) return false;
    for (let divisor = 2; divisor * divisor <= n; divisor++) {
        if (n % divisor === 0) return false;
    }
    return true;
}
const primes = [];
for (let n = 1; n <= 30; n++) {
    if (isPrime(n)) primes.push(n);
}
console.log("8. Primes up to 30:", primes.join(" "));

// 9. Countdown with while, stopping on a sentinel value.
function countdown(from) {
    const steps = [];
    let n = from;
    while (n > 0) {
        steps.push(n);
        n--;
    }
    steps.push("liftoff");
    return steps;
}
console.log("9. Countdown:", countdown(5).join(" -> "));

// 10. A week planner - nested loops plus a switch on the day.
function weekPlan(weekNumber) {
    const lines = [];
    for (let day = 1; day <= 5; day++) {
        let effort;
        switch (day) {
            case 5:
                effort = "build + README";
                break;
            case 1:
                effort = "new topic, light";
                break;
            default:
                effort = "new topic";
        }
        lines.push(`Week ${weekNumber} day ${day}: ${effort}`);
    }
    return lines;
}
console.log("10. Plan:");
for (const line of weekPlan(3)) {
    console.log("   ", line);
}

console.log("\n=== End of Day 12 ===");
