/* Day 14 - Arrays and objects
   Console exercises on a small product dataset. Open index.html and look in
   the DevTools console, or run `node arrays-objects.js` from this folder. */

console.log("=== Day 14 - Arrays and objects ===");


/* ---------------------------------------------------------------
   0. The dataset
   --------------------------------------------------------------- */

// Prices are in paise (the smallest unit) and kept as integers, for the reason
// I found on Day 11: 0.1 + 0.2 is not 0.3.
const products = [
    { id: 1, name: "Mechanical keyboard", category: "input",   price: 649900, stock: 12, tags: ["wired", "rgb"] },
    { id: 2, name: "Wireless mouse",      category: "input",   price: 189900, stock: 0,  tags: ["wireless"] },
    { id: 3, name: "27in monitor",        category: "display", price: 2249900, stock: 4, tags: ["4k", "ips"] },
    { id: 4, name: "USB-C hub",           category: "adapter", price: 329900, stock: 23, tags: ["usb-c"] },
    { id: 5, name: "Laptop stand",        category: "desk",    price: 149900, stock: 7,  tags: ["aluminium"] },
    { id: 6, name: "Webcam 1080p",        category: "display", price: 419900, stock: 0,  tags: ["1080p", "usb"] },
    { id: 7, name: "Desk mat",            category: "desk",    price:  99900, stock: 31, tags: ["felt"] }
];

const rupees = (paise) => `Rs ${(paise / 100).toFixed(2)}`;

console.log("Dataset:", products.length, "products");


/* ---------------------------------------------------------------
   1. Mutating against non-mutating
   --------------------------------------------------------------- */

console.log("\n--- 1. Which methods change the original ---");

const letters = ["a", "b", "c"];

// Non-mutating: they return something new and leave the original alone.
console.log("slice(1):", letters.slice(1), "| original:", letters);
console.log("concat:  ", letters.concat("d"), "| original:", letters);
console.log("spread:  ", [...letters, "d"], "| original:", letters);

// Mutating: they change the array in place and return something else entirely.
const copy = [...letters];
const removed = copy.splice(1, 1);
console.log("splice returns the removed items:", removed, "| array is now:", copy);
console.log("push returns the new length:", copy.push("z"), "| array is now:", copy);

// The list worth memorising, because these are the ones that mutate:
// push, pop, shift, unshift, splice, sort, reverse, fill, copyWithin.


/* ---------------------------------------------------------------
   2. map, filter, find
   --------------------------------------------------------------- */

console.log("\n--- 2. map, filter, find ---");

// map: same length out, each item transformed.
const names = products.map((product) => product.name);
console.log("map ->", names.length, "names:", names.slice(0, 3).join(", "), "...");

// filter: same items, fewer of them.
const inStock = products.filter((product) => product.stock > 0);
console.log("filter -> in stock:", inStock.length, "of", products.length);

// find: the first match, or undefined. findIndex gives its position, or -1.
const monitor = products.find((product) => product.category === "display");
console.log("find ->", monitor.name);
console.log("find with no match ->", products.find((p) => p.price > 9999999));
console.log("findIndex with no match ->", products.findIndex((p) => p.price > 9999999));

// some and every ask a yes/no question and stop as soon as they know.
console.log("some out of stock?", products.some((p) => p.stock === 0));
console.log("every priced?     ", products.every((p) => p.price > 0));

// Chaining reads in the order the work happens.
const affordableInStock = products
    .filter((product) => product.stock > 0)
    .filter((product) => product.price < 500000)
    .map((product) => `${product.name} (${rupees(product.price)})`);
console.log("Chained:", affordableInStock);

// map has to RETURN something. An arrow with braces and no return gives
// an array of undefined, which is a mistake that looks like it worked.
const broken = products.map((product) => { product.name; });
console.log("map with braces and no return:", broken.slice(0, 3));


/* ---------------------------------------------------------------
   3. reduce
   --------------------------------------------------------------- */

console.log("\n--- 3. reduce ---");

