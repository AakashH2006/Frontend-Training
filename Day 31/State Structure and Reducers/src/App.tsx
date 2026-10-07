/* Day 31 - the same app, driven by a reducer.

   Compare with Day 30's App:

       Day 30    5 useState calls, 6 handlers, 4 of them setting two things
       Day 31    1 useReducer, 0 handlers, and a list of 10 actions

   Every handler is gone. The components now dispatch, and all the logic that
   was spread across six closures lives in one pure function that can be read
   top to bottom - and tested without React at all, which is Day 37.

   What stayed the same: the component tree, every prop type, and the `key` on
   the edit form. None of this is a React change; it is a change in where the
   state logic lives. */

import { useReducer } from "react";

import { STATUSES, STATUS_LABELS } from "./data";
import {
    INITIAL_STATE,
    bookAdded,
    reducer,
    selectCounts,
    selectEditing,
    selectIsDuplicate,
    selectVisible
} from "./state/reducer";

import { Panel } from "./components/Panel";
import { Stat } from "./components/Stat";
import { EmptyState } from "./components/EmptyState";
import { BookRow } from "./components/BookRow";
import { BookForm } from "./components/BookForm";
import { FilterBar } from "./components/FilterBar";
import { StateInspector } from "./components/StateInspector";

export function App() {
    /* `useReducer(reducer, INITIAL_STATE)` - the reducer, the initial state,
       and back comes the state and a dispatch. `dispatch` is stable for the
       lifetime of the component, which is the quiet advantage over `useState`:
       passing it down never changes a child's props, so nothing re-renders
       because a handler was recreated. */
    const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

    /* Every one of these is derived by a selector. None of it is in state, and
       the selectors are plain functions of AppState, so they are the part of
       this app that needs no browser to test. */
    const visible = selectVisible(state);
    const editing = selectEditing(state);
    const counts = selectCounts(state);
    const total = state.list.ids.length;

    return (
        <div className="page">
            <header className="app-header">
                <h1>Reading List</h1>
                <p className="text-muted">
                    Day 31 &mdash; the same app as Day 30, with normalised state
                    and a reducer. Ten actions instead of six handlers, and the
                    state is visible at the bottom of the page.
                </p>
            </header>

            <main id="main">
                {editing === undefined ? (
                    <Panel id="add" title="Add a book">
                        <BookForm
                            /* The action creator generates the id and the
                               timestamp, because a reducer has to be pure. */
                            onSubmit={(draft) => dispatch(bookAdded(draft))}
                            isDuplicate={selectIsDuplicate(state, null)}
                            submitLabel="Add to list"
                        />
                    </Panel>
                ) : (
                    <Panel id="edit" title={`Editing "${editing.title}"`}>
                        <BookForm
                            key={editing.id}
                            initial={editing}
                            onSubmit={(draft) =>
                                dispatch({ type: "book/edited", id: editing.id, draft })
                            }
                            isDuplicate={selectIsDuplicate(state, editing.id)}
                            submitLabel="Save changes"
                            onCancel={() => dispatch({ type: "editing/stopped" })}
                        />
                    </Panel>
                )}

                <Panel
                    id="saved"
                    title="Your list"
                    actions={
                        total > 0 ? (
                            <button
                                type="button"
                                className="button button--quiet button--small"
                                /* One action. Day 30 needed four setters here
                                   and the fourth was easy to forget. */
                                onClick={() => dispatch({ type: "list/cleared" })}
                            >
                                Clear
                            </button>
                        ) : undefined
                    }
                >
                    <ul className="summary">
                        <Stat label="On the list" value={total} />
                        {STATUSES.map((status) => (
                            <Stat
                                key={status}
                                label={STATUS_LABELS[status]}
                                value={counts[status]}
                            />
                        ))}
                    </ul>

                    <FilterBar
                        query={state.query}
                        onQueryChange={(query) => dispatch({ type: "query/changed", query })}
                        filter={state.filter}
                        onFilterChange={(filter) => dispatch({ type: "filter/changed", filter })}
                        sort={state.sort}
                        onSortChange={(sort) => dispatch({ type: "sort/changed", sort })}
                        shown={visible.length}
                        total={total}
                    />

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
                            {visible.map((book) => (
                                <BookRow
                                    key={book.id}
                                    book={book}
                                    onStatusChange={(id, status) =>
                                        dispatch({ type: "book/statusChanged", id, status })
                                    }
                                    onEdit={(id) => dispatch({ type: "editing/started", id })}
                                    onRemove={(id) => dispatch({ type: "book/removed", id })}
                                />
                            ))}
                        </ul>
                    )}
                </Panel>

                <Panel id="state" title="The state, as stored">
                    <StateInspector state={state} />
                </Panel>
            </main>

            <footer className="app-footer">
                <p className="text-sm text-muted">
                    Week 7, Day 31 &mdash; <code>useReducer</code>, normalised
                    state and selectors. Still no effects and no fetching.
                </p>
            </footer>
        </div>
    );
}
