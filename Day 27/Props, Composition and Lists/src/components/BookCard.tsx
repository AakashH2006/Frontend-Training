/* One book, composed out of the small components rather than spelling out its
   own markup.

   The interesting part of this file is the props type. */

import { type Book } from "../data";
import { Badge } from "./Badge";
import { Button } from "./Button";

/* A discriminated union on the props, which is Day 22 arriving in a component
   signature.

   The card appears in two places on Day 30 - in search results, where the
   action is "Save", and in the saved list, where it is "Remove". Those need
   different handlers, and the first version of this had both as optional:

       onSave?: (id: string) => void;
       onRemove?: (id: string) => void;

   ...which allows all four combinations, including neither (a card with no
   action) and both (a card with two). Two of the four are nonsense, and
   nothing stopped me writing them.

   As a union there are exactly two shapes, and `variant` says which. */
type BookCardProps = {
    readonly book: Book;
} & (
    | { readonly variant: "result"; readonly onSave: (id: string) => void; readonly saved: boolean }
    | { readonly variant: "saved"; readonly onRemove: (id: string) => void }
);

function authorLine(authors: readonly string[]): string {
    if (authors.length === 0) return "Author unknown";
    if (authors.length === 1) return authors[0] ?? "Author unknown";
    if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
    return `${authors[0]} and ${authors.length - 1} others`;
}

export function BookCard(props: BookCardProps) {
    /* Destructuring `book` out and keeping the rest as a union, because
       narrowing works on the whole object and not on a destructured field.
       Pulling `variant` out first would break the link between it and the
       handler. */
    const { book } = props;

    return (
        <li className={`book-card book-card--${book.status}`}>
            <h3 className="book-card__title">{book.title}</h3>
            <p className="book-card__meta">{authorLine(book.authors)}</p>
            <p className="book-card__meta">
                {book.year === undefined
                    ? "Publication year unknown"
                    : `First published ${book.year}`}
            </p>

            {book.note !== undefined && <p className="book-card__note">{book.note}</p>}

            <p className="book-card__status">
                <Badge status={book.status} />
            </p>

            <p className="book-card__actions">
                {/* Narrowed by `variant`, so `props.onSave` exists in one
                    branch and `props.onRemove` in the other, and neither is
                    optional in its own branch. No `?.` and no fallback. */}
                {props.variant === "result" ? (
                    <Button small disabled={props.saved} onClick={() => props.onSave(book.id)}>
                        {props.saved ? "On your list" : "Save"}
                    </Button>
                ) : (
                    <Button small variant="danger" onClick={() => props.onRemove(book.id)}>
                        Remove
                    </Button>
                )}
            </p>
        </li>
    );
}
