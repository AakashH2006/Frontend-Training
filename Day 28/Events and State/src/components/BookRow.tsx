/* One saved book, now with controls.

   Three event handlers, and the types on all three came from React rather than
   from me guessing. */

import type { ChangeEvent } from "react";
import { type Book, type Status, STATUSES, STATUS_LABELS, isStatus } from "../data";
import { Badge } from "./Badge";
import { Button } from "./Button";

interface BookRowProps {
    readonly book: Book;
    readonly onStatusChange: (id: string, status: Status) => void;
    readonly onRemove: (id: string) => void;
}

export function BookRow({ book, onStatusChange, onRemove }: BookRowProps) {
    /* `ChangeEvent<HTMLSelectElement>` is the typed event. The payoff is
       `event.target.value` being a `string` rather than an `any` - and in
       Week 4 that line was `select.value` on an element I had asserted into
       existence.

       It is still only a `string`, though. The union needs the guard, which is
       Day 25's lesson: `isStatus` is what turns the DOM's string into a
       Status, and the "readng" typo from Week 4 cannot get through it. */
    function handleStatus(event: ChangeEvent<HTMLSelectElement>): void {
        const value = event.target.value;
        if (isStatus(value)) onStatusChange(book.id, value);
    }

    const selectId = `status-${book.id}`;

    return (
        <li className={`book-card book-card--${book.status}`}>
            <h3 className="book-card__title">{book.title}</h3>
            <p className="book-card__meta">
                {book.authors.length === 0 ? "Author unknown" : book.authors.join(", ")}
            </p>

            <p className="book-card__status">
                <Badge status={book.status} />
            </p>

            <div className="form-actions">
                <span className="field field--inline">
                    {/* htmlFor, not for. And the id has to be unique per row,
                        which is why it is built from the book id. */}
                    <label className="text-sm" htmlFor={selectId}>
                        Status
                    </label>
                    <select id={selectId} value={book.status} onChange={handleStatus}>
                        {/* The options come from STATUSES, so the markup and
                            the union cannot drift. Day 25 had to do this by
                            rewriting a <template> at startup; here it is just
                            a map. */}
                        {STATUSES.map((status) => (
                            <option key={status} value={status}>
                                {STATUS_LABELS[status]}
                            </option>
                        ))}
                    </select>
                </span>

                {/* An inline arrow, because the handler needs the id and the
                    prop takes it as an argument. This allocates a function per
                    render, which is fine - it is one small object, and the
                    alternatives (useCallback, or a data attribute read back
                    off the event) both cost more than they save here. */}
                <Button small variant="danger" onClick={() => onRemove(book.id)}>
                    Remove
                </Button>
            </div>
        </li>
    );
}

/* `value={book.status}` with `onChange` makes this a controlled select: the
   DOM never holds a value the state does not. Leaving `onChange` off would
   make React warn and the select would appear frozen, because the value prop
   would keep resetting it. Controlled inputs properly are Day 29. */
