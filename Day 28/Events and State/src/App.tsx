/* Day 28 - events and state.

   App owns the saved list. That is the first real state-ownership decision in
   this repo, and the rule I used is the one the React docs give: put state in
   the closest common parent of everything that needs it.

   Three components need the saved list:
     - Catalogue, to know which books are already on it
     - SavedList, to render it
     - SummaryBar, to count it

   Their closest common parent is App, so it lives here. Pushing it down into
   SavedList would mean Catalogue could not see it; pushing it up has nowhere
   to go. Lifting state properly is Day 29; this is the simple case where there
   is only one sensible answer. */

import { useState } from "react";

import { type Book, type Status, CATALOGUE, STATUSES, STATUS_LABELS } from "./data";
import { Panel } from "./components/Panel";
import { Stat } from "./components/Stat";
import { EmptyState } from "./components/EmptyState";
import { BookRow } from "./components/BookRow";
import { Catalogue } from "./components/Catalogue";
import { StateExperiments } from "./components/StateExperiments";

export function App() {
    /* One piece of state, and its type is written out because the initial
       value is an empty array - from which TypeScript would infer `never[]`.
       That is a real error rather than a style point: `never[]` accepts no
       pushes, so the first `addBook` would not compile.

       This is the most common place an annotation is actually required in
       React, and the message is confusing until you have seen it once. */
    const [saved, setSaved] = useState<readonly Book[]>([]);

    /* Derived, not stored. Day 20's rule, and the reason there is no
       `savedIds` piece of state: it would be a second copy of the same fact
       and the two could disagree. One Set per render is cheap. */
    const savedIds = new Set(saved.map((book) => book.id));

    function addBook(book: Book): void {
        /* A functional update, because the result depends on the previous
           value. The guard goes *inside* the updater for the same reason -
           checking `saved` out here would be checking the render's snapshot,
           and two fast clicks could both pass it. */
        setSaved((previous) =>
            previous.some((entry) => entry.id === book.id)
                ? previous
                : [{ ...book, status: "unread" }, ...previous]
        );
    }

    /* Returning `previous` unchanged when there is nothing to do is
       deliberate: React bails out of the re-render when the next state is
       the same reference. Returning `[...previous]` would be a new array
       every time and would re-render for no reason. */

    function removeBook(id: string): void {
        setSaved((previous) => previous.filter((book) => book.id !== id));
    }

    function changeStatus(id: string, status: Status): void {
        /* `.map` with a spread, not `saved[i].status = status`. Mutating the
           array React is holding would change the data and leave the
           reference identical, so React would see no change and not re-render
           - the classic "my state updated but nothing happened".

           Every update in this file produces a new object and a new array for
           exactly that reason. */
        setSaved((previous) =>
            previous.map((book) => (book.id === id ? { ...book, status } : book))
        );
    }

    return (
        <div className="page">
            <header className="app-header">
                <h1>Reading List</h1>
                <p className="text-muted">
                    Day 28 &mdash; the buttons do something now. App owns the
                    saved list; every update goes through a setter and produces
                    a new array.
                </p>
            </header>

            <main id="main">
                <Panel id="catalogue" title="Catalogue">
                    <Catalogue books={CATALOGUE} savedIds={savedIds} onAdd={addBook} />
                </Panel>

                <Panel
                    id="saved"
                    title="Your list"
                    actions={
                        saved.length > 0 ? (
                            <button
                                type="button"
                                className="button button--quiet button--small"
                                onClick={() => setSaved([])}
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

                    {saved.length === 0 ? (
                        <EmptyState message="Nothing saved yet.">
                            <p className="text-sm">Add something from the catalogue above.</p>
                        </EmptyState>
                    ) : (
                        <ul className="book-grid">
                            {saved.map((book) => (
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

                <Panel id="experiments" title="How state actually behaves">
                    <StateExperiments />
                </Panel>
            </main>

            <footer className="app-footer">
                <p className="text-sm text-muted">
                    Week 6, Day 28 &mdash; <code>useState</code>, typed events and
                    functional updates. No effects and no fetching yet.
                </p>
            </footer>
        </div>
    );
}

/* `actions={saved.length > 0 ? <button/> : undefined}` rather than `: null`,
   because `actions?: ReactNode` is an exact optional property - Week 5's
   `exactOptionalPropertyTypes`. `null` is a legal ReactNode but not a legal
   value for an *absent* optional prop, so `undefined` is the one that
   compiles. A small thing, and it is the strict option from Week 5 still
   earning its place. */
