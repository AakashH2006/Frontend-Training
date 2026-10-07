/* Day 25 - the store, typed.

   Day 20's state.js had nine fields in one flat object, and four of them were
   only meaningful in certain combinations:

       phase: "error"  with a full results array      - constructible, and a bug
       phase: "success" with error: "not found"       - constructible
       phase: "loading" with a stale query            - constructible

   The migration's real work was splitting that into a discriminated union, so
   those three combinations stop existing. Everything else here is the Day 20
   logic with types on it. */

import {
    type Book,
    type Filter,
    type SavedBook,
    type Sort,
    type Status,
    isSavedBook
} from "./model";

import { Repository, describeFailure } from "./repository";

const STORAGE_KEY = "day25.readingList";
const STORAGE_VERSION = 1;


/* ---------------------------------------------------------------
   Shape
   --------------------------------------------------------------- */

/* The union. `query` lives on every member that has one, and `results` exists
   only where there are results to hold. */
export type SearchState =
    | { readonly phase: "idle" }
    | { readonly phase: "loading"; readonly query: string }
    | {
          readonly phase: "success";
          readonly query: string;
          readonly results: readonly Book[];
          readonly total: number;
      }
    | { readonly phase: "empty"; readonly query: string }
    | { readonly phase: "failed"; readonly query: string; readonly message: string };

export interface AppState {
    readonly search: SearchState;
    readonly saved: readonly SavedBook[];
    readonly filter: Filter;
    readonly sort: Sort;
    readonly savedSearch: string;
    /* A transient line for the header - a storage warning, an import
       confirmation. Null rather than "" so "no message" is one value. */
    readonly notice: string | null;
    readonly persistent: boolean;
}

type Listener = (state: AppState) => void;


/* ---------------------------------------------------------------
   Setup
   --------------------------------------------------------------- */

const repository = new Repository<SavedBook>(STORAGE_KEY, STORAGE_VERSION, isSavedBook);

const listeners = new Set<Listener>();

/* The initial load is a Result, so "nothing saved" and "storage is broken" are
   distinguishable - which they were not in Day 20, where both came back as an
   empty array and the warning went to the console where no user sees it. */
const initial = repository.load();

let state: AppState = {
    search: { phase: "idle" },
    saved: initial.ok ? initial.value : [],
    filter: "all",
    sort: "added",
    savedSearch: "",
    notice: initial.ok ? null : describeFailure(initial.error),
    persistent: repository.available
};


/* ---------------------------------------------------------------
   Reading
   --------------------------------------------------------------- */

/* Day 20 copied the arrays on every read to stop callers mutating state. The
   types do that now - every field is `readonly` and the arrays are
   `readonly T[]` - so the snapshot can be the object itself.

   That is not just tidier. Day 20's getState() allocated a copy of the whole
   saved list on every call, and render called it on every keystroke. */
export function getState(): AppState {
    return state;
}

export function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}


/* ---------------------------------------------------------------
   Writing
   --------------------------------------------------------------- */

function commit(changes: Partial<AppState>, options: { persist?: boolean } = {}): void {
    state = { ...state, ...changes };

    if (options.persist === true) {
        const saved = repository.save(state.saved);
        if (!saved.ok) {
            state = { ...state, notice: describeFailure(saved.error) };
        }
    }

    for (const listener of listeners) listener(state);
}

/* `Partial<AppState>` is the patch type - Day 23's rule. And because `search`
   is a union rather than four loose fields, a patch cannot set a phase without
   also supplying that phase's data. */


/* ---------------------------------------------------------------
   Search actions
   --------------------------------------------------------------- */

export function startSearch(query: string): void {
    commit({ search: { phase: "loading", query } });
}

export function searchSucceeded(query: string, results: readonly Book[], total: number): void {
    commit({
        search:
            results.length === 0
                ? { phase: "empty", query }
                : { phase: "success", query, results, total }
    });
}

export function searchFailed(query: string, message: string): void {
    commit({ search: { phase: "failed", query, message } });
}

export function clearSearch(): void {
    commit({ search: { phase: "idle" } });
}

/* The query is not a field of its own any more, so reading it means asking the
   union - and the `idle` member genuinely has no query. */
export function currentQuery(): string {
    return state.search.phase === "idle" ? "" : state.search.query;
}


/* ---------------------------------------------------------------
   Reading-list actions
   --------------------------------------------------------------- */

export function saveBook(book: Book): void {
    if (state.saved.some((entry) => entry.id === book.id)) return;

    const entry: SavedBook = {
        ...book,
        status: "unread",
        note: "",
        addedAt: new Date().toISOString()
    };

    commit({ saved: [entry, ...state.saved] }, { persist: true });
}

export function removeBook(id: string): void {
    commit({ saved: state.saved.filter((entry) => entry.id !== id) }, { persist: true });
}

