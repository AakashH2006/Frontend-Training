/* One saved book: a status select, an Edit and a Remove.

   It holds no state. Whether this row is being edited is App's business,
   because only one row may be in edit mode at a time - that is a fact about
   the list, not about any one row. A boolean inside each row would allow two
   rows editing at once, which is a state the design does not want. */

import type { ChangeEvent } from "react";
import { STATUSES, STATUS_LABELS, isStatus } from "../data";
import type { Book } from "../state/reducer";
import { useListDispatch } from "../state/ListContext";
import { Badge } from "./Badge";
import { Button } from "./Button";

/* One prop, where Day 31 had four. The three handlers are gone: this component
   dispatches directly, so App no longer builds arrows to forward through a
   list it does not otherwise care about. */
interface BookRowProps {
    readonly book: Book;
}

export function BookRow({ book }: BookRowProps) {
    /* Dispatch only - this component never reads the state. So it subscribes
       to the one context value that never changes, and nothing here re-renders
       because the filter box was typed in. */
    const dispatch = useListDispatch();

    function handleStatus(event: ChangeEvent<HTMLSelectElement>): void {
        if (isStatus(event.target.value)) {
            dispatch({ type: "book/statusChanged", id: book.id, status: event.target.value });
        }
    }

    const selectId = `status-${book.id}`;

    return (
        <li className={`book-card book-card--${book.status}`}>
            <h3 className="book-card__title">{book.title}</h3>

            <p className="book-card__meta">
                {book.authors.length === 0 ? "Author unknown" : book.authors.join(", ")}
            </p>

            <p className="book-card__meta">
                {book.year === undefined
                    ? "Publication year unknown"
                    : `First published ${book.year}`}
            </p>

            {book.note !== undefined && <p className="book-card__note">{book.note}</p>}

            <p className="book-card__status">
                <Badge status={book.status} />
            </p>

            <div className="form-actions">
                <span className="field field--inline">
                    <label className="text-sm" htmlFor={selectId}>
                        Status
                    </label>
                    <select id={selectId} value={book.status} onChange={handleStatus}>
                        {STATUSES.map((status) => (
                            <option key={status} value={status}>
                                {STATUS_LABELS[status]}
                            </option>
                        ))}
                    </select>
                </span>

                <Button small variant="quiet" onClick={() => dispatch({ type: "editing/started", id: book.id })}>
                    Edit
                </Button>

                <Button small variant="danger" onClick={() => dispatch({ type: "book/removed", id: book.id })}>
                    Remove
                </Button>
            </div>
        </li>
    );
}

/* The status select stays even though the edit form can also change the
   status. Changing one book from unread to reading is the commonest thing
   anyone will do here, and making that a three-click edit instead of one
   would be worse. Two routes to the same field is fine when both go through
   the same action. */
