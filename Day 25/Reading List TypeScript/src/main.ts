/* Day 25 - Reading List, in TypeScript.
   The Week 5 build: Day 20's app migrated, with the API and storage boundaries
   validated and the request phase modelled as a discriminated union.

   The entry point, and the only file that knows about both the DOM and the
   store. It listens for an event, calls an action, and lets the subscription
   redraw. It reads no state of its own and writes no DOM. */

import "./styles.css";

import { type Filter, type Sort, FILTERS, SORTS, isStatus } from "./lib/model";
import * as store from "./lib/state";
import { render, syncStatusOptions } from "./lib/render";
import { describeSearchFailure, searchBooks } from "./lib/api";
import { closestAction, elementFrom, mustFind } from "./lib/dom";

console.log("=== Day 25 - Reading List, in TypeScript ===");


/* ---------------------------------------------------------------
   1. Wiring
   --------------------------------------------------------------- */

/* Nine lookups, each with the element type it needs. A typo in any id throws
   here, at startup, with the id in the message - rather than later as "cannot
   read properties of null" on whichever line touched it first. */
const form = mustFind<HTMLFormElement>("search-form");
const input = mustFind<HTMLInputElement>("query");
const resultsEl = mustFind("results");
const savedEl = mustFind("saved");
const filterList = mustFind("filters");
const sortSelect = mustFind<HTMLSelectElement>("sort");
const savedSearch = mustFind<HTMLInputElement>("saved-search");
const clearButton = mustFind<HTMLButtonElement>("clear-saved");
const exportButton = mustFind<HTMLButtonElement>("export");
const importInput = mustFind<HTMLInputElement>("import");

// Subscribed once. From here on, changing state redraws the page, and no
// handler below ever calls render().
syncStatusOptions();
store.subscribe(render);
render(store.getState());


/* ---------------------------------------------------------------
   2. Helpers
   --------------------------------------------------------------- */

/* Day 20's debounce was `(fn, delay = 250)` with `...args` untyped, so it
   erased the signature of whatever it wrapped. The generic keeps it: the
   returned function takes exactly what `fn` takes.

   `Args extends readonly unknown[]` is a constrained rest parameter, and it is
   the thing that made the difference - with a plain `unknown[]` the spread
   back into `fn` does not type-check. */
