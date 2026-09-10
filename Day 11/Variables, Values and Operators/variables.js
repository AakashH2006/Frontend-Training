/* Day 11 - Variables, values and operators
   Console exercises. Open index.html and look in the DevTools console,
   or run `node variables.js` from this folder. */

console.log("=== Day 11 - Variables, values and operators ===");


/* ---------------------------------------------------------------
   1. const, let and why not var
   --------------------------------------------------------------- */

console.log("\n--- 1. Declarations ---");

const courseName = "Front-End Web Development";
let currentWeek = 3;

currentWeek = currentWeek + 1;
console.log(courseName, "- now on week", currentWeek);

// const stops REASSIGNMENT, not mutation. The binding is fixed, the value
// underneath is not.
const progress = { html: "done", css: "done" };
progress.javascript = "in progress";
console.log("const object can still be mutated:", progress);

try {
    // Reassigning the binding is the thing const actually prevents.
    // Written as a string and passed to eval only so the file still parses -
    // `progress = {}` on its own line is caught before anything runs, so the
    // try/catch would never see it. I would not use eval in real code.
    eval("progress = {}");
} catch (error) {
    console.log("Reassigning it throws:", error.name);
}

// let and const are block scoped. var is function scoped, which is the whole
// reason I am not using it.
{
    let insideBlock = "only visible inside these braces";
    console.log(insideBlock);
}
console.log("typeof insideBlock outside the block:", typeof insideBlock);


/* ---------------------------------------------------------------
   2. The primitive types
   --------------------------------------------------------------- */

console.log("\n--- 2. Primitives ---");

const values = [
    "text",
    42,
    true,
    undefined,
    null,
    Symbol("id"),
    9007199254740993n
];

for (const value of values) {
    console.log(String(value).padEnd(20), "->", typeof value);
}

// The famous wrong answer. typeof null is "object" because of a bug in the
// first version of JavaScript that was never fixable without breaking the web.
console.log("typeof null is", typeof null, "- this is a known language bug");

// undefined means "no value has been put here yet".
// null means "a value was put here deliberately, and it is nothing".
let notAssignedYet;
const deliberatelyEmpty = null;
console.log("undefined:", notAssignedYet, "| null:", deliberatelyEmpty);


/* ---------------------------------------------------------------
   3. Numbers behave like floats, because they are floats
   --------------------------------------------------------------- */

console.log("\n--- 3. Numbers ---");

console.log("0.1 + 0.2 =", 0.1 + 0.2);
console.log("0.1 + 0.2 === 0.3 ?", 0.1 + 0.2 === 0.3);

// Comparing to a small tolerance instead of comparing exactly.
const almostEqual = Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON;
console.log("Within Number.EPSILON ?", almostEqual);

// For money, work in the smallest unit and divide only when displaying.
const priceInPaise = 19999;
console.log("Rounded to 2dp:", (priceInPaise / 100).toFixed(2));

console.log("NaN === NaN ?", NaN === NaN, "- use Number.isNaN() instead");
console.log("Number.isNaN(Number('abc')) ?", Number.isNaN(Number("abc")));
console.log("1 / 0 =", 1 / 0);


/* ---------------------------------------------------------------
   4. Strings and template literals
   --------------------------------------------------------------- */

console.log("\n--- 4. Strings ---");

const firstName = "Aakash";
const day = 11;

// Concatenation with + is what I used to write.
console.log("Old way: " + firstName + " is on day " + day + ".");

// A template literal handles the spaces for me and can hold an expression.
console.log(`Template: ${firstName} is on day ${day}, week ${Math.ceil(day / 5)}.`);

// It can also span lines without \n.
const summary = `Course:  ${courseName}
Student: ${firstName}
Day:     ${day}`;
console.log(summary);

// Strings are immutable. Every "change" is a new string.
const upper = firstName.toUpperCase();
console.log("Original is untouched:", firstName, "| new string:", upper);


/* ---------------------------------------------------------------
   5. Type conversion - explicit and implicit
   --------------------------------------------------------------- */

console.log("\n--- 5. Conversion ---");

// Explicit. This is what I want in real code, because it says what it does.
console.log("Number('42')     ->", Number("42"), typeof Number("42"));
console.log("Number('')       ->", Number(""));
console.log("Number('12abc')  ->", Number("12abc"));
console.log("parseInt('12abc')->", parseInt("12abc", 10), "- stops at the first non-digit");
console.log("String(42)       ->", String(42), typeof String(42));
console.log("Boolean('false') ->", Boolean("false"), "- any non-empty string is true");

