/* Day 15 - Expense analyzer
   Week 3 mini-project. A console program: it takes raw expense rows in the
   shape a form or a CSV would produce, validates them, reports on the good
   ones and explains the bad ones.

   Open index.html and look in the DevTools console, or run
   `node expense-analyzer.js` from this folder. */

console.log("=== Day 15 - Expense analyzer ===");


/* ---------------------------------------------------------------
   1. Configuration
   --------------------------------------------------------------- */

// Object.freeze stops accidental writes. It is shallow, so nested objects
// would need freezing too - here everything is one level deep.
const CATEGORIES = Object.freeze({
    food: "Food",
    travel: "Travel",
    course: "Course",
    hardware: "Hardware",
    other: "Other"
});

const BUDGET_PAISE = Object.freeze({
    food: 400000,
    travel: 250000,
    course: 500000,
    hardware: 800000,
    other: 150000
});

const MAX_AMOUNT_PAISE = 10000000;   // a sanity limit: Rs 1,00,000


/* ---------------------------------------------------------------
   2. Error types
   --------------------------------------------------------------- */

// A custom error class carries a name and any extra fields I need, so the
// catch block can tell "the user typed something wrong" apart from "my code
// has a bug", instead of matching on message text.
class ValidationError extends Error {
    constructor(message, { field, value } = {}) {
        super(message);
        this.name = "ValidationError";
        this.field = field;
        this.value = value;
    }
}

class EmptyDatasetError extends Error {
    constructor(message) {
        super(message);
        this.name = "EmptyDatasetError";
    }
}


/* ---------------------------------------------------------------
   3. Validation
   --------------------------------------------------------------- */

// Every field arrives as a string, the way it would from an input element.
// Each check returns the cleaned value or throws a ValidationError naming the
// field, so the caller can report exactly what was wrong with which row.

function parseDescription(raw) {
    const text = String(raw ?? "").trim();
    if (text === "") {
        throw new ValidationError("Description is required", { field: "description", value: raw });
    }
    if (text.length > 60) {
        throw new ValidationError("Description is longer than 60 characters", {
            field: "description",
            value: text.slice(0, 20) + "..."
        });
    }
    return text;
}

function parseAmountToPaise(raw) {
    const text = String(raw ?? "").trim().replace(/,/g, "");
    if (text === "") {
        throw new ValidationError("Amount is required", { field: "amount", value: raw });
    }

    const rupees = Number(text);
    // Number("12abc") is NaN and Number("") is 0, which is why the empty check
    // has to come first and the NaN check second.
    if (Number.isNaN(rupees)) {
        throw new ValidationError("Amount is not a number", { field: "amount", value: raw });
    }
    if (rupees <= 0) {
        throw new ValidationError("Amount must be greater than zero", { field: "amount", value: raw });
    }

    // Convert to paise and round, so the rest of the program only ever deals
    // in integers. Day 11: floats cannot hold 0.1 exactly.
    const paise = Math.round(rupees * 100);
    if (paise > MAX_AMOUNT_PAISE) {
        throw new ValidationError("Amount is above the sanity limit", { field: "amount", value: raw });
    }
    return paise;
}

function parseCategory(raw) {
    const key = String(raw ?? "").trim().toLowerCase();
    if (key === "") {
        throw new ValidationError("Category is required", { field: "category", value: raw });
    }
    // Own property only. Using `key in CATEGORIES` would also accept
    // "toString" and "constructor", which are inherited.
    if (!Object.hasOwn(CATEGORIES, key)) {
        throw new ValidationError(
            `Unknown category, expected one of: ${Object.keys(CATEGORIES).join(", ")}`,
            { field: "category", value: raw }
        );
    }
    return key;
}

function parseDate(raw) {
    const text = String(raw ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new ValidationError("Date must be in YYYY-MM-DD form", { field: "date", value: raw });
    }

    // The shape being right does not make the date real. "2026-02-30" passes
    // the regex, and new Date() does NOT reject it either - it rolls the extra
    // days over into March and hands back a perfectly valid Date. The only way
    // to catch that is to build the date and check it still says what I typed.
    const [year, month, day] = text.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (Number.isNaN(date.getTime())) {
        throw new ValidationError("Date is not a real date", { field: "date", value: raw });
    }
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new ValidationError("Date does not exist in that month", {
            field: "date",
            value: raw
        });
    }
    return text;
}

