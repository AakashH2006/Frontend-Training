/* Day 36 - one book, at /book/:id.

   The route parameter is the point of this file, and it comes with two things
   worth getting right.

   1. `useParams()` returns `Record<string, string | undefined>`. The `id` is
      typed `string | undefined` even though the route pattern guarantees it is
      there - because the types cannot know which route rendered this
      component. Another nullable boundary, and the honest answer is to check
      it rather than assert.

   2. An id in the URL may name a book that does not exist. Somebody edits the
      address bar, or follows a link to a book they have since removed. That is
      not an error page - it is a specific, explainable state. */

import { Link, useNavigate, useParams } from "react-router";

import { Panel } from "../components/Panel";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { BookForm } from "../components/BookForm";
import { STATUSES, STATUS_LABELS, isStatus } from "../data";
import { useListDispatch, useListState, useListView } from "../state/ListContext";

export function BookRoute() {
    const { id } = useParams();
    const dispatch = useListDispatch();
    const state = useListState();
    const { isDuplicate, editing } = useListView();
    const navigate = useNavigate();

    /* `id` is possibly undefined, so the lookup is guarded rather than
       asserted. `byId[...]` is also `Book | undefined` because the state is
       normalised and `noUncheckedIndexedAccess` is on - so there are two
       nullable steps here and both are real. */
    const book = id === undefined ? undefined : state.list.byId[id];

    if (book === undefined) {
        return (
            <Panel id="missing" title="Book not found">
                <EmptyState
                    message={
                        id === undefined
                            ? "No book was named in the address."
                            : `Nothing on your list has the id "${id}".`
                    }
                >
                    <p className="text-sm">
                        It may have been removed. <Link to="/list">Back to your list</Link>.
                    </p>
                </EmptyState>
            </Panel>
        );
    }

    /* Editing happens on this route rather than on the list, so the edit form
       has a URL. The reducer's `editingId` still decides whether the form is
       open, which keeps "one row at a time" true. */
    const isEditing = editing !== undefined && editing.id === book.id;

    return (
        <>
            <Panel
                id="book"
                title={book.title}
                actions={
                    <>
                        <Button
                            small
                            variant="quiet"
                            onClick={() =>
                                dispatch(
                                    isEditing
                                        ? { type: "editing/stopped" }
                                        : { type: "editing/started", id: book.id }
                                )
                            }
                        >
                            {isEditing ? "Stop editing" : "Edit"}
                        </Button>

                        <Button
                            small
                            variant="danger"
                            onClick={() => {
                                dispatch({ type: "book/removed", id: book.id });
                                /* Navigate away, because the thing this route
                                   is about no longer exists. Staying would
                                   render the not-found panel, which is correct
                                   but reads like an error rather than a
                                   completed action. */
                                void navigate("/list");
                            }}
                        >
                            Remove
                        </Button>
                    </>
                }
            >
                <dl className="notes-list">
                    <dt>Authors</dt>
                    <dd>{book.authors.length === 0 ? "Author unknown" : book.authors.join(", ")}</dd>

                    <dt>First published</dt>
                    <dd>{book.year === undefined ? "Unknown" : book.year}</dd>

                    <dt>Added</dt>
                    {/* Date formatting through Intl, not by hand. Day 20. */}
                    <dd>
                        {new Intl.DateTimeFormat(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                        }).format(new Date(book.addedAt))}
                    </dd>

                    <dt>Note</dt>
                    <dd>{book.note === undefined ? "No note." : book.note}</dd>
                </dl>

                <p className="book-card__status">
                    <Badge status={book.status} />
                </p>

                <div className="form-actions">
                    <span className="field field--inline">
                        <label className="text-sm" htmlFor="detail-status">
                            Status
                        </label>
                        <select
                            id="detail-status"
                            value={book.status}
                            onChange={(event) => {
                                if (isStatus(event.target.value)) {
                                    dispatch({
                                        type: "book/statusChanged",
                                        id: book.id,
                                        status: event.target.value
                                    });
                                }
                            }}
                        >
                            {STATUSES.map((status) => (
                                <option key={status} value={status}>
                                    {STATUS_LABELS[status]}
                                </option>
                            ))}
                        </select>
                    </span>
                </div>

                <p className="text-sm">
                    <Link to="/list">Back to your list</Link>
                </p>
            </Panel>

            {isEditing && (
                <Panel id="edit" title={`Editing "${book.title}"`}>
                    <BookForm
                        key={book.id}
                        initial={book}
                        onSubmit={(draft) => dispatch({ type: "book/edited", id: book.id, draft })}
                        isDuplicate={isDuplicate(book.id)}
                        submitLabel="Save changes"
                        onCancel={() => dispatch({ type: "editing/stopped" })}
                    />
                </Panel>
            )}
        </>
    );
}
