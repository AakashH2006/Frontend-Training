/* Day 17 - Events and forms
   The Day 16 renderer, now driven by events: a validated add form, a search
   box, category filters, a sort control and per-row delete.

   State lives in one place, every handler changes state and then calls
   render(). No handler edits a node directly. */

console.log("=== Day 17 - Events and forms ===");


/* ---------------------------------------------------------------
   1. State
   --------------------------------------------------------------- */

const state = {
    expenses: [
        { id: 1, date: "2026-08-03", description: "Course fee instalment", category: "course",   amount: 450000 },
        { id: 2, date: "2026-08-05", description: "Metro card top up",     category: "travel",   amount:  60000 },
        { id: 3, date: "2026-08-09", description: "Mechanical keyboard",   category: "hardware", amount: 649900 },
        { id: 4, date: "2026-08-12", description: "Canteen lunch",         category: "food",     amount:  18050 },
        { id: 5, date: "2026-08-19", description: "Notebook and pens",     category: "other",    amount:  34900 },
        { id: 6, date: "2026-09-01", description: "Canteen lunch",         category: "food",     amount:  21000 },
        { id: 7, date: "2026-09-02", description: "Bus fare",              category: "travel",   amount:   4500 },
        { id: 8, date: "2026-09-04", description: "USB-C hub",             category: "hardware", amount: 329900 }
    ],
    search: "",
    category: "all",
    sort: "date-desc"
};

let nextId = state.expenses.length + 1;

const LARGE_EXPENSE_PAISE = 300000;
const rupees = (paise) => `Rs ${(paise / 100).toFixed(2)}`;


/* ---------------------------------------------------------------
   2. Elements
   --------------------------------------------------------------- */

const form = document.getElementById("expense-form");
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const filterList = document.getElementById("filters");
const expenseList = document.getElementById("expense-list");
const summaryList = document.getElementById("summary");
const statusLine = document.getElementById("status");
const expenseTemplate = document.getElementById("expense-template");
const emptyTemplate = document.getElementById("empty-template");


/* ---------------------------------------------------------------
   3. Rendering (unchanged from Day 16, plus the delete button)
   --------------------------------------------------------------- */

function visibleExpenses() {
    const term = state.search.trim().toLowerCase();

    const filtered = state.expenses.filter((expense) => {
        const matchesCategory = state.category === "all" || expense.category === state.category;
        const matchesSearch = term === "" || expense.description.toLowerCase().includes(term);
        return matchesCategory && matchesSearch;
    });

    const comparators = {
        "date-desc": (a, b) => b.date.localeCompare(a.date),
        "date-asc": (a, b) => a.date.localeCompare(b.date),
        "amount-desc": (a, b) => b.amount - a.amount,
        "amount-asc": (a, b) => a.amount - b.amount,
        "description-asc": (a, b) => a.description.localeCompare(b.description)
    };

    // Copy before sorting. sort() mutates, and state.expenses is not the
    // view's to reorder (Day 14).
    return [...filtered].sort(comparators[state.sort]);
}

function buildExpenseRow(expense) {
    const row = expenseTemplate.content.cloneNode(true);
    const item = row.querySelector(".expense");

    row.querySelector(".expense__date").textContent = expense.date;
    row.querySelector(".expense__description").textContent = expense.description;
    row.querySelector(".tag").textContent = expense.category;
    row.querySelector(".expense__amount").textContent = rupees(expense.amount);

    item.dataset.id = String(expense.id);
    item.classList.toggle("expense--over", expense.amount >= LARGE_EXPENSE_PAISE);

    // The button needs its own accessible name. Six buttons all saying
    // "Delete" is useless to anyone listing the buttons on the page.
    const deleteButton = row.querySelector('[data-action="delete"]');
    deleteButton.setAttribute("aria-label", `Delete ${expense.description}`);

    return row;
}

function renderList(items) {
    expenseList.replaceChildren();

    if (items.length === 0) {
        expenseList.append(emptyTemplate.content.cloneNode(true));
    } else {
        const fragment = document.createDocumentFragment();
        for (const expense of items) {
            fragment.append(buildExpenseRow(expense));
        }
        expenseList.append(fragment);
    }

    statusLine.classList.remove("status--error");
    statusLine.textContent = `Showing ${items.length} of ${state.expenses.length} expenses`;
}

