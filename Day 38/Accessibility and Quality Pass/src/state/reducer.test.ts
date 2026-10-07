/* Day 37 - testing the reducer.

   These are the easiest tests in the project, and that is not an accident:
   Day 31 moved this logic into a pure function and pushed `crypto.randomUUID`
   and `new Date()` out onto the action specifically so it could be called with
   a state and an action and asserted on.

   No React, no DOM, no render. `environment: "jsdom"` is configured globally
   and this file does not use it. */

import { describe, expect, it } from "vitest";

import {
    INITIAL_STATE,
    bookAdded,
    bookSavedFromSearch,
    reducer,
    selectAll,
    selectCounts,
    selectEditing,
    selectIsDuplicate,
    selectVisible,
    type Action,
    type AppState,
    type Book
} from "./reducer";

/* A helper that applies a list of actions, so a test can set up a state in
   the same way the app would reach it. Building the state object by hand would
   be testing my own typing rather than the reducer. */
function applyAll(actions: readonly Action[], from: AppState = INITIAL_STATE): AppState {
    return actions.reduce(reducer, from);
}

function book(overrides: Partial<Book> = {}): Book {
    return {
        id: "b1",
        title: "Dune",
        authors: ["Frank Herbert"],
        year: 1965,
        status: "unread",
        addedAt: "2026-01-01T00:00:00.000Z",
        ...overrides
    };
}

/* Adding with a fixed id and timestamp, because the test is about the reducer
   and not about the clock. This is what moving them onto the action bought. */
function add(b: Book): Action {
    const { id, addedAt, ...draft } = b;
    return { type: "book/added", id, addedAt, draft };
}


describe("reducer: adding", () => {
    it("adds a book to both byId and ids", () => {
        const state = applyAll([add(book())]);

        expect(state.list.ids).toEqual(["b1"]);
        expect(state.list.byId["b1"]?.title).toBe("Dune");
    });

    it("puts the newest book first", () => {
        const state = applyAll([
            add(book({ id: "b1", title: "First" })),
            add(book({ id: "b2", title: "Second" }))
        ]);

        expect(state.list.ids).toEqual(["b2", "b1"]);
    });

    it("ignores a second add with the same id", () => {
        /* The guard added on Day 35, when search results became a second
           source of books. Without it, `ids` would hold a duplicate while
           `byId` held one entry - the normalisation invariant breaking. */
        const before = applyAll([add(book())]);
        const after = reducer(before, add(book({ title: "Changed" })));

        expect(after.list.ids).toEqual(["b1"]);
        expect(after.list.byId["b1"]?.title).toBe("Dune");
        /* Same reference, so React skips the re-render. Asserting on identity
           rather than equality is the only way to test a bail-out, and it is
           worth testing because it is invisible otherwise. */
        expect(after).toBe(before);
    });
});


describe("reducer: editing and removing", () => {
    it("keeps id and addedAt when editing", () => {
        const before = applyAll([add(book())]);

        const after = reducer(before, {
            type: "book/edited",
            id: "b1",
            draft: { title: "Dune Messiah", authors: ["Herbert"], status: "reading" }
        });

        expect(after.list.byId["b1"]).toMatchObject({
            id: "b1",
            addedAt: "2026-01-01T00:00:00.000Z",
            title: "Dune Messiah",
            status: "reading"
        });
    });

    it("closes the editor after an edit", () => {
        const before = applyAll([add(book()), { type: "editing/started", id: "b1" }]);
        expect(before.editingId).toBe("b1");

        const after = reducer(before, {
            type: "book/edited",
            id: "b1",
            draft: { title: "x", authors: [], status: "unread" }
        });

        expect(after.editingId).toBeNull();
    });

    it("removes from byId and ids together", () => {
        const state = applyAll([
            add(book({ id: "b1" })),
            add(book({ id: "b2" })),
            { type: "book/removed", id: "b1" }
        ]);

        expect(state.list.ids).toEqual(["b2"]);
        expect(state.list.byId["b1"]).toBeUndefined();
        expect(Object.keys(state.list.byId)).toEqual(["b2"]);
    });

    it("clears editingId when the book being edited is removed", () => {
        /* The two-things-at-once transition that pushed me to a reducer in the
           first place. In Day 30's version this was two setters in one handler
           and the second was easy to forget. */
        const state = applyAll([
            add(book()),
            { type: "editing/started", id: "b1" },
            { type: "book/removed", id: "b1" }
        ]);

        expect(state.editingId).toBeNull();
    });

    it("leaves editingId alone when a different book is removed", () => {
        const state = applyAll([
            add(book({ id: "b1" })),
            add(book({ id: "b2" })),
            { type: "editing/started", id: "b1" },
            { type: "book/removed", id: "b2" }
        ]);

        expect(state.editingId).toBe("b1");
    });

    it("ignores actions for an id that is not there", () => {
        const before = applyAll([add(book())]);

        for (const action of [
            { type: "book/removed", id: "nope" },
            { type: "book/statusChanged", id: "nope", status: "reading" },
            { type: "editing/started", id: "nope" }
        ] as const satisfies readonly Action[]) {
            expect(reducer(before, action)).toBe(before);
        }
    });
});