export function setStatus(id: string, status: Status): void {
    commit(
        {
            saved: state.saved.map((entry) => {
                if (entry.id !== id) return entry;

                /* `exactOptionalPropertyTypes` again. Day 20 wrote
                   `finishedAt: undefined` to clear the field, which is now an
                   error - so the property is spread in or left out. */
                const { finishedAt: _discarded, ...rest } = entry;
                return status === "finished"
                    ? { ...rest, status, finishedAt: new Date().toISOString() }
                    : { ...rest, status };
            })
        },
        { persist: true }
    );
}

export function setNote(id: string, note: string): void {
    commit(
        {
            saved: state.saved.map((entry) => (entry.id === id ? { ...entry, note } : entry))
        },
        { persist: true }
    );
}

export function clearSaved(): void {
    repository.clear();
    commit({ saved: [], notice: "The list has been cleared." });
}

/* Returns how many were added, so main.ts can word the confirmation without
   knowing how the merge works. */
export function importBooks(incoming: readonly unknown[]): number {
    const existing = new Set(state.saved.map((entry) => entry.id));

    /* The guard does the work the Day 20 version did by hand, and does it
       better: Day 20 checked only that `id` was a string, so a row with a
       misspelled status got in and rendered a card with no badge. */
    const additions = incoming.filter(isSavedBook).filter((book) => !existing.has(book.id));

    if (additions.length === 0) return 0;

    commit({ saved: [...additions, ...state.saved] }, { persist: true });
    return additions.length;
}


/* ---------------------------------------------------------------
   View actions
   --------------------------------------------------------------- */

export function setFilter(filter: Filter): void {
    commit({ filter });
}

export function setSort(sort: Sort): void {
    commit({ sort });
}

export function setSavedSearch(savedSearch: string): void {
    commit({ savedSearch });
}

export function setNotice(notice: string | null): void {
    commit({ notice });
}


/* ---------------------------------------------------------------
   Derived values - computed, never stored
   --------------------------------------------------------------- */

/* `Record<Sort, ...>` is a closed table, so adding a member to the Sort union
   is a compile error here until a comparator exists for it. Day 20 used a
   plain object with a `?? comparators.added` fallback, which meant a missing
   comparator was a silent fallback instead of an error. */
const comparators: Record<Sort, (a: SavedBook, b: SavedBook) => number> = {
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),
    title: (a, b) => a.title.localeCompare(b.title),
    author: (a, b) => (a.authors[0] ?? "").localeCompare(b.authors[0] ?? ""),
    // Missing years sort last rather than becoming 0 and jumping to the front.
    year: (a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity)
};

function matchesText(entry: SavedBook, text: string): boolean {
    if (text.length === 0) return true;
    const needle = text.toLowerCase();
    return (
        entry.title.toLowerCase().includes(needle) ||
        entry.authors.some((name) => name.toLowerCase().includes(needle))
    );
}

export function visibleSaved(snapshot: AppState): readonly SavedBook[] {
    const text = snapshot.savedSearch.trim().toLowerCase();

    return snapshot.saved
        .filter((entry) => (snapshot.filter === "all" ? true : entry.status === snapshot.filter))
        .filter((entry) => matchesText(entry, text))
        .toSorted(comparators[snapshot.sort]);
}


export interface Stats {
    readonly total: number;
    readonly byStatus: Record<Status, number>;
    readonly oldest: number | null;
    readonly commonestDecade: number | null;
}

export function stats(snapshot: AppState): Stats {
    /* Starting the accumulator as a full Record rather than `{}` means no
       assertion is needed and no count can be undefined downstream. */
    const byStatus = snapshot.saved.reduce<Record<Status, number>>(
        (totals, entry) => ({ ...totals, [entry.status]: totals[entry.status] + 1 }),
        { unread: 0, reading: 0, finished: 0 }
    );

    const decades = new Map<number, number>();
    for (const entry of snapshot.saved) {
        if (entry.year === undefined) continue;
        const decade = Math.floor(entry.year / 10) * 10;
        decades.set(decade, (decades.get(decade) ?? 0) + 1);
    }

    const commonest = [...decades.entries()].toSorted((a, b) => b[1] - a[1])[0];

    const years = snapshot.saved
        .map((entry) => entry.year)
        .filter((year): year is number => year !== undefined);

    return {
        total: snapshot.saved.length,
        byStatus,
        oldest: years.length === 0 ? null : Math.min(...years),
        commonestDecade: commonest === undefined ? null : commonest[0]
    };
}

/* `.filter((year): year is number => year !== undefined)` is the one line in
   this file I would not have written a week ago. Without the predicate the
   result is `(number | undefined)[]`, because `filter` cannot know what the
   callback proves - so `Math.min(...years)` would be an error. The annotation
   is Day 22's type predicate doing a job that comes up constantly. */