function renderSummary(items) {
    const total = items.reduce((sum, expense) => sum + expense.amount, 0);
    const byCategory = items.reduce((groups, expense) => {
        groups[expense.category] = (groups[expense.category] ?? 0) + expense.amount;
        return groups;
    }, {});
    const top = Object.entries(byCategory).sort(([, a], [, b]) => b - a)[0];

    const tiles = Object.entries({
        Count: String(items.length),
        Total: rupees(total),
        Average: items.length === 0 ? "-" : rupees(Math.round(total / items.length)),
        "Top category": top ? `${top[0]} (${rupees(top[1])})` : "-"
    }).map(([label, value]) => {
        const tile = document.createElement("li");
        tile.className = "summary__tile";

        const labelEl = document.createElement("p");
        labelEl.className = "summary__label";
        labelEl.textContent = label;

        const valueEl = document.createElement("p");
        valueEl.className = "summary__value";
        valueEl.textContent = value;

        tile.append(labelEl, valueEl);
        return tile;
    });

    summaryList.replaceChildren(...tiles);
}

function render() {
    const items = visibleExpenses();
    renderSummary(items);
    renderList(items);
}


/* ---------------------------------------------------------------
   4. Validation - the Constraint Validation API
   --------------------------------------------------------------- */

// The form has novalidate, so the browser does not show its own bubbles, but
// every constraint in the HTML is still checked and readable here through
// input.validity. The rules stay in the markup and are not duplicated in JS.

const MESSAGES = {
    valueMissing: {
        description: "Enter a description",
        amount: "Enter an amount",
        date: "Choose a date",
        category: "Choose a category"
    },
    rangeUnderflow: { amount: "Amount must be more than zero" },
    rangeOverflow: { amount: "Amount must be Rs 1,00,000 or less" },
    tooLong: { description: "Use 60 characters or fewer" },
    badInput: { amount: "Amount must be a number" },
    stepMismatch: { amount: "Use at most two decimal places" }
};

function messageFor(input) {
    const { validity, name } = input;
    if (validity.valid) return "";

    for (const key of Object.keys(MESSAGES)) {
        if (validity[key] && MESSAGES[key][name]) {
            return MESSAGES[key][name];
        }
    }
    // Fall back to the browser's own wording rather than saying nothing.
    return input.validationMessage;
}

function showError(input) {
    const errorLine = document.getElementById(`${input.name}-error`);
    const message = messageFor(input);
    if (errorLine) errorLine.textContent = message;
    return message === "";
}

function clearErrors() {
    for (const errorLine of form.querySelectorAll(".field__error")) {
        errorLine.textContent = "";
    }
}


/* ---------------------------------------------------------------
   5. Form events
   --------------------------------------------------------------- */

// submit on the FORM, not click on the button. A form can also be submitted by
// pressing Enter in a text field, and a click handler on the button misses it.
form.addEventListener("submit", (event) => {
    // Without this the browser navigates and the page reloads, which throws
    // away all the state. It is the first line of nearly every submit handler.
    event.preventDefault();

    const controls = [...form.elements].filter((element) => element.name);
    const allValid = controls.map(showError).every(Boolean);

    if (!allValid) {
        // Move focus to the first problem so a keyboard user is taken there.
        const firstInvalid = controls.find((control) => !control.validity.valid);
        firstInvalid?.focus();
        statusLine.classList.add("status--error");
        statusLine.textContent = "Fix the highlighted fields and try again";
        return;
    }

    // FormData reads every named control in one go, so the handler does not
    // need a reference to each input.
    const data = Object.fromEntries(new FormData(form));

    const expense = {
        id: nextId++,
        date: data.date,
        description: data.description.trim(),
        category: data.category,
        // Still integer paise. Day 11.
        amount: Math.round(Number(data.amount) * 100)
    };

    state.expenses.push(expense);
    form.reset();
    clearErrors();
    render();

    statusLine.textContent = `Added ${expense.description} (${rupees(expense.amount)})`;
    document.getElementById("description").focus();

    // A custom event, so anything else that cares can listen without this
    // handler having to know about it. Day 19 will use one to trigger saving.
    form.dispatchEvent(new CustomEvent("expense:added", {
        detail: expense,
        bubbles: true
    }));
});

// Validate a field when the user leaves it, not while they are still typing.
// blur does not bubble, so the listener has to be registered in the capture
// phase to catch it from the form. focusout is the bubbling version, and it is
// the simpler answer.
form.addEventListener("focusout", (event) => {
    if (event.target.name) showError(event.target);
});