// Implicit. The operator decides, and + is the awkward one because it means
// both addition and concatenation.
console.log("'5' + 1 =", "5" + 1, "- + prefers strings, so this concatenates");
console.log("'5' - 1 =", "5" - 1, "- every other maths operator converts to number");
console.log("'5' * '2' =", "5" * "2");
console.log("[] + {} =", [] + {});

// A form field always gives a string, even type="number".
const ageFromForm = "21";
console.log("Bug:", ageFromForm + 1, "| Fixed:", Number(ageFromForm) + 1);


/* ---------------------------------------------------------------
   6. Truthy and falsy
   --------------------------------------------------------------- */

console.log("\n--- 6. Truthy and falsy ---");

// There are exactly eight falsy values and everything else is truthy.
const falsyValues = [false, 0, -0, 0n, "", null, undefined, NaN];
console.log("Falsy count:", falsyValues.filter((v) => !v).length, "of", falsyValues.length);

const surprisinglyTruthy = ["0", "false", [], {}, " "];
for (const value of surprisinglyTruthy) {
    console.log(JSON.stringify(value).padEnd(8), "is truthy:", Boolean(value));
}


/* ---------------------------------------------------------------
   7. Comparison: == against ===
   --------------------------------------------------------------- */

console.log("\n--- 7. Comparison ---");

console.log("'5' == 5   ->", "5" == 5, "- loose, converts first");
console.log("'5' === 5  ->", "5" === 5, "- strict, type must match");
console.log("null == undefined  ->", null == undefined);
console.log("null === undefined ->", null === undefined);
console.log("0 == ''    ->", 0 == "");
console.log("0 == '0'   ->", 0 == "0");
console.log("'' == '0'  ->", "" == "0", "- so == is not even transitive");

// I use === everywhere. The one exception people allow is `x == null` to catch
// null and undefined together, and even that is clearer written out.
const maybeMissing = undefined;
console.log("Explicit version:", maybeMissing === null || maybeMissing === undefined);


/* ---------------------------------------------------------------
   8. Logical operators and short circuiting
   --------------------------------------------------------------- */

console.log("\n--- 8. Logical operators ---");

const isEnrolled = true;
const hasSubmitted = false;

console.log("AND:", isEnrolled && hasSubmitted);
console.log("OR: ", isEnrolled || hasSubmitted);
console.log("NOT:", !hasSubmitted);

// && and || do not return true or false. They return one of the operands,
// and they stop as soon as the answer is known.
console.log("'' || 'fallback'        ->", "" || "fallback");
console.log("'Aakash' && 'reached'   ->", "Aakash" && "reached");

// Which matters when 0 or "" are legitimate values.
const submittedCount = 0;
console.log("With || :", submittedCount || "no data", "- wrong, 0 is falsy");
console.log("With ?? :", submittedCount ?? "no data", "- right, only null/undefined");

// Optional chaining stops a lookup rather than throwing.
const student = { name: "Aakash", course: { title: "Front-End" } };
console.log("Deep read:", student.course?.title);
console.log("Missing branch:", student.mentor?.name, "- undefined, not a TypeError");


/* ---------------------------------------------------------------
   9. Putting it together
   --------------------------------------------------------------- */

console.log("\n--- 9. Exercise: a summary line from raw form values ---");

// Everything here arrives as a string, the way it would from an input element.
const rawEntries = [
    { technology: "HTML", hours: "12", done: "true" },
    { technology: "CSS", hours: "18.5", done: "true" },
    { technology: "JavaScript", hours: "", done: "false" }
];

for (const entry of rawEntries) {
    const hours = Number(entry.hours);
    const safeHours = Number.isNaN(hours) || entry.hours === "" ? 0 : hours;
    const isDone = entry.done === "true";

    const status = isDone ? "complete" : "in progress";
    const label = `${entry.technology.padEnd(11)} ${safeHours.toFixed(1).padStart(5)}h  ${status}`;

    console.log(label);
}

const totalHours = rawEntries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
console.log(`Total logged: ${totalHours.toFixed(1)} hours`);

console.log("\n=== End of Day 11 ===");
