/* Day 35 - the Week 7 build.

   Everything from the week, in one app:

       Day 31  normalised state in a reducer, with selectors
       Day 32  two (now three) contexts, and hooks as the only API
       Day 33  a real API, with cleanup, abort and four request states
       Day 34  custom hooks, and persistence

   App is providers plus layout. Every component that needs state asks for it,
   and the only prop passed anywhere is `book` to a row. */

import { Panel } from "./components/Panel";
import { Stat } from "./components/Stat";
import { EmptyState } from "./components/EmptyState";
import { Button } from "./components/Button";
import { BookRow } from "./components/BookRow";
import { BookForm } from "./components/BookForm";
import { FilterBar } from "./components/FilterBar";
import { SearchPanel } from "./components/SearchPanel";

import { STATUSES, STATUS_LABELS } from "./data";
import { bookAdded, bookSavedFromSearch } from "./state/reducer";
import {
    ListProvider,
    useListDispatch,
    useListView,
    useStorageNotice,
    useVisibleBooks
} from "./state/ListContext";
import { useOnlineStatus } from "./hooks/useOnlineStatus";

export function App() {
    /* A component cannot consume a context it provides, so App is the provider
       and ReadingList is the consumer. Day 32 found that by hitting it. */
    return (
        <ListProvider>
            <ReadingList />
        </ListProvider>
    );
}

function ReadingList() {
    return (
        <div className="page">
            <Header />

            <main id="main">
                <Panel id="search" title="Search Open Library">
                    <SearchSection />
                </Panel>

                <FormPanel />
                <ListPanel />
            </main>

            <footer className="app-footer">
                <p className="text-sm text-muted">
                    Week 7 build &mdash; reducer, context, custom hooks and a live
                    API. Written up in <code>Day 35/README.md</code>. Book data
                    from{" "}
                    <a href="https://openlibrary.org/developers/api">Open Library</a>.
                </p>
            </footer>
        </div>
    );
}

function Header() {
    const { notice, persistent } = useStorageNotice();
    const online = useOnlineStatus();

    return (
        <header className="app-header">
            <h1>Reading List</h1>
            <p className="text-muted">
                Day 35 &mdash; the Week 7 build. Search a live API, keep a list
                that survives a reload, and filter and sort it.
            </p>

            {/* Three notices from three sources, none of them stored twice.
                `notice` wins when there is one, because a specific problem is
                more useful than the general reassurance. */}
            <p
                className={`status${notice === null && persistent ? "" : " status--error"}`}
                role="status"
                id="storage-note"
            >
                {notice ??
                    (persistent
                        ? "Saved in this browser. The list will still be here after a reload."
                        : "This browser is blocking local storage, so the list will be lost on reload.")}
            </p>

            {!online && (
                <p className="status status--error" role="status" id="offline-note">
                    You are offline. Searching will not work until the connection
                    comes back; the saved list still will.
                </p>
            )}
        </header>
    );
}

function SearchSection() {
    const dispatch = useListDispatch();
    const { savedIds } = useListView();

    /* The one place the two halves of the app meet. The search hook knows
       nothing about the reducer, and the reducer knows nothing about the API -
       this line is the whole integration, and it is an action creator call. */
    return (
        <SearchPanel
            savedIds={savedIds}
            onSave={(hit) => dispatch(bookSavedFromSearch(hit))}
        />
    );
}

function FormPanel() {
    const dispatch = useListDispatch();
    const { editing, isDuplicate } = useListView();

    if (editing === undefined) {
        return (
            <Panel id="add" title="Add a book by hand">
                <BookForm
                    onSubmit={(draft) => dispatch(bookAdded(draft))}
                    isDuplicate={isDuplicate(null)}
                    submitLabel="Add to list"
                />
            </Panel>
        );
    }

    return (
        <Panel id="edit" title={`Editing "${editing.title}"`}>
            <BookForm
                /* A different key means a fresh form, so editing a second book
                   does not inherit the first one's fields. Day 30. */
                key={editing.id}
                initial={editing}
                onSubmit={(draft) => dispatch({ type: "book/edited", id: editing.id, draft })}
                isDuplicate={isDuplicate(editing.id)}
                submitLabel="Save changes"
                onCancel={() => dispatch({ type: "editing/stopped" })}
            />
        </Panel>
    );
}

function ListPanel() {
    const dispatch = useListDispatch();
    const { counts, total } = useListView();
    const visible = useVisibleBooks();

    return (
        <Panel
            id="saved"
            title="Your list"
            actions={
                total > 0 ? (
                    <Button
                        small
                        variant="quiet"
                        onClick={() => dispatch({ type: "list/cleared" })}
                    >
                        Clear
                    </Button>
                ) : undefined
            }
        >
            <ul className="summary">
                <Stat label="On the list" value={total} />
                {STATUSES.map((status) => (
                    <Stat key={status} label={STATUS_LABELS[status]} value={counts[status]} />
                ))}
            </ul>

            <FilterBar />

            {total === 0 ? (
                <EmptyState message="Nothing saved yet.">
                    <p className="text-sm">
                        Search above and save a result, or add one by hand.
                    </p>
                </EmptyState>
            ) : visible.length === 0 ? (
                <EmptyState message="No saved book matches that filter.">
                    <p className="text-sm">Clear the search box, or choose All.</p>
                </EmptyState>
            ) : (
                <ul className="book-grid" id="saved-list">
                    {visible.map((book) => (
                        <BookRow key={book.id} book={book} />
                    ))}
                </ul>
            )}
        </Panel>
    );
}
