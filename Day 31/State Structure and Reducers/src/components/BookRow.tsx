/* One saved book: a status select, an Edit and a Remove.

   It holds no state. Whether this row is being edited is App's business,
   because only one row may be in edit mode at a time - that is a fact about
   the list, not about any one row. A boolean inside each row would allow two
   rows editing at once, which is a state the design does not want. */

import type { ChangeEvent } from "react";
import { type Status, STATUSES, STATUS_LABELS, isStatus } from "../data";
import type { Book } from "../state/reducer";
import { Badge } from "./Badge";
import { Button } from "./Button";

interface BookRowProps {
    readonly book: Book;
    readonly onStatusChange: (id: string, status: Status) => void;
    readonly onEdit: (id: string) => void;
    readonly onRemove: (id: string) => void;
}

export function BookRow({ book, onStatusChange, onEdit, onRemove }: BookRowProps) {
    function handleStatus(event: ChangeEvent<HTMLSelectElement>): void {
        if (isStatus(event.target.value)) onStatusChange(book.id, event.target.value);
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

                <Button small variant="quiet" onClick={() => onEdit(book.id)}>
                    Edit
                </Button>

                <Button small variant="danger" onClick={() => onRemove(book.id)}>
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
