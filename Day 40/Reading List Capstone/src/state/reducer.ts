/* Day 35 - the reducer, from Day 31 with two additions noted below.

   Day 30's App had five useState calls and six handlers, and it worked. Two
   things pushed me to rewrite it as a reducer:

   1. `removeBook` had to update two pieces of state together - the list, and
      `editingId` if the removed book was the one being edited. Two setters in
      one handler, and the second one is easy to forget. There were three such
      pairs by the end of Day 30.

   2. I could not describe what the app does without reading the handlers.
      There was no list of the things that can happen.

   A reducer fixes both: every change is one named action, applied in one
   place, and the action type *is* the list of what the app can do. */

import { type Filter, type Sort, type Status, isStatus } from "../data";

/* ---------------------------------------------------------------
   The shape
   --------------------------------------------------------------- */

export interface Book {
    readonly id: string;
    readonly title: string;
    readonly authors: readonly string[];
    readonly year?: number;
    readonly status: Status;
    readonly note?: string;
    readonly addedAt: string;
}

/* Normalised: a lookup by id, plus the order separately.

   Day 30 stored `readonly Book[]` and every update was a `.map` or a
   `.filter` - a scan of the whole list to change one book. That is fine for
   twenty books and it is also the wrong shape, for a reason that has nothing
   to do with speed:

       setStatus with an id that is not in the list is a silent no-op in an
       array (`.map` just matches nothing) and an obvious one here
       (`byId[id]` is undefined, and the reducer can say so).

   The cost is that `ids` and `byId` have to agree. That is one invariant, kept
   in one file, instead of a scan at every call site. */
export interface ListState {
    readonly byId: Readonly<Record<string, Book>>;
    readonly ids: readonly string[];
}

export interface AppState {
    readonly list: ListState;
    readonly query: string;
    readonly filter: Filter;
    readonly sort: Sort;
    /* Still an id, not a Book - Day 30's lesson. The reducer is now the thing
       that keeps it from pointing at a deleted book. */
    readonly editingId: string | null;
}

export const INITIAL_STATE: AppState = {
    list: { byId: {}, ids: [] },
    query: "",
    filter: "all",
    sort: "added",
    editingId: null
};


/* ---------------------------------------------------------------
   What can happen
   --------------------------------------------------------------- */

/* A discriminated union, which is Day 22 again and the single most useful type
   in this file. Reading this list is reading what the app does.

   `BookDraft` is the five editable fields - no id and no addedAt, because the
   reducer owns both. */
export type BookDraft = Omit<Book, "id" | "addedAt">;

export type Action =
    | { readonly type: "book/added"; readonly draft: BookDraft; readonly id: string; readonly addedAt: string }
    | { readonly type: "book/edited"; readonly id: string; readonly draft: BookDraft }
    | { readonly type: "book/removed"; readonly id: string }
    | { readonly type: "book/statusChanged"; readonly id: string; readonly status: Status }
    | { readonly type: "list/cleared" }
    | { readonly type: "query/changed"; readonly query: string }
    | { readonly type: "filter/changed"; readonly filter: Filter }
    | { readonly type: "sort/changed"; readonly sort: Sort }
    | { readonly type: "editing/started"; readonly id: string }
    | { readonly type: "editing/stopped" };

/* `id` and `addedAt` are on the *action* rather than being generated in the
   reducer, which took me a while to accept. A reducer must be pure: same state
   and same action in, same state out. `crypto.randomUUID()` and `new Date()`
   are neither, so calling them inside would make the reducer impure, break
   replay, and double-generate under StrictMode's double invocation.

   So the impure part happens at the edge, in the action creator below. */

export function bookAdded(draft: BookDraft): Action {
    return {
        type: "book/added",
        draft,
        id: crypto.randomUUID(),
        addedAt: new Date().toISOString()
    };
}

/* Added on Day 35. A book saved from a search result keeps Open Library's id
   rather than getting a new one, so the search panel can tell which results
   are already on the list.

   No new action was needed: `book/added` already carries the id, because the
   reducer had to stay pure. A design that generated the id *inside* the
   reducer would have needed a second action type here - which is a small
   vindication of a decision that felt pedantic on Day 31. */
export function bookSavedFromSearch(
    hit: { readonly id: string; readonly title: string; readonly authors: readonly string[]; readonly year?: number }
): Action {
    const { year } = hit;

    return {
        type: "book/added",
        id: hit.id,
        addedAt: new Date().toISOString(),
        draft: {
            title: hit.title,
            authors: hit.authors,
            status: "unread",
            ...(year === undefined ? {} : { year })
        }
    };
}


/* ---------------------------------------------------------------
   The reducer
   --------------------------------------------------------------- */

