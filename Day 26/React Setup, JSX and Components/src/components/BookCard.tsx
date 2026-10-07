/* One book. The smallest component here, and the one that does the most to
   show what JSX actually is.

   It is pure in the React sense: same props in, same output, and nothing
   outside it is touched. No variable above it is read or written, nothing is
   logged, and no date or random number is generated - so rendering it twice
   gives the same result twice, which is exactly what React assumes it may do. */

import { type Book, STATUS_LABELS } from "../data";

interface BookCardProps {
    readonly book: Book;
}

/* A helper that lives outside the component, because it does not need props or
   state and recreating it on every render would be waste. Pulling pure
   functions out of components is the Day 20 `format.js` lesson again. */
function authorLine(authors: readonly string[]): string {
    if (authors.length === 0) return "Author unknown";
    if (authors.length === 1) return authors[0] ?? "Author unknown";
    if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
    return `${authors[0]} and ${authors.length - 1} others`;
}

export function BookCard({ book }: BookCardProps) {
    return (
        <li className={`book-card book-card--${book.status}`}>
            {/* An expression in braces. Everything between { and } is
                ordinary TypeScript, evaluated at render time, and the result
                is escaped before it reaches the DOM - which is why there is no
                textContent/innerHTML decision to make here the way there was
                in Week 4. */}
            <h3 className="book-card__title">{book.title}</h3>

            <p className="book-card__meta">{authorLine(book.authors)}</p>

            {/* A ternary rather than `&&`, because there is something to show in
                both cases. `&&` is for "render this or nothing". */}
            <p className="book-card__meta">
                {book.year === undefined
                    ? "Publication year unknown"
                    : `First published ${book.year}`}
            </p>

            {/* And here `&&` is right: no note means no paragraph at all.

                The trap I read about and then deliberately avoided: with a
                number on the left, `{count && <p/>}` renders a literal 0 when
                count is 0, because 0 is falsy but is still a valid React
                child. With a string, "" renders nothing visible but is the
                same mistake. So the test is explicit rather than truthy -
                which is Day 22's falsy-narrowing lesson showing up in JSX. */}
            {book.note !== undefined && (
                <p className="book-card__note">{book.note}</p>
            )}

            <p className="book-card__status">
                <span className={`badge badge--${book.status}`}>
                    {STATUS_LABELS[book.status]}
                </span>
            </p>
        </li>
    );
}

/* `STATUS_LABELS[book.status]` needs no `?? "unknown"`, which it would have in
   Week 4. `STATUS_LABELS` is `Record<Status, string>` and `book.status` is a
   `Status`, so the lookup cannot miss - the closed-record lesson from Day 23
   paying off in a component. */
