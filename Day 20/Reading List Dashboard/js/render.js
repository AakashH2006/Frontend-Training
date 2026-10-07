/* Day 20 - the view.

   Reads state, writes DOM, changes nothing. The data flow stays
   one-directional:

       event -> action (state.js) -> subscriber -> render (this file)

   Every function here takes a snapshot and produces nodes. None of them read
   the live store, which is what stops a render from depending on the order the
   renders happened in. */

import { coverUrl } from "./api.js";
import { visibleSaved, stats } from "./state.js";
import { authorLine, formatDate, timeAgo, plural, percent } from "./format.js";

const el = {
    results: document.getElementById("results"),
    saved: document.getElementById("saved"),
    status: document.getElementById("status"),
    summary: document.getElementById("summary"),
    savedCount: document.getElementById("saved-count"),
    storageNote: document.getElementById("storage-note"),
    filters: document.getElementById("filters"),
    sort: document.getElementById("sort"),
    savedSearch: document.getElementById("saved-search")
};

const templates = {
    card: document.getElementById("card-template"),
    saved: document.getElementById("saved-template"),
    skeleton: document.getElementById("skeleton-template"),
    tile: document.getElementById("tile-template")
};


/* ---------------------------------------------------------------
   Search results
   --------------------------------------------------------------- */

function fillCover(img, book) {
    const url = coverUrl(book.coverId);

    if (!url) {
        // No cover. A broken-image icon says nothing useful, so the element
        // goes rather than being left to fail.
        img.remove();
        return;
    }

    img.src = url;
    // Decorative: the title is directly beside it, so a screen reader reading
    // it again as alt text is noise. Empty alt, not a missing alt.
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove(), { once: true });
}


function renderSkeletons(count = 4) {
    const list = document.createElement("ul");
    list.className = "result-grid";
    // Hidden from assistive tech - the status line announces the loading
    // state, and a list of empty boxes is not information.
    list.setAttribute("aria-hidden", "true");

    for (let index = 0; index < count; index += 1) {
        list.append(templates.skeleton.content.cloneNode(true));
    }

    el.results.replaceChildren(list);
}


function renderResults(snapshot) {
    const savedIds = new Set(snapshot.saved.map((entry) => entry.id));

    const list = document.createElement("ul");
    list.className = "result-grid";

    // Build into a fragment and insert once. Appending inside the loop makes
    // the browser recalculate layout on every iteration.
    const fragment = document.createDocumentFragment();

    snapshot.results.forEach((book) => {
        const node = templates.card.content.cloneNode(true);
        const card = node.querySelector(".result-card");

        card.dataset.id = book.id;

        // textContent, never innerHTML. Titles and author names arrive from a
        // public API and are not trusted markup.
        node.querySelector(".result-card__name").textContent = book.title;
        node.querySelector('[data-field="author"]').textContent =
            authorLine(book.authors);
        node.querySelector('[data-field="year"]').textContent = book.year
            ? `First published ${book.year}`
            : "Publication year unknown";
        node.querySelector('[data-field="editions"]').textContent =
            plural(book.editions, "edition");

        fillCover(node.querySelector(".result-card__cover"), book);

        const button = node.querySelector('[data-action="save"]');
        const already = savedIds.has(book.id);
        button.textContent = already ? "On your list" : "Save";
        button.disabled = already;

        fragment.append(node);
    });

    list.append(fragment);
    el.results.replaceChildren(list);
}


function renderEmptyResults(snapshot) {
    const box = document.createElement("div");
    box.className = "empty-state";

    const title = document.createElement("p");
    title.textContent = `Nothing matched "${snapshot.query}".`;

    const hint = document.createElement("p");
    hint.className = "text-sm";
    hint.textContent = "Try fewer words, or a surname on its own.";

    box.append(title, hint);
    el.results.replaceChildren(box);
}


function renderError(snapshot) {
    const box = document.createElement("div");
    box.className = "error-box";

    const title = document.createElement("p");
    title.className = "error-box__title";
    title.textContent = "That search did not work";

    const body = document.createElement("p");
    body.className = "error-box__body";
    body.textContent = snapshot.error;

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button button--small";
    retry.id = "retry";
    retry.textContent = "Try again";

    box.append(title, body, retry);
    el.results.replaceChildren(box);
}


/* ---------------------------------------------------------------
   The saved list
   --------------------------------------------------------------- */