export function reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case "book/added": {
            /* Added on Day 35. Day 31's version did not check, because the
               only way in was a form that generated a fresh UUID. Now a book
               can also arrive from a search result, which carries the Open
               Library id - and saving the same result twice would push a
               duplicate into `ids` while `byId` kept one entry.

               That is the normalisation invariant breaking, and the
               StateInspector would have caught it. Better to make it
               impossible. */
            if (state.list.byId[action.id] !== undefined) return state;

            const book: Book = { ...action.draft, id: action.id, addedAt: action.addedAt };

            return {
                ...state,
                list: {
                    byId: { ...state.list.byId, [book.id]: book },
                    ids: [book.id, ...state.list.ids]
                }
            };
        }

        case "book/edited": {
            const existing = state.list.byId[action.id];
            /* An id that is not in the list. In Day 30's array version this
               was a `.map` that matched nothing - no change, no complaint.
               Here it is visible, and returning the same state means React
               skips the re-render. */
            if (existing === undefined) return state;

            return {
                ...state,
                list: {
                    ...state.list,
                    /* The draft last, so its fields win and `id` and
                       `addedAt` survive. Day 30. */
                    byId: { ...state.list.byId, [action.id]: { ...existing, ...action.draft } }
                },
                editingId: null
            };
        }

        case "book/removed": {
            if (state.list.byId[action.id] === undefined) return state;

            /* Destructuring the key out rather than `delete`, so `byId` is a
               new object and nothing mutates the old one. The discarded
               binding needs the eslint-style underscore to survive
               noUnusedLocals. */
            const { [action.id]: _removed, ...byId } = state.list.byId;

            return {
                ...state,
                list: { byId, ids: state.list.ids.filter((id) => id !== action.id) },
                /* The two-setters-in-one-handler problem from Day 30, now
                   impossible to forget: removing a book and closing the editor
                   are one transition, written once. */
                editingId: state.editingId === action.id ? null : state.editingId
            };
        }

        case "book/statusChanged": {
            const existing = state.list.byId[action.id];
            if (existing === undefined) return state;
            if (!isStatus(action.status)) return state;
            // Nothing to do - bail out so React skips the render.
            if (existing.status === action.status) return state;

            return {
                ...state,
                list: {
                    ...state.list,
                    byId: { ...state.list.byId, [action.id]: { ...existing, status: action.status } }
                }
            };
        }

        case "list/cleared":
            /* Clearing the list also clears the filters and the editor. In
               Day 30 that was four setters in one handler; here it is one
               action and one object, so the four cannot drift apart. */
            return INITIAL_STATE;

        case "query/changed":
            return { ...state, query: action.query };

        case "filter/changed":
            return { ...state, filter: action.filter };

        case "sort/changed":
            return { ...state, sort: action.sort };

        case "editing/started":
            // Refusing to open an editor for a book that is not there.
            if (state.list.byId[action.id] === undefined) return state;
            return { ...state, editingId: action.id };

        case "editing/stopped":
            return { ...state, editingId: null };

        default: {
            /* Exhaustiveness. Every action type is handled above, so `action`
               is `never` here - and adding an eleventh action without a case
               makes this line a compile error.

               Day 20's switch had a `default:` that guessed. This one cannot. */
            const unreachable: never = action;
            throw new Error(`Unhandled action: ${JSON.stringify(unreachable)}`);
        }
    }
}


/* ---------------------------------------------------------------
   Selectors - derived, never stored
   --------------------------------------------------------------- */

/* Plain functions of state. They live here rather than in the component for
   the same reason format.ts existed on Day 20: they are pure, so they are the
   part that can be tested without a DOM - which is Day 37's problem and worth
   setting up for now. */

const COMPARATORS: Record<Sort, (a: Book, b: Book) => number> = {
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),
    title: (a, b) => a.title.localeCompare(b.title),
    author: (a, b) => (a.authors[0] ?? "").localeCompare(b.authors[0] ?? ""),
    year: (a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity)
};

export function selectAll(state: AppState): readonly Book[] {
    /* `ids` is the order, `byId` is the data. The filter at the end is the
       price of normalising: TypeScript cannot know an id in `ids` is a key of
       `byId`, so the lookup is `Book | undefined`.

       That is `noUncheckedIndexedAccess` being right rather than annoying -
       the two really can disagree if a reducer case forgets one of them, and
       this is where that would show up. */
    return state.list.ids
        .map((id) => state.list.byId[id])
        .filter((book): book is Book => book !== undefined);
}

export function selectVisible(state: AppState): readonly Book[] {
    const needle = state.query.trim().toLowerCase();

    return selectAll(state)
        .filter((book) => state.filter === "all" || book.status === state.filter)
        .filter(
            (book) =>
                needle.length === 0 ||
                book.title.toLowerCase().includes(needle) ||
                book.authors.some((name) => name.toLowerCase().includes(needle))
        )
        .toSorted(COMPARATORS[state.sort]);
}

export function selectEditing(state: AppState): Book | undefined {
    return state.editingId === null ? undefined : state.list.byId[state.editingId];
}

export function selectCounts(state: AppState): Record<Status, number> {
    return selectAll(state).reduce<Record<Status, number>>(
        (totals, book) => ({ ...totals, [book.status]: totals[book.status] + 1 }),
        { unread: 0, reading: 0, finished: 0 }
    );
}

export function selectIsDuplicate(state: AppState, exceptId: string | null) {
    return (title: string): boolean => {
        const normalised = title.trim().toLowerCase();
        return selectAll(state).some(
            (book) => book.id !== exceptId && book.title.trim().toLowerCase() === normalised
        );
    };
}
