/* Day 16 - DOM selection and updates
   Renders the expense list and the summary from a JavaScript array.
   No events yet - that is Day 17. Everything here runs once on load, plus
   whatever I call by hand from the console through `demo`. */

console.log("=== Day 16 - DOM selection and updates ===");


/* ---------------------------------------------------------------
   1. Data
   --------------------------------------------------------------- */

// Carried over from the Day 15 analyzer, already validated, and money is still
// stored as integer paise.
const expenses = [
    { id: 1, date: "2026-08-03", description: "Course fee instalment", category: "course",   amount: 450000 },
    { id: 2, date: "2026-08-05", description: "Metro card top up",     category: "travel",   amount:  60000 },
    { id: 3, date: "2026-08-09", description: "Mechanical keyboard",   category: "hardware", amount: 649900 },
    { id: 4, date: "2026-08-12", description: "Canteen lunch",         category: "food",     amount:  18050 },
    { id: 5, date: "2026-08-19", description: "Notebook and pens",     category: "other",    amount:  34900 },
    { id: 6, date: "2026-09-01", description: "Canteen lunch",         category: "food",     amount:  21000 },
    { id: 7, date: "2026-09-02", description: "Bus fare",              category: "travel",   amount:   4500 },
    { id: 8, date: "2026-09-04", description: "USB-C hub",             category: "hardware", amount: 329900 }
];

const LARGE_EXPENSE_PAISE = 300000;

const rupees = (paise) => `Rs ${(paise / 100).toFixed(2)}`;


/* ---------------------------------------------------------------
   2. Selection
   --------------------------------------------------------------- */

// Selected once, at the top, rather than inside the render function. Every
// query walks the document, so doing it repeatedly in a loop is wasted work.
const summaryList = document.getElementById("summary");
const expenseList = document.getElementById("expense-list");
const statusLine = document.getElementById("status");
const expenseTemplate = document.getElementById("expense-template");
const emptyTemplate = document.getElementById("empty-template");

// The four ways of selecting, and what each returns.
console.log("getElementById   ->", statusLine.tagName, "- one element or null");
console.log("querySelector    ->", document.querySelector(".panel h2").textContent);
console.log("querySelectorAll ->", document.querySelectorAll(".panel").length, "panels (static NodeList)");
console.log("getElementsByTagName ->", document.getElementsByTagName("section").length, "(live HTMLCollection)");

// The live/static difference, demonstrated.
const liveSections = document.getElementsByTagName("section");
const staticSections = document.querySelectorAll("section");
const extraSection = document.createElement("section");
document.querySelector(".page").append(extraSection);

console.log("After adding a section - live:", liveSections.length, "| static:", staticSections.length);
extraSection.remove();

// querySelectorAll returns a NodeList, which has forEach but not map or filter.
const panelHeadings = [...document.querySelectorAll(".panel h2")].map((h) => h.textContent);
console.log("Spread to a real array first:", panelHeadings);


/* ---------------------------------------------------------------
   3. Building one row
   --------------------------------------------------------------- */

function buildExpenseRow(expense) {
    // cloneNode(true) copies the template's children deeply. Without `true`
    // only the empty fragment comes back.
    const row = expenseTemplate.content.cloneNode(true);

    const item = row.querySelector(".expense");
    const date = row.querySelector(".expense__date");
    const description = row.querySelector(".expense__description");
    const tag = row.querySelector(".tag");
    const amount = row.querySelector(".expense__amount");

    // textContent, never innerHTML. A description is user data, and with
    // innerHTML a description of "<img src=x onerror=alert(1)>" would run.
    // textContent treats every character as text, so there is nothing to run.
    date.textContent = expense.date;
    description.textContent = expense.description;
    tag.textContent = expense.category;
    amount.textContent = rupees(expense.amount);

    // dataset writes a data-* attribute. Day 17 needs this to work out which
    // row a click came from.
    item.dataset.id = String(expense.id);

    // classList.toggle with a second argument adds or removes based on the
    // condition, which saves an if/else.
    item.classList.toggle("expense--over", expense.amount >= LARGE_EXPENSE_PAISE);

    // An accessible name for the amount, so it is not read as a bare number.
    amount.setAttribute("aria-label", `Amount ${rupees(expense.amount)}`);

    return row;
}


/* ---------------------------------------------------------------
   4. Rendering the list
   --------------------------------------------------------------- */

function renderList(items) {
    // replaceChildren() with no arguments empties the element. It is clearer
    // than innerHTML = "" and it does not go through the HTML parser.
    expenseList.replaceChildren();

    if (items.length === 0) {
        expenseList.append(emptyTemplate.content.cloneNode(true));
        statusLine.textContent = "Showing 0 of " + expenses.length + " expenses";
        return;
    }

    // A DocumentFragment is an off-screen container. Appending each row to the
    // fragment and the fragment to the page once means the browser only
    // reflows once instead of once per row.
    const fragment = document.createDocumentFragment();

    for (const expense of items) {
        fragment.append(buildExpenseRow(expense));
    }

    expenseList.append(fragment);
    statusLine.textContent = `Showing ${items.length} of ${expenses.length} expenses`;
}


