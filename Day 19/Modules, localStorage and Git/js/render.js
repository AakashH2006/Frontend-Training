/* Day 19 - everything that touches the DOM.

   This module reads state and writes DOM. It never changes state, and nothing
   that changes state is allowed in here. That one rule is what keeps the data
   flow in a single direction:

       event -> action (state.js) -> subscriber -> render (this file)

   Splitting it out also means api.js and state.js have no `document` in them
   at all, which is what makes them runnable under Node and, later, portable
   into a framework. */

import { coverUrl } from "./api.js";
import { visibleSaved } from "./state.js";

const resultsEl = document.getElementById("results");
const savedEl = document.getElementById("saved");
const statusEl = document.getElementById("status");
const countEl = document.getElementById("saved-count");
const storageNote = document.getElementById("storage-note");
const filterList = document.getElementById("filters");

const cardTemplate = document.getElementById("card-template");
const savedTemplate = document.getElementById("saved-template");
const skeletonTemplate = document.getElementById("skeleton-template");


function authorLine(book) {
    if (book.authors.length === 0) return "Author unknown";
    if (book.authors.length <= 2) return book.authors.join(" and ");
    return `${book.authors[0]} and ${book.authors.length - 1} others`;
}


function fillCover(img, book) {
    const url = coverUrl(book.coverId);

    if (!url) {
        img.remove();
        return;
    }

    img.src = url;
    // The cover adds nothing a screen reader needs that the title does not
    // already say, so it is decorative: empty alt, not a repeat of the title.
    img.alt = "";
    img.loading = "lazy";
}


function renderSkeletons(count = 4) {
    const list = document.createElement("ul");
    list.className = "result-grid";
    // The skeletons are shaped like the real cards so the layout does not jump.
    // They are hidden from assistive tech, which hears the status line instead.
    list.setAttribute("aria-hidden", "true");

    for (let index = 0; index < count; index += 1) {
        list.append(skeletonTemplate.content.cloneNode(true));
    }

    resultsEl.replaceChildren(list);
}


function renderResults(snapshot) {
    const { results, saved } = snapshot;
    const savedIds = new Set(saved.map((entry) => entry.id));

    const list = document.createElement("ul");
    list.className = "result-grid";

    // One fragment, one insertion. Appending inside the loop makes the browser
    // recalculate layout on every pass.
    const fragment = document.createDocumentFragment();

    results.forEach((book) => {
        const node = cardTemplate.content.cloneNode(true);
        const card = node.querySelector(".result-card");

        card.dataset.id = book.id;
        node.querySelector(".result-card__name").textContent = book.title;
        node.querySelector('[data-field="author"]').textContent = authorLine(book);
        node.querySelector('[data-field="year"]').textContent =
            book.year ? `First published ${book.year}` : "Publication year unknown";
        node.querySelector('[data-field="editions"]').textContent =
            `${book.editions} edition${book.editions === 1 ? "" : "s"}`;

        fillCover(node.querySelector(".result-card__cover"), book);

        const button = node.querySelector('[data-action="save"]');
        const already = savedIds.has(book.id);
        button.textContent = already ? "On your list" : "Save";
        button.disabled = already;

        fragment.append(node);
    });

    list.append(fragment);
    resultsEl.replaceChildren(list);
}


function renderError(snapshot) {
    const box = document.createElement("div");
    box.className = "error-box";
    box.innerHTML = `<p class="error-box__title"></p><p class="error-box__body"></p>`;
    box.querySelector(".error-box__title").textContent = "That search did not work";
    box.querySelector(".error-box__body").textContent = snapshot.error;

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button button--small";
    retry.id = "retry";
    retry.textContent = "Try again";
    box.append(retry);

    resultsEl.replaceChildren(box);
}


function renderSaved(snapshot) {
    const visible = visibleSaved(snapshot);

    countEl.textContent =
        snapshot.saved.length === 0
            ? "Nothing saved yet"
            : `${snapshot.saved.length} saved, ${visible.length} shown`;

    if (visible.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent =
            snapshot.saved.length === 0
                ? "Search above, then save a book to start the list."
                : "No saved books have that status.";
        savedEl.replaceChildren(empty);
        return;
    }

    const list = document.createElement("ul");
    list.className = "expense-list";
    const fragment = document.createDocumentFragment();

    visible.forEach((book) => {
        const node = savedTemplate.content.cloneNode(true);
        const row = node.querySelector(".expense");

        row.dataset.id = book.id;
        node.querySelector(".expense__description").textContent = book.title;
        node.querySelector(".expense__date").textContent = authorLine(book);

        const select = node.querySelector('[data-action="status"]');
        select.value = book.status;
        select.id = `status-${book.id.replace(/\W/g, "")}`;
        node.querySelector("label").htmlFor = select.id;

        fragment.append(node);
    });

    list.append(fragment);
    savedEl.replaceChildren(list);
}


function renderStatus(snapshot) {
    const messages = {
        idle: "Search for a title, an author or a subject.",
        loading: "Searching\u2026",
        success: `Showing ${snapshot.results.length} results.`,
        empty: `Nothing matched "${snapshot.query}".`,
        error: "The search failed."
    };

    statusEl.textContent = messages[snapshot.phase] ?? "";
    statusEl.classList.toggle("status--error", snapshot.phase === "error");
}


function renderFilters(snapshot) {
    filterList.querySelectorAll(".filter").forEach((button) => {
        button.setAttribute(
            "aria-pressed",
            String(button.dataset.filter === snapshot.filter)
        );
    });
}


/* The single entry point. It is subscribed to the store once, so every action
   redraws without any handler remembering to ask. */
export function render(snapshot) {
    renderStatus(snapshot);
    renderFilters(snapshot);
    renderSaved(snapshot);

    if (snapshot.phase === "loading") renderSkeletons();
    else if (snapshot.phase === "error") renderError(snapshot);
    else if (snapshot.phase === "idle") resultsEl.replaceChildren();
    else if (snapshot.phase === "empty") {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No books matched that search. Try fewer words.";
        resultsEl.replaceChildren(empty);
    } else renderResults(snapshot);
}


export function showStorageNote(persistent) {
    storageNote.textContent = persistent
        ? "Your list is saved in this browser and will still be here after a reload."
        : "This browser is blocking local storage, so the list will be lost on reload.";
    storageNote.classList.toggle("status--error", !persistent);
}