// Once a field has been marked wrong, clear the message as soon as it becomes
// valid again rather than making the user submit to find out.
form.addEventListener("input", (event) => {
    const input = event.target;
    if (input.name && input.validity.valid) {
        const errorLine = document.getElementById(`${input.name}-error`);
        if (errorLine) errorLine.textContent = "";
    }
});

form.addEventListener("reset", () => {
    // reset fires before the fields are actually cleared, so the clean-up has
    // to wait for the next tick.
    setTimeout(() => {
        clearErrors();
        statusLine.classList.remove("status--error");
        render();
    }, 0);
});

document.addEventListener("expense:added", (event) => {
    console.log("Custom event heard on document:", event.detail.description);
});


/* ---------------------------------------------------------------
   6. Event delegation
   --------------------------------------------------------------- */

// ONE listener on the list, not one per row. The rows are created and destroyed
// on every render, so a per-row listener would have to be re-attached each
// time - and any row added later would have none at all.
expenseList.addEventListener("click", (event) => {
    // event.target is the deepest element that was clicked.
    // event.currentTarget is the element the listener is on - the list.
    // closest() walks up from the target to find the button, which is what
    // makes the click work even if the button ever gets an icon inside it.
    const button = event.target.closest("[data-action]");
    if (!button) return;          // a click on the row background, ignore it

    const row = button.closest(".expense");
    const id = Number(row.dataset.id);

    if (button.dataset.action === "delete") {
        removeExpense(id, row);
    }
});

function removeExpense(id, row) {
    const index = state.expenses.findIndex((expense) => expense.id === id);
    if (index === -1) return;

    const [removed] = state.expenses.splice(index, 1);

    // Where focus goes after the focused element is deleted matters. Left
    // alone, focus falls back to <body> and a keyboard user loses their place.
    const nextRow = row.nextElementSibling ?? row.previousElementSibling;
    render();

    const nextButton = nextRow
        ? expenseList.querySelector(`[data-id="${nextRow.dataset.id}"] [data-action="delete"]`)
        : null;
    (nextButton ?? searchInput).focus();

    statusLine.textContent = `Deleted ${removed.description}`;
}

// The filters work the same way: one listener for six buttons.
filterList.addEventListener("click", (event) => {
    const button = event.target.closest(".filter");
    if (!button) return;

    state.category = button.dataset.category;

    // aria-pressed is the state a screen reader reads out, and the stylesheet
    // uses the same attribute for the highlight, so there is one source of
    // truth rather than a class and an attribute that can disagree.
    for (const filter of filterList.querySelectorAll(".filter")) {
        filter.setAttribute("aria-pressed", String(filter === button));
    }

    render();
});


/* ---------------------------------------------------------------
   7. Search and sort
   --------------------------------------------------------------- */

// input fires on every keystroke, including paste and the search box's clear
// button. change would only fire when the field is left.
searchInput.addEventListener("input", debounce((event) => {
    state.search = event.target.value;
    render();
}, 200));

// A debounce waits until the events stop before doing the work. Rendering on
// every keystroke is fine for eight rows and would not be for eight thousand,
// and the same helper is what a search that calls an API needs on Day 18.
function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
});


/* ---------------------------------------------------------------
   8. Keyboard shortcut, and the event object
   --------------------------------------------------------------- */

document.addEventListener("keydown", (event) => {
    // "/" focuses the search box, unless the user is already typing in a field.
    const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName);

    if (event.key === "/" && !typing) {
        // Stop the browser's own quick-find from opening as well.
        event.preventDefault();
        searchInput.focus();
    }

    if (event.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = "";
        state.search = "";
        render();
    }
});

// Bubbling, demonstrated once in the console. The event starts at the deepest
// element and travels up through every ancestor, which is what makes one
// listener on the list able to hear a click on a button inside a row.
expenseList.addEventListener("click", (event) => {
    console.log(
        "target:", event.target.tagName,
        "| currentTarget:", event.currentTarget.id,
        "| phase:", event.eventPhase === 3 ? "bubbling" : "at target"
    );
});


/* ---------------------------------------------------------------
   9. Start
   --------------------------------------------------------------- */

// Default the date field to today, so adding an expense is one field shorter.
document.getElementById("date").value = new Date().toISOString().slice(0, 10);

render();

console.log("Ready. Press / to search, Escape to clear it.");
console.log("=== End of Day 17 ===");
