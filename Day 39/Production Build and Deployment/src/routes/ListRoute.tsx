/* Day 36 - the saved list, as a route.

   Day 35's ListPanel, with one addition: each row's title is now a link to
   that book's own route. */

import { Link } from "react-router";

import { Panel } from "../components/Panel";
import { Stat } from "../components/Stat";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/Button";
import { FilterBar } from "../components/FilterBar";
import { Badge } from "../components/Badge";
import { STATUSES, STATUS_LABELS } from "../data";
import { useListDispatch, useListView, useVisibleBooks } from "../state/ListContext";

export function ListRoute() {
    const dispatch = useListDispatch();
    const { counts, total } = useListView();
    const visible = useVisibleBooks();

    return (
        <Panel
            id="saved"
            title="Your list"
            actions={
                total > 0 ? (
                    <Button small variant="quiet" onClick={() => dispatch({ type: "list/cleared" })}>
                        Clear
                    </Button>
                ) : undefined
            }
        >
            {/* An accessible name, added on Day 37 because a test could not
                tell this list's "Finished" tile from the "Finished" filter
                button - and neither could a screen reader, which announced
                "list, 4 items" with no idea what the list was. */}
            <ul className="summary" aria-label="Status summary">
                <Stat label="On the list" value={total} />
                {STATUSES.map((status) => (
                    <Stat key={status} label={STATUS_LABELS[status]} value={counts[status]} />
                ))}
            </ul>

            <FilterBar />

            {total === 0 ? (
                <EmptyState message="Nothing saved yet.">
                    <p className="text-sm">
                        <Link to="/">Search for something</Link>, or{" "}
                        <Link to="/add">add a book by hand</Link>.
                    </p>
                </EmptyState>
            ) : visible.length === 0 ? (
                <EmptyState message="No saved book matches that filter.">
                    <p className="text-sm">Clear the search box, or choose All.</p>
                </EmptyState>
            ) : (
                <ul className="book-grid" id="saved-list">
                    {visible.map((book) => (
                        <li className="book-card" key={book.id}>
                            <h3 className="book-card__title">
                                {/* A <Link>, not an <a href>. An anchor would do
                                    a full page load - losing the in-memory state
                                    and refetching the whole bundle. The router
                                    pushes onto the history stack instead. */}
                                <Link to={`/book/${book.id}`}>{book.title}</Link>
                            </h3>
                            <p className="book-card__meta">
                                {book.authors.length === 0
                                    ? "Author unknown"
                                    : book.authors.join(", ")}
                            </p>
                            <p className="book-card__status">
                                <Badge status={book.status} />
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}