/* ---------------------------------------------------------------
   5. Rendering the summary
   --------------------------------------------------------------- */

function summarise(items) {
    const total = items.reduce((sum, expense) => sum + expense.amount, 0);
    const byCategory = items.reduce((groups, expense) => {
        groups[expense.category] = (groups[expense.category] ?? 0) + expense.amount;
        return groups;
    }, {});

    const topCategory = Object.entries(byCategory).sort(([, a], [, b]) => b - a)[0];

    return {
        Count: String(items.length),
        Total: rupees(total),
        Average: items.length === 0 ? "-" : rupees(Math.round(total / items.length)),
        "Top category": topCategory ? `${topCategory[0]} (${rupees(topCategory[1])})` : "-"
    };
}

function renderSummary(items) {
    const tiles = Object.entries(summarise(items)).map(([label, value]) => {
        // createElement + append, the long way round, for comparison with the
        // template approach above. Both are safe; neither parses HTML.
        const tile = document.createElement("li");
        tile.className = "summary__tile";

        const labelEl = document.createElement("p");
        labelEl.className = "summary__label";
        labelEl.textContent = label;

        const valueEl = document.createElement("p");
        valueEl.className = "summary__value";
        valueEl.textContent = value;

        // append takes several nodes at once, and unlike appendChild it also
        // accepts plain strings.
        tile.append(labelEl, valueEl);
        return tile;
    });

    // Spreading the array into replaceChildren clears and refills in one call.
    summaryList.replaceChildren(...tiles);
}


/* ---------------------------------------------------------------
   6. One render function for the whole view
   --------------------------------------------------------------- */

// The view is a function of the data. Anything that changes the data calls
// render() again rather than reaching in and editing single nodes, which is
// the same idea React is built on.
function render(items = expenses) {
    renderSummary(items);
    renderList(items);
}

render();


/* ---------------------------------------------------------------
   7. Attributes against properties
   --------------------------------------------------------------- */

console.log("\n--- Attributes and properties ---");

const firstRow = expenseList.querySelector(".expense");

console.log("dataset.id:", firstRow.dataset.id, "| getAttribute:", firstRow.getAttribute("data-id"));
console.log("className:", firstRow.className, "| classList:", [...firstRow.classList]);

// The attribute is the initial value from the markup; the property is the live
// state. For an input they drift apart as soon as the user types.
const probe = document.createElement("input");
probe.setAttribute("value", "from the attribute");
probe.value = "changed later";
console.log("attribute:", probe.getAttribute("value"), "| property:", probe.value);

// Sizes and positions live on the element, not in CSS text.
console.log("First row height:", Math.round(firstRow.getBoundingClientRect().height), "px");
console.log("Computed colour:", getComputedStyle(firstRow).backgroundColor);


/* ---------------------------------------------------------------
   8. Traversal
   --------------------------------------------------------------- */

console.log("\n--- Traversal ---");

console.log("parentElement:", firstRow.parentElement.id);
console.log("children:", firstRow.children.length, "element children");
console.log("closest('.panel'):", firstRow.closest(".panel").querySelector("h2").textContent);
console.log("nextElementSibling:", firstRow.nextElementSibling?.querySelector(".expense__description").textContent);

// The element-only versions skip text nodes. childNodes and nextSibling do not,
// and the whitespace between tags counts as a text node.
console.log("childNodes:", firstRow.childNodes.length, "vs children:", firstRow.children.length);


/* ---------------------------------------------------------------
   9. Console helpers - the only way to re-render today
   --------------------------------------------------------------- */

const demo = {
    all: () => render(),

    filter(category) {
        const items = expenses.filter((expense) => expense.category === category);
        render(items);
        return `${items.length} matching`;
    },

    over(rupeeAmount) {
        const items = expenses.filter((expense) => expense.amount >= rupeeAmount * 100);
        render(items);
        return `${items.length} matching`;
    },

    // Editing one node directly rather than re-rendering, to show the
    // difference. This change is lost on the next render(), which is exactly
    // why one render function is easier to reason about.
    dim(id) {
        const row = expenseList.querySelector(`[data-id="${id}"]`);
        row?.classList.add("expense--dimmed");
        return row ? `dimmed ${id}` : `no row with id ${id}`;
    },

    clear: () => render([])
};

// Attached to window so it can be reached from the console. Everything else in
// this file stays out of the global scope.
window.demo = demo;

console.log("\nTry: demo.filter('food'), demo.over(1000), demo.dim(3), demo.clear(), demo.all()");
console.log("=== End of Day 16 ===");
