/* Counts per status, derived from the books it is given.

   Deliberately *not* taking the counts as props. Day 20's rule was that a
   value calculable from state is not state, and the same applies to props: if
   App passed both the books and the counts, the two could disagree, and the
   one that went stale would be a wrong number on screen.

   So this takes the books and counts them on every render. Cheap, and it
   cannot be wrong. */

import { type Book, STATUSES, STATUS_LABELS } from "../data";

interface SummaryBarProps {
    readonly books: readonly Book[];
}

export function SummaryBar({ books }: SummaryBarProps) {
    /* Starting the accumulator as a complete Record rather than `{}` means no
       assertion and no possibly-undefined count downstream. */
    const counts = books.reduce<Record<string, number>>(
        (totals, book) => ({ ...totals, [book.status]: (totals[book.status] ?? 0) + 1 }),
        {}
    );

    return (
        <ul className="summary">
            <li className="summary__tile">
                <span className="summary__label">On the list</span>
                <span className="summary__value">{books.length}</span>
            </li>

            {/* Mapping over STATUSES rather than over the counts, so the order
                is fixed and a status with zero books still gets a tile.
                Iterating the counts object would hide "Finished: 0", which is
                information. */}
            {STATUSES.map((status) => (
                <li className="summary__tile" key={status}>
                    <span className="summary__label">{STATUS_LABELS[status]}</span>
                    <span className="summary__value">{counts[status] ?? 0}</span>
                </li>
            ))}
        </ul>
    );
}