// reduce(callback, initialValue). The accumulator is whatever I want it to be,
// which is the part that makes it more than "sum an array".
const totalStockValue = products.reduce((total, product) => total + product.price * product.stock, 0);
console.log("Total stock value:", rupees(totalStockValue));

// The initial value is not optional in practice. Without it, reduce uses the
// first item as the accumulator, and on an empty array it throws.
try {
    [].reduce((a, b) => a + b);
} catch (error) {
    console.log("reduce on [] with no initial value:", error.name);
}
console.log("With an initial value:", [].reduce((a, b) => a + b, 0));

// Grouping - the accumulator is an object.
const byCategory = products.reduce((groups, product) => {
    // ??= assigns only if the key is null or undefined, so an existing group
    // is never replaced.
    groups[product.category] ??= [];
    groups[product.category].push(product.name);
    return groups;
}, {});
console.log("Grouped by category:", byCategory);

// Indexing by id - the accumulator is a lookup table.
const byId = products.reduce((lookup, product) => {
    lookup[product.id] = product;
    return lookup;
}, {});
console.log("Lookup by id 4:", byId[4].name);

// Object.groupBy does the grouping in one call in newer runtimes. Guarded,
// because it is recent enough that it may not exist.
if (typeof Object.groupBy === "function") {
    const grouped = Object.groupBy(products, (product) => product.category);
    console.log("Object.groupBy categories:", Object.keys(grouped).join(", "));
} else {
    console.log("Object.groupBy not available here - the reduce above is the fallback");
}


/* ---------------------------------------------------------------
   4. sort
   --------------------------------------------------------------- */

console.log("\n--- 4. sort ---");

// Default sort converts everything to strings, which is wrong for numbers.
console.log("Default sort:", [10, 9, 100, 1].sort(), "- '10' comes before '9'");
console.log("With a comparator:", [10, 9, 100, 1].sort((a, b) => a - b));

// sort MUTATES. Copy first, or use toSorted where it exists.
const original = [3, 1, 2];
const sorted = [...original].sort((a, b) => a - b);
console.log("Copy then sort - original:", original, "sorted:", sorted);

const cheapestFirst = (typeof products.toSorted === "function")
    ? products.toSorted((a, b) => a.price - b.price)
    : [...products].sort((a, b) => a.price - b.price);
console.log("Cheapest:", cheapestFirst[0].name, rupees(cheapestFirst[0].price));

// Strings need localeCompare rather than a - b.
const alphabetical = [...products].sort((a, b) => a.name.localeCompare(b.name));
console.log("Alphabetical:", alphabetical.map((p) => p.name).slice(0, 3).join(", "), "...");

// Two keys: fall through to the second only when the first ties.
const byCategoryThenPrice = [...products].sort((a, b) =>
    a.category.localeCompare(b.category) || a.price - b.price
);
console.log("Category then price:", byCategoryThenPrice.map((p) => `${p.category}/${p.name}`));


/* ---------------------------------------------------------------
   5. flat and flatMap
   --------------------------------------------------------------- */

console.log("\n--- 5. flat and flatMap ---");

const allTags = products.flatMap((product) => product.tags);
console.log("All tags:", allTags.join(", "));

// A Set removes duplicates, and spreading it gives an array back.
const uniqueTags = [...new Set(allTags)].sort();
console.log("Unique tags:", uniqueTags.join(", "));
console.log("flat on nesting:", [1, [2, [3, [4]]]].flat(2));


/* ---------------------------------------------------------------
   6. Objects
   --------------------------------------------------------------- */

console.log("\n--- 6. Objects ---");

const settings = { theme: "light", "items-per-page": 20 };

// Dot for a fixed name, brackets when the key is in a variable or is not a
// valid identifier.
const key = "theme";
console.log("Dot:", settings.theme, "| bracket by variable:", settings[key]);
console.log("Key with a dash needs brackets:", settings["items-per-page"]);