function renderSaved(snapshot) {
    const visible = visibleSaved(snapshot);

    el.savedCount.textContent =
        snapshot.saved.length === 0
            ? "Nothing saved yet."
            : `${plural(snapshot.saved.length, "book")} saved, ${visible.length} shown.`;

    if (visible.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent =
            snapshot.saved.length === 0
                ? "Search above, then save a book to start the list."
                : "No saved book matches that filter.";
        el.saved.replaceChildren(empty);
        return;
    }

    const list = document.createElement("ul");
    list.className = "expense-list";
    const fragment = document.createDocumentFragment();

    visible.forEach((book) => {
        const node = templates.saved.content.cloneNode(true);
        const row = node.querySelector(".expense");

        row.dataset.id = book.id;
        row.classList.add(`expense--${book.status}`);

        node.querySelector(".expense__description").textContent = book.title;
        node.querySelector(".expense__date").textContent =
            `${authorLine(book.authors)} · added ${timeAgo(book.addedAt)}`;

        // An id has to be unique and a valid selector target, and an Open
        // Library key looks like "/works/OL45804W". The slashes are stripped
        // so label/control pairing works.
        const safeId = book.id.replace(/\W/g, "");

        const select = node.querySelector('[data-action="status"]');
        select.value = book.status;
        select.id = `status-${safeId}`;
        node.querySelector('[data-for="status"]').htmlFor = select.id;

        const note = node.querySelector('[data-action="note"]');
        note.value = book.note ?? "";
        note.id = `note-${safeId}`;
        node.querySelector('[data-for="note"]').htmlFor = note.id;

        const meta = node.querySelector(".expense__meta");
        if (book.finishedAt) {
            meta.textContent = `Finished ${formatDate(book.finishedAt)}`;
        } else if (book.year) {
            meta.textContent = `First published ${book.year}`;
        } else {
            meta.remove();
        }

        fragment.append(node);
    });

    list.append(fragment);
    el.saved.replaceChildren(list);
}


/* ---------------------------------------------------------------
   Summary tiles
   --------------------------------------------------------------- */

function tile(label, value) {
    const node = templates.tile.content.cloneNode(true);
    node.querySelector(".summary__label").textContent = label;
    node.querySelector(".summary__value").textContent = value;
    return node;
}


function renderSummary(snapshot) {
    const figures = stats(snapshot);

    if (figures.total === 0) {
        el.summary.replaceChildren();
        el.summary.hidden = true;
        return;
    }

    el.summary.hidden = false;
    el.summary.replaceChildren(
        tile("On the list", figures.total),
        tile("Reading", figures.reading),
        tile(
            "Finished",
            `${figures.finished} (${percent(figures.finished, figures.total)})`
        ),
        tile("Oldest", figures.oldest ?? "—"),
        tile(
            "Commonest decade",
            figures.commonestDecade === null ? "—" : `${figures.commonestDecade}s`
        )
    );
}


/* ---------------------------------------------------------------
   Status, filters, sort
   --------------------------------------------------------------- */

function renderStatus(snapshot) {
    const messages = {
        idle: "Search for a title, an author or a subject.",
        loading: "Searching…",
        success: `Showing ${plural(snapshot.results.length, "result")}.`,
        empty: `Nothing matched "${snapshot.query}".`,
        error: "The search failed."
    };

    el.status.textContent = messages[snapshot.phase] ?? "";
    el.status.classList.toggle("status--error", snapshot.phase === "error");
}


function renderControls(snapshot) {
    el.filters.querySelectorAll(".filter").forEach((button) => {
        // aria-pressed on a real button, rather than a class that only looks
        // selected. The state has to be in the accessibility tree too.
        button.setAttribute(
            "aria-pressed",
            String(button.dataset.filter === snapshot.filter)
        );
    });

    if (el.sort.value !== snapshot.sort) el.sort.value = snapshot.sort;

    // Only write back when it differs, or typing in the box moves the caret to
    // the end on every keystroke.
    if (el.savedSearch.value !== snapshot.savedSearch) {
        el.savedSearch.value = snapshot.savedSearch;
    }
}


/* ---------------------------------------------------------------
   The single entry point
   --------------------------------------------------------------- */

export function render(snapshot) {
    renderStatus(snapshot);
    renderControls(snapshot);
    renderSummary(snapshot);
    renderSaved(snapshot);

    switch (snapshot.phase) {
        case "loading":
            renderSkeletons();
            break;
        case "error":
            renderError(snapshot);
            break;
        case "empty":
            renderEmptyResults(snapshot);
            break;
        case "idle":
            el.results.replaceChildren();
            break;
        default:
            renderResults(snapshot);
    }
}


export function showStorageNote(persistent) {
    el.storageNote.textContent = persistent
        ? "Saved in this browser. The list will still be here after a reload."
        : "This browser is blocking local storage, so the list will be lost on reload.";
    el.storageNote.classList.toggle("status--error", !persistent);
}


/* A transient message that is not an error and is not part of state - an
   import confirmation, say. The element is role="status", so it is announced
   without moving focus. */
export function flash(message) {
    el.storageNote.textContent = message;
}
