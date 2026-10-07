/* Day 19 - one place the data lives.

   Day 16 and 17 kept a `state` object at the top of app.js and every handler
   reached in and changed it, then remembered to call render(). Forgetting the
   render call was the single most common bug.

   This module closes over the state so nothing outside can assign to it, and
   notifies subscribers on every change. Render is no longer something a
   handler has to remember. */

import * as storage from "./storage.js";

const listeners = new Set();

const state = {
    query: "",
    results: [],          // books from the last search
    saved: storage.load(), // books kept in localStorage
    phase: "idle",        // idle | loading | success | empty | error
    error: null,
    filter: "all",        // all | unread | reading | finished
    persistent: storage.isPersistent
};


/* Callers get a copy, not the object. Handing out the real one would let any
   caller mutate it without going through an action, which is the thing this
   module exists to prevent. */
export function getState() {
    return { ...state, results: [...state.results], saved: [...state.saved] };
}


export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);   // unsubscribe
}


function commit(changes, { persist = false } = {}) {
    Object.assign(state, changes);

    if (persist) {
        const result = storage.save(state.saved);
        if (!result.ok) {
            state.error =
                result.reason === "quota"
                    ? "The reading list is too large for local storage."
                    : "Could not save the reading list.";
        }
    }

    const snapshot = getState();
    listeners.forEach((listener) => listener(snapshot));
}


/* ---------------------------------------------------------------
   Actions - the only way state changes
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

export function setFilter(filter) {
    commit({ filter });
}


export function saveBook(book) {
    if (state.saved.some((entry) => entry.id === book.id)) return;

    const entry = { ...book, status: "unread", addedAt: new Date().toISOString() };
    commit({ saved: [entry, ...state.saved] }, { persist: true });
}

export function removeBook(id) {
    commit({ saved: state.saved.filter((entry) => entry.id !== id) }, { persist: true });
}

export function setStatus(id, status) {
    commit(
        {
            saved: state.saved.map((entry) =>
                entry.id === id ? { ...entry, status } : entry
            )
        },
        { persist: true }
    );
}

export function clearSaved() {
    storage.clear();
    commit({ saved: [] });
}


/* Derived, not stored. The filtered list is computed from saved + filter every
   time it is needed. Keeping a second array in sync with the first is how the
   two drift apart. */
export function visibleSaved(snapshot = state) {
    if (snapshot.filter === "all") return snapshot.saved;
    return snapshot.saved.filter((entry) => entry.status === snapshot.filter);
}

export function isSaved(id) {
    return state.saved.some((entry) => entry.id === id);
}
