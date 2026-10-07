/* The list, in both of its variants.

   `BookListProps` mirrors BookCard's union rather than taking four optional
   props, so the list cannot be asked for "saved" cards with a save handler. */

import { type Book } from "../data";
import { BookCard } from "./BookCard";
import { EmptyState } from "./EmptyState";

type BookListProps = {
    readonly books: readonly Book[];
    readonly emptyMessage: string;
} & (
    | { readonly variant: "result"; readonly onSave: (id: string) => void; readonly savedIds: ReadonlySet<string> }
    | { readonly variant: "saved"; readonly onRemove: (id: string) => void }
);

export function BookList(props: BookListProps) {
    const { books, emptyMessage } = props;

    if (books.length === 0) {
        return (
            <EmptyState message={emptyMessage}>
                <p className="text-sm">Nothing to show here yet.</p>
            </EmptyState>
        );
    }

    return (
        <ul className="book-grid">
            {books.map((book) =>
                props.variant === "result" ? (
                    <BookCard
                        key={book.id}
                        book={book}
                        variant="result"
                        saved={props.savedIds.has(book.id)}
                        onSave={props.onSave}
                    />
                ) : (
                    <BookCard key={book.id} book={book} variant="saved" onRemove={props.onRemove} />
                )
            )}
        </ul>
    );
}

/* `ReadonlySet<string>` for savedIds rather than `readonly string[]`.
   `.has()` is one lookup; `.includes()` on an array is a scan per card, so a
   list of 20 results against 50 saved books is 1,000 comparisons for no
   reason. The type says which one the caller has to build. */
