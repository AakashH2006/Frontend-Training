/* Day 19 - Modules, localStorage and Git
   The entry point. Everything else is imported.

   Loaded with <script type="module">, which changes four things compared with
   the plain <script> of Days 16-18:

     1. Top-level names are scoped to the module, not to window. Nothing here
        leaks into the global namespace.
     2. Modules are deferred by default, so the DOM is parsed before this runs.
        No DOMContentLoaded wrapper is needed.
     3. A module is evaluated once, however many files import it.
     4. Strict mode is on and cannot be turned off.

   Because of (1) a module cannot be opened with file:// - the browser blocks
   it as a cross-origin request. It needs a local server. See notes.md. */

import { searchBooks, HttpError } from "./js/api.js";
import * as store from "./js/state.js";
import { render, showStorageNote } from "./js/render.js";

console.log("=== Day 19 - Modules, localStorage and Git ===");


/* ---------------------------------------------------------------
   1. Wiring
   --------------------------------------------------------------- */

const form = document.getElementById("search-form");
const input = document.getElementById("query");
const resultsEl = document.getElementById("results");
const savedEl = document.getElementById("saved");
const filterList = document.getElementById("filters");
const clearButton = document.getElementById("clear-saved");
const exportButton = document.getElementById("export");
const importInput = document.getElementById("import");

// Render is subscribed once. From here on, changing state redraws the page -
// no handler has to remember to call it.
store.subscribe(render);

render(store.getState());
showStorageNote(store.getState().persistent);


/* ---------------------------------------------------------------
   2. Searching
   --------------------------------------------------------------- */

let controller = null;

function describe(error) {
    if (error instanceof HttpError) {
        return error.status === 404
            ? "Open Library has no endpoint at that address."
            : `Open Library answered ${error.status}. Try again shortly.`;
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

async function runSearch(query) {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;

    // Cancel whatever is still in flight, so a slow earlier response cannot
    // arrive after a fast later one and overwrite it.
    controller?.abort();
    controller = new AbortController();

    store.setQuery(trimmed);
    store.startSearch();

    try {
        const { books } = await searchBooks(trimmed, { signal: controller.signal });
        store.searchSucceeded(books);
    } catch (error) {
        // An abort is not a failure: a newer search is already on screen.
        if (error.name === "AbortError") return;
        store.searchFailed(describe(error));
    }
}

form.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch(input.value);
});


/* ---------------------------------------------------------------
   3. Delegated handlers
   --------------------------------------------------------------- */

// One listener on the container instead of one per card. The cards are
// replaced on every render, so per-card listeners would have to be reattached
// each time - and the ones on removed nodes would leak until GC.
resultsEl.addEventListener("click", (event) => {
    const retry = event.target.closest("#retry");
    if (retry) {
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

// change, not click: a select is also operated with the keyboard.
savedEl.addEventListener("change", (event) => {
    const select = event.target.closest('[data-action="status"]');
    if (!select) return;

    store.setStatus(select.closest(".expense").dataset.id, select.value);
});

filterList.addEventListener("click", (event) => {
    const button = event.target.closest(".filter");
    if (button) store.setFilter(button.dataset.filter);
});

clearButton.addEventListener("click", () => {
    if (store.getState().saved.length === 0) return;
    store.clearSaved();
});


/* ---------------------------------------------------------------
   4. Export and import
   --------------------------------------------------------------- */

// localStorage is per-browser and per-origin. A file is how the list moves
// between browsers - and it is a backup for the corrupt-JSON case in
// storage.js, where the only safe recovery is to start empty.
exportButton.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(store.getState().saved, null, 2)], {
        type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reading-list.json";
    link.click();

    // The object URL pins the blob in memory until it is revoked.
    URL.revokeObjectURL(url);
});

importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    try {
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed)) throw new Error("Expected a list of books.");

        parsed.forEach((book) => {
            if (book && typeof book.id === "string") store.saveBook(book);
        });
    } catch (error) {
        console.error("Import failed:", error);
        store.searchFailed(`Could not import that file: ${error.message}`);
    } finally {
        // Reset, or choosing the same file twice fires no change event.
        importInput.value = "";
    }
});


/* ---------------------------------------------------------------
   5. Safety net
   --------------------------------------------------------------- */

window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled rejection:", event.reason);
});
