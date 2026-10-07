/* Day 30 - the Week 6 build.

   A filterable reading list: add, edit, delete, filter, sort. Everything the
   week covered, in one app.

   State, and nothing else:

       saved      readonly SavedBook[]   the list
       query      string                 text filter
       filter     Filter                 status filter
       sort       Sort                   ordering
       editingId  string | null          which row is open for editing

   Derived in the render, never stored:

       editing    the book being edited  (found from saved + editingId)
       visible    filtered and sorted
       counts     per status
       isDuplicate

   Five pieces of state for an app with five features is about right, and the
   test I used for each one was Day 20's: could this be calculated from
   something already here? `editing` can - it is `saved.find(...)` - so only
   the id is stored. Keeping the whole book would mean a second copy that goes
   stale the moment the book is edited. */

import { useState } from "react";

import {
    type Filter,
    type SavedBook,
    type Sort,
    type Status,
    STATUSES,
    STATUS_LABELS
} from "./data";

import { Panel } from "./components/Panel";
import { Stat } from "./components/Stat";
import { EmptyState } from "./components/EmptyState";
import { BookRow } from "./components/BookRow";
import { BookForm, type BookDraft } from "./components/BookForm";
import { FilterBar } from "./components/FilterBar";

/* A closed table, so adding a member to Sort is a compile error here until it
   has a comparator. Day 23, and the reason this is not a switch with a
   default. */
const COMPARATORS: Record<Sort, (a: SavedBook, b: SavedBook) => number> = {
    // ISO strings, newest first.
    added: (a, b) => b.addedAt.localeCompare(a.addedAt),
    // localeCompare, not `<` - otherwise every capital sorts before every
    // lowercase. Day 20.
    title: (a, b) => a.title.localeCompare(b.title),
    author: (a, b) => (a.authors[0] ?? "").localeCompare(b.authors[0] ?? ""),
    // Unknown years last, rather than becoming 0 and jumping to the front.
    year: (a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity)
};