// One row in, one clean object out. Throws on the first problem it finds.
function parseExpense(row, index) {
    if (row === null || typeof row !== "object") {
        throw new ValidationError("Row is not an object", { field: "row", value: row });
    }

    return {
        line: index + 1,
        date: parseDate(row.date),
        description: parseDescription(row.description),
        category: parseCategory(row.category),
        amount: parseAmountToPaise(row.amount)
    };
}


/* ---------------------------------------------------------------
   4. Loading - collect the failures instead of stopping at the first
   --------------------------------------------------------------- */

function loadExpenses(rows) {
    const accepted = [];
    const rejected = [];

    rows.forEach((row, index) => {
        try {
            accepted.push(parseExpense(row, index));
        } catch (error) {
            // Narrow catch. Only the errors this code knows how to describe are
            // turned into a report line; anything else is a bug in my own code
            // and is rethrown rather than swallowed.
            if (error instanceof ValidationError) {
                rejected.push({
                    line: index + 1,
                    field: error.field,
                    value: error.value,
                    reason: error.message
                });
            } else {
                throw error;
            }
        }
    });

    return { accepted, rejected };
}


/* ---------------------------------------------------------------
   5. Analysis - pure functions over clean data
   --------------------------------------------------------------- */

const rupees = (paise) => `Rs ${(paise / 100).toFixed(2)}`;

function analyse(expenses) {
    if (expenses.length === 0) {
        throw new EmptyDatasetError("No valid expenses to analyse");
    }

    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    const byCategory = expenses.reduce((groups, { category, amount }) => {
        groups[category] ??= { total: 0, count: 0 };
        groups[category].total += amount;
        groups[category].count += 1;
        return groups;
    }, {});

    const byMonth = expenses.reduce((months, { date, amount }) => {
        const month = date.slice(0, 7);
        months[month] = (months[month] ?? 0) + amount;
        return months;
    }, {});

    const largest = expenses.reduce((biggest, expense) =>
        expense.amount > biggest.amount ? expense : biggest
    );

    return {
        count: expenses.length,
        total,
        average: Math.round(total / expenses.length),
        largest,
        byCategory,
        byMonth
    };
}

function budgetStatus(byCategory) {
    return Object.entries(byCategory).map(([key, { total }]) => {
        const budget = BUDGET_PAISE[key] ?? 0;
        const share = budget === 0 ? Infinity : (total / budget) * 100;
        return {
            category: CATEGORIES[key],
            spent: total,
            budget,
            percent: Number.isFinite(share) ? Math.round(share) : null,
            over: total > budget
        };
    });
}


/* ---------------------------------------------------------------
   6. Reporting
   --------------------------------------------------------------- */

function printReport(summary) {
    console.log(`\nExpenses accepted: ${summary.count}`);
    console.log(`Total:   ${rupees(summary.total)}`);
    console.log(`Average: ${rupees(summary.average)}`);
    console.log(`Largest: ${summary.largest.description} (${rupees(summary.largest.amount)}) on ${summary.largest.date}`);

    console.log("\nBy category");
    const ranked = Object.entries(summary.byCategory).sort(([, a], [, b]) => b.total - a.total);
    for (const [key, { total, count }] of ranked) {
        const share = Math.round((total / summary.total) * 100);
        const bar = "#".repeat(Math.max(1, Math.round(share / 4)));
        console.log(
            `  ${CATEGORIES[key].padEnd(9)} ${rupees(total).padStart(12)}  ${String(share).padStart(3)}%  ${bar}  (${count})`
        );
    }

    console.log("\nBy month");
    for (const [month, total] of Object.entries(summary.byMonth).sort()) {
        console.log(`  ${month}  ${rupees(total).padStart(12)}`);
    }

    console.log("\nAgainst budget");
    for (const line of budgetStatus(summary.byCategory)) {
        const state = line.over ? "OVER" : "ok";
        console.log(
            `  ${line.category.padEnd(9)} ${rupees(line.spent).padStart(12)} of ${rupees(line.budget).padStart(12)}  ${String(line.percent).padStart(3)}%  ${state}`
        );
    }
}

