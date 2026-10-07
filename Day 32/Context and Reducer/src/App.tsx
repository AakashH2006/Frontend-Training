/* Day 32 - the same app, with the state in a context.

   App is now two things: the providers, and the layout. It passes one prop to
   one component (`book` to `BookRow`) and builds two inline arrows instead of
   Day 31's ten.

       Day 31   App dispatches 10 ways, passes 4 props to BookRow, 8 to FilterBar
       Day 32   App dispatches 2 ways,  passes 1 prop to BookRow, 0 to FilterBar

   The components that need state ask for it. The ones in between - Panel, the
   <main>, the <ul> - no longer carry anything through. */

import { STATUSES, STATUS_LABELS } from "./data";
import { bookAdded } from "./state/reducer";
import {
    ListProvider,
    useListDispatch,
    useListState,
    useListView,
    useVisibleBooks
} from "./state/ListContext";
import { ThemeProvider, useTheme } from "./state/ThemeContext";

import { Panel } from "./components/Panel";
import { Stat } from "./components/Stat";
import { EmptyState } from "./components/EmptyState";
import { BookRow } from "./components/BookRow";
import { BookForm } from "./components/BookForm";
import { FilterBar } from "./components/FilterBar";
import { StateInspector } from "./components/StateInspector";
import { Button } from "./components/Button";

/* The providers wrap the tree; everything below them can reach the state.
   App itself is split so that the part which *consumes* the context is a
   child of the provider - a component cannot read a context it provides
   itself, which is the first mistake I made here. */
export function App() {
    return (
        <ThemeProvider>
            <ListProvider>
                <ReadingList />
            </ListProvider>
        </ThemeProvider>
    );
}

function ReadingList() {
    const { density, toggleDensity } = useTheme();

    return (
        <div className={`page page--${density}`}>
            <header className="app-header">
                <h1>Reading List</h1>
                <p className="text-muted">
                    Day 32 &mdash; the Day 31 reducer behind a context. Two
                    contexts, four hooks, and no component in the middle
                    forwarding anything.
                </p>
                <div className="form-actions">
                    <Button small variant="quiet" onClick={toggleDensity}>
                        Density: {density}
                    </Button>
                </div>
            </header>

            <main id="main">
                {/* Each of these reads the context itself. ReadingList does
                    not fetch state in order to hand it down. */}
                <FormPanel />
                <ListPanel />

                <Panel id="state" title="The state, as stored">
                    <StatePanel />
                </Panel>

                <Panel id="scope" title="Context is not a global">
                    <ScopeDemo />
                </Panel>
            </main>

            <footer className="app-footer">
                <p className="text-sm text-muted">
                    Week 7, Day 32 &mdash; <code>createContext</code>, a split
                    state/dispatch pair, and hooks that throw outside their
                    provider.
                </p>
            </footer>
        </div>
    );
}

/* The add/edit panel. It needs the editing book and a dispatch, so it asks for
   both - rather than ReadingList asking and passing them through Panel. */
function FormPanel() {
    const dispatch = useListDispatch();
    const { editing, isDuplicate } = useListView();

    if (editing === undefined) {
        return (
            <Panel id="add" title="Add a book">
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

            {/* No props. FilterBar reads the three values and the two counts
                it needs, and dispatches its own changes. */}
            <FilterBar />

            {total === 0 ? (
                <EmptyState message="Nothing saved yet.">
                    <p className="text-sm">Add a book with the form above.</p>
                </EmptyState>
            ) : visible.length === 0 ? (
                <EmptyState message="No saved book matches that filter.">
                    <p className="text-sm">Clear the search box, or choose All.</p>
                </EmptyState>
            ) : (
                <ul className="book-grid">
                    {/* One prop. The row dispatches its own three actions. */}
                    {visible.map((book) => (
                        <BookRow key={book.id} book={book} />
                    ))}
                </ul>
            )}
        </Panel>
    );
}

function StatePanel() {
    return <StateInspector state={useListState()} />;
}

/* Two independent providers, to show that a context is scoped to its provider
   and is not a global.

   This nested <ListProvider> has its own useReducer, so adding a book inside
   it does not touch the list above. The inner components read the nearest
   provider above them, which is this one - which is also how the same
   component can appear twice on a page with different state, and why context
   is not a replacement for a store. */
function ScopeDemo() {
    return (
        <>
            <p className="text-sm text-muted">
                Below is a second <code>&lt;ListProvider&gt;</code> with its own
                reducer. Adding here changes nothing above, because a context is
                read from the nearest provider and not from a global.
            </p>

            <ListProvider>
                <div className="scope-demo">
                    <ScopeCount />
                    <ScopeAdd />
                </div>
            </ListProvider>
        </>
    );
}

function ScopeCount() {
    const { total } = useListView();
    return (
        <p className="status" id="inner-total">
            Inner provider holds {total} {total === 1 ? "book" : "books"}.
        </p>
    );
}

function ScopeAdd() {
    const dispatch = useListDispatch();

    return (
        <Button
            small
            onClick={() =>
                dispatch(
                    bookAdded({
                        title: `Inner book ${Math.floor(Math.random() * 900) + 100}`,
                        authors: [],
                        status: "unread"
                    })
                )
            }
        >
            Add to the inner list
        </Button>
    );
}