// Optional chaining, and its call form.
const config = { api: { url: "https://example.test" } };
console.log("Deep read:", config.api?.url);
console.log("Missing branch:", config.cache?.ttl);
console.log("Missing method:", config.log?.write?.("nothing happens"));

// Computed keys and shorthand.
const field = "stock";
const threshold = 5;
const rule = { [field]: threshold, [`${field}Label`]: "units" };
console.log("Computed keys:", rule);

// Keys, values, entries.
console.log("Object.keys:", Object.keys(settings));
console.log("Object.entries:", Object.entries(settings));
// entries + map + fromEntries is the object equivalent of map on an array.
const upperValues = Object.fromEntries(
    Object.entries(settings).map(([k, v]) => [k, String(v).toUpperCase()])
);
console.log("fromEntries:", upperValues);

// Spread merges, and later keys win.
const defaults = { theme: "light", compact: false };
const userPrefs = { compact: true };
console.log("Merged:", { ...defaults, ...userPrefs });

// But spread is a SHALLOW copy. Nested objects are still shared.
const source = { name: "keyboard", meta: { warrantyYears: 2 } };
const shallow = { ...source };
shallow.meta.warrantyYears = 5;
console.log("Shallow copy shares the nested object:", source.meta.warrantyYears);

const deep = structuredClone(source);
deep.meta.warrantyYears = 99;
console.log("structuredClone is independent:", source.meta.warrantyYears);


/* ---------------------------------------------------------------
   7. Destructuring
   --------------------------------------------------------------- */

console.log("\n--- 7. Destructuring ---");

// Arrays destructure by POSITION.
const [first, second, ...rest] = products;
console.log("Array:", first.name, "|", second.name, "| rest:", rest.length);

// Swapping without a temporary variable.
let a = 1;
let b = 2;
[a, b] = [b, a];
console.log("Swapped:", a, b);

// Objects destructure by NAME, with renaming and defaults.
const { name, price, discount = 0, category: group } = products[0];
console.log(`Object: ${name} in ${group} at ${rupees(price)}, discount ${discount}`);

// Nested, and in a parameter list.
const order = { id: "A-19", customer: { name: "Aakash", city: "Bengaluru" } };
const { customer: { city } } = order;
console.log("Nested:", city);

function describe({ name, stock, tags = [] }) {
    return `${name}: ${stock} in stock, tagged ${tags.join("/")}`;
}
console.log("In a parameter:", describe(products[2]));

// Destructuring undefined throws, so a default object is worth having.
function safeDescribe({ name = "unknown" } = {}) {
    return name;
}
console.log("Called with nothing:", safeDescribe());


/* ---------------------------------------------------------------
   8. Exercise: a stock report
   --------------------------------------------------------------- */

console.log("\n--- 8. Exercise: stock report ---");

function stockReport(items) {
    const available = items.filter(({ stock }) => stock > 0);

    const totals = available.reduce((acc, { category, price, stock }) => {
        acc[category] ??= { count: 0, units: 0, value: 0 };
        acc[category].count += 1;
        acc[category].units += stock;
        acc[category].value += price * stock;
        return acc;
    }, {});

    const rows = Object.entries(totals)
        .sort(([, x], [, y]) => y.value - x.value)
        .map(([category, { count, units, value }]) =>
            `${category.padEnd(9)} ${String(count).padStart(2)} lines  ${String(units).padStart(3)} units  ${rupees(value).padStart(14)}`
        );

    return {
        rows,
        outOfStock: items.filter(({ stock }) => stock === 0).map(({ name }) => name),
        grandTotal: available.reduce((sum, { price, stock }) => sum + price * stock, 0)
    };
}

const { rows, outOfStock, grandTotal } = stockReport(products);

for (const row of rows) {
    console.log(row);
}
console.log("Out of stock:", outOfStock.join(", "));
console.log("Grand total: ", rupees(grandTotal));

// Nothing above mutated the dataset - the original order is untouched.
console.log("First product is still:", products[0].name);

console.log("\n=== End of Day 14 ===");