export function App() {
    const [saved, setSaved] = useState<readonly SavedBook[]>([]);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [sort, setSort] = useState<Sort>("added");
    const [editingId, setEditingId] = useState<string | null>(null);

    /* Derived from the id, so it cannot disagree with the list. */
    const editing = saved.find((book) => book.id === editingId);

    const needle = query.trim().toLowerCase();

    const visible = saved
        .filter((book) => filter === "all" || book.status === filter)
        .filter(
            (book) =>
                needle.length === 0 ||
                book.title.toLowerCase().includes(needle) ||
                book.authors.some((name) => name.toLowerCase().includes(needle))
        )
        /* toSorted, not sort - `saved` is readonly and sorting in place would
           mutate the state React is holding. The type makes it an error, which
           is Week 5 preventing a Week 4 bug. */
        .toSorted(COMPARATORS[sort]);

    /* Takes the id being edited so a book does not count as a duplicate of
       itself. Without that, saving an edit without changing the title would
       be rejected - which is the bug I hit first. */
    function isDuplicateOf(exceptId: string | null) {
        return (title: string): boolean => {
            const normalised = title.trim().toLowerCase();
            return saved.some(
                (book) =>
                    book.id !== exceptId && book.title.trim().toLowerCase() === normalised
            );
        };
    }

    function addBook(draft: BookDraft): void {
        const book: SavedBook = {
            ...draft,
            /* crypto.randomUUID is in every current browser and is a better id
               than Date.now(), which collides if two are added in the same
               millisecond - and two adds in one millisecond is exactly what a
               test does. */
            id: crypto.randomUUID(),
            addedAt: new Date().toISOString()
        };

        setSaved((previous) => [book, ...previous]);
    }

    function saveEdit(draft: BookDraft): void {
        if (editingId === null) return;

        setSaved((previous) =>
            previous.map((book) =>
                book.id === editingId
                    ? /* Spread the draft over the existing book, so `id` and
                         `addedAt` survive and the five editable fields are
                         replaced. Spreading the other way round would let the
                         old values win. */
                      { ...book, ...draft }
                    : book
            )
        );

        setEditingId(null);
    }

    function removeBook(id: string): void {
        setSaved((previous) => previous.filter((book) => book.id !== id));

        /* If the row being removed is the one open for editing, close the
           form. Leaving `editingId` set would leave `editing` as undefined and
           the edit panel rendering nothing - a state with no visible cause. */
        if (id === editingId) setEditingId(null);
    }

    function changeStatus(id: string, status: Status): void {
        setSaved((previous) =>
            previous.map((book) => (book.id === id ? { ...book, status } : book))
        );
    }

    function clearAll(): void {
        setSaved([]);
        setQuery("");
        setFilter("all");
        setEditingId(null);
    }

    return (
        <div className="page">
            <header className="app-header">
                <h1>Reading List</h1>
                <p className="text-muted">
                    Day 30 &mdash; the Week 6 build. Add, edit, delete, filter and
                    sort, from typed reusable components. No effects and no
                    fetching: the data lives in state and is gone on reload,
                    which Week 7 fixes.
                </p>
            </header>

            <main id="main">
                {/* One component, two uses. The `key` is what makes the edit
                    case work: clicking Edit on a second book gives a different
                    key, so React unmounts the first form and mounts a fresh
                    one with the new book's values. Without it the fields would
                    still hold the first book, because useState's initialiser
                    only runs once. */}
                {editing === undefined ? (
                    <Panel id="add" title="Add a book">
                        <BookForm
                            onSubmit={addBook}
                            isDuplicate={isDuplicateOf(null)}
                            submitLabel="Add to list"
                        />
                    </Panel>
                ) : (
                    <Panel id="edit" title={`Editing "${editing.title}"`}>
                        <BookForm
                            key={editing.id}
                            initial={editing}
                            onSubmit={saveEdit}
                            isDuplicate={isDuplicateOf(editing.id)}
                            submitLabel="Save changes"
                            onCancel={() => setEditingId(null)}
                        />
                    </Panel>
                )}

                <Panel
                    id="saved"
                    title="Your list"
                    actions={
                        saved.length > 0 ? (
                            <button
                                type="button"
                                className="button button--quiet button--small"
                                onClick={clearAll}
                            >
                                Clear
                            </button>
                        ) : undefined
                    }
                >
                    <ul className="summary">
                        <Stat label="On the list" value={saved.length} />
                        {STATUSES.map((status) => (
                            <Stat
                                key={status}
                                label={STATUS_LABELS[status]}
                                value={saved.filter((book) => book.status === status).length}
                            />
                        ))}
                    </ul>

                    <FilterBar
                        query={query}
                        onQueryChange={setQuery}
                        filter={filter}
                        onFilterChange={setFilter}
                        sort={sort}
                        onSortChange={setSort}
                        shown={visible.length}
                        total={saved.length}
                    />

                    {saved.length === 0 ? (
                        <EmptyState message="Nothing saved yet.">
                            <p className="text-sm">Add a book with the form above.</p>
                        </EmptyState>
                    ) : visible.length === 0 ? (
                        <EmptyState message="No saved book matches that filter.">
                            <p className="text-sm">Clear the search box, or choose All.</p>
                        </EmptyState>
                    ) : (
                        <ul className="book-grid">
                            {visible.map((book) => (
                                <BookRow
                                    key={book.id}
                                    book={book}
                                    onStatusChange={changeStatus}
                                    onEdit={setEditingId}
                                    onRemove={removeBook}
                                />
                            ))}
                        </ul>
                    )}
                </Panel>
            </main>

            <footer className="app-footer">
                <p className="text-sm text-muted">
                    Week 6 build &mdash; React + TypeScript, typed props, lists with
                    stable keys, controlled inputs and state ownership that can be
                    explained. Written up in <code>Day 30/README.md</code>.
                </p>
            </footer>
        </div>
    );
}