function debounce<Args extends readonly unknown[]>(
    fn: (...args: Args) => void,
    delay = 250
): (...args: Args) => void {
    let timer: ReturnType<typeof setTimeout> | undefined;

    return (...args: Args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

/* `ReturnType<typeof setTimeout>` rather than `number`, because the DOM's
   setTimeout returns a number and Node's returns a Timeout object. Writing
   `number` compiles until @types/node is in scope and then does not. */


/* Two narrowing guards for values arriving from the DOM as plain strings.
   `dataset` and `select.value` are both `string`, and these are what turn a
   string into a member of the union before it reaches an action. */
function isFilter(value: string): value is Filter {
    return (FILTERS as readonly string[]).includes(value);
}

function isSort(value: string): value is Sort {
    return (SORTS as readonly string[]).includes(value);
}


/* ---------------------------------------------------------------
   3. Searching
   --------------------------------------------------------------- */

let controller: AbortController | null = null;

async function runSearch(rawQuery: string): Promise<void> {
    const query = rawQuery.trim();
    if (query.length === 0) return;

    /* Cancel whatever is in flight, so a slow earlier response cannot land
       after a fast later one and overwrite it. That race has no error message
       attached to it - the user just sees stale results. */
    controller?.abort();
    controller = new AbortController();

    store.startSearch(query);

    try {
        const result = await searchBooks(query, { signal: controller.signal });

        /* A Result, so the failure is a value rather than a throw, and the
           compiler will not let `result.value` be read until `.ok` is checked.
           Day 20 had a try/catch here and nothing enforcing the check. */
        if (result.ok) {
            store.searchSucceeded(query, result.value.books, result.value.total);

            if (result.value.skipped > 0) {
                console.warn(`${result.value.skipped} result(s) were dropped by the shape guard.`);
            }
        } else {
            store.searchFailed(query, describeSearchFailure(result.error));
        }
    } catch (error) {
        /* The only thing still thrown is an abort, which is not a failure - a
           newer search is already on screen. Everything else is a Result. */
        if (error instanceof DOMException && error.name === "AbortError") return;
        throw error;
    }
}

form.addEventListener("submit", (event) => {
    // The form is a real form, so Enter submits and the browser does the
    // keyboard work. preventDefault stops the page navigating away.
    event.preventDefault();
    void runSearch(input.value);
});


/* ---------------------------------------------------------------
   4. Delegated handlers
   --------------------------------------------------------------- */

/* One listener per container, not one per card. The cards are replaced on every
   render, so per-card listeners would need reattaching each time. */
resultsEl.addEventListener("click", (event) => {
    const target = elementFrom(event);
    if (target === null) return;

    if (target.closest("#retry") !== null) {
        void runSearch(store.currentQuery());
        return;
    }

    const hit = closestAction(event, '[data-action="save"]', ".result-card");
    if (hit === null) return;

    /* The results only exist on the success member, so reading them means
       asking the union first. In Day 20 `state.results` was always present and
       could be a stale array from a previous search. */
    const search = store.getState().search;
    if (search.phase !== "success") return;

    const book = search.results.find((entry) => entry.id === hit.id);
    if (book !== undefined) store.saveBook(book);
});


savedEl.addEventListener("click", (event) => {
    const hit = closestAction(event, '[data-action="remove"]', ".expense");
    if (hit !== null) store.removeBook(hit.id);
});


// change, not click: a select is operated with the keyboard too.
savedEl.addEventListener("change", (event) => {
    const hit = closestAction(event, '[data-action="status"]', ".expense");
    if (hit === null) return;

    if (!(hit.element instanceof HTMLSelectElement)) return;

    /* `select.value` is a string, and `setStatus` takes a Status. The guard is
       what bridges them - and it is the typo from Day 20 made unreachable:
       "readng" now fails the check and nothing is written. */
    if (isStatus(hit.element.value)) {
        store.setStatus(hit.id, hit.element.value);
    }
});


// Notes save as you type, debounced, so there is no Save button to forget.
const saveNote = debounce((id: string, value: string) => store.setNote(id, value), 400);

savedEl.addEventListener("input", (event) => {
    const hit = closestAction(event, '[data-action="note"]', ".expense");
    if (hit === null) return;
    if (!(hit.element instanceof HTMLTextAreaElement)) return;

    saveNote(hit.id, hit.element.value);
});


filterList.addEventListener("click", (event) => {
    const target = elementFrom(event);
    const button = target?.closest(".filter");
    if (!(button instanceof HTMLElement)) return;

    const filter = button.dataset["filter"];
    // `dataset` entries are `string | undefined`, so both the presence and the
    // value have to be checked.
    if (filter !== undefined && isFilter(filter)) store.setFilter(filter);
});

sortSelect.addEventListener("change", () => {
    if (isSort(sortSelect.value)) store.setSort(sortSelect.value);
});

savedSearch.addEventListener(
    "input",
    debounce(() => store.setSavedSearch(savedSearch.value))
);


clearButton.addEventListener("click", () => {
    const { saved } = store.getState();
    if (saved.length === 0) return;

    // window.confirm blocks the whole page, which is what is wanted for a
    // destructive action with no undo.
    const sure = window.confirm(
        `Remove all ${saved.length} saved books? This cannot be undone.`
    );
    if (sure) store.clearSaved();
});


/* ---------------------------------------------------------------
   5. Export and import
   --------------------------------------------------------------- */

exportButton.addEventListener("click", () => {
    const { saved } = store.getState();

    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `reading-list-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();

    // The object URL pins the blob in memory until it is revoked.
    URL.revokeObjectURL(url);

    store.setNotice(`Exported ${saved.length} books.`);
});


importInput.addEventListener("change", () => {
    void (async () => {
        const file = importInput.files?.[0];
        if (file === undefined) return;

        try {
            /* `unknown`, not `any`. The file has been on a disk and may have
               been edited by hand, so nothing about its shape is known. */
            const parsed: unknown = JSON.parse(await file.text());

            if (!Array.isArray(parsed)) {
                throw new Error("that file is not a list of books");
            }

            /* The guard inside importBooks drops anything that is not a valid
               SavedBook, so a malformed row is one skipped entry rather than a
               broken card. Reporting both numbers, because silently importing
               3 of 10 would be worse than saying so. */
            const added = store.importBooks(parsed);
            const skipped = parsed.length - added;

            store.setNotice(
                added === 0
                    ? `Nothing imported from that file${skipped > 0 ? ` (${skipped} entries were unusable or already saved)` : ""}.`
                    : `Imported ${added} ${added === 1 ? "book" : "books"}${skipped > 0 ? `, skipped ${skipped}` : ""}.`
            );
        } catch (error) {
            console.error("Import failed:", error);
            const message = error instanceof Error ? error.message : String(error);
            store.setNotice(`Could not import that file: ${message}`);
        } finally {
            // Reset, or choosing the same file twice fires no change event.
            importInput.value = "";
        }
    })();
});


/* ---------------------------------------------------------------
   6. Keyboard shortcuts
   --------------------------------------------------------------- */

document.addEventListener("keydown", (event) => {
    const target = elementFrom(event);

    // "/" focuses the search box, unless the user is already typing somewhere.
    // Without that guard the shortcut eats a slash out of the note field.
    const typing = target?.matches("input, textarea, select") ?? false;

    if (event.key === "/" && !typing) {
        event.preventDefault();
        input.focus();
        input.select();
    }

    if (event.key === "Escape" && target === input) {
        input.value = "";
        store.clearSearch();
    }
});


/* ---------------------------------------------------------------
   7. Safety net
   --------------------------------------------------------------- */

window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled rejection:", event.reason);
});
