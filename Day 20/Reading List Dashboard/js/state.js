/* Day 20 - the store.

   Day 19's store with sorting, per-book notes and derived statistics added.

   The rule that has not changed: nothing outside this file may assign to
   `state`. Everything goes through an action, every action ends in commit(),
   and commit() is the only place that notifies subscribers. Render is no
   longer something a handler has to remember to call. */

import * as storage from "./storage.js";

const listeners = new Set();

const STATUSES = ["unread", "reading", "finished"];

const state = {
    query: "",
    results: [],
    saved: storage.load(),
    phase: "idle",          // idle | loading | success | empty | error
    error: null,
    filter: "all",          // all | unread | reading | finished
    sort: "added",          // added | title | year | author
    savedSearch: "",
    persistent: storage.isPersistent
};


export function getState() {
    return {
        ...state,
        results: [...state.results],
        saved: state.saved.map((entry) => ({ ...entry }))
    };
}


export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}


function commit(changes, { persist = false } = {}) {
    Object.assign(state, changes);

    if (persist) {
        const result = storage.save(state.saved);
        if (!result.ok) {
            state.error =
                result.reason === "quota"
                    ? "The reading list is too large to save in this browser."
                    : "Could not save the reading list.";
        }
    }

    const snapshot = getState();
    listeners.forEach((listener) => listener(snapshot));
}


/* ---------------------------------------------------------------
   Search actions
   --------------------------------------------------------------- */

export function setQuery(query) {
    commit({ query });
}

export function startSearch() {
    commit({ phase: "loading", error: null });
}

export function searchSucceeded(books) {
    commit({
        results: books,
        phase: books.length === 0 ? "empty" : "success",
        error: null
    });
}

export function searchFailed(message) {
    commit({ phase: "error", error: message, results: [] });
}

export function clearResults() {
    commit({ results: [], phase: "idle", query: "", error: null });
}


/* ---------------------------------------------------------------
   Reading-list actions
   --------------------------------------------------------------- */

export function saveBook(book) {
    if (state.saved.some((entry) => entry.id === book.id)) return;

    const entry = {
        ...book,
        status: "unread",
        note: "",
        addedAt: new Date().toISOString()
    };

    commit({ saved: [entry, ...state.saved] }, { persist: true });
}

export function removeBook(id) {
    commit(
        { saved: state.saved.filter((entry) => entry.id !== id) },
        { persist: true }
    );
}

export function setStatus(id, status) {
    if (!STATUSES.includes(status)) return;

    commit(
        {
            saved: state.saved.map((entry) =>
                entry.id === id
                    ? {
                          ...entry,
                          status,
                          finishedAt:
                              status === "finished"
                                  ? new Date().toISOString()
                                  : undefined
                      }
                    : entry
            )
        },
        { persist: true }
    );
}

export function setNote(id, note) {
    commit(
        {
            saved: state.saved.map((entry) =>
                entry.id === id ? { ...entry, note } : entry
            )
        },
        { persist: true }
    );
}

export function clearSaved() {
    storage.clear();
    commit({ saved: [] });
}

export function importBooks(books) {
    // Merge rather than replace: importing a file should not silently delete
    // whatever is already on the list.
    const existing = new Set(state.saved.map((entry) => entry.id));
    const incoming = books
        .filter((book) => book && typeof book.id === "string" && !existing.has(book.id))
        .map((book) => ({
            status: "unread",
            note: "",
            addedAt: new Date().toISOString(),
            ...book
        }));

    if (incoming.length === 0) return 0;

    commit({ saved: [...incoming, ...state.saved] }, { persist: true });
    return incoming.length;
}


/* ---------------------------------------------------------------
   View actions
   --------------------------------------------------------------- */

export function setFilter(filter) {
    commit({ filter });
}

export function setSort(sort) {
    commit({ sort });
}

export function setSavedSearch(text) {
    commit({ savedSearch: text });
}


/* ---------------------------------------------------------------
   Derived values - computed, never stored
   --------------------------------------------------------------- */

const comparators = {
    // Most recently added first. ISO strings sort correctly as strings, which
    // is the reason dates are stored in that format.
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),

    // localeCompare, not `<`. Plain comparison sorts by code point, which puts
    // every capital letter before every lowercase one.
    title: (a, b) => a.title.localeCompare(b.title),

    author: (a, b) =>
        (a.authors[0] ?? "").localeCompare(b.authors[0] ?? ""),

    // Missing years sort last rather than becoming 0 and jumping to the front.
    year: (a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity)
};


export function visibleSaved(snapshot) {
    const text = snapshot.savedSearch.trim().toLowerCase();

    return snapshot.saved
        .filter((entry) =>
            snapshot.filter === "all" ? true : entry.status === snapshot.filter
        )
        .filter((entry) => {
            if (text.length === 0) return true;
            return (
                entry.title.toLowerCase().includes(text) ||
                entry.authors.some((name) => name.toLowerCase().includes(text))
            );
        })
        // toSorted, not sort: sort mutates, and this array is derived from
        // state on every render.
        .toSorted(comparators[snapshot.sort] ?? comparators.added);
}


export function stats(snapshot) {
    const total = snapshot.saved.length;

    const byStatus = snapshot.saved.reduce(
        (totals, entry) => {
            totals[entry.status] = (totals[entry.status] ?? 0) + 1;
            return totals;
        },
        { unread: 0, reading: 0, finished: 0 }
    );

    const decades = snapshot.saved.reduce((counts, entry) => {
        if (!entry.year) return counts;
        const decade = Math.floor(entry.year / 10) * 10;
        counts.set(decade, (counts.get(decade) ?? 0) + 1);
        return counts;
    }, new Map());

    const commonest = [...decades.entries()].toSorted((a, b) => b[1] - a[1])[0];

    return {
        total,
        ...byStatus,
        oldest: snapshot.saved.reduce(
            (min, entry) =>
                entry.year && (min === null || entry.year < min) ? entry.year : min,
            null
        ),
        commonestDecade: commonest ? commonest[0] : null
    };
}


export function isSaved(id) {
    return state.saved.some((entry) => entry.id === id);
}
