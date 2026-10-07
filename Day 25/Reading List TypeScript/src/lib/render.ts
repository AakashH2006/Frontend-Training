/* Day 25 - the view, typed.

   Reads state, writes DOM, changes nothing. The data flow is unchanged from
   Day 19:

       event -> action (state.ts) -> subscriber -> render (this file)

   The migration changed two things. Every DOM lookup goes through dom.ts, and
   `render` switches on a discriminated union instead of a string - so the
   `default:` branch is now an exhaustiveness check rather than a guess at what
   is left over. */

import { type Book, type SavedBook, type Status, STATUSES } from "./model";
import { type AppState, type SearchState, stats, visibleSaved } from "./state";
import { coverUrl } from "./api";
import { authorLine, formatDate, percent, plural, timeAgo } from "./format";
import { cloneTemplate, mustFind, queryIn } from "./dom";

/* Looked up once, at module load, and non-null from here on. A missing id
   throws now rather than at the first render that touches it. */
const el = {
    results: mustFind("results"),
    saved: mustFind("saved"),
    status: mustFind("status"),
    summary: mustFind<HTMLUListElement>("summary"),
    savedCount: mustFind("saved-count"),
    notice: mustFind("storage-note"),
    filters: mustFind("filters"),
    sort: mustFind<HTMLSelectElement>("sort"),
    savedSearch: mustFind<HTMLInputElement>("saved-search")
} as const;

const templates = {
    card: mustFind<HTMLTemplateElement>("card-template"),
    saved: mustFind<HTMLTemplateElement>("saved-template"),
    skeleton: mustFind<HTMLTemplateElement>("skeleton-template"),
    tile: mustFind<HTMLTemplateElement>("tile-template")
} as const;


/* ---------------------------------------------------------------
   Search results
   --------------------------------------------------------------- */

function fillCover(img: HTMLImageElement, book: Book): void {
    const url = coverUrl(book.coverId);

    if (url === null) {
        // No cover. A broken-image icon says nothing useful, so the element
        // goes rather than being left to fail.
        img.remove();
        return;
    }

    img.src = url;
    // Decorative: the title is right beside it, so reading it again as alt text
    // is noise. Empty alt, not a missing alt.
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove(), { once: true });
}


function renderSkeletons(count = 4): void {
    const list = document.createElement("ul");
    list.className = "result-grid";
    // Hidden from assistive technology: the status line announces the loading
    // state, and a list of empty boxes is not information.
    list.setAttribute("aria-hidden", "true");

    for (let index = 0; index < count; index += 1) {
        list.append(cloneTemplate(templates.skeleton));
    }

    el.results.replaceChildren(list);
}


function renderResults(results: readonly Book[], saved: readonly SavedBook[]): void {
    const savedIds = new Set(saved.map((entry) => entry.id));

    const list = document.createElement("ul");
    list.className = "result-grid";

    // Built into a fragment and inserted once. Appending inside the loop makes
    // the browser recalculate layout on every iteration.
    const fragment = document.createDocumentFragment();

    for (const book of results) {
        const node = cloneTemplate(templates.card);
        const card = queryIn<HTMLLIElement>(node, ".result-card");

        card.dataset["id"] = book.id;

        // textContent, never innerHTML. Titles and author names arrive from a
        // public API and are not trusted markup.
        queryIn(node, ".result-card__name").textContent = book.title;
        queryIn(node, '[data-field="author"]').textContent = authorLine(book.authors);
        queryIn(node, '[data-field="year"]').textContent =
            book.year === undefined ? "Publication year unknown" : `First published ${book.year}`;
        queryIn(node, '[data-field="editions"]').textContent = plural(book.editionCount, "edition");

        fillCover(queryIn<HTMLImageElement>(node, ".result-card__cover"), book);

        const button = queryIn<HTMLButtonElement>(node, '[data-action="save"]');
        const already = savedIds.has(book.id);
        button.textContent = already ? "On your list" : "Save";
        button.disabled = already;

        fragment.append(node);
    }

    list.append(fragment);
    el.results.replaceChildren(list);
}


function renderEmptyResults(query: string): void {
    const box = document.createElement("div");
    box.className = "empty-state";

    const title = document.createElement("p");
    title.textContent = `Nothing matched "${query}".`;

    const hint = document.createElement("p");
    hint.className = "text-sm";
    hint.textContent = "Try fewer words, or a surname on its own.";

    box.append(title, hint);
    el.results.replaceChildren(box);
}