describe("reducer: status", () => {
    it("changes the status", () => {
        const state = applyAll([add(book()), { type: "book/statusChanged", id: "b1", status: "finished" }]);
        expect(state.list.byId["b1"]?.status).toBe("finished");
    });

    it("bails out when the status is already that", () => {
        const before = applyAll([add(book({ status: "reading" }))]);
        const after = reducer(before, { type: "book/statusChanged", id: "b1", status: "reading" });

        expect(after).toBe(before);
    });
});


describe("reducer: view state", () => {
    it("stores query, filter and sort", () => {
        const state = applyAll([
            { type: "query/changed", query: "dune" },
            { type: "filter/changed", filter: "reading" },
            { type: "sort/changed", sort: "title" }
        ]);

        expect(state).toMatchObject({ query: "dune", filter: "reading", sort: "title" });
    });

    it("clearing resets everything, not just the list", () => {
        /* Day 30 needed four setters here. This asserts that one action does
           all four, which is the thing a reducer is for. */
        const state = applyAll([
            add(book()),
            { type: "query/changed", query: "dune" },
            { type: "filter/changed", filter: "reading" },
            { type: "sort/changed", sort: "title" },
            { type: "editing/started", id: "b1" },
            { type: "list/cleared" }
        ]);

        expect(state).toEqual(INITIAL_STATE);
    });
});


