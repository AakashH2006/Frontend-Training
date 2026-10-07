/* Day 29 - forms and lifting state.

   App now owns three pieces of state, and the interesting part of the day was
   working out which things belong here and which do not.

   Here, because more than one component needs them:

       saved    the list itself       - the form adds, the list renders, the tiles count
       query    the text filter       - FilterBar sets it, the list is filtered by it
       filter   the status filter     - same

   Not here, deliberately:

       the form's draft   only the form cares what is half-typed
       the field errors   same
       shown / total      derived from the three above
       savedIds           derived

   The rule that decided each one: state goes in the closest common parent of
   everything that *reads* it. The draft is read by one component, so it stays
   there - lifting it would re-render App on every keystroke in a field App has
   no interest in. */

import { useState } from "react";

import { type Book, type Filter, type Status, STATUSES, STATUS_LABELS } from "./data";
import { Panel } from "./components/Panel";
import { Stat } from "./components/Stat";
import { EmptyState } from "./components/EmptyState";
import { BookRow } from "./components/BookRow";
import { AddBookForm } from "./components/AddBookForm";
import { FilterBar } from "./components/FilterBar";
import { ControlledNotes } from "./components/ControlledNotes";

export function App() {
    const [saved, setSaved] = useState<readonly Book[]>([]);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");

    /* All three derived in the render. None of them stored, which is the only
       reason they cannot disagree with the list. */
    const needle = query.trim().toLowerCase();

    const visible = saved
        .filter((book) => filter === "all" || book.status === filter)
        .filter(
            (book) =>
                needle.length === 0 ||
                book.title.toLowerCase().includes(needle) ||
                book.authors.some((name) => name.toLowerCase().includes(needle))
        );

    /* Passed down to the form so it can reject a duplicate. A function rather
       than the list, because the form needs the answer to one question and not
       the data to work it out - which keeps the form unaware of how the list
       is stored. */
    function isDuplicate(title: string): boolean {
        const normalised = title.trim().toLowerCase();
        return saved.some((book) => book.title.trim().toLowerCase() === normalised);
    }

    function addBook(book: Book): void {
        setSaved((previous) => [book, ...previous]);
    }

    function removeBook(id: string): void {
        setSaved((previous) => previous.filter((book) => book.id !== id));
    }

    function changeStatus(id: string, status: Status): void {
        setSaved((previous) =>
            previous.map((book) => (book.id === id ? { ...book, status } : book))
        );
    }

    return (
        <div className="page">
            <header className="app-header">
                <h1>Reading List</h1>
                <p className="text-muted">
                    Day 29 &mdash; a controlled form with validation, and the
                    query and filter lifted to the parent that two components
                    share.
                </p>
            </header>

            <main id="main">
                <Panel id="add" title="Add a book">
                    {/* The form owns its draft and reports a finished Book. App
                        never sees a half-typed title, and the form never sees
                        the saved list. */}
                    <AddBookForm onAdd={addBook} isDuplicate={isDuplicate} />
                </Panel>

                <Panel
                    id="saved"
                    title="Your list"
                    actions={
                        saved.length > 0 ? (
                            <button
                                type="button"
                                className="button button--quiet button--small"
                                onClick={() => {
                                    setSaved([]);
                                    /* Clearing the list also clears the
                                       filters. Leaving `query` set would show
                                       "Showing 0 of 0" with a filter box full
                                       of text and no way to tell whether the
                                       list is empty or just filtered. */
                                    setQuery("");
                                    setFilter("all");
                                }}
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

                    {/* The lifted state, passed down as a value and a setter.
                        FilterBar holds nothing. */}
                    <FilterBar
                        query={query}
                        onQueryChange={setQuery}
                        filter={filter}
                        onFilterChange={setFilter}
                        shown={visible.length}
                        total={saved.length}
                    />

                    {/* Three empty cases, not one. "Nothing saved" and "nothing
                        matches" are different problems with different actions,
                        and Week 4 showed only one message for both. */}
                    {saved.length === 0 ? (
                        <EmptyState message="Nothing saved yet.">
                            <p className="text-sm">Add a book with the form above.</p>
                        </EmptyState>
                    ) : visible.length === 0 ? (
                        <EmptyState message="No saved book matches that filter.">
                            <p className="text-sm">
                                Clear the search box, or choose All.
                            </p>
                        </EmptyState>
                    ) : (
                        <ul className="book-grid">
                            {visible.map((book) => (
                                <BookRow
                                    key={book.id}
                                    book={book}
                                    onStatusChange={changeStatus}
                                    onRemove={removeBook}
                                />
                            ))}
                        </ul>
                    )}
                </Panel>

                <Panel id="controlled" title="Controlled against uncontrolled">
                    <ControlledNotes />
                </Panel>
            </main>

            <footer className="app-footer">
                <p className="text-sm text-muted">
                    Week 6, Day 29 &mdash; controlled inputs, validation,
                    <code>useId</code>, and state lifted only as far as it needs
                    to go.
                </p>
            </footer>
        </div>
    );
}