function renderError(message: string): void {
    const box = document.createElement("div");
    box.className = "error-box";

    const title = document.createElement("p");
    title.className = "error-box__title";
    title.textContent = "That search did not work";

    const body = document.createElement("p");
    body.className = "error-box__body";
    body.textContent = message;

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

function renderSaved(snapshot: AppState): void {
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

    for (const book of visible) {
        const node = cloneTemplate(templates.saved);
        const row = queryIn<HTMLLIElement>(node, ".expense");

        row.dataset["id"] = book.id;
        row.classList.add(`expense--${book.status}`);

        queryIn(node, ".expense__description").textContent = book.title;
        queryIn(node, ".expense__date").textContent =
            `${authorLine(book.authors)} · added ${timeAgo(book.addedAt)}`;

        /* An id has to be unique and a valid selector target. Day 23's toBook
           already strips "/works/" from the key, so these are plain
           alphanumerics - but the sanitiser stays, because the id's shape is
           the API's decision and not mine. */
        const safeId = book.id.replace(/\W/g, "");

        const select = queryIn<HTMLSelectElement>(node, '[data-action="status"]');
        select.value = book.status;
        select.id = `status-${safeId}`;
        queryIn<HTMLLabelElement>(node, '[data-for="status"]').htmlFor = select.id;

        const note = queryIn<HTMLTextAreaElement>(node, '[data-action="note"]');
        note.value = book.note;
        note.id = `note-${safeId}`;
        queryIn<HTMLLabelElement>(node, '[data-for="note"]').htmlFor = note.id;

        const meta = queryIn(node, ".expense__meta");
        if (book.finishedAt !== undefined) {
            meta.textContent = `Finished ${formatDate(book.finishedAt)}`;
        } else if (book.year !== undefined) {
            meta.textContent = `First published ${book.year}`;
        } else {
            meta.remove();
        }

        fragment.append(node);
    }

    list.append(fragment);
    el.saved.replaceChildren(list);
}


/* ---------------------------------------------------------------
   Summary tiles
   --------------------------------------------------------------- */

function tile(label: string, value: string | number): DocumentFragment {
    const node = cloneTemplate(templates.tile);
    queryIn(node, ".summary__label").textContent = label;
    queryIn(node, ".summary__value").textContent = String(value);
    return node;
}


function renderSummary(snapshot: AppState): void {
    const figures = stats(snapshot);

    if (figures.total === 0) {
        el.summary.replaceChildren();
        el.summary.hidden = true;
        return;
    }

    el.summary.hidden = false;
    el.summary.replaceChildren(
        tile("On the list", figures.total),
        tile("Reading", figures.byStatus.reading),
        tile(
            "Finished",
            `${figures.byStatus.finished} (${percent(figures.byStatus.finished, figures.total)})`
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

/* The status line, derived from the union rather than from a lookup table
   keyed by a string. Each branch can only read the fields its own member has,
   which is why `results.length` is available here and nowhere else. */
function statusMessage(search: SearchState): string {
    switch (search.phase) {
        case "idle":
            return "Search for a title, an author or a subject.";
        case "loading":
            return "Searching…";
        case "success":
            return `Showing ${plural(search.results.length, "result")} of ${search.total}.`;
        case "empty":
            return `Nothing matched "${search.query}".`;
        case "failed":
            return "The search failed.";
        default: {
            const unreachable: never = search;
            throw new Error(`Unhandled phase: ${JSON.stringify(unreachable)}`);
        }
    }
}


function renderControls(snapshot: AppState): void {
    for (const button of el.filters.querySelectorAll<HTMLButtonElement>(".filter")) {
        // aria-pressed on a real button, rather than a class that only looks
        // selected. The state has to be in the accessibility tree too.
        button.setAttribute("aria-pressed", String(button.dataset["filter"] === snapshot.filter));
    }

    if (el.sort.value !== snapshot.sort) el.sort.value = snapshot.sort;

    // Only write back when it differs, or typing in the box moves the caret to
    // the end on every keystroke.
    if (el.savedSearch.value !== snapshot.savedSearch) {
        el.savedSearch.value = snapshot.savedSearch;
    }
}


function renderNotice(snapshot: AppState): void {
    const message =
        snapshot.notice ??
        (snapshot.persistent
            ? "Saved in this browser. The list will still be here after a reload."
            : "This browser is blocking local storage, so the list will be lost on reload.");

    el.notice.textContent = message;
    el.notice.classList.toggle("status--error", !snapshot.persistent);
}


/* ---------------------------------------------------------------
   The single entry point
   --------------------------------------------------------------- */

export function render(snapshot: AppState): void {
    el.status.textContent = statusMessage(snapshot.search);
    el.status.classList.toggle("status--error", snapshot.search.phase === "failed");

    renderNotice(snapshot);
    renderControls(snapshot);
    renderSummary(snapshot);
    renderSaved(snapshot);

    /* The payoff. Day 20's switch had a `default:` that rendered results,
       which meant an unrecognised phase silently drew the success view. Here
       every member is named and the default is unreachable - so adding a
       phase to SearchState breaks this file until it has a view. */
    const search = snapshot.search;

    switch (search.phase) {
        case "idle":
            el.results.replaceChildren();
            break;
        case "loading":
            renderSkeletons();
            break;
        case "success":
            renderResults(search.results, snapshot.saved);
            break;
        case "empty":
            renderEmptyResults(search.query);
            break;
        case "failed":
            renderError(search.message);
            break;
        default: {
            const unreachable: never = search;
            throw new Error(`Unhandled phase: ${JSON.stringify(unreachable)}`);
        }
    }
}


/* Called once at startup. Day 20 hard-coded the three <option> elements inside
   the saved-row template, so adding a status would have meant editing the union
   in model.ts and the markup in index.html and hoping they matched.

   This rebuilds those options from STATUSES, which makes the union the single
   source. `Record<Status, string>` is closed, so a fourth status is a compile
   error here until it has a label. */
const STATUS_LABELS: Record<Status, string> = {
    unread: "Unread",
    reading: "Reading",
    finished: "Finished"
};

export function syncStatusOptions(): void {
    const select = queryIn<HTMLSelectElement>(
        templates.saved.content,
        '[data-action="status"]'
    );

    select.replaceChildren(
        ...STATUSES.map((status) => {
            const option = document.createElement("option");
            option.value = status;
            option.textContent = STATUS_LABELS[status];
            return option;
        })
    );
}
