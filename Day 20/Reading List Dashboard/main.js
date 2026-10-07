/* Day 20 - API app + pull request
   Reading List Dashboard: the finished Week 4 build.

   The entry point, and the only file that knows about both the DOM and the
   store. Everything it does is: listen for an event, call an action, and let
   the subscription redraw. It reads no state of its own and writes no DOM. */

import { searchBooks, HttpError } from "./js/api.js";
import * as store from "./js/state.js";
import { render, showStorageNote, flash } from "./js/render.js";

console.log("=== Day 20 - Reading List Dashboard ===");


/* ---------------------------------------------------------------
   1. Wiring
   --------------------------------------------------------------- */

const form = document.getElementById("search-form");
const input = document.getElementById("query");
const resultsEl = document.getElementById("results");
const savedEl = document.getElementById("saved");
const filterList = document.getElementById("filters");
const sortSelect = document.getElementById("sort");
const savedSearch = document.getElementById("saved-search");
const clearButton = document.getElementById("clear-saved");
const exportButton = document.getElementById("export");
const importInput = document.getElementById("import");

// Subscribed once. From here on, changing state redraws the page, and no
// handler below ever calls render().
store.subscribe(render);

render(store.getState());
showStorageNote(store.getState().persistent);


/* ---------------------------------------------------------------
   2. Small helpers
   --------------------------------------------------------------- */

// Wait until the typing stops. Without it the saved-list filter re-renders on
// every keystroke, and a live API search would fire a request per character.
function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}


/* Turn any thrown thing into a sentence that tells the user what to do next.
   "Something went wrong" does not say whether to retry, check the connection
   or give up. */
function describe(error) {
    if (error instanceof HttpError) {
        if (error.status === 404) return "Open Library has no endpoint at that address.";
        if (error.status === 429) return "Too many searches too quickly. Wait a moment.";
        if (error.status >= 500) return "Open Library is having trouble. Try again shortly.";
        return `Open Library answered ${error.status}.`;
    }

    switch (error.name) {
        case "TimeoutError":
            return "The request took longer than eight seconds and was cancelled.";
        case "TypeError":
            return "Could not reach Open Library. Check your connection.";
        case "SyntaxError":
            return "The response was not valid JSON.";
        default:
            return error.message || "Something went wrong.";
    }
}


/* ---------------------------------------------------------------
   3. Searching
   --------------------------------------------------------------- */

let controller = null;

async function runSearch(rawQuery) {
    const query = rawQuery.trim();
    if (query.length === 0) return;

    // Cancel whatever is in flight, so a slow earlier response cannot land
    // after a fast later one and overwrite it. That race has no error message
    // attached to it - the user just sees stale results.
    controller?.abort();
    controller = new AbortController();

    store.setQuery(query);
    store.startSearch();

    try {
        const { books } = await searchBooks(query, { signal: controller.signal });
        store.searchSucceeded(books);
    } catch (error) {
        // An abort is not a failure. A newer search is already on screen.
        if (error.name === "AbortError") return;
        store.searchFailed(describe(error));
    }
}

form.addEventListener("submit", (event) => {
    // The form is a real form so Enter submits and the browser does the
    // keyboard work. preventDefault stops the page navigating away.
    event.preventDefault();
    runSearch(input.value);
});


/* ---------------------------------------------------------------
   4. Delegated handlers
   --------------------------------------------------------------- */

// One listener on the container, not one per card. The cards are replaced on
// every render, so per-card listeners would need reattaching each time.
resultsEl.addEventListener("click", (event) => {
    if (event.target.closest("#retry")) {
        runSearch(store.getState().query);
        return;
    }

    const save = event.target.closest('[data-action="save"]');
    if (!save) return;

    const id = save.closest(".result-card").dataset.id;
    const book = store.getState().results.find((entry) => entry.id === id);
    if (book) store.saveBook(book);
});


savedEl.addEventListener("click", (event) => {
    const remove = event.target.closest('[data-action="remove"]');
    if (!remove) return;

    store.removeBook(remove.closest(".expense").dataset.id);
});


// change, not click: a select is operated with the keyboard too.
savedEl.addEventListener("change", (event) => {
    const select = event.target.closest('[data-action="status"]');
    if (!select) return;

    store.setStatus(select.closest(".expense").dataset.id, select.value);
});


// Notes save as you type, debounced, so there is no Save button to forget.
const saveNote = debounce((id, value) => store.setNote(id, value), 400);

savedEl.addEventListener("input", (event) => {
    const note = event.target.closest('[data-action="note"]');
    if (!note) return;

    saveNote(note.closest(".expense").dataset.id, note.value);
});


filterList.addEventListener("click", (event) => {
    const button = event.target.closest(".filter");
    if (button) store.setFilter(button.dataset.filter);
});

sortSelect.addEventListener("change", () => store.setSort(sortSelect.value));

savedSearch.addEventListener(
    "input",
    debounce(() => store.setSavedSearch(savedSearch.value))
);


clearButton.addEventListener("click", () => {
    const { saved } = store.getState();
    if (saved.length === 0) return;

    // window.confirm blocks the whole page, which is exactly what is wanted
    // for a destructive action with no undo. Anything less and a stray click
    // wipes the list.
    const sure = window.confirm(
        `Remove all ${saved.length} saved books? This cannot be undone.`
    );
    if (sure) store.clearSaved();
});


/* ---------------------------------------------------------------
   5. Export and import
   --------------------------------------------------------------- */

// localStorage is per-browser and per-origin, so a file is the only way the
// list moves between browsers - and it is the backup for the corrupt-JSON
// case in storage.js, where the only safe recovery is to start empty.
exportButton.addEventListener("click", () => {
    const { saved } = store.getState();

    const blob = new Blob([JSON.stringify(saved, null, 2)], {
        type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reading-list-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();

    // The object URL pins the blob in memory until it is revoked.
    URL.revokeObjectURL(url);

    flash(`Exported ${saved.length} books.`);
});


importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    try {
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed)) {
            throw new Error("that file is not a list of books");
        }

        const added = store.importBooks(parsed);
        flash(
            added === 0
                ? "Nothing new in that file - every book was already on the list."
                : `Imported ${added} new ${added === 1 ? "book" : "books"}.`
        );
    } catch (error) {
        console.error("Import failed:", error);
        flash(`Could not import that file: ${error.message}`);
    } finally {
        // Reset, or choosing the same file twice fires no change event.
        importInput.value = "";
    }
});


/* ---------------------------------------------------------------
   6. Keyboard shortcut
   --------------------------------------------------------------- */

document.addEventListener("keydown", (event) => {
    // "/" focuses the search box, unless the user is already typing somewhere.
    // Without that guard the shortcut eats a slash out of the note field.
    const typing = event.target.matches("input, textarea, select");

    if (event.key === "/" && !typing) {
        event.preventDefault();
        input.focus();
        input.select();
    }

    if (event.key === "Escape" && event.target === input) {
        input.value = "";
        store.clearResults();
    }
});


/* ---------------------------------------------------------------
   7. Safety net
   --------------------------------------------------------------- */

// A rejected promise with no catch is the async version of an uncaught error,
// except nothing stops and nothing looks broken. Logging it makes a forgotten
// catch visible.
window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled rejection:", event.reason);
});