function printRejections(rejected) {
    if (rejected.length === 0) {
        console.log("\nNo rejected rows.");
        return;
    }

    console.log(`\nRejected rows: ${rejected.length}`);
    for (const { line, field, value, reason } of rejected) {
        console.log(`  line ${line}: ${field} = ${JSON.stringify(value)} - ${reason}`);
    }
}


/* ---------------------------------------------------------------
   7. The run function, with try / catch / finally
   --------------------------------------------------------------- */

function run(rows, label) {
    console.log(`\n============ ${label} ============`);
    const startedAt = Date.now();

    try {
        const { accepted, rejected } = loadExpenses(rows);
        printRejections(rejected);
        printReport(analyse(accepted));
        return true;
    } catch (error) {
        if (error instanceof EmptyDatasetError) {
            console.log("\nNothing to report:", error.message);
        } else if (error instanceof ValidationError) {
            console.log("\nInput problem:", error.message, "| field:", error.field);
        } else {
            // Unknown failures are re-reported with their type rather than
            // hidden. Swallowing this is how a bug becomes invisible.
            console.log("\nUnexpected failure:", error.name, "-", error.message);
        }
        return false;
    } finally {
        // finally runs whether the try succeeded, threw, or returned. Good for
        // the cleanup or the timing line that has to happen either way.
        console.log(`\n[finished in ${Date.now() - startedAt}ms]`);
    }
}


/* ---------------------------------------------------------------
   8. Data - deliberately mixed, valid rows and broken ones
   --------------------------------------------------------------- */

const rawRows = [
    { date: "2026-08-03", description: "Course fee instalment", category: "course",   amount: "4500" },
    { date: "2026-08-05", description: "Metro card top up",     category: "Travel",   amount: "600" },
    { date: "2026-08-09", description: "Mechanical keyboard",   category: "hardware", amount: "6,499.00" },
    { date: "2026-08-12", description: "Canteen lunch",         category: "food",     amount: "180.50" },
    { date: "2026-08-19", description: "Notebook and pens",     category: "other",    amount: "349" },
    { date: "2026-09-01", description: "Canteen lunch",         category: "food",     amount: "210" },
    { date: "2026-09-02", description: "Bus fare",              category: "travel",   amount: "45" },
    { date: "2026-09-04", description: "USB-C hub",             category: "hardware", amount: "3299" },

    // Every one of these is a different failure.
    { date: "2026-09-05", description: "",                      category: "food",     amount: "120" },
    { date: "2026-09-06", description: "Coffee",                category: "food",     amount: "abc" },
    { date: "2026-09-07", description: "Refund",                category: "food",     amount: "-90" },
    { date: "06-09-2026", description: "Train ticket",          category: "travel",   amount: "800" },
    { date: "2026-02-30", description: "Impossible date",       category: "other",    amount: "100" },
    { date: "2026-09-08", description: "Laptop",                category: "gadgets",  amount: "55000" },
    { date: "2026-09-09", description: "Rounding error",        category: "other",    amount: "" },
    null
];


/* ---------------------------------------------------------------
   9. Run it
   --------------------------------------------------------------- */

run(rawRows, "Full dataset");

// Every row invalid, so analyse() gets an empty array and throws.
run(
    [
        { date: "nope", description: "x", category: "food", amount: "1" },
        { date: "2026-09-09", description: "y", category: "nope", amount: "1" }
    ],
    "All rows invalid"
);

// An empty input list, which is a different path again.
run([], "Empty input");

// A demonstration that a non-ValidationError is not swallowed by loadExpenses.
console.log("\n============ Rethrow check ============");
try {
    loadExpenses({ length: 1 });   // not an array, so forEach does not exist
} catch (error) {
    console.log("loadExpenses rethrew:", error.name, "-", error.message);
}

// error.cause keeps the original error attached when wrapping one in another,
// so the low-level reason is not lost.
try {
    try {
        parseAmountToPaise("abc");
    } catch (error) {
        throw new Error("Could not import row 4", { cause: error });
    }
} catch (error) {
    console.log("\nWrapped:", error.message);
    console.log("Caused by:", error.cause?.name, "-", error.cause?.message);
}

console.log("\n=== End of Day 15 ===");