describe("action creators", () => {
    it("bookAdded generates an id and a timestamp", () => {
        const action = bookAdded({ title: "New", authors: [], status: "unread" });

        expect(action.type).toBe("book/added");
        if (action.type !== "book/added") throw new Error("narrowing");

        expect(action.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(Number.isNaN(Date.parse(action.addedAt))).toBe(false);
    });

    it("bookSavedFromSearch keeps the API's id", () => {
        /* The reason the search panel can tell which results are already
           saved. A generated id would break that, and the failure would be a
           Save button that never disables. */
        const action = bookSavedFromSearch({
            id: "OL45804W",
            title: "Dune",
            authors: ["Frank Herbert"],
            year: 1965
        });

        if (action.type !== "book/added") throw new Error("narrowing");
        expect(action.id).toBe("OL45804W");
        expect(action.draft.status).toBe("unread");
        expect(action.draft.year).toBe(1965);
    });

    it("omits year entirely when the hit has none", () => {
        /* exactOptionalPropertyTypes again: absent and present-and-undefined
           are different, and `"year" in draft` is the observable difference. */
        const action = bookSavedFromSearch({ id: "x", title: "No year", authors: [] });

        if (action.type !== "book/added") throw new Error("narrowing");
        expect("year" in action.draft).toBe(false);
    });
});


describe("selectors", () => {
    const populated = applyAll([
        add(book({ id: "b1", title: "Dune", authors: ["Frank Herbert"], year: 1965, status: "finished", addedAt: "2026-01-01T00:00:00.000Z" })),
        add(book({ id: "b2", title: "Beloved", authors: ["Toni Morrison"], year: 1987, status: "reading", addedAt: "2026-01-02T00:00:00.000Z" })),
        add(book({ id: "b3", title: "Neuromancer", authors: ["William Gibson"], year: 1984, status: "unread", addedAt: "2026-01-03T00:00:00.000Z" }))
    ]);

    it("selectAll returns books in ids order", () => {
        expect(selectAll(populated).map((b) => b.title)).toEqual(["Neuromancer", "Beloved", "Dune"]);
    });

    it("counts per status", () => {
        expect(selectCounts(populated)).toEqual({ unread: 1, reading: 1, finished: 1 });
    });

    it("counts zero for a status nothing has", () => {
        /* The closed Record, so a status with no books still has an entry
           rather than being undefined. */
        const one = applyAll([add(book({ status: "unread" }))]);
        expect(selectCounts(one)).toEqual({ unread: 1, reading: 0, finished: 0 });
    });

    it("filters by status", () => {
        const state = reducer(populated, { type: "filter/changed", filter: "reading" });
        expect(selectVisible(state).map((b) => b.title)).toEqual(["Beloved"]);
    });

    it("searches titles and authors", () => {
        const byAuthor = reducer(populated, { type: "query/changed", query: "gibson" });
        expect(selectVisible(byAuthor).map((b) => b.title)).toEqual(["Neuromancer"]);

        const byTitle = reducer(populated, { type: "query/changed", query: "belov" });
        expect(selectVisible(byTitle).map((b) => b.title)).toEqual(["Beloved"]);
    });

    it("search is case-insensitive and trims", () => {
        const state = reducer(populated, { type: "query/changed", query: "  DUNE  " });
        expect(selectVisible(state).map((b) => b.title)).toEqual(["Dune"]);
    });

    it("sorts by title, author and year", () => {
        const byTitle = reducer(populated, { type: "sort/changed", sort: "title" });
        expect(selectVisible(byTitle).map((b) => b.title)).toEqual(["Beloved", "Dune", "Neuromancer"]);

        const byAuthor = reducer(populated, { type: "sort/changed", sort: "author" });
        expect(selectVisible(byAuthor).map((b) => b.title)).toEqual(["Dune", "Beloved", "Neuromancer"]);

        const byYear = reducer(populated, { type: "sort/changed", sort: "year" });
        expect(selectVisible(byYear).map((b) => b.title)).toEqual(["Beloved", "Neuromancer", "Dune"]);
    });

    it("sorts books with no year last", () => {
        /* The `?? -Infinity` in the comparator. Without it the subtraction is
           NaN, and a comparator that returns NaN produces an order that can
           differ between engines rather than an error. */
        /* Built as a literal rather than `book({ year: undefined })`, which is
           what I wrote first. Vitest ran it happily - the types are erased -
           and `tsc` rejected it: under exactOptionalPropertyTypes you cannot
           pass `year: undefined` where the property is `year?: number`.

           A reminder that `npm test` passing is not `npm run typecheck`
           passing, and both belong in the build. */
        const undated: Book = {
            id: "b4",
            title: "Undated",
            authors: ["No One"],
            status: "unread",
            addedAt: "2026-01-04T00:00:00.000Z"
        };

        const withUnknown = applyAll([add(undated)], populated);
        const sorted = reducer(withUnknown, { type: "sort/changed", sort: "year" });

        expect(selectVisible(sorted).map((b) => b.title).at(-1)).toBe("Undated");
    });

    it("combines filter, search and sort", () => {
        const state = applyAll(
            [
                { type: "filter/changed", filter: "all" },
                { type: "query/changed", query: "o" },
                { type: "sort/changed", sort: "title" }
            ],
            populated
        );

        /* Matches on "o": "Beloved" and "Neuromancer" by title, and both of
           those also by author ("Toni Morrison", "William Gibson").

           "Dune" does not match, and I had it in this list on the first run.
           Neither "Dune" nor "Frank Herbert" contains an "o" - so the test was
           wrong and the code was right, which is the most useful kind of
           failure to get from a first test run. */
        expect(selectVisible(state).map((b) => b.title)).toEqual(["Beloved", "Neuromancer"]);
    });

    it("selectEditing follows editingId and survives an edit", () => {
        expect(selectEditing(populated)).toBeUndefined();

        const editing = reducer(populated, { type: "editing/started", id: "b2" });
        expect(selectEditing(editing)?.title).toBe("Beloved");
    });

    it("selectIsDuplicate ignores case and surrounding space", () => {
        const isDuplicate = selectIsDuplicate(populated, null);

        expect(isDuplicate("  dune  ")).toBe(true);
        expect(isDuplicate("Something else")).toBe(false);
    });

    it("selectIsDuplicate does not match a book against itself", () => {
        /* The bug from Day 30: without the exception, saving an edit without
           changing the title is rejected as a duplicate of the book being
           edited. */
        expect(selectIsDuplicate(populated, "b1")("Dune")).toBe(false);
        expect(selectIsDuplicate(populated, "b2")("Dune")).toBe(true);
    });
});
